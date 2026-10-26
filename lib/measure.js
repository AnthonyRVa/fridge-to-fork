// Rough grams for a recipe measure like "2 tbsp", "1 1/2 cups", "200g", "3".
// Recipes are written for cooks, not scales, so these are estimates.
import { tokens } from "./ingredients.js";

const UNIT_GRAMS = [
  [/^(kg|kilo|kilogram)s?$/, 1000], [/^(g|gr|gram|grams)$/, 1], [/^(mg)$/, 0.001],
  [/^(lb|lbs|pound|pounds)$/, 453.6], [/^(oz|ounce|ounces)$/, 28.35],
  [/^(l|litre|liter|litres|liters)$/, 1000], [/^(ml|millilitre|milliliter)s?$/, 1], [/^(cl)$/, 10], [/^(dl)$/, 100],
  [/^(cup|cups|c)$/, 240], [/^(tbsp|tbs|tbls|tablespoons?|tblsp)$/, 15], [/^(tsp|teaspoons?)$/, 5],
  [/^(pint|pints)$/, 473], [/^(clove|cloves)$/, 5], [/^(slice|slices)$/, 30], [/^(can|cans|tin|tins)$/, 400],
  [/^(handful|handfuls)$/, 30], [/^(stick|sticks)$/, 113], [/^(bunch)$/, 100], [/^(sprig|sprigs)$/, 1],
  [/^(pinch|dash|sprinkling|garnish)$/, 0.5],
];

// Grams for one of something counted, e.g. "2 eggs".
const EACH = {
  egg: 50, onion: 110, shallot: 30, tomato: 120, potato: 170, carrot: 61, lime: 67, lemon: 58,
  garlic: 5, tortilla: 45, avocado: 150, pepper: 120, chilli: 15, chili: 15, banana: 118, apple: 180,
  "chicken breast": 170, "chicken thigh": 110, breast: 170, thigh: 110, sausage: 75, bun: 60, pitta: 60,
  courgette: 200, zucchini: 200, aubergine: 300, eggplant: 300, cucumber: 300, leek: 90, celery: 40,
  "cinnamon stick": 3, "bay leaf": 0.5, "star anise": 1, lemongrass: 20, "kaffir lime leaf": 0.3, "cardamom pod": 0.2,
  bacon: 25, rasher: 25, "mozzarella ball": 125, ball: 125, fillet: 150, "salmon fillet": 150, steak: 225, clove: 5,
};

// Grams in one cup for dry or dense foods (water is 240).
const CUP = { cheddar: 113, parmesan: 100, mozzarella: 113, feta: 150, rice: 185, flour: 125, sugar: 200, oat: 90, cheese: 113, pasta: 100, lentil: 190, bean: 180, quinoa: 170, spinach: 30, breadcrumb: 108, nut: 140, berr: 150 };

const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

export function parseQuantity(s) {
  let str = String(s || "").toLowerCase().trim();
  for (const [f, v] of Object.entries(FRACTIONS)) str = str.replace(new RegExp(`(\\d)?\\s*${f}`, "g"), (m, d) => ` ${(d ? +d : 0) + v} `);
  const m = str.match(/(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?|(\d+)\/(\d+)/);
  let qty = null;
  if (m) {
    if (m[4]) qty = +m[4] / +m[5];
    else qty = +m[1] + (m[2] ? +m[2] / +m[3] : 0);
  }
  const rest = m ? str.slice(m.index + m[0].length) : str;
  const unitWord = (rest.match(/[a-z]+/) || [""])[0];
  // "200g" has the unit glued on; "1.5kg" too.
  return { qty, unitWord, raw: str };
}

export function gramsFor(ingredientName, measure) {
  const { qty, unitWord, raw } = parseQuantity(measure);
  if (/to taste|to serve|garnish|topping|for frying|as needed|optional|drizzle|dusting/.test(raw) && qty == null) return 0;
  const n = qty == null ? 1 : qty;
  const t0 = tokens(ingredientName).join(" ");
  if (/^(cup|cups|c)$/.test(unitWord)) {
    const dense = Object.entries(CUP).find(([k]) => t0.includes(k));
    if (dense) return n * dense[1];
  }
  // "1 stick" means 113 g only for butter; a stick of celery or cinnamon is counted as one item.
  const stickOfButter = /^(stick|sticks)$/.test(unitWord) && /butter/.test(t0);
  for (const [re, g] of UNIT_GRAMS) {
    if (!unitWord || !re.test(unitWord)) continue;
    if (/^(stick|sticks)$/.test(unitWord) && !stickOfButter) break;
    return n * g;
  }
  const t = tokens(ingredientName);
  const key2 = t.slice(-2).join(" ");
  const each = EACH[key2] ?? EACH[t[t.length - 1]];
  if (each) return n * each;
  return qty == null ? 50 : n * 100; // unknown: assume a modest amount
}
