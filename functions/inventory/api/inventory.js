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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
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
  const devEmail =
    env.ALLOW_DEV_USER_HEADER === "true" ? normalizeEmail(request.headers.get("x-inventory-user-email")) : "";
  const email = accessEmail || devEmail;
  if (!email) return { error: jsonResponse({ error: "Cloudflare Access login is required." }, 401) };

  const allowedEmails = getAllowedEmails(env);
  if (allowedEmails.length && !allowedEmails.includes(email)) {
    return { error: jsonResponse({ error: "This user is not allowed to access this inventory." }, 403) };
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

async function handleRead(request, env) {
  if (!env.SEDORI_DB) {
    return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503);
  }

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  const state = await readState(env.SEDORI_DB, user.email);
  return jsonResponse({
    ...state,
    user: { email: user.email },
  });
}

async function handleWrite(request, env) {
  if (!env.SEDORI_DB) {
    return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503);
  }

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (!Array.isArray(body.items)) {
    return jsonResponse({ error: "items must be an array." }, 400);
  }

  const itemsJson = JSON.stringify(body.items);
  if (itemsJson.length > 5_000_000) {
    return jsonResponse({ error: "Inventory payload is too large." }, 413);
  }

  const baseVersion = Number(body.baseVersion);
  const result = await writeState(env.SEDORI_DB, user.email, body.items, baseVersion, body.force === true);

  if (result.conflict) {
    return jsonResponse(
      {
        error: "Remote inventory has changed.",
        ...result.current,
        user: { email: user.email },
      },
      409,
    );
  }

  return jsonResponse({
    ...result,
    user: { email: user.email },
  });
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

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: jsonHeaders,
  });
}
