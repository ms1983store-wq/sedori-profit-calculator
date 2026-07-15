const tableSql = `
CREATE TABLE IF NOT EXISTS calculator_state (
  user_id TEXT PRIMARY KEY,
  records_json TEXT NOT NULL,
  stores_json TEXT NOT NULL,
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
    return { error: jsonResponse({ error: "This user is not allowed to access calculator data." }, 403, request) };
  }

  return { email };
}

async function ensureSchema(db) {
  await db.prepare(tableSql).run();
}

async function readState(db, userId) {
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT records_json, stores_json, version, updated_at FROM calculator_state WHERE user_id = ?")
    .bind(userId)
    .first();

  if (!row) {
    return { records: [], stores: [], version: 0, updatedAt: null };
  }

  let records = [];
  let stores = [];
  try {
    const parsed = JSON.parse(row.records_json || "[]");
    records = Array.isArray(parsed) ? parsed : [];
  } catch {
    records = [];
  }
  try {
    const parsed = JSON.parse(row.stores_json || "[]");
    stores = Array.isArray(parsed) ? parsed : [];
  } catch {
    stores = [];
  }

  return {
    records,
    stores,
    version: Number(row.version) || 0,
    updatedAt: row.updated_at || null,
  };
}

async function writeState(db, userId, records, stores, baseVersion, force) {
  await ensureSchema(db);
  const current = await readState(db, userId);

  if (!force && Number.isFinite(baseVersion) && current.version > baseVersion) {
    return { conflict: true, current };
  }

  const nextVersion = current.version + 1;
  const updatedAt = new Date().toISOString();
  await db
    .prepare(
      `
      INSERT INTO calculator_state (user_id, records_json, stores_json, version, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        records_json = excluded.records_json,
        stores_json = excluded.stores_json,
        version = excluded.version,
        updated_at = excluded.updated_at
      `,
    )
    .bind(userId, JSON.stringify(records), JSON.stringify(stores), nextVersion, updatedAt)
    .run();

  return { records, stores, version: nextVersion, updatedAt };
}

async function handleRead(request, env) {
  if (!env.SEDORI_DB) {
    return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503, request);
  }

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  const state = await readState(env.SEDORI_DB, user.email);
  return jsonResponse({ ...state, user: { email: user.email } }, 200, request);
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

  if (!Array.isArray(body.records) || !Array.isArray(body.stores)) {
    return jsonResponse({ error: "records and stores must be arrays." }, 400, request);
  }

  const payloadSize = JSON.stringify({ records: body.records, stores: body.stores }).length;
  if (payloadSize > 5_000_000) {
    return jsonResponse({ error: "Calculator payload is too large." }, 413, request);
  }

  const result = await writeState(
    env.SEDORI_DB,
    user.email,
    body.records,
    [...new Set(body.stores.map((store) => String(store || "").trim()).filter(Boolean))],
    Number(body.baseVersion),
    body.force === true,
  );

  if (result.conflict) {
    return jsonResponse(
      {
        error: "Remote calculator data has changed.",
        ...result.current,
        user: { email: user.email },
      },
      409,
      request,
    );
  }

  return jsonResponse({ ...result, user: { email: user.email } }, 200, request);
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
