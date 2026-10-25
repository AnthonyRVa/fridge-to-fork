// USDA FoodData Central: nutrition per 100 g for whole foods. https://fdc.nal.usda.gov/api-guide
// Needs USDA_API_KEY (free from https://fdc.nal.usda.gov/api-key-signup).
import { tokens } from "./ingredients.js";
import { gramsFor } from "./measure.js";
import { readFileSync } from "node:fs";

// Values looked up ahead of time (with the food-data-central MCP) so common
// ingredients never wait on USDA. Keyed by simplified ingredient name.
let BAKED = {};
try { BAKED = JSON.parse(readFileSync(new URL("./usda-baked.json", import.meta.url), "utf8")); } catch {}

const ENERGY = [1008, 2047, 2048];

function pick(nutrients, ids, unit) {
  for (const id of ids) {
    const n = nutrients.find(x => (x.nutrientId === id || x.nutrient?.id === id) &&
      (!unit || String(x.unitName || x.nutrient?.unitName || "").toUpperCase() === unit));
    if (n) return Number(n.value ?? n.amount) || 0;
  }
  return 0;
}

export function per100(food) {
  const ns = food.foodNutrients || [];
  return {
    kcal: pick(ns, ENERGY, "KCAL"),
    protein: pick(ns, [1003]),
    carbs: pick(ns, [1005]),
    fat: pick(ns, [1004]),
  };
}

async function search(name) {
  const key = process.env.USDA_API_KEY;
  if (!key) throw Object.assign(new Error("USDA_API_KEY is not set"), { code: "not_configured" });
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(name)}&dataType=${encodeURIComponent("Foundation,SR Legacy")}&pageSize=3`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`USDA ${r.status}`);
  const j = await r.json();
  const food = (j.foods || []).find(f => per100(f).kcal > 0) || (j.foods || [])[0];
  return food ? { fdcId: food.fdcId, description: food.description, ...per100(food) } : null;
}

export async function lookupFood(name) {
  const key = tokens(name).join(" ");
  if (BAKED[key]) return { ...BAKED[key], from: "baked" };
  const hit = await search(key || name);
  return hit ? { ...hit, from: "live" } : null;
}

/** Totals for a recipe and per serving. ingredients: [{name, measure}] */
export async function recipeNutrition(ingredients, servings = 4) {
  const rows = await Promise.all(ingredients.map(async ing => {
    const grams = gramsFor(ing.name, ing.measure);
    let food = null, error = null;
    try { food = grams > 0 ? await lookupFood(ing.name) : null; } catch (e) { error = e.code || "lookup_failed"; if (e.code === "not_configured") throw e; }
    const f = grams / 100;
    return {
      name: ing.name, measure: ing.measure, grams: Math.round(grams),
      match: food?.description || null, fdcId: food?.fdcId || null,
      kcal: food ? food.kcal * f : 0, protein: food ? food.protein * f : 0,
      carbs: food ? food.carbs * f : 0, fat: food ? food.fat * f : 0, error,
    };
  }));
  const total = rows.reduce((t, r) => ({
    kcal: t.kcal + r.kcal, protein: t.protein + r.protein, carbs: t.carbs + r.carbs, fat: t.fat + r.fat,
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  const s = Math.max(1, Number(servings) || 4);
  const round = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  return {
    servings: s,
    perServing: round({ kcal: total.kcal / s, protein: total.protein / s, carbs: total.carbs / s, fat: total.fat / s }),
    total: round(total),
    matched: rows.filter(r => r.match).length,
    rows: rows.map(r => ({ ...r, kcal: Math.round(r.kcal) })),
  };
}
