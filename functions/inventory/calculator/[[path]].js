const calculatorPrefix = "/inventory/calculator/";

function getAssetPath(pathname) {
  const relativePath = pathname.startsWith(calculatorPrefix)
    ? pathname.slice(calculatorPrefix.length)
    : "";

  if (!relativePath) return "/";
  if (relativePath === "calendar" || relativePath === "calendar/") return "/calendar/";

  const allowedFiles = new Set([
    "app.js",
    "cloud-sync.js",
    "manifest.webmanifest",
    "styles.css",
    "sw.js",
  ]);
  if (allowedFiles.has(relativePath)) return `/${relativePath}`;
  if (/^icons\/icon-(192|512)\.svg$/.test(relativePath)) return `/${relativePath}`;

  return "";
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === "/inventory/calculator") {
    requestUrl.pathname = `${requestUrl.pathname}/`;
    return Response.redirect(requestUrl.href, 302);
  }
  const assetPath = getAssetPath(requestUrl.pathname);
  if (!assetPath) return new Response("Not Found", { status: 404 });

  const assetUrl = new URL(assetPath, requestUrl.origin);
  assetUrl.search = requestUrl.search;
  return env.ASSETS.fetch(new Request(assetUrl, request));
}
