// GET /api/recipes?fridge=eggs,spinach&cuisine=Mexican&pantry=1
import { findRecipes } from "../lib/mealdb.js";
import { list, send, query } from "../lib/http.js";

export default async function handler(req, res) {
  const q = query(req);
  const fridge = list(q.fridge);
  if (!fridge.length) return send(res, 400, { error: "Add at least one ingredient." });
  try {
    const out = await findRecipes(fridge, { cuisine: q.cuisine || "any", pantry: q.pantry !== "0", limit: 12 });
    send(res, 200, out, 3600);
  } catch (e) {
    send(res, 502, { error: "The recipe database didn't answer. Try again in a moment." });
  }
}
