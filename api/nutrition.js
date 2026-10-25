// POST /api/nutrition  { ingredients: [{name, measure}], servings }
import { recipeNutrition } from "../lib/usda.js";
import { send, readBody } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  const body = await readBody(req);
  const ingredients = (Array.isArray(body.ingredients) ? body.ingredients : [])
    .slice(0, 25).map(i => ({ name: String(i.name || "").slice(0, 80), measure: String(i.measure || "").slice(0, 40) }))
    .filter(i => i.name);
  if (!ingredients.length) return send(res, 400, { error: "No ingredients to look up." });
  try {
    send(res, 200, await recipeNutrition(ingredients, body.servings));
  } catch (e) {
    if (e.code === "not_configured") return send(res, 501, { error: "Nutrition isn't set up on this site yet." });
    send(res, 502, { error: "USDA FoodData Central didn't answer. Try again in a moment." });
  }
}
