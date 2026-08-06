const tableSql = `
CREATE TABLE IF NOT EXISTS inventory_photos (
  user_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  image_blob BLOB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, photo_id)
)
`;

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxPhotoBytes = 1_500_000;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
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
    env.ALLOW_DEV_USER_HEADER === "true"
      ? normalizeEmail(request.headers.get("x-inventory-user-email")) || "local-photo-test@example.invalid"
      : "";
  const email = devEmail || (accessEmail && accessJwt ? accessEmail : "");
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

function normalizePhotoId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9-]{8,80}$/.test(id) ? id : "";
}

function toResponseBody(value) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return new Uint8Array(value);
  return new Uint8Array();
}

export async function onRequestGet({ request, env }) {
  if (!env.SEDORI_DB) return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503);

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  const url = new URL(request.url);
  const photoId = normalizePhotoId(url.searchParams.get("id"));
  if (!photoId) return jsonResponse({ error: "A valid photo id is required." }, 400);

  await ensureSchema(env.SEDORI_DB);
  const photo = await env.SEDORI_DB.prepare(
    "SELECT content_type, image_blob FROM inventory_photos WHERE user_id = ? AND photo_id = ?",
  )
    .bind(user.email, photoId)
    .first();

  if (!photo) return jsonResponse({ error: "Photo not found." }, 404);

  return new Response(toResponseBody(photo.image_blob), {
    headers: {
      "content-type": photo.content_type || "image/jpeg",
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.SEDORI_DB) return jsonResponse({ error: "D1 binding SEDORI_DB is not configured." }, 503);

  const user = getUserEmail(request, env);
  if (user.error) return user.error;

  const contentType = String(request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!allowedImageTypes.has(contentType)) {
    return jsonResponse({ error: "JPEG, PNG, or WebP image is required." }, 415);
  }

  const contentLength = Number(request.headers.get("content-length")) || 0;
  if (contentLength > maxPhotoBytes) return jsonResponse({ error: "Photo is too large." }, 413);

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength) return jsonResponse({ error: "Photo is empty." }, 400);
  if (bytes.byteLength > maxPhotoBytes) return jsonResponse({ error: "Photo is too large." }, 413);

  await ensureSchema(env.SEDORI_DB);
  const photoId = crypto.randomUUID();
  await env.SEDORI_DB.prepare(
    `INSERT INTO inventory_photos (user_id, photo_id, content_type, image_blob, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(user.email, photoId, contentType, bytes, new Date().toISOString())
    .run();

  const photoUrl = new URL(request.url);
  photoUrl.search = "";
  photoUrl.searchParams.set("id", photoId);
  return jsonResponse({ id: photoId, url: photoUrl.href }, 201);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      allow: "GET, POST, OPTIONS",
      "cache-control": "no-store",
    },
  });
}
