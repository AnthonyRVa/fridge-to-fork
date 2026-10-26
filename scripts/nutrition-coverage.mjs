// How many ingredient lines in real TheMealDB recipes resolve to a checked USDA entry?
import { readFileSync } from "node:fs";
import { lookupFood } from "../lib/usda.js";
import { normalize } from "../lib/mealdb.js";

process.env.USDA_API_KEY = ""; // offline: only the MCP-built table counts
const cache = JSON.parse(readFileSync(new URL("../loop/.cache.json", import.meta.url), "utf8"));
const seen = new Set(), counts = new Map();
let lines = 0, hits = 0;
for (const [url, body] of Object.entries(cache)) {
  if (!url.includes("lookup.php") || !body) continue;
  const m = JSON.parse(body).meals?.[0];
  if (!m || seen.has(m.idMeal)) continue;
  seen.add(m.idMeal);
  for (const ing of normalize(m).ingredients) {
    if (/^(salt|water|black pepper|pepper|ice)$/i.test(ing.name.trim())) continue; // no calories to count
    lines++;
    let f = null;
    try { f = await lookupFood(ing.name); } catch {}
    if (f) hits++; else counts.set(ing.name.toLowerCase(), (counts.get(ing.name.toLowerCase()) || 0) + 1);
  }
}
console.log(`${seen.size} recipes, ${lines} ingredient lines, ${hits} covered by the MCP table (${Math.round(hits / lines * 100)}%)`);
console.log("Most common uncovered:", [...counts].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([n, c]) => `${n} (${c})`).join(", "));
