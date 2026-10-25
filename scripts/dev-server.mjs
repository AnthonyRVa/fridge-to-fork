// Local server that behaves like Vercel: static files from public/, functions from api/.
// MOCK=1 swaps the outside APIs for canned answers so the site can be tested offline.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

if (process.env.MOCK) {
  const { mockFetch } = await import("./mock-apis.mjs");
  globalThis.fetch = mockFetch;
  process.env.USDA_API_KEY ||= "mock";
  process.env.KROGER_CLIENT_ID ||= "mock";
  process.env.KROGER_CLIENT_SECRET ||= "mock";
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, "");
      const mod = await import(pathToFileURL(join(root, "api", `${name}.js`)).href);
      return await mod.default(req, res);
    }
    if (url.pathname.startsWith("/mock-photo/")) {
      const id = Number(url.pathname.split("/").pop()) || 1;
      const hue = (id * 47) % 360;
      res.setHeader("Content-Type", "image/svg+xml");
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue} 55% 55%)"/><circle cx="200" cy="160" r="95" fill="hsl(${hue} 30% 92%)"/><circle cx="200" cy="160" r="70" fill="hsl(${(hue + 40) % 360} 60% 50%)"/></svg>`);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (p === "/" || p === "\\") p = "/index.html";
    const file = join(root, "public", p);
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.end(body);
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ERR_MODULE_NOT_FOUND") { res.statusCode = 404; return res.end("Not found"); }
    console.error(e);
    res.statusCode = 500; res.end("Server error");
  }
}).listen(PORT, () => console.log(`Fridge to Fork on http://localhost:${PORT}${process.env.MOCK ? " (mock APIs)" : ""}`));
