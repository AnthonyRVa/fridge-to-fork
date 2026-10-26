import { coverage } from "/ingredients.js";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = n => n == null ? "—" : `$${Number(n).toFixed(2)}`;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const state = {
  fridge: store.get("f2f:fridge", ["chicken thighs", "rice", "onion", "bell pepper", "eggs", "cheddar", "tomatoes"]),
  favs: store.get("f2f:favs", []),
  zip: store.get("f2f:zip", "84770"),
  config: { nutrition: false, prices: false, ai: false },
  results: [],
  open: null,
};

/* ---------- fridge door ---------- */
function renderFridge() {
  $("#magnets").innerHTML = state.fridge.length
    ? state.fridge.map((f, i) => `<span class="mag">${esc(f)}<button type="button" data-i="${i}" aria-label="Remove ${esc(f)}">×</button></span>`).join("")
    : `<span class="empty-mag">Your fridge door is empty. Add a few things below.</span>`;
  store.set("f2f:fridge", state.fridge);
}
$("#magnets").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]");
  if (!b) return;
  state.fridge.splice(+b.dataset.i, 1);
  renderFridge();
});
function addIngredients() {
  const v = $("#ingInput").value.split(",").map(s => s.trim()).filter(Boolean);
  for (const x of v) if (!state.fridge.some(f => f.toLowerCase() === x.toLowerCase())) state.fridge.push(x);
  $("#ingInput").value = "";
  renderFridge();
}
$("#addBtn").addEventListener("click", addIngredients);
$("#ingInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addIngredients(); } });

const cuisine = () => document.querySelector("input[name=cuisine]:checked").value;
const pantry = () => $("#pantry").checked;
function setStatus(msg, err) { const s = $("#status"); s.textContent = msg; s.classList.toggle("err", !!err); }

/* ---------- recipe search ---------- */
function skeletons(n = 6) {
  $("#cards").innerHTML = Array.from({ length: n }, () =>
    `<div class="rc skeleton" aria-hidden="true"><div class="ph"></div><div class="body"><div class="line" style="width:80%"></div><div class="line" style="width:50%"></div></div></div>`).join("");
}

function card(r) {
  const pct = r.total ? Math.round(((r.have.length + r.staples.length) / r.total) * 100) : 0;
  return `<button class="rc" data-id="${esc(r.id)}" data-src="${esc(r.source)}">
    ${r.photo ? `<div class="ph" style="background-image:url('${esc(r.photo)}')"></div>` : `<div class="ph ai">Claude</div>`}
    <div class="body">
      <span class="sub">${esc([r.cuisine, r.category].filter(Boolean).join(" · "))}</span>
      <h3>${esc(r.title)}</h3>
      <div class="bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
      <span class="fit">${r.have.length} have · ${r.staples.length} pantry · <span class="${r.need.length ? "buy" : ""}">${r.need.length} to buy</span></span>
    </div>
  </button>`;
}

async function search() {
  if (!state.fridge.length) { setStatus("Add at least one ingredient first.", true); $("#ingInput").focus(); return; }
  const btn = $("#findBtn"); btn.disabled = true;
  setStatus("Searching recipes…"); skeletons(); $("#note").hidden = true; $("#resultsMeta").textContent = "";
  try {
    const q = new URLSearchParams({ fridge: state.fridge.join(","), cuisine: cuisine(), pantry: pantry() ? "1" : "0" });
    const r = await fetch(`/api/recipes?${q}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Search failed.");
    state.results = j.recipes || [];
    $("#cards").innerHTML = state.results.length ? state.results.map(card).join("")
      : `<div class="empty">No recipes use those ingredients yet. Try adding a protein or a staple like rice, pasta or potatoes.</div>`;
    const n = state.results.length;
    $("#resultsMeta").textContent = n ? `${n} recipe${n === 1 ? "" : "s"} to choose from, best match first` : "";
    if (j.note) { $("#note").textContent = j.note; $("#note").hidden = false; }
    setStatus("");
  } catch (e) {
    $("#cards").innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
    setStatus("");
  } finally { btn.disabled = false; }
}
$("#fridgeForm").addEventListener("submit", e => { e.preventDefault(); search(); });
$("#cards").addEventListener("click", e => { const c = e.target.closest(".rc[data-id]"); if (c) openRecipe(c.dataset.id); });
$("#favs").addEventListener("click", e => { const c = e.target.closest(".rc[data-id]"); if (c) openRecipe(c.dataset.id); });

/* ---------- custom AI recipe ---------- */
$("#aiBtn").addEventListener("click", async () => {
  if (!state.fridge.length) { setStatus("Add at least one ingredient first.", true); return; }
  const btn = $("#aiBtn"); btn.disabled = true; setStatus("Claude is writing a recipe…");
  try {
    const r = await fetch("/api/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ fridge: state.fridge, cuisine: cuisine(), pantry: pantry(), minutes: 30, diet: "any" }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    const c = coverage(state.fridge, j.ingredients || [], { pantry: pantry() });
    const recipe = { ...j, have: c.have.map(i => i.name), need: c.need.map(i => i.name), staples: c.staples.map(i => i.name), total: (j.ingredients || []).length };
    state.results = [recipe, ...state.results];
    $("#cards").innerHTML = state.results.map(card).join("");
    setStatus("");
    showRecipe(recipe);
  } catch (e) { setStatus(e.message || "Claude couldn't write a recipe just now.", true); }
  finally { btn.disabled = false; }
});

/* ---------- recipe sheet ---------- */
const dlg = $("#recipe");
function close() { dlg.close(); }
dlg.addEventListener("click", e => { if (e.target === dlg) close(); });

async function openRecipe(id) {
  const known = state.results.find(r => r.id === id) || state.favs.find(f => f.id === id);
  if (known && known.source === "claude") return showRecipe(known.full || known);
  $("#sheet").innerHTML = `<div class="sheet-body"><p class="muted">Loading recipe…</p></div>`;
  if (!dlg.open) dlg.showModal();
  try {
    const r = await fetch(`/api/meal?id=${encodeURIComponent(id)}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    showRecipe(j);
  } catch (e) {
    $("#sheet").innerHTML = `<div class="sheet-body"><p class="err">${esc(e.message || "Couldn't load that recipe.")}</p><button class="btn" id="closeErr">Close</button></div>`;
    $("#closeErr").onclick = close;
  }
}

function showRecipe(r) {
  state.open = r;
  const c = coverage(state.fridge, r.ingredients || [], { pantry: pantry() });
  const status = ing => c.have.includes(ing) ? ["have", "have"] : c.staples.includes(ing) ? ["staple", "pantry"] : ["buy", "buy"];
  const saved = state.favs.some(f => f.id === r.id);
  $("#sheet").innerHTML = `
    <div class="hero ${r.photo ? "" : "ai"}" style="${r.photo ? `background-image:url('${esc(r.photo)}')` : ""}">
      <button class="x" id="closeBtn" aria-label="Close recipe">×</button>
    </div>
    <div class="sheet-body">
      <div style="display:grid;gap:10px">
        <div class="chips">
          ${r.source === "claude" ? `<span class="chip y">Written by Claude</span>` : ""}
          ${r.cuisine ? `<span class="chip">${esc(r.cuisine)}</span>` : ""}
          ${r.category ? `<span class="chip">${esc(r.category)}</span>` : ""}
          ${r.minutes ? `<span class="chip">${esc(r.minutes)} min</span>` : ""}
          <span class="chip">Serves ${esc(r.servings || 4)}</span>
        </div>
        <h2 id="rTitle">${esc(r.title)}</h2>
        ${r.summary ? `<p class="muted">${esc(r.summary)}</p>` : ""}
        <div class="chips">
          <button class="btn" id="favBtn">${saved ? "Saved to cookbook ✓" : "Save to my cookbook"}</button>
          <span class="fit">${c.have.length} from your fridge · ${c.staples.length} pantry · ${c.need.length} to buy</span>
        </div>
      </div>

      <div class="cols">
        <div><h3 class="k">Ingredients</h3><ul class="ing">${(r.ingredients || []).map(i => {
          const [cls, label] = status(i);
          return `<li><span class="amt">${esc(i.measure)}</span><span>${esc(i.name)}</span><span class="tag ${cls}">${label}</span></li>`;
        }).join("")}</ul></div>
        <div><h3 class="k">Method</h3><ol class="steps">${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join("")}</ol>
          <div class="links" style="margin-top:14px">
            ${r.youtube ? `<a href="${esc(r.youtube)}" target="_blank" rel="noopener">Watch the video</a>` : ""}
            ${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Original recipe</a>` : ""}
          </div>
        </div>
      </div>

      <div class="panels">
        <section class="panel" id="nutri" aria-live="polite"><h3>Nutrition per serving</h3><p class="muted">Loading USDA data…</p></section>
        <section class="panel" id="prices">
          <h3>What it costs</h3>
          <div class="pricerow">
            <input inputmode="numeric" maxlength="5" id="zip" value="${esc(state.zip)}" aria-label="ZIP code">
            <button class="btn" id="priceNeed" ${c.need.length ? "" : "disabled"}>Price what I'm missing (${c.need.length})</button>
            <button class="btn ghost" id="priceAll">Price the whole recipe</button>
          </div>
          <div id="priceOut" aria-live="polite"><p class="muted">Live prices from the nearest Kroger-family store (Smith's in Utah).</p></div>
        </section>
      </div>
    </div>`;
  if (!dlg.open) dlg.showModal();
  $("#sheet").scrollTop = 0;
  $("#closeBtn").onclick = close;
  $("#favBtn").onclick = () => toggleFav(r);
  $("#priceNeed").onclick = () => prices(c.need.map(i => i.name));
  $("#priceAll").onclick = () => prices((r.ingredients || []).map(i => i.name));
  $("#prices").hidden = !state.config.prices; // shows up automatically once Kroger keys are added
  nutrition(r);
}

async function nutrition(r) {
  const box = $("#nutri");
  if (!state.config.nutrition) { box.innerHTML = `<h3>Nutrition per serving</h3><p class="muted">Nutrition isn't switched on for this site yet.</p>`; return; }
  try {
    const res = await fetch("/api/nutrition", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredients: r.ingredients, servings: r.servings || 4 }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error);
    if (state.open !== r) return;
    const p = j.perServing;
    const kc = { protein: p.protein * 4, carbs: p.carbs * 4, fat: p.fat * 9 };
    const sum = kc.protein + kc.carbs + kc.fat || 1;
    box.innerHTML = `<h3>Nutrition per serving</h3>
      <div class="macros">
        <div class="macro"><b>${p.kcal}</b><small>Calories</small><i style="background:var(--kcal)"></i></div>
        <div class="macro"><b>${p.protein}g</b><small>Protein</small><i style="background:var(--protein)"></i></div>
        <div class="macro"><b>${p.carbs}g</b><small>Carbs</small><i style="background:var(--carbs)"></i></div>
        <div class="macro"><b>${p.fat}g</b><small>Fat</small><i style="background:var(--fat)"></i></div>
      </div>
      <div class="split" role="img" aria-label="Calories from protein ${Math.round(kc.protein / sum * 100)}%, carbs ${Math.round(kc.carbs / sum * 100)}%, fat ${Math.round(kc.fat / sum * 100)}%">
        <i style="width:${kc.protein / sum * 100}%;background:var(--protein)"></i><i style="width:${kc.carbs / sum * 100}%;background:var(--carbs)"></i><i style="width:${kc.fat / sum * 100}%;background:var(--fat)"></i>
      </div>
      <p class="muted" style="font-size:13px">Estimate for ${j.servings} servings, from USDA FoodData Central. ${j.matched} of ${j.rows.length} ingredients matched.</p>
      <details><summary>See each ingredient</summary><div class="tbl"><table>
        <thead><tr><th>Ingredient</th><th>USDA match</th><th class="n">g</th><th class="n">kcal</th></tr></thead>
        <tbody>${j.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.match || "no match")}</td><td class="n">${x.grams}</td><td class="n">${x.kcal}</td></tr>`).join("")}</tbody>
      </table></div></details>`;
  } catch (e) {
    box.innerHTML = `<h3>Nutrition per serving</h3><p class="err">${esc(e.message || "Couldn't load nutrition.")}</p>`;
  }
}

async function prices(items) {
  const out = $("#priceOut");
  const zip = $("#zip").value.trim();
  if (!/^\d{5}$/.test(zip)) { out.innerHTML = `<p class="err">Enter a 5-digit ZIP code.</p>`; return; }
  state.zip = zip; store.set("f2f:zip", zip);
  out.innerHTML = `<p class="muted">Checking prices for ${items.length} item${items.length === 1 ? "" : "s"}…</p>`;
  try {
    const r = await fetch(`/api/prices?${new URLSearchParams({ items: items.join(","), zip })}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    out.innerHTML = `<p class="muted" style="font-size:13px">${esc(j.store.name)}, ${esc(j.store.address)}</p>
      <div class="tbl"><table><tbody>${j.items.map(i => `<tr><td>${esc(i.name)}<br><small class="muted">${esc(i.product || "not found at this store")}${i.size ? " · " + esc(i.size) : ""}</small></td>
        <td class="n">${money(i.price)}${i.onSale ? `<br><span class="sale">on sale</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <div class="total"><span>Shopping total</span><b>${money(j.total)}</b></div>
      <p class="muted" style="font-size:12px">Full package prices, so you'll have leftovers.</p>`;
  } catch (e) {
    out.innerHTML = `<p class="err">${esc(e.message || "Couldn't get prices.")}</p>`;
  }
}

