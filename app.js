const state = {
  date: todayStr(),
  mealType: defaultMealType(),
  lastResults: [],
  goals: { calories: 2000, protein: 120, carbs: 250, fat: 65 },
};

function todayStr() {
  // Read local calendar fields directly - never round-trip through
  // toISOString() for "today", since that converts to UTC and silently
  // shifts the date backward by a day in any positive-UTC-offset timezone
  // (e.g. IST). See shiftDate() below for the same fix applied to arithmetic.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultMealType() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18 && h < 22) return 'dinner';
  return 'snack';
}

function shiftDate(dateStr, days) {
  // Pure UTC calendar arithmetic - treats dateStr as a plain calendar date
  // with no timezone attached, avoiding the local-parse/UTC-serialize bug.
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function setDate(date) {
  state.date = date;
  el('datePicker').value = date;
  loadDay();
}

function loadDay() {
  const data = Store.getDayLog(state.date);
  renderMealGroups(data.entries);
  renderDashboard(data.totals);
  loadHistory();
  loadTrend();
}

// ---------- Dashboard: ring + macro bars ----------

const RING_CIRCUMFERENCE = 2 * Math.PI * 70;

function renderDashboard(totals) {
  const g = state.goals;
  const pct = g.calories > 0 ? Math.min(totals.calories / g.calories, 1) : 0;
  const over = totals.calories > g.calories;
  const ring = el('ringProgress');
  ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - pct));
  ring.style.stroke = over ? 'var(--danger)' : 'var(--primary)';

  el('ringCalories').textContent = Math.round(totals.calories);
  el('ringGoalLabel').textContent = `of ${Math.round(g.calories)} kcal`;

  const remaining = g.calories - totals.calories;
  const footnote = el('ringRemaining');
  footnote.textContent = remaining >= 0 ? `${Math.round(remaining)} kcal remaining` : `${Math.round(-remaining)} kcal over goal`;
  footnote.style.color = remaining < 0 ? 'var(--danger)' : 'var(--muted)';

  setMacroBar('protein', totals.protein, g.protein);
  setMacroBar('carbs', totals.carbs, g.carbs);
  setMacroBar('fat', totals.fat, g.fat);
}

function setMacroBar(key, value, goal) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  el(`${key}Bar`).style.width = `${pct}%`;
  el(`${key}Values`).textContent = `${Math.round(value)} / ${Math.round(goal)}g`;
}

// ---------- Meal-grouped log ----------

const MEAL_META = {
  breakfast: { icon: String.fromCodePoint(0x1f305), label: 'Breakfast' },
  lunch: { icon: String.fromCodePoint(0x2600), label: 'Lunch' },
  dinner: { icon: String.fromCodePoint(0x1f319), label: 'Dinner' },
  snack: { icon: String.fromCodePoint(0x1f34e), label: 'Snacks' },
};
const MEAL_ORDER = ['breakfast', 'lunch', 'snack', 'dinner'];

function renderMealGroups(entries) {
  const container = el('mealGroups');
  container.innerHTML = '';

  MEAL_ORDER.forEach((meal) => {
    const items = entries.filter((e) => (e.mealType || 'snack') === meal);
    const meta = MEAL_META[meal];
    const cal = items.reduce((sum, e) => sum + e.calories, 0);

    const group = document.createElement('div');
    group.className = 'meal-group';

    const itemsHtml = items.length
      ? items
          .map(
            (e) => `
        <div class="meal-item">
          <span class="item-name">${escapeHtml(e.description)}</span>
          ${e.grams ? `<span class="item-amount">${e.grams}g</span>` : ''}
          <span class="item-macros">${Math.round(e.calories)} cal &middot; P${Math.round(e.protein)} C${Math.round(e.carbs)} F${Math.round(e.fat)}</span>
          <button class="del-btn" data-id="${e.id}">Delete</button>
        </div>`
          )
          .join('')
      : `<div class="meal-empty">Nothing logged yet.</div>`;

    group.innerHTML = `
      <div class="meal-group-header">
        <span class="meal-icon">${meta.icon}</span>
        <span class="meal-name">${meta.label}</span>
        <span class="meal-cal">${Math.round(cal)} cal</span>
      </div>
      <div class="meal-items">${itemsHtml}</div>
    `;
    container.appendChild(group);
  });

  container.querySelectorAll('.del-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      Store.deleteEntry(Number(btn.dataset.id));
      loadDay();
    });
  });
}

