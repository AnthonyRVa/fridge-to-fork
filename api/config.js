// GET /api/config -> which optional services this deployment has keys for
import { configured as kroger } from "../lib/kroger.js";
import { send } from "../lib/http.js";

export default function handler(req, res) {
  send(res, 200, {
    nutrition: Boolean(process.env.USDA_API_KEY),
    prices: kroger(),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
