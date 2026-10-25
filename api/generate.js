// POST /api/generate { fridge, cuisine, minutes, diet, pantry, strict } -> one custom recipe from Claude
// Optional: only works when ANTHROPIC_API_KEY is set (paid, from https://console.anthropic.com).
import { send, readBody } from "../lib/http.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

export function buildPrompt({ fridge, cuisine, minutes, diet, pantry, strict }) {
  return `You are a practical home cook. Create ONE recipe using mainly these fridge ingredients: ${fridge.join(", ")}.
Constraints:
- Total time at most ${minutes} minutes, including prep.
- Diet: ${diet}. Never include an ingredient that breaks this diet.
- Cuisine style: ${cuisine === "any" ? "whatever suits the ingredients" : `${cuisine}. Use that cuisine's typical techniques, seasonings and dish types`}.
- ${pantry ? "The cook has salt, pepper, cooking oil, butter, flour and garlic." : "Assume no pantry staples beyond what is listed."}
- ${strict ? "Use ONLY the listed ingredients (plus staples if allowed). Nothing to buy." : "Add at most 2 inexpensive extra ingredients, only if they really help."}
- You do not need to use every ingredient. Prefer a dish people actually cook.
Reply with only a JSON object:
{"title": string, "summary": string, "cuisine": string, "minutes": number, "servings": number,
 "ingredients": [{"name": string, "measure": string}], "steps": [string] (4-8 steps)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
  if (!process.env.ANTHROPIC_API_KEY) return send(res, 501, { error: "Custom AI recipes aren't set up on this site." });
  const b = await readBody(req);
  const fridge = (Array.isArray(b.fridge) ? b.fridge : []).map(String).map(s => s.slice(0, 60)).slice(0, 25);
  if (!fridge.length) return send(res, 400, { error: "Add at least one ingredient." });
  const prompt = buildPrompt({
    fridge, cuisine: String(b.cuisine || "any"), minutes: Number(b.minutes) || 30,
    diet: String(b.diet || "any"), pantry: b.pantry !== false, strict: Boolean(b.strict),
  });
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}`);
    const j = await r.json();
    const text = (j.content || []).map(c => c.text || "").join("");
    const recipe = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    send(res, 200, { ...recipe, id: `ai-${Date.now()}`, source: "claude", photo: "", servings: recipe.servings || 2 });
  } catch {
    send(res, 502, { error: "Claude couldn't write a recipe just now. Try again." });
  }
}
