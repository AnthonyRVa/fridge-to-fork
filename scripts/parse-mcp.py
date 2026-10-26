"""Summarize saved food-data-central MCP search results: query -> top foods with macros."""
import json, sys, glob, os
DIR = "/root/.claude/projects/-home-claude/36418632-c1a8-5795-b792-b9ba740a026b/tool-results"
out = {}
for f in sorted(glob.glob(os.path.join(DIR, "mcp-remote-devices-food-data-central__search-foods-*.txt"))):
    t = open(f).read()
    try: j = json.loads(t)
    except Exception: j = json.loads(t[t.index("{"):t.rindex("}") + 1])
    q = j.get("foodSearchCriteria", {}).get("query")
    foods = []
    for x in j.get("foods", []):
        n = {}
        for v in x.get("foodNutrients", []):
            nid, unit = v.get("nutrientId"), str(v.get("unitName", "")).upper()
            if nid in (1008, 2047, 2048) and unit == "KCAL" and "kcal" not in n: n["kcal"] = v.get("value")
            if nid == 1003: n["protein"] = v.get("value")
            if nid == 1005: n["carbs"] = v.get("value")
            if nid == 1004: n["fat"] = v.get("value")
        foods.append({"fdcId": x["fdcId"], "dataType": x.get("dataType"), "description": x["description"], **n})
    out[q] = foods
json.dump(out, open(sys.argv[1], "w"), indent=1)
if len(sys.argv) > 2:
    for q, foods in out.items():
        print(f"\n## {q}")
        for i, x in enumerate(foods): print(f"  {i} [{x['dataType']}] {x['description']} | {x.get('kcal')} kcal P{x.get('protein')} C{x.get('carbs')} F{x.get('fat')}")
