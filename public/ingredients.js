// Turning what people type ("half an onion", "baby spinach") into names recipe
// databases understand, and deciding whether a fridge item covers a recipe ingredient.

const FILLER = new Set([
  "a", "an", "the", "of", "some", "half", "leftover", "leftovers", "fresh", "baby", "frozen",
  "chopped", "diced", "sliced", "minced", "large", "small", "medium", "bag", "can", "canned",
  "jar", "pack", "bunch", "handful", "piece", "pieces", "whole", "raw", "cooked", "old", "and",
]);

const MODIFIERS = new Set(["black", "white", "cayenne", "powder", "flake", "dried", "paprika", "coconut", "almond", "oat"]);

// Products made from an ingredient: having the ingredient doesn't mean having these.
const PRODUCTS = new Set(["stock", "broth", "sauce", "powder", "paste", "puree", "passata", "vinegar", "noodle",
  "extract", "seasoning", "cube", "gravy", "oil", "juice", "zest", "flour", "wine", "ketchup", "jam", "syrup", "milk", "cream"]);
const CITRUS = new Set(["lemon", "lime", "orange"]);
const CITRUS_PARTS = new Set(["juice", "zest"]);

// Things most kitchens already have. Used when the cook ticks "I have basics".
export const PANTRY = [
  "salt", "pepper", "black pepper", "oil", "olive oil", "vegetable oil", "sunflower oil",
  "butter", "flour", "plain flour", "all purpose flour", "water", "sugar", "caster sugar",
  "garlic", "baking powder", "vinegar",
];

export function singular(word) {
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("oes")) return word.slice(0, -2);
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("ches")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

export function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(w => w && !FILLER.has(w))
    .map(singular);
}

/** Search names to try against TheMealDB's ingredient filter, best first. */
export function searchVariants(item) {
  const t = tokens(item);
  if (!t.length) return [];
  const out = [t.join(" ")];
  if (t.length > 1) out.push(t[t.length - 1]); // "baby spinach" -> "spinach", "cheddar cheese" -> "cheese"
  if (t.length > 1) out.push(t[0]);            // "chicken thighs" -> "chicken"
  const plural = t.join(" ") + "s";
  out.push(plural);                            // "egg" -> "eggs"
  return [...new Set(out)];
}

/** True when a fridge item can stand in for a recipe ingredient. */
export function covers(fridgeItem, recipeIngredient) {
  const a = tokens(fridgeItem);
  const b = tokens(recipeIngredient);
  if (!a.length || !b.length) return false;
  const bs = new Set(b);
  // "black pepper" is not a bell pepper; "chilli powder" is not a fresh chilli.
  if (b.some(w => MODIFIERS.has(w) && !a.includes(w))) return false;
  // The recipe's head noun (last word) must be in the fridge item, or every
  // fridge word must appear in the recipe ingredient.
  const head = b[b.length - 1];
  if (a.includes(head)) return true;
  // "rice" doesn't give you rice noodles, and "tomatoes" aren't tomato puree.
  // A lemon or lime does give you its juice and zest, though.
  if (PRODUCTS.has(head) && !(CITRUS_PARTS.has(head) && a.some(w => CITRUS.has(w)))) return false;
  return a.every(w => bs.has(w));
}

export function isPantry(recipeIngredient) {
  const b = tokens(recipeIngredient).join(" ");
  return PANTRY.some(p => tokens(p).join(" ") === b);
}

/** Split a recipe's ingredient list into what the cook has, pantry, and what to buy. */
export function coverage(fridge, ingredients, { pantry = true } = {}) {
  const have = [], staples = [], need = [];
  for (const ing of ingredients) {
    if (fridge.some(f => covers(f, ing.name))) have.push(ing);
    else if (pantry && isPantry(ing.name)) staples.push(ing);
    else need.push(ing);
  }
  return { have, staples, need };
}