// ---------- History list ----------

function loadHistory() {
  const days = Store.getAllDays();
  const list = el('historyList');
  list.innerHTML = '';
  if (days.length === 0) {
    list.innerHTML = '<p class="empty-msg">No history yet.</p>';
    return;
  }
  for (const d of days.slice(0, 14)) {
    const div = document.createElement('div');
    div.className = 'history-item' + (d.date === state.date ? ' active' : '');
    div.innerHTML = `
      <span>${d.date}${d.date === state.date ? ' (viewing)' : ''}</span>
      <span class="macros">
        <span>${Math.round(d.calories)} cal</span>
        <span>P ${Math.round(d.protein)}g</span>
        <span>C ${Math.round(d.carbs)}g</span>
        <span>F ${Math.round(d.fat)}g</span>
      </span>
    `;
    div.addEventListener('click', () => setDate(d.date));
    list.appendChild(div);
  }
}

// ---------- Trend chart (plain SVG, no dependencies) ----------

function loadTrend() {
  renderTrend(Store.getTrend(7, state.date));
}

function renderTrend(series) {
  const svg = el('trendSvg');
  const goal = state.goals.calories;
  const width = 700;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 16 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(goal, ...series.map((d) => d.calories), 1) * 1.15;
  const barGap = 14;
  const barWidth = (chartW - barGap * (series.length - 1)) / series.length;

  const bars = series
    .map((d, i) => {
      const x = padding.left + i * (barWidth + barGap);
      const h = Math.max((d.calories / maxVal) * chartH, d.calories > 0 ? 3 : 0);
      const y = padding.top + (chartH - h);
      const over = d.calories > goal;
      const color = over ? 'var(--danger)' : 'var(--primary)';
      const dateObj = new Date(`${d.date}T00:00:00`);
      const label = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="6" style="fill:${color}"></rect>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${label}</text>
      `;
    })
    .join('');

  const goalY = padding.top + (chartH - (goal / maxVal) * chartH);
  const goalLine = `<line x1="${padding.left}" y1="${goalY.toFixed(1)}" x2="${width - padding.right}" y2="${goalY.toFixed(1)}" style="stroke:var(--muted)" stroke-width="1.5" stroke-dasharray="5,4"></line>`;

  svg.innerHTML = goalLine + bars;
}

// ---------- Meal selector ----------

function initMealSelector() {
  document.querySelectorAll('.meal-chip').forEach((chip) => {
    if (chip.dataset.meal === state.mealType) chip.classList.add('active');
    chip.addEventListener('click', () => {
      state.mealType = chip.dataset.meal;
      document.querySelectorAll('.meal-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });
}

// ---------- Settings: goals, API keys, backup ----------

function updateGoalCalories() {
  const p = Number(el('goalProtein').value) || 0;
  const c = Number(el('goalCarbs').value) || 0;
  const f = Number(el('goalFat').value) || 0;
  el('goalCalories').value = Math.round(p * 4 + c * 4 + f * 9);
}

function openSettings() {
  el('goalProtein').value = state.goals.protein;
  el('goalCarbs').value = state.goals.carbs;
  el('goalFat').value = state.goals.fat;
  updateGoalCalories();
  const settings = Store.getSettings();
  el('settingFdcKey').value = settings.fdcKey;
  el('settingAnthropicKey').value = settings.anthropicKey;
  el('settingsModal').classList.remove('hidden');
}

function closeSettings() {
  el('settingsModal').classList.add('hidden');
}

function saveSettings() {
  state.goals = Store.setGoals({
    protein: el('goalProtein').value,
    carbs: el('goalCarbs').value,
    fat: el('goalFat').value,
  });
  Store.setSettings({
    fdcKey: el('settingFdcKey').value.trim(),
    anthropicKey: el('settingAnthropicKey').value.trim(),
  });
  closeSettings();
  loadDay();
}

async function downloadBackup() {
  const data = Store.exportData();
  const json = JSON.stringify(data, null, 2);
  const filename = `nutritrack-backup-${todayStr()}.json`;

  // Inside the Android app (Capacitor), blob downloads don't work in the
  // WebView - write the file natively and open the share sheet so it can be
  // saved to Drive/Files or sent anywhere.
  const cap = window.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
    try {
      const { Filesystem, Share } = cap.Plugins;
      const written = await Filesystem.writeFile({
        path: filename,
        data: json,
        directory: 'CACHE',
        encoding: 'utf8',
      });
      await Share.share({
        title: filename,
        url: written.uri,
        dialogTitle: 'Save your NutriTrack backup',
      });
    } catch (err) {
      // User closing the share sheet also rejects - only surface real failures.
      if (!/cancel/i.test(String(err && err.message))) {
        alert(`Backup failed: ${err.message}`);
      }
    }
    return;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const count = Array.isArray(parsed.entries) ? parsed.entries.length : 0;
      const ok = window.confirm(
        `Restore backup from ${parsed.exportedAt ? parsed.exportedAt.slice(0, 10) : 'unknown date'} with ${count} entries?\n\nThis REPLACES all current log data.`
      );
      if (!ok) return;
      Store.importData(parsed);
      state.goals = Store.getGoals();
      loadFavorites();
      loadDay();
      closeSettings();
      alert('Backup restored.');
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      el('importFileInput').value = '';
    }
  };
  reader.readAsText(file);
}

// ---------- Favorites (My foods) ----------

function loadFavorites() {
  const favorites = Store.getFavorites();
  const list = el('favoritesList');
  list.innerHTML = '';
  if (!favorites.length) {
    list.innerHTML = '<p class="empty-msg">No favorites yet.</p>';
    return;
  }
  favorites.forEach((fav) => {
    const div = document.createElement('div');
    div.className = 'result-item';
    div.innerHTML = `
      <div class="info">
        <span class="name">${escapeHtml(fav.name)}</span>
        <span class="meta">${escapeHtml(fav.servingLabel)} - ${Math.round(fav.perServing.calories)} cal - P${Math.round(fav.perServing.protein)} C${Math.round(fav.perServing.carbs)} F${Math.round(fav.perServing.fat)}</span>
      </div>
      <button class="star-btn starred" title="Remove from My foods">★</button>
      <button class="add-fav-btn">Add</button>
    `;
    div.querySelector('.add-fav-btn').addEventListener('click', () => openFavModal(fav));
    div.querySelector('.star-btn').addEventListener('click', () => {
      if (window.confirm(`Remove "${fav.name}" from My foods?`)) {
        Store.removeFavorite(fav.id);
        loadFavorites();
      }
    });
    list.appendChild(div);
  });
}

let submitting = false;
let pendingFav = null;

function fillFavFieldsFromGrams(per100g, grams) {
  const scale = grams / 100;
  el('favCalories').value = round1(per100g.calories * scale);
  el('favProtein').value = round1(per100g.protein * scale);
  el('favCarbs').value = round1(per100g.carbs * scale);
  el('favFat').value = round1(per100g.fat * scale);
}

function recomputeFavGrams() {
  if (!pendingFav) return;
  const qty = Number(el('favQtyInput').value) || 0;
  const unit = el('favQtyUnit').value;
  // "piece" uses this favorite's own known per-piece weight (e.g. 1 pani puri = 15g)
  // rather than the generic name-keyword guess used for open-ended USDA search results.
  const grams = unit === 'piece' ? qty * pendingFav.pieceGrams : computeGrams(pendingFav.name, qty, unit);
  el('favGramsDisplay').value = round1(grams);
  fillFavFieldsFromGrams(pendingFav.per100g, grams);
}

function openFavModal(fav) {
  pendingFav = { ...fav, pieceGrams: fav.totalGrams / fav.defaultQty };
  el('favFoodName').textContent = fav.name;
  el('favServingLabel').textContent = `Estimated values (based on ${fav.servingLabel}) - edit any field if you know better.`;
  el('favQtyInput').value = fav.defaultQty;
  el('favQtyUnit').value = fav.defaultUnit;
  recomputeFavGrams();
  el('favModal').classList.remove('hidden');
}

function closeFavModal() {
  pendingFav = null;
  el('favModal').classList.add('hidden');
}

function confirmFav() {
  if (!pendingFav || submitting) return;
  submitting = true;
  el('favConfirm').disabled = true;
  try {
    const grams = Number(el('favGramsDisplay').value) || null;
    Store.addEntry({
      date: state.date,
      mealType: state.mealType,
      description: pendingFav.name,
      grams,
      calories: el('favCalories').value || 0,
      protein: el('favProtein').value || 0,
      carbs: el('favCarbs').value || 0,
      fat: el('favFat').value || 0,
    });
    closeFavModal();
    loadDay();
  } finally {
    submitting = false;
    el('favConfirm').disabled = false;
  }
}

// ---------- Search food (USDA FoodData Central, called directly) ----------

function extractPer100g(foodNutrients) {
  const find = (names, unit) =>
    foodNutrients.find((n) => names.includes(n.nutrientName) && (!unit || n.unitName === unit));

  const energy = find(['Energy'], 'KCAL') || find(['Energy']);
  const protein = find(['Protein']);
  const carbs = find(['Carbohydrate, by difference']);
  const fat = find(['Total lipid (fat)']);

  return {
    calories: energy ? energy.value : 0,
    protein: protein ? protein.value : 0,
    carbs: carbs ? carbs.value : 0,
    fat: fat ? fat.value : 0,
  };
}

function mapFood(f) {
  return {
    fdcId: f.fdcId,
    description: f.description,
    brandOwner: f.brandOwner || null,
    dataType: f.dataType,
    per100g: extractPer100g(f.foodNutrients || []),
  };
}

function relevanceScore(description, q) {
  // Token-based scoring so multi-word queries ("medium whole eggs") and
  // plural mismatches ("avocado" vs "Avocados, raw") still rank the plain
  // ingredient above compound dishes and packaged products.
  const dTokens = description.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const tokenSet = new Set(dTokens);
  const qTokens = q.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const has = (t) =>
    tokenSet.has(t) || tokenSet.has(`${t}s`) || tokenSet.has(`${t}es`) || (t.endsWith('s') && tokenSet.has(t.slice(0, -1)));

  const missing = qTokens.filter((t) => !has(t)).length;
  let score = missing * 40; // absent query words dominate the ranking

  // Simple commodity names lead with the ingredient ("Egg, whole, raw")
  const first = dTokens[0] || '';
  const anchor = qTokens.find((t) => has(t)) || qTokens[0] || '';
  if (!(first === anchor || first === `${anchor}s` || first === `${anchor}es` || `${first}s` === anchor)) score += 15;

  // ALL-CAPS descriptions are packaged-product styling ("AVOCADO CHUNKS")
  if (description === description.toUpperCase()) score += 30;

  // Shelf forms nobody logs by default ("Egg, whole, dried")
  if (['dried', 'dehydrated', 'powder', 'powdered'].some((t) => tokenSet.has(t))) score += 8;

  // Shorter names tend to be simpler, less-processed foods
  score += Math.min(dTokens.length, 12);
  return score;
}

async function fdcSearch(query, dataTypes, pageSize) {
  const key = Store.getSettings().fdcKey || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
    key
  )}&query=${encodeURIComponent(query)}&pageSize=${pageSize}&dataType=${encodeURIComponent(dataTypes.join(','))}`;
  // USDA's API intermittently 400s on valid requests; one quick retry almost
  // always recovers, and without it the generic-foods bucket silently drops
  // out, leaving searches looking branded-only.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`USDA API error: ${await response.text()}`);
      const data = await response.json();
      return (data.foods || []).map(mapFood);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

async function searchFoods(query) {
  // Query generic/raw foods, home-style dishes, and branded products as separate
  // prioritized batches so a plain query (e.g. "rice") surfaces the simple raw
  // food first instead of whatever USDA's single relevance ranking happens to favor
  // (which is often dish mixtures or packaged snacks sharing the word). USDA's API
  // intermittently 400s on individual dataType buckets (observed, not query-specific),
  // so a failure in one bucket must not blank out the other two.
  const results = await Promise.allSettled([
    fdcSearch(query, ['Foundation', 'SR Legacy'], 100),
    fdcSearch(query, ['Survey (FNDDS)'], 15),
    fdcSearch(query, ['Branded'], 10),
  ]);
  const [generic, dishes, branded] = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error('USDA API is temporarily unavailable. Try again in a moment.');
  }

  const q = query.toLowerCase();
  const sortByRelevance = (list) =>
    list.slice().sort((a, b) => relevanceScore(a.description, q) - relevanceScore(b.description, q));

  return [...sortByRelevance(generic), ...sortByRelevance(dishes), ...sortByRelevance(branded)].slice(0, 20);
}

async function doSearch() {
  const q = el('searchInput').value.trim();
  const results = el('searchResults');
  if (!q) return;
  results.innerHTML = '<p class="empty-msg">Searching...</p>';
  try {
    const foods = await searchFoods(q);
    state.lastResults = foods;
    if (foods.length === 0) {
      results.innerHTML = '<p class="empty-msg">No results. Try manual entry instead.</p>';
      return;
    }
    results.innerHTML = '';
    foods.forEach((food, idx) => {
      const favId = `fdc-${food.fdcId}`;
      const starred = Store.hasFavorite(favId);
      const div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML = `
        <div class="info">
          <span class="name">${escapeHtml(food.description)}</span>
          <span class="meta">${food.brandOwner ? escapeHtml(food.brandOwner) + ' - ' : ''}${Math.round(food.per100g.calories)} cal / 100g - P${Math.round(food.per100g.protein)} C${Math.round(food.per100g.carbs)} F${Math.round(food.per100g.fat)}</span>
        </div>
        <button data-idx="${idx}" class="star-btn ${starred ? 'starred' : ''}" title="${starred ? 'Remove from My foods' : 'Save to My foods'}">${starred ? '★' : '☆'}</button>
        <button data-idx="${idx}" class="add-result-btn">Add</button>
      `;
      results.appendChild(div);
    });
    results.querySelectorAll('.add-result-btn').forEach((btn) => {
      btn.addEventListener('click', () => openGramsModal(state.lastResults[btn.dataset.idx]));
    });
    results.querySelectorAll('.star-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const food = state.lastResults[btn.dataset.idx];
        const favId = `fdc-${food.fdcId}`;
        if (Store.hasFavorite(favId)) {
          Store.removeFavorite(favId);
          btn.textContent = '☆';
          btn.classList.remove('starred');
          btn.title = 'Save to My foods';
        } else {
          Store.addFavorite(makeFavoriteFromFood(food));
          btn.textContent = '★';
          btn.classList.add('starred');
          btn.title = 'Remove from My foods';
        }
        loadFavorites();
      });
    });
  } catch (err) {
    results.innerHTML = `<p class="empty-msg">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function makeFavoriteFromFood(food) {
  const def = guessDefault(food.description);
  const totalGrams = round1(computeGrams(food.description, def.qty, def.unit));
  const scale = totalGrams / 100;
  const label = def.unit === 'g' ? `${def.qty} g` : `${def.qty} ${def.unit} (~${Math.round(totalGrams)} g)`;
  return {
    id: `fdc-${food.fdcId}`,
    name: food.description,
    servingLabel: label,
    totalGrams,
    defaultUnit: def.unit,
    defaultQty: def.qty,
    perServing: {
      calories: round1(food.per100g.calories * scale),
      protein: round1(food.per100g.protein * scale),
      carbs: round1(food.per100g.carbs * scale),
      fat: round1(food.per100g.fat * scale),
    },
  };
}

let pendingFood = null;

const PIECE_WEIGHTS = [
  { re: /banana/i, grams: 118 },
  { re: /chapati|roti/i, grams: 40 },
  { re: /\begg\b/i, grams: 50 },
  { re: /apple/i, grams: 180 },
  { re: /orange/i, grams: 131 },
  { re: /idli/i, grams: 35 },
  { re: /dosa/i, grams: 80 },
  { re: /samosa/i, grams: 60 },
  { re: /bread|slice/i, grams: 28 },
  { re: /potato/i, grams: 170 },
  { re: /tomato/i, grams: 120 },
  { re: /onion/i, grams: 110 },
];

const DENSITY_OVERRIDES = [{ re: /ghee|butter|\boil\b|cream/i, density: 0.9 }];

const VOLUME_ML = { ml: 1, tsp: 5, tbsp: 15, cup: 240, glass: 250 };
const WEIGHT_G = { g: 1, kg: 1000, bowl: 150, katori: 150 };

function guessPieceWeight(name) {
  const hit = PIECE_WEIGHTS.find((p) => p.re.test(name));
  return hit ? hit.grams : 100;
}

function guessDensity(name) {
  const hit = DENSITY_OVERRIDES.find((d) => d.re.test(name));
  return hit ? hit.density : 1;
}

function guessDefault(name) {
  if (/ghee|butter|\boil\b/i.test(name)) return { unit: 'tsp', qty: 1 };
  if (PIECE_WEIGHTS.some((p) => p.re.test(name))) return { unit: 'piece', qty: 1 };
  if (/milk|juice|\bwater\b/i.test(name)) return { unit: 'ml', qty: 250 };
  if (/yogurt|curd|dal|soup|curry/i.test(name)) return { unit: 'bowl', qty: 1 };
  return { unit: 'g', qty: 100 };
}

function computeGrams(name, qty, unit) {
  if (unit === 'piece') return qty * guessPieceWeight(name);
  if (unit in WEIGHT_G) return qty * WEIGHT_G[unit];
  if (unit in VOLUME_ML) return qty * VOLUME_ML[unit] * guessDensity(name);
  return qty;
}

function recomputeGrams() {
  if (!pendingFood) return;
  const qty = Number(el('qtyInput').value) || 0;
  const unit = el('qtyUnit').value;
  el('gramsInput').value = round1(computeGrams(pendingFood.description, qty, unit));
}

function openGramsModal(food) {
  pendingFood = food;
  el('gramsFoodName').textContent = food.description;
  const brandNote = food.brandOwner ? `Brand: ${food.brandOwner}. ` : 'Generic/unbranded (USDA Foundation or SR Legacy data). ';
  el('gramsHint').textContent = `${brandNote}Per 100g: ${Math.round(food.per100g.calories)} cal, P${Math.round(food.per100g.protein)}g C${Math.round(food.per100g.carbs)}g F${Math.round(food.per100g.fat)}g`;
  const defaults = guessDefault(food.description);
  el('qtyInput').value = defaults.qty;
  el('qtyUnit').value = defaults.unit;
  recomputeGrams();
  el('gramsModal').classList.remove('hidden');
  el('qtyInput').focus();
}

function closeGramsModal() {
  pendingFood = null;
  el('gramsModal').classList.add('hidden');
}

function confirmGrams() {
  if (!pendingFood || submitting) return;
  const grams = Number(el('gramsInput').value) || 0;
  if (grams <= 0) return;
  submitting = true;
  el('gramsConfirm').disabled = true;
  try {
    const scale = grams / 100;
    const p100 = pendingFood.per100g;
    Store.addEntry({
      date: state.date,
      mealType: state.mealType,
      description: pendingFood.description,
      fdcId: pendingFood.fdcId,
      grams,
      calories: p100.calories * scale,
      protein: p100.protein * scale,
      carbs: p100.carbs * scale,
      fat: p100.fat * scale,
    });
    closeGramsModal();
    el('searchInput').value = '';
    el('searchResults').innerHTML = '';
    loadDay();
  } finally {
    submitting = false;
    el('gramsConfirm').disabled = false;
  }
}

// ---------- Manual entry ----------

function addManual() {
  const description = el('manDesc').value.trim();
  if (!description) return;
  const macros = {
    calories: Number(el('manCalories').value) || 0,
    protein: Number(el('manProtein').value) || 0,
    carbs: Number(el('manCarbs').value) || 0,
    fat: Number(el('manFat').value) || 0,
  };
  Store.addEntry({
    date: state.date,
    mealType: state.mealType,
    description,
    grams: null,
    ...macros,
  });
  if (el('manSaveFav').checked) {
    Store.addFavorite({
      id: `custom-${Date.now()}`,
      name: description,
      servingLabel: '1 serving',
      totalGrams: 100,
      defaultUnit: 'g',
      defaultQty: 100,
      perServing: macros,
    });
    loadFavorites();
  }
  ['manDesc', 'manCalories', 'manProtein', 'manCarbs', 'manFat'].forEach((id) => (el(id).value = ''));
  el('manSaveFav').checked = false;
  loadDay();
}

// ---------- Scan label (Anthropic vision, called directly) ----------

let pendingScan = null;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function parseLabel(imageBase64, mediaType) {
  const settings = Store.getSettings();
  if (!settings.anthropicKey) {
    throw new Error('Add your Anthropic API key in Settings (gear icon) to enable label scanning.');
  }

  const prompt = `Read the nutrition facts label in this photo. Respond with ONLY a JSON object, no markdown fences, no other text, matching exactly this shape:
{"description": "short food/product name guessed from label or packaging", "servingLabel": "the serving size as printed, e.g. '1 cup (240ml)' or '30g'", "calories": number, "protein": number, "carbs": number, "fat": number}
All macro numbers are grams (except calories) for ONE serving as defined on the label. If a value is unreadable, use 0. Do not include any text before or after the JSON object.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.anthropicKey,
      'anthropic-version': '2023-06-01',
      // Required for calling the Anthropic API from a browser/WebView context.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.anthropicModel || 'claude-sonnet-5',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error: ${text}`);
  }

  const data = await response.json();
  const rawText = (data.content || []).map((b) => b.text || '').join('').trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not read the label - try a clearer photo.');
  }
  const parsed = JSON.parse(jsonMatch[0]);
  return {
    description: parsed.description || 'Scanned food',
    servingLabel: parsed.servingLabel || '1 serving',
    perServing: {
      calories: Number(parsed.calories) || 0,
      protein: Number(parsed.protein) || 0,
      carbs: Number(parsed.carbs) || 0,
      fat: Number(parsed.fat) || 0,
    },
  };
}

