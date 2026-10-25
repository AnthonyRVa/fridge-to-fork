# Fridge to Fork

Tell it what's in your fridge. It finds real recipes that use those ingredients, ranks them by how little you'd need to buy, and shows USDA nutrition and live grocery prices for each one.

## What it uses

| Piece | What it does | Key needed |
|---|---|---|
| [TheMealDB](https://www.themealdb.com/api.php) | Recipes, photos, cuisines, instructions | None (free test key `1`) |
| [USDA FoodData Central](https://fdc.nal.usda.gov/api-guide) | Calories, protein, carbs and fat per ingredient | `USDA_API_KEY` |
| [Kroger API](https://developer.kroger.com) | Nearest store (Smith's in Utah) and live product prices | `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET` |
| Claude API (optional) | "Write me a custom recipe" button | `ANTHROPIC_API_KEY` |
| Vercel | Hosts the site; `api/*.js` run as serverless functions so keys stay secret | — |

There are no npm dependencies. The front end is plain HTML, CSS and JavaScript in `public/`; the back end is the files in `api/`.

## Run it locally

```bash
npm run dev:mock   # fake API answers, no keys needed, http://localhost:3000
npm run dev        # real APIs, reads keys from your environment
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. On vercel.com: **Add New → Project → Import** this repo. Framework preset: **Other**. Leave build settings empty.
3. Add the environment variables from `.env.example` under **Settings → Environment Variables**.
4. Deploy. Every push to `main` redeploys automatically.

## Tests

`tests/ui_test.py` drives the site in a real browser with Playwright: it loads recipes, filters by cuisine, opens a recipe, checks nutrition and prices, saves to the cookbook, and checks phone and desktop layouts in light and dark mode.

```bash
MOCK=1 PORT=3123 node scripts/dev-server.mjs &
python3 tests/ui_test.py http://localhost:3123
```
