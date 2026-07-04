// On-device storage layer. Everything lives in localStorage under one key,
// so the app runs with no backend - in a plain browser tab or inside the
// Android (Capacitor) wrapper, where localStorage is the app's private storage.
const Store = (() => {
  const STORAGE_KEY = 'nutritrack.v1';

  // Calories are always derived from the macro goals (4/4/9 kcal per gram) -
  // storing them independently would allow impossible goal combinations.
  const DEFAULT_MACRO_GOALS = { protein: 120, carbs: 250, fat: 65 };

  function deriveCalories(g) {
    return Math.round(g.protein * 4 + g.carbs * 4 + g.fat * 9);
  }

  // Personal-use defaults; can be overridden in Settings. The Anthropic key
  // is injected at APK build time from a GitHub Actions secret - it stays
  // empty in source control and in the public web deployment.
  const DEFAULT_FDC_KEY = '';
  const DEFAULT_ANTHROPIC_KEY = '';

  const SEED_FAVORITES = [
    { id: 'chapati', name: 'Whole wheat chapati', servingLabel: '1 piece', totalGrams: 40, defaultUnit: 'piece', defaultQty: 1, perServing: { calories: 120, protein: 3.1, carbs: 18.3, fat: 3.7 } },
    { id: 'pani-puri', name: 'Pani puri', servingLabel: '6 pieces', totalGrams: 90, defaultUnit: 'piece', defaultQty: 6, perServing: { calories: 170, protein: 3, carbs: 30, fat: 4 } },
    { id: 'vada-pav', name: 'Vada pav', servingLabel: '1 piece', totalGrams: 120, defaultUnit: 'piece', defaultQty: 1, perServing: { calories: 290, protein: 6, carbs: 40, fat: 12 } },
    { id: 'paneer', name: 'Paneer', servingLabel: '150 g', totalGrams: 150, defaultUnit: 'g', defaultQty: 150, perServing: { calories: 398, protein: 27.5, carbs: 1.8, fat: 31.2 } },
    { id: 'low-fat-yogurt', name: 'Low-fat yogurt (curd)', servingLabel: '1 bowl (~200 g)', totalGrams: 200, defaultUnit: 'g', defaultQty: 200, perServing: { calories: 126, protein: 6.2, carbs: 9.4, fat: 3 } },
    { id: 'banana', name: 'Banana', servingLabel: '1 medium (~118 g)', totalGrams: 118, defaultUnit: 'piece', defaultQty: 1, perServing: { calories: 105, protein: 1.3, carbs: 27, fat: 0.3 } },
    { id: 'ghee', name: 'Ghee', servingLabel: '1 teaspoon (~5 g)', totalGrams: 5, defaultUnit: 'g', defaultQty: 5, perServing: { calories: 40, protein: 0, carbs: 0, fat: 4.5 } },
    { id: 'milk', name: 'Milk (toned)', servingLabel: '250 ml (1 glass)', totalGrams: 250, defaultUnit: 'g', defaultQty: 250, perServing: { calories: 145, protein: 8, carbs: 12, fat: 7.5 } },
    { id: 'rice', name: 'Rice, white (cooked)', servingLabel: '1 cup (~158 g)', totalGrams: 158, defaultUnit: 'g', defaultQty: 158, perServing: { calories: 205, protein: 4.3, carbs: 44.5, fat: 0.4 } },
  ];

  function freshData() {
    return {
      entries: [],
      nextId: 1,
      goals: { ...DEFAULT_MACRO_GOALS, calories: deriveCalories(DEFAULT_MACRO_GOALS) },
      favorites: SEED_FAVORITES.map((f) => ({ ...f, perServing: { ...f.perServing } })),
      settings: { fdcKey: DEFAULT_FDC_KEY, anthropicKey: DEFAULT_ANTHROPIC_KEY, anthropicModel: 'claude-sonnet-5' },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return freshData();
      const data = JSON.parse(raw);
      // Backfill any fields missing from older versions of the schema.
      const fresh = freshData();
      const settings = { ...fresh.settings, ...(data.settings || {}) };
      // An empty stored key means "never set" - fall back to the built-in
      // defaults so upgraded installs pick up newly injected keys.
      if (!settings.fdcKey) settings.fdcKey = DEFAULT_FDC_KEY;
      if (!settings.anthropicKey) settings.anthropicKey = DEFAULT_ANTHROPIC_KEY;
      return {
        entries: Array.isArray(data.entries) ? data.entries : [],
        nextId: Number(data.nextId) || 1,
        goals: normalizeGoals({ ...fresh.goals, ...(data.goals || {}) }),
        favorites: Array.isArray(data.favorites) && data.favorites.length ? data.favorites : fresh.favorites,
        settings,
      };
    } catch (err) {
      return freshData();
    }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function r1(n) {
    return Math.round(n * 10) / 10;
  }

  // ---------- Entries ----------

  function addEntry(entry) {
    const data = load();
    const record = { id: data.nextId++, createdAt: new Date().toISOString(), ...entry };
    record.calories = r1(Number(record.calories) || 0);
    record.protein = r1(Number(record.protein) || 0);
    record.carbs = r1(Number(record.carbs) || 0);
    record.fat = r1(Number(record.fat) || 0);
    data.entries.push(record);
    save(data);
    return record;
  }

  function deleteEntry(id) {
    const data = load();
    data.entries = data.entries.filter((e) => e.id !== id);
    save(data);
  }

  function getDayLog(date) {
    const entries = load().entries.filter((e) => e.date === date);
    const totals = entries.reduce(
      (acc, e) => {
        acc.calories += e.calories;
        acc.protein += e.protein;
        acc.carbs += e.carbs;
        acc.fat += e.fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    for (const k of Object.keys(totals)) totals[k] = r1(totals[k]);
    return { date, entries, totals };
  }

  function summarizeByDate(entries) {
    const byDate = {};
    for (const e of entries) {
      if (!byDate[e.date]) byDate[e.date] = { date: e.date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
      byDate[e.date].calories += e.calories;
      byDate[e.date].protein += e.protein;
      byDate[e.date].carbs += e.carbs;
      byDate[e.date].fat += e.fat;
      byDate[e.date].count += 1;
    }
    return byDate;
  }

  function getAllDays() {
    const byDate = summarizeByDate(load().entries);
    return Object.values(byDate)
      .map((d) => ({ ...d, calories: r1(d.calories), protein: r1(d.protein), carbs: r1(d.carbs), fat: r1(d.fat) }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function getTrend(days, todayStr) {
    const byDate = summarizeByDate(load().entries);
    const result = [];
    // Pure UTC calendar arithmetic - see app.js shiftDate() for why.
    const [y, m, d] = todayStr.split('-').map(Number);
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const day = byDate[dateStr] || { date: dateStr, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
      result.push({ ...day, calories: r1(day.calories), protein: r1(day.protein), carbs: r1(day.carbs), fat: r1(day.fat) });
    }
    return result;
  }

  // ---------- Goals ----------

  function getGoals() {
    return load().goals;
  }

  function normalizeGoals(goals) {
    const macros = {
      protein: Number(goals.protein) || DEFAULT_MACRO_GOALS.protein,
      carbs: Number(goals.carbs) || DEFAULT_MACRO_GOALS.carbs,
      fat: Number(goals.fat) || DEFAULT_MACRO_GOALS.fat,
    };
    return { ...macros, calories: deriveCalories(macros) };
  }

  function setGoals(goals) {
    const data = load();
    data.goals = normalizeGoals(goals);
    save(data);
    return data.goals;
  }

  // ---------- Favorites ----------

  function getFavorites() {
    return load().favorites.map((fav) => {
      const scale = 100 / fav.totalGrams;
      return {
        ...fav,
        per100g: {
          calories: r1(fav.perServing.calories * scale),
          protein: r1(fav.perServing.protein * scale),
          carbs: r1(fav.perServing.carbs * scale),
          fat: r1(fav.perServing.fat * scale),
        },
      };
    });
  }

  function addFavorite(fav) {
    const data = load();
    if (!data.favorites.some((f) => f.id === fav.id)) data.favorites.push(fav);
    save(data);
  }

  function removeFavorite(id) {
    const data = load();
    data.favorites = data.favorites.filter((f) => f.id !== id);
    save(data);
  }

  function hasFavorite(id) {
    return load().favorites.some((f) => f.id === id);
  }

  // ---------- Settings ----------

  function getSettings() {
    return load().settings;
  }

  function setSettings(patch) {
    const data = load();
    data.settings = { ...data.settings, ...patch };
    save(data);
    return data.settings;
  }

  // ---------- Backup: export / import ----------

  function exportData() {
    const data = load();
    return {
      app: 'nutritrack',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: data.entries,
      nextId: data.nextId,
      goals: data.goals,
      favorites: data.favorites,
      // API keys are deliberately NOT exported - backups may end up in
      // cloud drives; keys are quick to re-enter in Settings.
    };
  }

  function importData(parsed) {
    if (!parsed || parsed.app !== 'nutritrack' || !Array.isArray(parsed.entries)) {
      throw new Error('Not a valid NutriTrack backup file.');
    }
    const data = load();
    data.entries = parsed.entries;
    data.nextId = Number(parsed.nextId) || Math.max(0, ...parsed.entries.map((e) => Number(e.id) || 0)) + 1;
    if (parsed.goals) data.goals = { ...data.goals, ...parsed.goals };
    if (Array.isArray(parsed.favorites) && parsed.favorites.length) data.favorites = parsed.favorites;
    save(data);
    return { entries: data.entries.length };
  }

  return {
    addEntry,
    deleteEntry,
    getDayLog,
    getAllDays,
    getTrend,
    getGoals,
    setGoals,
    getFavorites,
    addFavorite,
    removeFavorite,
    hasFavorite,
    getSettings,
    setSettings,
    exportData,
    importData,
  };
})();