async function handleScanFile(file) {
  if (!file) return;
  const status = el('scanStatus');
  const preview = el('scanPreview');
  const previewImg = el('scanPreviewImg');

  previewImg.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  status.classList.remove('hidden');
  status.textContent = 'Reading label...';

  try {
    const imageBase64 = await fileToBase64(file);
    const result = await parseLabel(imageBase64, file.type || 'image/jpeg');
    status.textContent = '';
    status.classList.add('hidden');
    openScanModal(result);
  } catch (err) {
    status.textContent = `Error: ${err.message}`;
  }
}

function openScanModal(result) {
  pendingScan = result;
  el('scanDesc').value = result.description;
  el('scanServingLabel').textContent = `Label serving: ${result.servingLabel}. Set how many servings you actually ate.`;
  el('scanServings').value = 1;
  fillScanFields(result.perServing, 1);
  el('scanModal').classList.remove('hidden');
}

function fillScanFields(perServing, servings) {
  el('scanCalories').value = round1(perServing.calories * servings);
  el('scanProtein').value = round1(perServing.protein * servings);
  el('scanCarbs').value = round1(perServing.carbs * servings);
  el('scanFat').value = round1(perServing.fat * servings);
}

function closeScanModal() {
  pendingScan = null;
  el('scanModal').classList.add('hidden');
  el('scanInput').value = '';
  el('scanPreview').classList.add('hidden');
}

