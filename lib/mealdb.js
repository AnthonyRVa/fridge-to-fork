// TheMealDB: free recipe database with photos. https://www.themealdb.com/api.php
// The test key "1" is allowed for development and education. Set MEALDB_KEY for a premium key.
import { searchVariants, coverage } from "./ingredients.js";

const KEY = () => process.env.MEALDB_KEY || "1";
const BASE = () => `https://www.themealdb.com/api/json/v1/${KEY()}`;

// The app's cuisine chips mapped onto TheMealDB's "areas".
export const CUISINES = {
  Mexican: ["Mexican"],
  "Latin American": ["Mexican", "Argentine", "Bolivian", "Brazilian", "Chilean", "Colombian", "Costa Rican", "Cuban",
    "Dominican", "Ecuadorean", "Salvadoran", "Guatemalan", "Honduran", "Nicaraguan", "Panamanian", "Paraguayan",
    "Peruvian", "Puerto Rican", "Uruguayan", "Venezuelan", "Jamaican", "Belizean"],
  Asian: ["Chinese", "Japanese", "Thai", "Vietnamese", "Malaysian", "Filipino", "Indonesian", "South Korean", "North Korean",
    "Taiwanese", "Hong Konger", "Singaporean", "Cambodian", "Laotian", "Burmese", "Mongolian"],
  Italian: ["Italian"],
  Mediterranean: ["Greek", "Italian", "Spanish", "Turkish", "Moroccan", "Croatian", "Tunisian", "Portuguese", "Lebanese",
    "Cypriot", "Maltese", "Israeli", "Egyptian", "Syrian", "Palestinian", "Algerian", "Libyan", "Montenegrin", "Albanian"],
  Indian: ["Indian", "Pakistani", "Bangladeshi", "Sri Lankan", "Nepalese"],
  American: ["American", "Canadian"],
};

// Some recipes have no cuisine label. Give them one from their name.
const HINTS = {
  Mexican: /\b(taco|burrito|enchilada|quesadilla|fajita|salsa|tortilla|chipotle|jalape|guacamole|tamale|mole|elote|carnitas|chilaquiles|pozole|huevos|nacho)/i,
  "Latin American": /\b(taco|burrito|enchilada|quesadilla|fajita|salsa|empanada|arepa|pollo|arroz|feijoada|ceviche|chimichurri|gallo pinto|plantain|jerk)/i,
  Asian: /\b(stir[- ]?fry|teriyaki|ramen|udon|pho|pad thai|fried rice|dumpling|bao|kimchi|bibimbap|bulgogi|satay|curry laksa|katsu|sushi|miso|lo mein|chow mein|egg roll|spring roll)/i,
  Italian: /\b(pasta|risotto|lasagn|parmigian|carbonara|pesto|gnocchi|ravioli|bolognese|arrabbiata|focaccia|frittata|minestrone|osso buco|tiramisu|pizza|penne|spaghetti)/i,
  Mediterranean: /\b(hummus|falafel|tzatziki|shakshuka|tabbouleh|souvlaki|gyro|moussaka|paella|tagine|couscous|pita|feta|halloumi|kebab)/i,
  Indian: /\b(curry|masala|tikka|dal|dhal|biryani|paneer|korma|vindaloo|naan|samosa|pakora|chana|saag|aloo)/i,
  American: /\b(burger|mac (and|&) cheese|bbq|barbecue|pancake|meatloaf|sloppy|buffalo|cornbread|grits|hash brown|pot pie|chowder|cobbler)/i,
};

// In style if TheMealDB files it under a matching region, or the dish itself is a
// classic of that style (Chicken Tikka Masala is filed as "British", tacos often as "American").
function fitsStyle(cuisine, areaIds, recipe) {
  return areaIds.has(recipe.id) || Boolean(HINTS[cuisine]?.test(recipe.title));
}

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

  // 2. Which recipes are in the chosen style (by region, or by name when unlabeled).
  const areas = CUISINES[cuisine];
  const ids = new Set();
  if (areas) {
    await Promise.all(areas.map(async a => {
      try { (await filterByArea(a)).forEach(m => ids.add(m.idMeal)); } catch {}
    }));
  }
  const nameFits = h => Boolean(HINTS[cuisine]?.test(h.meal.strMeal));
  const likely = h => ids.has(h.meal.idMeal) || nameFits(h);

  // 3. Look up the strongest candidates: likely in-style ones first, then the best overall matches.
  const pool = [...hits.values()].sort((a, b) =>
    (areas ? Number(likely(b)) - Number(likely(a)) : 0) || (b.items.size - a.items.size));
  const styled = areas ? pool.filter(likely).slice(0, 40) : [];
  const overall = pool.filter(h => !styled.includes(h)).slice(0, 18);
  const full = await Promise.all([...styled, ...overall].map(h => lookup(h.meal.idMeal).catch(() => null)));
  const all = full.filter(Boolean).map(r => {
    const c = coverage(fridge, r.ingredients, { pantry });
    return {
      id: r.id, source: r.source, title: r.title, cuisine: r.cuisine, category: r.category, photo: r.photo,
      have: c.have.map(i => i.name), need: c.need.map(i => i.name), staples: c.staples.map(i => i.name),
      total: r.ingredients.length,
      inStyle: areas ? fitsStyle(cuisine, ids, r) : true,
    };
  }).filter(r => r.have.length > 0);

  // 4. Rank: recipes that really use the fridge (2+ items) beat ones that use 1;
  // within that, in-style first, then fewest things to buy.
  const useful = r => r.have.length >= 2;
  all.sort((a, b) =>
    (Number(useful(b)) - Number(useful(a))) || (Number(b.inStyle) - Number(a.inStyle)) ||
    (a.need.length - b.need.length) || (b.have.length - a.have.length));
  const recipes = all.slice(0, limit);

  let note = "";
  if (areas) {
    const n = recipes.filter(r => r.inStyle && useful(r)).length;
    if (n === 0) note = `None of our ${cuisine} recipes use your ingredients yet, so here are the closest matches in other styles.`;
    else if (n < 3) note = `Only ${n} ${cuisine} ${n === 1 ? "recipe uses" : "recipes use"} your ingredients, so other styles are included too.`;
  }
  return { recipes, note, searched: hits.size, styleHits: areas ? pool.filter(likely).length : null };
}
