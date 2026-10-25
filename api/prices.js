// GET /api/prices?items=eggs,cilantro&zip=84770
import { priceList, configured } from "../lib/kroger.js";
import { list, send, query } from "../lib/http.js";

export default async function handler(req, res) {
  const q = query(req);
  if (!configured()) return send(res, 501, { error: "Store prices aren't set up on this site yet." });
  const items = list(q.items);
  const zip = String(q.zip || "").trim();
  if (!/^\d{5}$/.test(zip)) return send(res, 400, { error: "Enter a 5-digit ZIP code." });
  if (!items.length) return send(res, 200, { store: null, items: [], total: 0 });
  try {
    const out = await priceList(items, zip);
    if (!out.store) return send(res, 404, { error: `No Kroger-family store found near ${zip}.` });
    send(res, 200, out, 1800);
  } catch (e) {
    send(res, 502, { error: e.code === "auth_failed" ? "The Kroger keys on this site were rejected." : "Kroger didn't answer. Try again in a moment." });
  }
}
