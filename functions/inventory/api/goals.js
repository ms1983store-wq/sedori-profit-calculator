const tableSql = `
CREATE TABLE IF NOT EXISTS inventory_goals (
  user_id TEXT PRIMARY KEY,
  goals_json TEXT NOT NULL,
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
    headers["access-control-allow-methods"] = "GET, PUT, OPTIONS";
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
    return { error: jsonResponse({ error: "This user is not allowed to access these goals." }, 403, request) };
  }
  return { email };
}

function normalizeValue(value, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), maximum);
}

function normalizeGoals(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([month, goal]) => /^\d{4}-\d{2}$/.test(month) && goal && typeof goal === "object")
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-120)
      .map(([month, goal]) => [
        month,
        {
          sales: Math.round(normalizeValue(goal.sales, 1_000_000_000)),
          profit: Math.round(normalizeValue(goal.profit, 1_000_000_000)),
          soldCount: Math.round(normalizeValue(goal.soldCount, 100_000)),
          margin: normalizeValue(goal.margin, 100),
          updatedAt: String(goal.updatedAt || ""),
        },
      ]),
  );
}

async function ensureSchema(db) {
  await db.prepare(tableSql).run();
}

async function readState(db, userId) {
  await ensureSchema(db);
  const row = await db
    .prepare("SELECT goals_json, version, updated_at FROM inventory_goals WHERE user_id = ?")
    .bind(userId)
    .first();
  if (!row) return { goals: {}, version: 0, updatedAt: null };

  let goals = {};
  try {
    goals = normalizeGoals(JSON.parse(row.goals_json || "{}"));
  } catch {
    goals = {};
  }
  return {
    goals,
    version: Number(row.version) || 0,
    updatedAt: row.updated_at || null,
  };
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
  if (!body.goals || typeof body.goals !== "object" || Array.isArray(body.goals)) {
    return jsonResponse({ error: "goals must be an object." }, 400, request);
  }

  const goals = normalizeGoals(body.goals);
  const goalsJson = JSON.stringify(goals);
  if (goalsJson.length > 300_000) {
    return jsonResponse({ error: "Goal payload is too large." }, 413, request);
  }

  const current = await readState(env.SEDORI_DB, user.email);
  const baseVersion = Number(body.baseVersion);
  if (body.force !== true && Number.isFinite(baseVersion) && current.version > baseVersion) {
    return jsonResponse(
      { error: "Remote goals have changed.", ...current, user: { email: user.email } },
      409,
      request,
    );
  }

  const nextVersion = current.version + 1;
  const updatedAt = new Date().toISOString();
  await env.SEDORI_DB.prepare(
    `
    INSERT INTO inventory_goals (user_id, goals_json, version, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      goals_json = excluded.goals_json,
      version = excluded.version,
      updated_at = excluded.updated_at
    `,
  )
    .bind(user.email, goalsJson, nextVersion, updatedAt)
    .run();

  return jsonResponse(
    { goals, version: nextVersion, updatedAt, user: { email: user.email } },
    200,
    request,
  );
}

export async function onRequestGet({ request, env }) {
  return handleRead(request, env);
}

export async function onRequestPut({ request, env }) {
  return handleWrite(request, env);
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: getResponseHeaders(request) });
}
