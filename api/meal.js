// GET /api/meal?id=52772  -> full recipe with photo, ingredients and steps
import { lookup } from "../lib/mealdb.js";
import { send, query } from "../lib/http.js";

export default async function handler(req, res) {
  const { id } = query(req);
  if (!/^\d+$/.test(id || "")) return send(res, 400, { error: "Missing recipe id." });
  try {
    const meal = await lookup(id);
    if (!meal) return send(res, 404, { error: "That recipe no longer exists." });
    send(res, 200, meal, 86400);
  } catch {
    send(res, 502, { error: "The recipe database didn't answer. Try again in a moment." });
  }
}