/* ---------- cookbook ---------- */
function toggleFav(r) {
  const i = state.favs.findIndex(f => f.id === r.id);
  if (i >= 0) state.favs.splice(i, 1);
  else state.favs.unshift({ id: r.id, source: r.source, title: r.title, photo: r.photo, cuisine: r.cuisine, category: r.category, full: r.source === "claude" ? r : undefined });
  store.set("f2f:favs", state.favs);
  renderFavs();
  $("#favBtn").textContent = i >= 0 ? "Save to my cookbook" : "Saved to cookbook ✓";
}
function renderFavs() {
  $("#favCount").textContent = state.favs.length;
  $("#favs").innerHTML = state.favs.length ? state.favs.map(f => `<button class="rc" data-id="${esc(f.id)}">
      ${f.photo ? `<div class="ph" style="background-image:url('${esc(f.photo)}')"></div>` : `<div class="ph ai">Claude</div>`}
      <div class="body"><span class="sub">${esc(f.cuisine || "")}</span><h3>${esc(f.title)}</h3></div></button>`).join("")
    : `<div class="empty">Nothing saved yet. Open a recipe and press “Save to my cookbook”.</div>`;
}

/* ---------- start ---------- */
renderFridge();
renderFavs();
fetch("/api/config").then(r => r.json()).then(c => { state.config = c; $("#aiBtn").hidden = !c.ai; }).catch(() => {});
search();