function confirmScan() {
  if (!pendingScan || submitting) return;
  submitting = true;
  el('scanConfirm').disabled = true;
  try {
    const description = el('scanDesc').value.trim() || pendingScan.description;
    Store.addEntry({
      date: state.date,
      mealType: state.mealType,
      description,
      grams: null,
      calories: el('scanCalories').value || 0,
      protein: el('scanProtein').value || 0,
      carbs: el('scanCarbs').value || 0,
      fat: el('scanFat').value || 0,
    });
    closeScanModal();
    loadDay();
  } finally {
    submitting = false;
    el('scanConfirm').disabled = false;
  }
}

// ---------- Tabs ----------

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
      btn.classList.add('active');
      el(`tab-${btn.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ---------- Init ----------

function init() {
  initTabs();
  initMealSelector();

  el('datePicker').value = state.date;
  el('datePicker').addEventListener('change', (e) => setDate(e.target.value));
  el('prevDay').addEventListener('click', () => setDate(shiftDate(state.date, -1)));
  el('nextDay').addEventListener('click', () => setDate(shiftDate(state.date, 1)));
  el('todayBtn').addEventListener('click', () => setDate(todayStr()));

  el('searchBtn').addEventListener('click', doSearch);
  el('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });

  el('manAddBtn').addEventListener('click', addManual);

  el('gramsCancel').addEventListener('click', closeGramsModal);
  el('gramsConfirm').addEventListener('click', confirmGrams);
  el('qtyInput').addEventListener('input', recomputeGrams);
  el('qtyUnit').addEventListener('change', recomputeGrams);

  el('favCancel').addEventListener('click', closeFavModal);
  el('favConfirm').addEventListener('click', confirmFav);
  el('favQtyInput').addEventListener('input', recomputeFavGrams);
  el('favQtyUnit').addEventListener('change', recomputeFavGrams);

  el('scanInput').addEventListener('change', (e) => handleScanFile(e.target.files[0]));
  el('scanServings').addEventListener('change', () => {
    if (pendingScan) fillScanFields(pendingScan.perServing, Number(el('scanServings').value) || 1);
  });
  el('scanCancel').addEventListener('click', closeScanModal);
  el('scanConfirm').addEventListener('click', confirmScan);

  el('settingsBtn').addEventListener('click', openSettings);
  el('settingsCancel').addEventListener('click', closeSettings);
  el('settingsSave').addEventListener('click', saveSettings);
  ['goalProtein', 'goalCarbs', 'goalFat'].forEach((id) => el(id).addEventListener('input', updateGoalCalories));
  el('exportBtn').addEventListener('click', downloadBackup);
  el('importBtn').addEventListener('click', () => el('importFileInput').click());
  el('importFileInput').addEventListener('change', (e) => handleImportFile(e.target.files[0]));

  state.goals = Store.getGoals();
  loadFavorites();
  loadDay();
}

document.addEventListener('DOMContentLoaded', init);
