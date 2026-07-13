const tableSql = `
CREATE TABLE IF NOT EXISTS inventory_state (
  user_id TEXT PRIMARY KEY,
  items_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)
`;

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const allowedCorsOrigins = new Set([
  "https://ms1983store-wq.github.io",
  "https://rieki-calc.hachi-ribe.workers.dev",
]);

function getResponseHeaders(request) {
  const headers = { ...jsonHeaders };
  const origin = request?.headers.get("origin") || "";
  if (allowedCorsOrigins.has(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-credentials"] = "true";
    headers["access-control-allow-methods"] = "GET, POST, PUT, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
    headers.vary = "Origin";
  }
  return headers;
}

function jsonResponse(body, status = 200, request = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: getResponseHeaders(request),
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedEmails(env) {
  return String(env.INVENTORY_OWNER_EMAIL || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

function getUserEmail(request, env) {
  const accessEmail = normalizeEmail(request.headers.get("cf-access-authenticated-user-email"));
  const accessJwt = String(request.headers.get("cf-access-jwt-assertion") || "").trim();
  const devEmail =
    env.ALLOW_DEV_USER_HEADER === "true" ? normalizeEmail(request.headers.get("x-inventory-user-email")) : "";
  const email = devEmail || (accessEmail && accessJwt ? accessEmail : "");
  if (!email) return { error: jsonResponse({ error: "Cloudflare Access login is required." }, 401, request) };

  const allowedEmails = getAllowedEmails(env);
  if (allowedEmails.length && !allowedEmails.includes(email)) {
    return { error: jsonResponse({ error: "This user is not allowed to access this inventory." }, 403, request) };
  }

  return { email };
}

async function ensureSchema(db) {
  await db.prepare(tableSql).run();
}

async function readState(db, userId) {
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT items_json, version, updated_at FROM inventory_state WHERE user_id = ?")
    .bind(userId)
    .first();

  if (!row) {
    return { items: [], version: 0, updatedAt: null };
  }

  let items = [];
  try {
    const parsed = JSON.parse(row.items_json || "[]");
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }

  return {
    items,
    version: Number(row.version) || 0,
    updatedAt: row.updated_at || null,
  };
}

async function writeState(db, userId, items, baseVersion, force) {
  await ensureSchema(db);
  const current = await readState(db, userId);

  if (!force && Number.isFinite(baseVersion) && current.version > baseVersion) {
    return {
      conflict: true,
      current,
    };
  }

  const nextVersion = current.version + 1;
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO inventory_state (user_id, items_json, version, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        items_json = excluded.items_json,
        version = excluded.version,
        updated_at = excluded.updated_at
      `,
    )
    .bind(userId, JSON.stringify(items), nextVersion, updatedAt)
    .run();

  return {
    items,
    version: nextVersion,
    updatedAt,
  };
}

function getItemKeys(item) {
  const id = String(item?.id || "").trim();
  const sourceRef = String(item?.sourceRef || "").trim();
  return [id ? `id:${id}` : "", sourceRef ? `source:${sourceRef}` : ""].filter(Boolean);
}

function isIncomingItemNewer(incoming, existing) {
  const incomingTime = Date.parse(incoming?.updatedAt || "");
  const existingTime = Date.parse(existing?.updatedAt || "");
  if (Number.isFinite(incomingTime) && Number.isFinite(existingTime)) return incomingTime >= existingTime;
  if (Number.isFinite(incomingTime)) return true;
  if (Number.isFinite(existingTime)) return false;
  return true;
}

function mergeInventoryItems(currentItems, incomingItems, options = {}) {
  const merged = currentItems.filter((item) => item && typeof item === "object").map((item) => ({ ...item }));
  const indexByKey = new Map();

  function indexItem(item, index) {
    getItemKeys(item).forEach((key) => indexByKey.set(key, index));
  }

  merged.forEach(indexItem);
  incomingItems.forEach((incoming) => {
    if (!incoming || typeof incoming !== "object" || !String(incoming.name || "").trim()) return;
    const keys = getItemKeys(incoming);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      const index = merged.push({ ...incoming }) - 1;
      indexItem(incoming, index);
      return;
    }

    const existing = merged[existingIndex];
    if (options.source === "calculator" && String(existing.status || "") !== "出品前") return;
    if (!isIncomingItemNewer(incoming, existing)) return;
    merged[existingIndex] = { ...existing, ...incoming, id: existing.id || incoming.id };
    indexItem(merged[existingIndex], existingIndex);
  });

  return merged;
}

async function handleRead(request, env) {
  if (!env.SEDORI_DB) {
    return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503, request);
  }

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  const state = await readState(env.SEDORI_DB, user.email);
  return jsonResponse({
    ...state,
    user: { email: user.email },
  }, 200, request);
}

async function handleWrite(request, env) {
  if (!env.SEDORI_DB) {
    return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503, request);
  }

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, request);
  }

  if (!Array.isArray(body.items)) {
    return jsonResponse({ error: "items must be an array." }, 400, request);
  }

  const itemsJson = JSON.stringify(body.items);
  if (itemsJson.length > 5_000_000) {
    return jsonResponse({ error: "Inventory payload is too large." }, 413, request);
  }

  const current = body.mode === "merge" ? await readState(env.SEDORI_DB, user.email) : null;
  const items = current
    ? mergeInventoryItems(current.items, body.items, { source: body.source })
    : body.items;
  if (JSON.stringify(items).length > 5_000_000) {
    return jsonResponse({ error: "Merged inventory payload is too large." }, 413, request);
  }
  if (current && JSON.stringify(items) === JSON.stringify(current.items)) {
    return jsonResponse({
      ...current,
      user: { email: user.email },
    }, 200, request);
  }
  const baseVersion = Number(body.baseVersion);
  const result = await writeState(
    env.SEDORI_DB,
    user.email,
    items,
    current ? current.version : baseVersion,
    body.force === true,
  );

  if (result.conflict) {
    return jsonResponse(
      {
        error: "Remote inventory has changed.",
        ...result.current,
        user: { email: user.email },
      },
      409,
      request,
    );
  }

  return jsonResponse({
    ...result,
    user: { email: user.email },
  }, 200, request);
}

export async function onRequestGet({ request, env }) {
  return handleRead(request, env);
}

export async function onRequestPut({ request, env }) {
  return handleWrite(request, env);
}

export async function onRequestPost({ request, env }) {
  return handleWrite(request, env);
}

export async function onRequestOptions({ request }) {
  return new Response(null, {
    status: 204,
    headers: getResponseHeaders(request),
  });
}
