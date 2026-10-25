// Kroger Public API: store locations and live product prices. https://developer.kroger.com
// Needs KROGER_CLIENT_ID and KROGER_CLIENT_SECRET (app registered with scope product.compact).
import { tokens } from "./ingredients.js";

const API = "https://api.kroger.com/v1";
let cached = { token: null, expires: 0 };

export function configured() {
  return Boolean(process.env.KROGER_CLIENT_ID && process.env.KROGER_CLIENT_SECRET);
}

async function token() {
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;
  if (!configured()) throw Object.assign(new Error("Kroger keys are not set"), { code: "not_configured" });
  const basic = Buffer.from(`${process.env.KROGER_CLIENT_ID}:${process.env.KROGER_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${API}/connect/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: "grant_type=client_credentials&scope=product.compact",
  });
  if (!r.ok) throw Object.assign(new Error(`Kroger auth ${r.status}`), { code: "auth_failed" });
  const j = await r.json();
  cached = { token: j.access_token, expires: Date.now() + (j.expires_in || 1800) * 1000 };
  return cached.token;
}

async function get(path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Kroger ${r.status}`);
  return r.json();
}

/** Nearest Kroger-family store (Smith's in Utah, Ralphs, Fry's, King Soopers...). */
export async function nearestStore(zip) {
  const j = await get(`/locations?filter.zipCode.near=${encodeURIComponent(zip)}&filter.limit=1`);
  const s = (j.data || [])[0];
  if (!s) return null;
  return {
    locationId: s.locationId, name: s.name, chain: s.chain,
    address: [s.address?.addressLine1, s.address?.city, s.address?.state].filter(Boolean).join(", "),
  };
}

function bestPrice(product) {
  for (const it of product.items || []) {
    const p = it.price || {};
    const regular = Number(p.regular) || 0, promo = Number(p.promo) || 0;
    if (regular || promo) return { price: promo && promo < regular ? promo : regular, regular, onSale: Boolean(promo && promo < regular), size: it.size || "" };
  }
  return null;
}

export async function priceItem(name, locationId) {
  const term = tokens(name).join(" ") || name;
  const j = await get(`/products?filter.term=${encodeURIComponent(term)}&filter.locationId=${encodeURIComponent(locationId)}&filter.limit=5`);
  for (const p of j.data || []) {
    const bp = bestPrice(p);
    if (bp) return { name, product: p.description, brand: p.brand || "", ...bp };
  }
  return { name, product: null, price: null };
}

export async function priceList(names, zip) {
  const store = await nearestStore(zip);
  if (!store) return { store: null, items: [], total: 0 };
  const items = await Promise.all(names.map(n => priceItem(n, store.locationId).catch(() => ({ name: n, product: null, price: null }))));
  const total = items.reduce((t, i) => t + (i.price || 0), 0);
  return { store, items, total: Math.round(total * 100) / 100 };
}
