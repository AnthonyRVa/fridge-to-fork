// Canned TheMealDB, USDA and Kroger answers in the same shapes the real APIs return.
const meal = (id, name, area, category, ings, steps) => {
  const m = { idMeal: String(id), strMeal: name, strArea: area, strCategory: category,
    strMealThumb: `/mock-photo/${id}`, strInstructions: steps.join("\r\n"), strYoutube: "", strSource: "" };
  ings.forEach(([n, ms], i) => { m[`strIngredient${i + 1}`] = n; m[`strMeasure${i + 1}`] = ms; });
  for (let i = ings.length + 1; i <= 20; i++) { m[`strIngredient${i}`] = ""; m[`strMeasure${i}`] = ""; }
  return m;
};

export const MEALS = [
  meal(1, "Chicken Fajitas", "Mexican", "Chicken", [["Chicken Thighs", "500g"], ["Onion", "1"], ["Red Pepper", "1"], ["Tortillas", "8"], ["Lime", "1"], ["Olive Oil", "2 tbsp"], ["Cumin", "1 tsp"]],
    ["Slice the chicken, onion and pepper.", "Fry the chicken in oil with cumin for 6 minutes.", "Add the vegetables and cook 4 minutes.", "Squeeze over lime and serve in warm tortillas."]),
  meal(2, "Arroz con Pollo", "Mexican", "Chicken", [["Chicken Thighs", "6"], ["Rice", "1 1/2 cups"], ["Onion", "1"], ["Tomatoes", "2"], ["Chicken Stock", "500ml"], ["Garlic", "2 cloves"]],
    ["Brown the chicken.", "Soften onion and garlic.", "Add rice, tomatoes and stock.", "Simmer covered 20 minutes."]),
  meal(3, "Egg Fried Rice", "Chinese", "Side", [["Rice", "2 cups"], ["Eggs", "2"], ["Spring Onions", "3"], ["Soy Sauce", "2 tbsp"], ["Vegetable Oil", "1 tbsp"]],
    ["Scramble the eggs and set aside.", "Fry the rice in oil.", "Add soy sauce, eggs and spring onions."]),
  meal(4, "Huevos Rancheros", "Mexican", "Breakfast", [["Eggs", "4"], ["Tomatoes", "3"], ["Onion", "1/2"], ["Tortillas", "4"], ["Cheddar Cheese", "50g"]],
    ["Make a quick tomato and onion sauce.", "Fry the eggs.", "Serve on tortillas with sauce and cheese."]),
  meal(5, "Cheesy Chicken Bake", "American", "Chicken", [["Chicken Thighs", "4"], ["Cheddar Cheese", "100g"], ["Rice", "1 cup"], ["Butter", "1 tbsp"], ["Broccoli", "1 head"]],
    ["Cook the rice.", "Layer rice, chicken and broccoli.", "Top with cheese and bake 30 minutes."]),
  meal(6, "Teriyaki Chicken Bowl", "Japanese", "Chicken", [["Chicken Thighs", "2"], ["Rice", "1 cup"], ["Soy Sauce", "3 tbsp"], ["Honey", "1 tbsp"], ["Ginger", "1 tsp"]],
    ["Cook the rice.", "Fry the chicken.", "Glaze with soy, honey and ginger.", "Serve over rice."]),
  meal(7, "Stuffed Peppers", "American", "Beef", [["Red Pepper", "4"], ["Minced Beef", "400g"], ["Rice", "1 cup"], ["Tomatoes", "2"], ["Cheddar Cheese", "60g"]],
    ["Hollow the peppers.", "Brown the beef with tomatoes and rice.", "Stuff, top with cheese, bake 25 minutes."]),
];

const INGREDIENT_INDEX = {};
for (const m of MEALS) for (let i = 1; i <= 20; i++) {
  const n = m[`strIngredient${i}`]; if (!n) continue;
  const k = n.toLowerCase().replace(/ /g, "_");
  (INGREDIENT_INDEX[k] ||= []).push(m);
}

const USDA = {
  chicken: [177, 24, 0, 8], rice: [365, 7, 80, 0.7], onion: [40, 1.1, 9.3, 0.1], pepper: [31, 1, 6, 0.3],
  tortilla: [312, 8, 52, 8], lime: [30, 0.7, 10.5, 0.2], oil: [884, 0, 0, 100], egg: [143, 12.6, 0.7, 9.5],
  tomato: [18, 0.9, 3.9, 0.2], cheese: [403, 23, 3, 33], stock: [6, 0.6, 0.4, 0.2], garlic: [149, 6.4, 33, 0.5],
  soy: [53, 8, 4.9, 0.6], butter: [717, 0.9, 0.1, 81], broccoli: [34, 2.8, 6.6, 0.4], beef: [254, 17, 0, 20],
  honey: [304, 0.3, 82, 0], ginger: [80, 1.8, 18, 0.8], cumin: [375, 18, 44, 22], spring: [32, 1.8, 7.3, 0.2],
};

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export async function mockFetch(input) {
  const u = new URL(typeof input === "string" ? input : input.url);
  if (u.hostname.endsWith("themealdb.com")) {
    if (u.pathname.endsWith("/filter.php")) {
      if (u.searchParams.has("i")) {
        const list = INGREDIENT_INDEX[u.searchParams.get("i").toLowerCase()] || null;
        return json({ meals: list && list.map(m => ({ strMeal: m.strMeal, strMealThumb: m.strMealThumb, idMeal: m.idMeal })) });
      }
      const area = u.searchParams.get("a");
      const list = MEALS.filter(m => m.strArea === area);
      return json({ meals: list.length ? list.map(m => ({ strMeal: m.strMeal, strMealThumb: m.strMealThumb, idMeal: m.idMeal })) : null });
    }
    if (u.pathname.endsWith("/lookup.php")) return json({ meals: MEALS.filter(m => m.idMeal === u.searchParams.get("i")) });
  }
  if (u.hostname === "api.nal.usda.gov") {
    const q = (u.searchParams.get("query") || "").toLowerCase();
    const key = Object.keys(USDA).find(k => q.includes(k));
    if (!key) return json({ foods: [] });
    const [kcal, p, c, f] = USDA[key];
    return json({ foods: [{ fdcId: 1000 + key.length, description: `${key[0].toUpperCase()}${key.slice(1)}, raw (mock)`,
      foodNutrients: [{ nutrientId: 1008, unitName: "KCAL", value: kcal }, { nutrientId: 1003, unitName: "G", value: p },
        { nutrientId: 1005, unitName: "G", value: c }, { nutrientId: 1004, unitName: "G", value: f }] }] });
  }
  if (u.hostname === "api.kroger.com") {
    if (u.pathname.includes("oauth2/token")) return json({ access_token: "mock", expires_in: 1800 });
    if (u.pathname.endsWith("/locations")) return json({ data: [{ locationId: "70600001", name: "Smith's Marketplace", chain: "SMITHS", address: { addressLine1: "565 S Mall Dr", city: "St. George", state: "UT" } }] });
    if (u.pathname.endsWith("/products")) {
      const t = u.searchParams.get("filter.term") || "";
      const price = Math.round((1.29 + (t.length % 7) * 0.8) * 100) / 100;
      return json({ data: [{ description: `Kroger ${t}`, brand: "Kroger", items: [{ size: "1 ct", price: { regular: price, promo: t.length % 3 === 0 ? price - 0.5 : 0 } }] }] });
    }
  }
  return json({ error: "not mocked" }, 404);
}
