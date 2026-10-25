// TheMealDB: free recipe database with photos. https://www.themealdb.com/api.php
// The test key "1" is allowed for development and education. Set MEALDB_KEY for a premium key.
import { searchVariants, coverage } from "./ingredients.js";

const KEY = () => process.env.MEALDB_KEY || "1";
const BASE = () => `https://www.themealdb.com/api/json/v1/${KEY()}`;

// The app's cuisine chips mapped onto TheMealDB's "areas".
export const CUISINES = {
  Mexican: ["Mexican"],
  Asian: ["Chinese", "Japanese", "Thai", "Vietnamese", "Malaysian", "Filipino"],
  Italian: ["Italian"],
  Mediterranean: ["Greek", "Italian", "Spanish", "Turkish", "Moroccan", "Croatian", "Tunisian", "Portuguese"],
  Indian: ["Indian"],
  American: ["American", "Canadian"],
};

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TheMealDB ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}

export async function filterByIngredient(name) {
  const j = await getJson(`${BASE()}/filter.php?i=${encodeURIComponent(name.replace(/ /g, "_"))}`);
  return Array.isArray(j.meals) ? j.meals : [];
}

export async function filterByArea(area) {
  const j = await getJson(`${BASE()}/filter.php?a=${encodeURIComponent(area)}`);
  return Array.isArray(j.meals) ? j.meals : [];
}

/** Full recipe, with ingredients turned into a clean list. */
export async function lookup(id) {
  const j = await getJson(`${BASE()}/lookup.php?i=${encodeURIComponent(id)}`);
  const m = j.meals && j.meals[0];
  return m ? normalize(m) : null;
}

export function normalize(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] || "").trim();
    if (name) ingredients.push({ name, measure: (m[`strMeasure${i}`] || "").trim() });
  }
  const steps = String(m.strInstructions || "")
    .split(/\r?\n+/)
    .map(s => s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, "").trim())
    .filter(s => s.length > 2);
  return {
    id: m.idMeal,
    source: "themealdb",
    title: m.strMeal,
    cuisine: m.strArea || "",
    category: m.strCategory || "",
    photo: m.strMealThumb || "",
    youtube: m.strYoutube || "",
    link: m.strSource || "",
    servings: 4,
    ingredients,
    steps,
  };
}

/**
 * Recipes that use what's in the fridge, best match first.
 * Returns { recipes, note } where each recipe carries have/need/staples counts.
 */
export async function findRecipes(fridge, { cuisine = "any", pantry = true, limit = 12 } = {}) {
  // 1. Every recipe that uses at least one fridge item, scored by how many items it uses.
  const hits = new Map(); // id -> { meal, items:Set }
  await Promise.all(fridge.map(async item => {
    for (const variant of searchVariants(item)) {
      let meals = [];
      try { meals = await filterByIngredient(variant); } catch { meals = []; }
      if (!meals.length) continue;
      for (const meal of meals) {
        const h = hits.get(meal.idMeal) || { meal, items: new Set() };
        h.items.add(item);
        hits.set(meal.idMeal, h);
      }
      break; // first variant that finds anything wins
    }
  }));

  // 2. Cuisine filter.
  let pool = [...hits.values()];
  let note = "";
  const areas = CUISINES[cuisine];
  const ids = new Set();
  if (areas) {
    await Promise.all(areas.map(async a => {
      try { (await filterByArea(a)).forEach(m => ids.add(m.idMeal)); } catch {}
    }));
    const inStyle = pool.filter(h => ids.has(h.meal.idMeal));
    if (inStyle.length >= 3) pool = inStyle;
    else if (inStyle.length) {
      note = `Only ${inStyle.length} ${cuisine} ${inStyle.length === 1 ? "recipe uses" : "recipes use"} your ingredients, so other styles are included too.`;
      pool = [...inStyle, ...pool.filter(h => !ids.has(h.meal.idMeal))];
    } else {
      note = `No ${cuisine} recipes use your ingredients yet. Here are the closest matches in other styles.`;
    }
  }

  // 3. Look up the strongest candidates and measure real coverage.
  pool.sort((a, b) => b.items.size - a.items.size);
  const candidates = pool.slice(0, Math.max(limit + 6, 18));
  const full = await Promise.all(candidates.map(h => lookup(h.meal.idMeal).catch(() => null)));
  const recipes = full.filter(Boolean).map(r => {
    const c = coverage(fridge, r.ingredients, { pantry });
    return {
      id: r.id, source: r.source, title: r.title, cuisine: r.cuisine, category: r.category, photo: r.photo,
      have: c.have.map(i => i.name), need: c.need.map(i => i.name), staples: c.staples.map(i => i.name),
      total: r.ingredients.length,
      inStyle: areas ? ids.has(r.id) : true,
    };
  }).filter(r => r.have.length > 0);
  recipes.sort((a, b) =>
    (Number(b.inStyle) - Number(a.inStyle)) || (a.need.length - b.need.length) || (b.have.length - a.have.length));
  return { recipes: recipes.slice(0, limit), note, searched: hits.size };
}
