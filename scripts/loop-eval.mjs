// Step 4 loop: score recipe search across many fridges x cuisines.
// Usage: node scripts/loop-eval.mjs [round-label]   (writes loop/round-<label>.json)
import { findRecipes, CUISINES as AREAS, GENERIC_AREAS } from "../lib/mealdb.js";
import { tokens } from "../lib/ingredients.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

// Cache TheMealDB answers on disk so each round re-checks our logic, not the network.
const CACHE = new URL("../loop/.cache.json", import.meta.url);
mkdirSync(new URL("../loop/", import.meta.url), { recursive: true });
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const key = String(url);
  if (!(key in cache)) {
    const r = await realFetch(url, opts);
    cache[key] = r.ok ? await r.text() : null;
  }
  const body = cache[key];
  return new Response(body ?? "", { status: body == null ? 502 : 200 });
};

export const FRIDGES = {
  "Breakfast leftovers": ["eggs", "cheddar", "tortillas", "salsa", "onion", "spinach"],
  "Chicken & rice": ["chicken breast", "rice", "broccoli", "soy sauce", "carrots"],
  "Pasta night": ["ground beef", "pasta", "tomatoes", "onion", "bell pepper"],
  "Fish dinner": ["salmon", "potatoes", "lemon", "green beans"],
  "Plant based": ["tofu", "rice", "cabbage", "mushrooms", "ginger"],
  "Mezze": ["chickpeas", "yogurt", "cucumber", "tomatoes", "lemon"],
  "Diner": ["bacon", "eggs", "bread", "cheese", "milk"],
  "Taco Tuesday": ["shrimp", "lime", "avocado", "rice", "cilantro"],
};
export const CUISINES = ["any", "Mexican", "Latin American", "Asian", "Italian", "Mediterranean", "Indian", "American"];

// The checklist every fridge + cuisine combination must pass.
const MIN_OPTIONS = 3;   // at least 3 useful recipes to pick from
const MAX_TOP_NEED = 5;  // the best match needs at most 5 store items
const DERIVED = new Set(["stock", "broth", "sauce", "powder", "paste", "extract", "seasoning", "oil", "vinegar", "flake", "cube", "gravy", "noodle", "puree"]);

function falseMatches(fridge, recipe) {
  // "chicken" in the fridge should not tick off "chicken stock" in a recipe.
  return recipe.have.filter(ing => {
    const head = tokens(ing).at(-1);
    return DERIVED.has(head) && !fridge.some(f => tokens(f).includes(head));
  });
}

const label = process.argv[2] || "1";
const rows = [];
for (const [fname, fridge] of Object.entries(FRIDGES)) {
  for (const cuisine of CUISINES) {
    const out = await findRecipes(fridge, { cuisine, pantry: true, limit: 12 });
    const useful = out.recipes.filter(r => r.have.length >= 2);
    const inStyle = useful.filter(r => r.inStyle);
    const top = out.recipes[0];
    const bad = out.recipes.flatMap(r => falseMatches(fridge, r).map(i => `${r.title}: ${i}`));
    const fails = [];
    if (useful.length < MIN_OPTIONS) fails.push(`only ${useful.length} useful options`);
    if (cuisine !== "any" && inStyle.length < MIN_OPTIONS && !out.note) fails.push(`only ${inStyle.length} ${cuisine} and no note shown`);
    // Is a shortfall our logic, or does the database simply not have more? styleHits is how many
    // in-style recipes use any fridge item at all; 40 or fewer means every one of them was checked.
    const dataLimited = out.styleHits != null && out.styleHits <= 40;
    if (cuisine !== "any" && inStyle.length < MIN_OPTIONS) fails.push(`only ${inStyle.length} ${cuisine} options${dataLimited ? " (database limit)" : ""}`);
    // With no style chosen the top pick must need at most 5 items. With a style chosen it must be
    // the in-style recipe that needs the fewest items (the best that style can offer).
    if (cuisine === "any" && top && top.need.length > MAX_TOP_NEED) fails.push(`best match needs ${top.need.length} items`);
    if (cuisine !== "any" && top) {
      const pool = (inStyle.length ? inStyle : useful);
      const best = Math.min(...pool.map(r => r.need.length));
      if (top.need.length > best) fails.push(`top pick needs ${top.need.length} but a ${cuisine} option needs ${best}`);
    }
    if (bad.length) fails.push(`${bad.length} false ingredient matches`);
    // Added in round 5 after the live test showed "Spanish Tortilla" under Mexican:
    // an in-style recipe must not carry a different, specific cuisine label.
    const wrongStyle = cuisine === "any" ? [] : out.recipes.filter(r => r.inStyle && !GENERIC_AREAS.has(r.cuisine || "") && !AREAS[cuisine].includes(r.cuisine));
    if (wrongStyle.length) fails.push(`${wrongStyle.length} recipes in the wrong style (e.g. ${wrongStyle[0].title}, ${wrongStyle[0].cuisine})`);
    rows.push({ fridge: fname, cuisine, options: useful.length, inStyle: inStyle.length, topNeed: top?.need.length ?? null,
      top: top?.title ?? null, falseMatches: bad.slice(0, 5), note: out.note, styleHits: out.styleHits, pass: fails.length === 0, fails });
  }
}
writeFileSync(CACHE, JSON.stringify(cache));

const passed = rows.filter(r => r.pass).length;
const summary = { round: label, passed, total: rows.length, at: new Date().toISOString(),
  failsByType: rows.flatMap(r => r.fails.map(f => f.replace(/\d+/g, "N"))).reduce((m, f) => (m[f] = (m[f] || 0) + 1, m), {}) };
writeFileSync(new URL(`../loop/round-${label}.json`, import.meta.url), JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of rows.filter(r => !r.pass)) console.log(`FAIL ${r.fridge} / ${r.cuisine}: ${r.fails.join("; ")}${r.falseMatches.length ? "  e.g. " + r.falseMatches[0] : ""}`);
