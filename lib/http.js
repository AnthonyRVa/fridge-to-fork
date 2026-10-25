// Small helpers shared by the API routes.
export function list(param) {
  return String(param || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 25);
}
export function send(res, status, body, cacheSeconds = 0) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cacheSeconds && status === 200) res.setHeader("Cache-Control", `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`);
  else res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}
export function query(req) {
  return Object.fromEntries(new URL(req.url, "http://x").searchParams);
}
