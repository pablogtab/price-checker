// This listener is the public security boundary. Keep every permitted API route explicit.
import http from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(
  process.env.PUBLIC_BUILD_ROOT ||
    fileURLToPath(new URL("../dist/storefront/browser", import.meta.url)),
);
const api = new URL(process.env.STOREFRONT_API_URL || "http://127.0.0.1:3215");
if (!["http:", "https:"].includes(api.protocol) || api.pathname !== "/")
  throw Error("API origin required");
const files = new Set(
  (await readdir(root)).filter((name) =>
    /^[A-Za-z0-9_-]+\.(js|css|woff2|ico|png|svg)$/.test(name),
  ),
);
const routes = [
  /^\/api\/public\/storefront\/media\/[1-9][0-9]*\/(mobile|desktop)$/,
  /^\/api\/public\/storefront\/categories$/,
  /^\/api\/public\/storefront\/catalog$/,
  /^\/api\/public\/storefront\/presentations\/[1-9][0-9]*$/,
  /^\/api\/public\/storefront\/images\/[a-f0-9]{64}$/,
];
function fail(res, status) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(
    JSON.stringify({
      message: status === 405 ? "Método no permitido" : "Recurso inexistente",
    }),
  );
}
const server = http.createServer(async (req, res) => {
  try {
    const raw = req.url || "/";
    const path = raw.split("?")[0];
    // Reject noncanonical paths before URL decoding/normalization can turn them into an allowed route.
    if (
      path.includes("%") ||
      path.includes("//") ||
      path.split("/").some((x) => x === "." || x === "..") ||
      path.includes("\\")
    )
      return fail(res, 404);
    const publicApi = routes.some((route) => route.test(path));
    const asset = files.has(path.slice(1));
    const page = path === "/" || /^\/products\/[1-9][0-9]*$/.test(path);
    if (!publicApi && !asset && !page) return fail(res, 404);
    if (!["GET", "HEAD"].includes(req.method)) return fail(res, 405);
    if (publicApi) {
      const upstream = await fetch(new URL(raw, api), {
        method: req.method,
        redirect: "error",
      });
      res.writeHead(upstream.status, {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(
        req.method === "HEAD"
          ? undefined
          : Buffer.from(await upstream.arrayBuffer()),
      );
      return;
    }
    const name = page ? "index.html" : path.slice(1);
    const data = await readFile(join(root, name));
    const type = name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".html")
          ? "text/html"
          : name.endsWith(".svg")
            ? "image/svg+xml"
            : name.endsWith(".woff2")
              ? "font/woff2"
              : "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    fail(res, 502);
  }
});
server.listen(
  Number(process.env.PORT || 4315),
  process.env.HOST || "127.0.0.1",
  () => console.log(`Public storefront listening on ${server.address().port}`),
);
