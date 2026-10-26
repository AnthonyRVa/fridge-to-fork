// GET /api/config -> which optional services this deployment has keys for
import { configured as kroger } from "../lib/kroger.js";
import { send } from "../lib/http.js";

export default function handler(req, res) {
  send(res, 200, {
    nutrition: true, // the USDA table built with the MCP always works; a key adds live lookups for the rest
    prices: kroger(),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
