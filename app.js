'use strict';
(() => {
  /* =========================================================================
     Constants & helpers
     ========================================================================= */
  const LS_KEY = 'recipeapp.v1';
  // Display order for ingredient groups: least → most likely on hand, pantry last.
  const GROUPS = [
    ['protein', 'Protein'],
    ['produce', 'Produce'],
    ['shelf', 'Shelf'],
    ['seasonings', 'Seasonings'],
    ['pantry', 'Pantry Essentials'],
  ];
  const GROUP_LABEL = Object.fromEntries(GROUPS);
  // Each recipe has one category (stored lowercase). These lead the list; others follow alphabetically.
  const CATEGORY_ORDER = ['breakfast', 'lunch/dinner', 'dinner', 'snack', 'dessert'];
  const SCALES = [0.5, 1, 2, 3];
  const RECIPE_KEYS = ['title', 'category', 'source_name', 'source_url', 'author', 'description', 'prep_time', 'cook_time',
    'total_time', 'servings', 'ingredients', 'instructions', 'nutrition', 'tags'];

  const $ = (sel, el = document) => el.querySelector(sel);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const blankToNull = (s) => (s == null || String(s).trim() === '' ? null : String(s).trim());
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const I = {
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
    cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.2 11h11L20 8H6.2"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 21c-3.9 0-7-2.7-7-6.5 0-4 4-6 3.5-10.5C12 6 14 9 14 11c1-1 1.5-2.5 1.5-3.5C18 9.5 19 12 19 14.5 19 18.3 15.9 21 12 21z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    pot: '<svg viewBox="0 0 24 24"><path d="M3 11h18M5 11v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6M21 11l1.5-1.5M9 7c0-1 1-1.5 1-2.5M13 7c0-1 1-1.5 1-2.5"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  };

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* =========================================================================
     Quantity parsing & scaling (½, 1½, 1 1/2, 1.5, ranges like 15–20 g / 2 to 3)
     ========================================================================= */
  const FRAC = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8 };
  const FC = Object.keys(FRAC).join('');
  const NUM = `(?:\\d+\\s*[${FC}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.\\d+|\\d+|[${FC}])`;
  const RANGE = `(${NUM})(?:(\\s*(?:-|–|—|to)\\s*)(${NUM}))?`;
  const LEAD_RE = new RegExp(`^(\\s*[~≈]?\\s*)${RANGE}`);
  const PLUS_RE = new RegExp(`(\\bplus\\s+)${RANGE}`, 'gi');
  const PAREN_RE = new RegExp(`\\((\\s*(?:about|approx\\.?|~)?\\s*)${RANGE}([^)]*)\\)(\\s*(?:cans?|jars?|packages?|pkgs?|bags?|box(?:es)?|bottles?|cartons?|containers?|tins?)\\b)?`, 'gi');
  const METRIC_RE = /^\s*(g|grams?|kg|mg|ml|milliliters?)\b/i;
  const UNIT_WORD_RE = /^(\s+)(pound|cup|tablespoon|teaspoon|clove|ounce|scoop|serving|slice|pint)s?\b/i;

  function parseNum(s) {
    s = s.trim();
    const f = s.match(new RegExp(`^(\\d*)\\s*([${FC}])$`));
    if (f) return (f[1] ? +f[1] : 0) + FRAC[f[2]];
    const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return +mixed[1] + mixed[2] / mixed[3];
    const fr = s.match(/^(\d+)\/(\d+)$/);
    if (fr) return fr[1] / fr[2];
    return parseFloat(s);
  }

  const NICE = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'], [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'], [1, '']];
  function fmtQty(n, metric) {
    if (metric) return String(n < 10 ? Math.round(n * 2) / 2 : Math.round(n));
    let whole = Math.floor(n);
    const rem = n - whole;
    let best = null;
    for (const [v, g] of NICE) if (Math.abs(rem - v) < 0.04) { best = [v, g]; break; }
    if (!best) return String(Math.round(n * 100) / 100);
    if (best[0] === 1) whole += 1;
    if (!best[1]) return String(whole);
    return whole ? `${whole}${best[1]}` : best[1];
  }

  function scaleText(text, f) {
    if (!text || f === 1) return text ?? '';
    const sc = (a, sep, b, after) => {
      const metric = METRIC_RE.test(after);
      return fmtQty(parseNum(a) * f, metric) + (b ? sep + fmtQty(parseNum(b) * f, metric) : '');
    };
    let out = text;
    const lead = text.match(LEAD_RE);
    if (lead) {
      const [m, pre, a, sep, b] = lead;
      const rest = text.slice(m.length);
      // Keep simple units grammatical after scaling: "1 cup" → "2 cups", "2 cups" → "1 cup".
      const top = parseNum(b || a) * f;
      out = pre + sc(a, sep, b, rest) + rest.replace(UNIT_WORD_RE, (u, sp, word) => sp + word + (top > 1 ? 's' : ''));
    }
    out = out.replace(PLUS_RE, (m, pre, a, sep, b, off, str) => pre + sc(a, sep, b, str.slice(off + m.length)));
    out = out.replace(PAREN_RE, (m, pre, a, sep, b, rest, container) =>
      container ? m : `(${pre}${sc(a, sep, b, rest)}${rest})`);
    return out;
  }

  const isWholeRecipe = (per) => /entire|whole|recipe|batch|total/i.test(per || '');
  const fmtN = (n) => String(Math.round(n * 10) / 10);

  function nutritionParts(n, f = 1) {
    if (!n || n.calories == null) return null;
    const m = isWholeRecipe(n.per) ? f : 1;
    const parts = [`${fmtN(n.calories * m)} cal`];
    if (n.protein_g != null) parts.push(`${fmtN(n.protein_g * m)}g protein`);
    return { m, parts, per: n.per || 'serving' };
  }
  function nutritionFull(n, f) {
    const p = nutritionParts(n, f);
    if (!p) return '';
    for (const [k, label] of [['carbs_g', 'carbs'], ['fat_g', 'fat'], ['fiber_g', 'fiber']])
      if (n[k] != null) p.parts.push(`${fmtN(n[k] * p.m)}g ${label}`);
    return `${p.parts.join(' | ')} per ${p.per}${p.m !== 1 ? ` (${fmtN(f)}× batch)` : ''}`;
  }


  /* =========================================================================
     State
     ========================================================================= */
  let S = null;
  let seedError = null;
  const ui = { q: '', chips: new Set(), scale: {}, draft: null, dirty: false, cook: null, cookRows: null, cookFilter: '', calculating: null, unlocked: null };

  const blankState = () => ({ recipes: [], cooks: [], pantry_essentials: [], favorites: [], theme: 'auto' });

  function save() {
    if (!store.set(LS_KEY, S)) toast("Couldn't save. Storage is full or blocked in this browser.");
    sync?.push();
  }

  /* =========================================================================
     Firebase sync (see sync.js). The device copy above is always kept, so the
     app works offline and while signed out; when signed in, Firestore wins.
     ========================================================================= */
  const SYNC_KEY = 'recipeapp.sync'; // {uid, ids}: which recipes this device has seen in Firestore
  let sync = null;
  let syncStatus = { signedIn: false, state: 'starting' };

  const normTitle = (t) => String(t || '').trim().toLowerCase();
  const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];

  // Firestore returns fields alphabetically; put them back in recipes.json order.
  function orderRecipe(r) {
    const out = { _id: r._id };
    for (const k of RECIPE_KEYS) if (k in r) out[k] = r[k];
    for (const k of Object.keys(r)) if (!(k in out)) out[k] = r[k];
    if (out.ingredients && !Array.isArray(out.ingredients)) {
      const ing = {};
      for (const k of groupOrder(out.ingredients)) if (k in out.ingredients) ing[k] = out.ingredients[k];
      out.ingredients = ing;
    }
    if (out.nutrition) {
      const n = {};
      for (const k of ['per', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'note']) if (k in out.nutrition) n[k] = out.nutrition[k];
      out.nutrition = Object.assign(n, out.nutrition);
    }
    return out;
  }

  function applyRemote(remote, first) {
    // Typing on a cook is saved after a short pause; until then this device is newer than
    // Firestore. Skip this update: saving sends a fresh one that includes everything.
    if (!first && saveTimer) return;
    const uidNow = syncStatus.uid;
    const book = store.get(SYNC_KEY) || {};
    const firstForUser = first && book.uid !== uidNow;
    const remoteRecipes = remote.recipes.map(orderRecipe).sort((a, b) => (a._order ?? 1e9) - (b._order ?? 1e9));
    const remoteIds = new Set(remoteRecipes.map((r) => r._id));
    const remoteTitles = new Map(remoteRecipes.map((r) => [normTitle(r.title), r._id]));
    const seen = new Set(book.uid === uidNow ? book.ids || [] : []);

    // Recipes only on this device: on the first sign-in, anything with a new title;
    // after that, only recipes Firestore has never had (anything else was deleted elsewhere).
    const localOnly = S.recipes.filter((r) => (firstForUser
      ? !remoteTitles.has(normTitle(r.title))
      : !remoteIds.has(r._id) && !seen.has(r._id)));
    // Point favorites at the Firestore copy of the same recipe.
    const mapId = (id) => {
      const r = S.recipes.find((x) => x._id === id);
      return (r && remoteTitles.get(normTitle(r.title))) || id;
    };

    if (firstForUser) {
      S.favorites = union(remote.favorites?.ids, S.favorites.map(mapId));
      S.pantry_essentials = union(remote.pantry?.items, S.pantry_essentials);
    } else {
      if (remote.favorites) S.favorites = [...remote.favorites.ids];
      if (remote.pantry) S.pantry_essentials = [...remote.pantry.items];
    }

    // Cooks follow the same rule as recipes, matched by id.
    const remoteCooks = (remote.cooks || []).map((c) => ({ ...c }));
    const remoteCookIds = new Set(remoteCooks.map((c) => c._id));
    const seenCooks = new Set(book.uid === uidNow ? book.cookIds || [] : []);
    const localCooks = (S.cooks || []).filter((c) => !remoteCookIds.has(c._id) && (firstForUser || !seenCooks.has(c._id)));
    if (firstForUser) localCooks.forEach((c) => { c.recipe_id = mapId(c.recipe_id); });

    S.recipes = [...remoteRecipes, ...localOnly];
    S.cooks = [...remoteCooks, ...localCooks];
    if (firstForUser) recategorize(S.recipes);
    const migrated = migrateCategories(S.recipes);
    store.set(SYNC_KEY, {
      uid: uidNow,
      ids: union(firstForUser ? [] : book.ids, [...remoteIds]),
      cookIds: union(firstForUser ? [] : book.cookIds, [...remoteCookIds]),
    });
    store.set(LS_KEY, S);
    if (!first && (localOnly.length || localCooks.length || migrated)) sync?.push();
    refreshView();
  }

  // Re-render after new data arrives, without wiping a form being typed in.
  function refreshView() {
    const [view = '', id] = location.hash.replace(/^#\/?/, '').split('/');
    if (view === 'edit' || view === 'new' || view === 'more') return;
    if (ui.cook) { if (findRecipe(ui.cook.id)) renderCook(); else closeCook(); }
    const typing = app.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (view === 'r') rerender(() => viewRecipe(decodeURIComponent(id || '')));
    else if (view === 'cooked') rerender(viewCookedList);
    else if (view === 'c') { if (!typing) rerender(() => viewCookLog(decodeURIComponent(id || ''))); }
    else if ($('#list')) {
      $('#chips').innerHTML = chipsHtml();
      renderList();
      renderSyncUI();
    }
  }

  function syncMessage() {
    const s = syncStatus;
    if (s.state === 'unavailable') return "Sync isn't available right now. Your recipes are saved on this device.";
    if (!s.signedIn) return 'Not signed in. Recipes are saved on this device only.';
    if (s.state === 'error') {
      return s.error === 'permission'
        ? 'Firebase refused to save recipes. The database rules need to allow them (see the README).'
        : "Couldn't sync. Your changes are saved on this device and will sync when it works again.";
    }
    if (s.state === 'loading') return 'Connecting…';
    if (s.state === 'offline') return "Offline. Changes are saved on this device and will sync when you're back online.";
    return 'Synced. Changes show up on your other devices.';
  }

  function syncPanelHtml() {
    const s = syncStatus;
    const body = s.signedIn
      ? `<p class="sync-line ${s.state === 'synced' ? 'ok' : s.state === 'error' ? 'bad' : ''}">${esc(syncMessage())}</p>
         <p class="hint">Signed in as <b>${esc(s.email)}</b></p>
         <button class="btn block add-row" data-a="sign-out">Sign out</button>`
      : s.state === 'unavailable' || s.state === 'starting'
        ? `<p>${esc(s.state === 'starting' ? 'Loading…' : syncMessage())}</p>`
        : `<p>Sign in with your Card Deals login to keep recipes, favorites, and pantry essentials the same on every device.</p>
           <form class="form" id="sync-form" novalidate>
             <label for="sync-email">Email</label>
             <input id="sync-email" type="email" autocomplete="username" autocapitalize="none" required>
             <label for="sync-password">Password</label>
             <input id="sync-password" type="password" autocomplete="current-password" required>
             <button class="btn primary block add-row" type="submit">Sign in</button>
           </form>`;
    return `<section class="panel" id="sync-panel"><h2>Sync across devices</h2>${body}</section>`;
  }

  function syncNoticeHtml() {
    return syncStatus.state === 'signed-out'
      ? `<div class="notice" id="sync-notice">Recipes are only on this device. <a href="#/more">Sign in to sync</a></div>`
      : '<div id="sync-notice" hidden></div>';
  }

  function renderSyncUI() {
    const panel = $('#sync-panel');
    if (panel && !panel.contains(document.activeElement)) panel.outerHTML = syncPanelHtml();
    const notice = $('#sync-notice');
    if (notice) notice.outerHTML = syncNoticeHtml();
  }

  async function startSync() {
    if (!location.protocol.startsWith('http')) { syncStatus = { signedIn: false, state: 'unavailable' }; return; }
    try {
      const mod = await import('./sync.js');
      sync = mod.start({
        getState: () => S,
        onRemote: applyRemote,
        onStatus: (s) => { syncStatus = s; renderSyncUI(); },
      });
    } catch {
      syncStatus = { signedIn: false, state: 'unavailable' };
      renderSyncUI();
    }
  }

  function authMessage(err) {
    const code = err?.code || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(code)) return 'Wrong email or password.';
    if (/network-request-failed/.test(code)) return "No connection. Try again when you're online.";
    if (/too-many-requests/.test(code)) return 'Too many tries. Wait a few minutes and try again.';
    return "Couldn't sign in. Try again.";
  }

  function normalizeRecipe(r, keepId) {
    const out = { _id: keepId || uid() };
    for (const k of RECIPE_KEYS) if (k in r) out[k] = r[k];
    for (const k of Object.keys(r)) if (!(k in out) && !k.startsWith('_')) out[k] = r[k];
    if (!Array.isArray(out.instructions)) out.instructions = out.instructions ? [String(out.instructions)] : [];
    if (!Array.isArray(out.tags)) out.tags = [];
    if (out.ingredients == null) out.ingredients = [];
    return out;
  }
  // Tags were replaced by a single category. A recipe without one takes its first tag
  // (meal-type tags first); the old tags stay in the data but aren't shown or edited.
  function migrateCategories(recipes) {
    let changed = false;
    for (const r of recipes) {
      if (r.category != null || !Array.isArray(r.tags) || !r.tags.length) continue;
      const tags = r.tags.map((t) => String(t).toLowerCase());
      r.category = CATEGORY_ORDER.find((c) => tags.includes(c)) || tags[0];
      changed = true;
    }
    return changed;
  }
  // Strip internal fields (anything starting with "_") so exports match recipes.json.
  const cleanRecipe = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_')));

  const findRecipe = (id) => S.recipes.find((r) => r._id === id);

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.json();
  }

  async function seed() {
    const recipes = await fetchJSON('recipes.json');
    let pantry = ['olive oil'];
    try { pantry = await fetchJSON('pantry_essentials.json'); } catch { /* keep default */ }
    if (!Array.isArray(recipes)) throw new Error('recipes.json should be a list of recipes');
    S = blankState();
    S.recipes = recipes.map((r) => normalizeRecipe(r));
    S.pantry_essentials = pantry.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    recategorize(S.recipes);
    save();
  }

  /* =========================================================================
     Pantry essentials
     ========================================================================= */
  const pantryRe = (item) => new RegExp(`(^|[^a-z])${escRe(item)}($|[^a-z])`, 'i');
  const isPantryItem = (text) => S.pantry_essentials.some((p) => pantryRe(p).test(text));

  // Move ingredients that match a pantry essential into the "pantry" group.
  // Only applies to grouped (object) ingredient lists; flat lists are grouped at display time.
  function recategorize(recipes, items = S.pantry_essentials) {
    let moved = 0;
    const touched = new Set();
    for (const r of recipes) {
      const ing = r.ingredients;
      if (!ing || Array.isArray(ing)) continue;
      for (const key of Object.keys(ing)) {
        if (key === 'pantry' || !Array.isArray(ing[key])) continue;
        const keep = [];
        for (const t of ing[key]) {
          if (items.some((p) => pantryRe(p).test(t))) {
            (ing.pantry ||= []).push(t);
            moved++;
            touched.add(r._id);
          } else keep.push(t);
        }
        ing[key] = keep;
      }
    }
    return { moved, recipes: touched.size };
  }

  /* =========================================================================
     Ingredient helpers
     ========================================================================= */
  function groupOrder(ing) {
    const known = GROUPS.map(([k]) => k);
    const extra = Object.keys(ing).filter((k) => !known.includes(k));
    return [...known.slice(0, 4), ...extra, 'pantry'];
  }

  // [{key, label, items:[{text, ck}]}] in display order, empty groups dropped.
  function ingredientGroups(r) {
    const ing = r.ingredients;
    if (Array.isArray(ing)) {
      const main = [], pan = [];
      ing.forEach((t, i) => (isPantryItem(t) ? pan : main).push({ text: t, ck: `f${i}` }));
      return [
        { key: 'other', label: '', items: main },
        { key: 'pantry', label: 'Pantry Essentials', items: pan },
      ].filter((g) => g.items.length);
    }
    return groupOrder(ing || {}).map((k) => ({
      key: k,
      label: GROUP_LABEL[k] || cap(k),
      items: (ing?.[k] || []).map((t, i) => ({ text: t, ck: `${k}${i}` })),
    })).filter((g) => g.items.length);
  }

  const allIngredientText = (r) => ingredientGroups(r).flatMap((g) => g.items.map((i) => i.text));

  /* =========================================================================
     Ingredient names inside the steps (shown as pills)
     ========================================================================= */
  // Words that are too generic to mark on their own (they still match as part of a longer name).
  const PILL_STOP = new Set(['powder', 'flake', 'juice', 'zest', 'wedge', 'extract', 'sauce', 'spray', 'blend', 'mix', 'piece',
    'red', 'green', 'yellow', 'white', 'black', 'brown', 'sweet', 'ground', 'dark', 'light', 'dried', 'freeze-dried', 'fresh',
    'large', 'small', 'medium', 'cooked', 'frozen', 'salted', 'unsalted', 'kosher', 'smoked', 'crushed', 'whole', 'extra',
    'extra-virgin', 'fire-roasted', 'greek', 'cherry', 'baby', 'mixed', 'plain', 'raw', 'toasted', 'roasted', 'sliced']);
  const singular = (w) => w.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/([^s])s$/, '$1');

  // Names to look for in the steps, from each ingredient line: the full name, its last
  // two words, and its first and last word when those are specific enough.
  function ingredientTerms(r) {
    const terms = new Set();
    for (const line of allIngredientText(r)) {
      const base = line.replace(/\([^)]*\)/g, ' ').split(',')[0];
      for (const piece of base.split(/\s*(?:\band\/or\b|\bor\b|\band\b|\bplus\b|&|\/)\s*/i)) {
        const words = parseIngredient(piece).name.replace(/\b(with|in|for|to)\b.*$/, '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) continue;
        terms.add(words.join(' '));
        if (words.length > 2) terms.add(words.slice(-2).join(' '));
        const first = words[0], last = words[words.length - 1];
        if (words.length > 1 && !PILL_STOP.has(singular(last))) terms.add(last);
        if (words.length > 1 && first.length >= 5 && !PILL_STOP.has(singular(first))) terms.add(first);
      }
    }
    return [...terms].filter((t) => t.length >= 3 && !PILL_STOP.has(singular(t)));
  }

  // One regex for all of a recipe's names, longest first, matching singular or plural.
  function ingredientRegex(r) {
    const terms = ingredientTerms(r).sort((a, b) => b.length - a.length);
    if (!terms.length) return null;
    const pattern = terms.map((t) => {
      const words = t.split(' ');
      const lastWord = singular(words.pop());
      const tail = lastWord.endsWith('y') ? `${escRe(lastWord.slice(0, -1))}(?:y|ies)` : `${escRe(lastWord)}(?:es|s)?`;
      return [...words.map(escRe), tail].join('\\s+');
    }).join('|');
    return new RegExp(`(?<![A-Za-z])(?:${pattern})(?![A-Za-z])`, 'gi');
  }

  function withPills(text, re) {
    if (!re) return esc(text);
    let out = '', last = 0;
    for (const m of text.matchAll(re)) {
      out += esc(text.slice(last, m.index)) + `<span class="ing">${esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  /* =========================================================================
     Ingredient name parsing
     ========================================================================= */
  const UNITS = {
    tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp', teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
    cup: 'cup', cups: 'cup', pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb', ounce: 'oz', ounces: 'oz', oz: 'oz',
    g: 'g', gram: 'g', grams: 'g', kg: 'kg', ml: 'ml', clove: 'clove', cloves: 'clove', can: 'can', cans: 'can',
    scoop: 'scoop', scoops: 'scoop', pinch: 'pinch', slice: 'slice', slices: 'slice', serving: 'serving', servings: 'serving',
  };
  const DESCRIPTORS = /\b(large|medium|small|fresh|freshly|minced|chopped|diced|grated|sliced|pitted|loosely|packed|finely|roughly|halved|crumbled|peeled|drained|optional|for topping|for serving|to taste|added gradually|about|plus|and\/or)\b/gi;

  function parseIngredient(text) {
    let rest = text, lo = null, hi = null, unit = '';
    const m = rest.match(LEAD_RE);
    if (m) {
      lo = parseNum(m[2]);
      hi = m[4] ? parseNum(m[4]) : null;
      rest = rest.slice(m[0].length);
    }
    const size = rest.match(/^\s*\(([^)]*)\)\s*/);
    if (size) rest = rest.slice(size[0].length);
    const um = rest.match(/^\s*([a-zA-Z]+)\.?(?=\s|$)/);
    if (m && um && UNITS[um[1].toLowerCase()]) {
      unit = UNITS[um[1].toLowerCase()];
      rest = rest.slice(um[0].length);
    }
    if (unit === 'can' && size) unit = `(${size[1]}) can`;
    let name = rest.replace(/^\s*of\s+/i, '').replace(/\([^)]*\)/g, '').split(',')[0]
      .replace(DESCRIPTORS, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!unit && /\bcloves?$/.test(name)) { unit = 'clove'; name = name.replace(/\s*cloves?$/, ''); }
    const key = name.split(' ').map((w) => w.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/([^s])s$/, '$1')).join(' ');
    return { lo, hi, unit, name, key: key || text.toLowerCase() };
  }

  /* =========================================================================
     Paste-to-parse
     ========================================================================= */
  function guessCategory(t) {
    if (isPantryItem(t)) return 'pantry';
    if (/\b(bell peppers?|jalape\w*|poblano|serrano)\b/i.test(t)) return 'produce';
    if (/\b(salt|black pepper|pepper(?!s)\b|paprika|cumin|chili powder|cayenne|oregano|cinnamon|nutmeg|turmeric|curry powder|garlic powder|onion powder|pepper flakes|bay lea\w+|seasoning|spices?|dried (thyme|basil|parsley|rosemary|dill)|allspice|cloves? ground|ground (ginger|cloves|coriander)|coriander)\b/i.test(t)) return 'seasonings';
    if (/\b(broth|stock|bouillon|canned|cans?|jar|frozen|dried|freeze-dried|powder)\b|\(\d+\s*oz\)/i.test(t)) return 'shelf';
    if (/\b(chicken|turkey|beef|steak|pork|bacon|ham|sausages?|salmon|tuna|cod|fish|shrimp|prawns?|scallops?|tofu|tempeh|eggs?|lamb|chorizo|prosciutto)\b/i.test(t)) return 'protein';
    if (/\b(onions?|garlic|shallots?|scallions?|tomato(es)?|potato(es)?|carrots?|celery|zucchini|squash|spinach|kale|lettuce|arugula|cabbage|broccoli|cauliflower|mushrooms?|cucumbers?|avocados?|lemons?|limes?|oranges?|apples?|bananas?|berries|strawberr\w*|blueberr\w*|raspberr\w*|mangoe?s?|dates|herbs|cilantro|parsley|basil|mint|dill|thyme|rosemary|ginger|corn|peas|green beans|asparagus|eggplant|beets?)\b/i.test(t)) return 'produce';
    return 'shelf';
  }

  function parseRecipeText(text) {
    const out = { head: [], ing: [], steps: [] };
    let sec = 'head', sawHeader = false;
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.trim().replace(/^[-•*▢☐◦·]\s*/, '').trim();
      if (!l) continue;
      let m;
      if (/^ingredients?\s*:?$/i.test(l)) { sec = 'ing'; sawHeader = true; continue; }
      if (/^(instructions|directions|method|steps|preparation|how to make( it)?)\s*:?$/i.test(l)) { sec = 'steps'; sawHeader = true; continue; }
      if (/^(notes?|nutrition( facts)?|equipment)\s*:?$/i.test(l)) { sec = 'skip'; continue; }
      if ((m = l.match(/^(?:serves|servings|yield|makes)\s*:?\s*(.+)$/i))) { out.servings = m[1]; continue; }
      if ((m = l.match(/^prep(?:aration)?\s*time\s*:?\s*(.+)$/i))) { out.prep = m[1]; continue; }
      if ((m = l.match(/^cook(?:ing)?\s*time\s*:?\s*(.+)$/i))) { out.cook = m[1]; continue; }
      if ((m = l.match(/^total\s*time\s*:?\s*(.+)$/i))) { out.total = m[1]; continue; }
      if (sec === 'ing') { if (!(/:$/.test(l) && !LEAD_RE.test(l))) out.ing.push(l); }
      else if (sec === 'steps') {
        if (/^step\s*\d+\s*:?$/i.test(l)) continue;
        out.steps.push(l.replace(/^(step\s*)?\d+\s*[.):-]?\s+/i, ''));
      } else if (sec === 'head') out.head.push(l);
    }
    if (!sawHeader) {
      // No section headers: quantity-led or short lines are ingredients, sentences are steps.
      const [title, ...rest] = out.head;
      out.head = title ? [title] : [];
      for (const l of rest) {
        const ingLike = LEAD_RE.test(l) || /^(pinch|dash|salt)\b/i.test(l) || (l.length < 50 && !/[.!]$/.test(l));
        (ingLike ? out.ing : out.steps).push(l.replace(/^(step\s*)?\d+[.)]\s+/i, ''));
      }
    }
    return {
      title: out.head[0] || '',
      description: out.head.slice(1).join(' '),
      servings: out.servings, prep: out.prep, cook: out.cook, total: out.total,
      ing: out.ing.map((t) => ({ text: t, cat: guessCategory(t) })),
      steps: out.steps,
    };
  }

  /* =========================================================================
     Routing
     ========================================================================= */
  // Where a cook was opened from (a recipe page or the Cooked tab), so Back and the
  // highlighted tab return there. Moving between cooks ("Cook again") keeps it.
  let lastHash = '';
  function route() {
    const [view = '', id] = location.hash.replace(/^#\/?/, '').split('/');
    if (view === 'c' && !lastHash.startsWith('#/c/')) ui.cookOrigin = lastHash.startsWith('#/r/') ? lastHash : '#/cooked';
    lastHash = location.hash;
    if (ui.cook) closeCook();
    flushSave();
    ui.cookRows = null;
    const fromRecipe = view === 'c' && ui.cookOrigin?.startsWith('#/r/');
    document.querySelectorAll('.tabs a').forEach((a) => {
      const tab = fromRecipe ? 'home' : { '': 'home', r: 'home', edit: 'home', new: 'home', cooked: 'cooked', c: 'cooked', more: 'more' }[view] || 'home';
      a.toggleAttribute('aria-current', false);
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    });
    if (!S) return;
    switch (view) {
      case 'r': viewRecipe(decodeURIComponent(id || '')); break;
      case 'edit': viewEdit(decodeURIComponent(id || '')); break;
      case 'new': viewEdit(null); break;
      case 'more': viewMore(); break;
      case 'cooked': viewCookedList(); break;
      case 'c': viewCookLog(decodeURIComponent(id || '')); break;
      default: viewHome();
    }
    window.scrollTo(0, 0);
  }

  // Re-render the current view in place without jumping to the top.
  function rerender(fn) {
    const y = window.scrollY;
    fn();
    window.scrollTo(0, y);
  }

  /* =========================================================================
     Home
     ========================================================================= */
  function allCategories() {
    const seen = new Set(S.recipes.map((r) => String(r.category || '').toLowerCase()).filter(Boolean));
    const ordered = CATEGORY_ORDER.filter((c) => seen.has(c));
    return [...ordered, ...[...seen].filter((c) => !ordered.includes(c)).sort()];
  }

  function chipsHtml() {
    return `<button class="chip" data-a="chip" data-chip="★" aria-pressed="${ui.chips.has('★')}">${I.heart}Favorites</button>`;
  }

  function viewHome() {
    document.title = 'Recipes';
    app.innerHTML = `
      <header class="top">
        <h1 class="page-title">Recipes</h1>
        <a class="icon-btn filled" href="#/new" aria-label="Add recipe">${I.plus}</a>
      </header>
      ${seedError ? `<div class="notice"><b>Couldn't load recipes.json.</b> ${esc(seedError)}<br>Open the app from a web server (see README) or import a backup from the Settings tab.</div>` : ''}
      ${syncNoticeHtml()}
      <div class="search-row">
        <div class="search">${I.search}<input id="q" type="search" placeholder="Search recipes" value="${esc(ui.q)}" autocomplete="off" aria-label="Search recipes"></div>
        <div class="chips" id="chips" role="group" aria-label="Filters">${chipsHtml()}</div>
      </div>
      <div id="list"></div>`;
    renderList();
  }

  function matchesFilters(r) {
    if (ui.chips.has('★') && !S.favorites.includes(r._id)) return false;
    const q = ui.q.trim().toLowerCase();
    if (!q) return true;
    const hay = [r.title, r.category || '', ...allIngredientText(r)].join('\n').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  }

  function renderList() {
    const list = $('#list');
    if (!list) return;
    const items = S.recipes.filter(matchesFilters);
    if (!S.recipes.length) {
      list.innerHTML = `<div class="empty"><p>No recipes yet.</p><p><a href="#/new">Add your first recipe</a></p></div>`;
      return;
    }
    if (!items.length) {
      list.innerHTML = `<div class="empty"><p>No recipes match.</p><button class="btn small" data-a="clear-filters">Clear search & filters</button></div>`;
      return;
    }
    const filtered = ui.q || ui.chips.size;
    // One section per category; recipes without one go last.
    const sections = allCategories()
      .map((c) => ({ label: cap(c), items: items.filter((r) => String(r.category || '').toLowerCase() === c) }))
      .concat([{ label: 'No category', items: items.filter((r) => !r.category) }])
      .filter((sec) => sec.items.length);
    list.innerHTML = `${filtered ? `<p class="count">${items.length} of ${S.recipes.length} recipes</p>` : ''}
      ${sections.map((sec) => `<section class="cat">
        <h2 class="sub cat-h">${esc(sec.label)} <span class="cat-n">${sec.items.length}</span></h2>
        <div class="cards">${sec.items.map(cardHtml).join('')}</div>
      </section>`).join('')}`;
  }

  // Short version for the list: "280 cal | 18g protein", plus "/bite" etc. when it isn't per serving.
  function cardNutrition(n) {
    const per = String(n.per || 'serving').replace(/\s*\(.*\)\s*/, '').trim();
    const parts = [`${fmtN(n.calories)} cal`];
    if (n.protein_g != null) parts.push(`${fmtN(n.protein_g)}g protein`);
    return parts.join(' | ') + (per && per !== 'serving' ? `/${per}` : '');
  }

  function cardHtml(r) {
    const fav = S.favorites.includes(r._id);
    return `<article class="card">
      <a class="card-link" href="#/r/${encodeURIComponent(r._id)}">
        <h2>${esc(r.title)}</h2>
        <div class="card-line">
          ${(() => { const n = S.cooks.filter((c) => c.recipe_id === r._id).length; return n ? `<span class="card-cooks" title="Cooked ${n} time${n === 1 ? '' : 's'}">${I.pot}${n}×</span>` : ''; })()}
          ${r.nutrition?.calories != null ? `<span class="card-nut">${esc(cardNutrition(r.nutrition))}</span>` : ''}
        </div>
      </a>
      <button class="icon-btn fav ${fav ? 'on' : ''}" data-a="fav" data-id="${esc(r._id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${I.heart}</button>
    </article>`;
  }

  /* =========================================================================
     Recipe detail
     ========================================================================= */
  function viewRecipe(id) {
    const r = findRecipe(id);
    if (!r) { app.innerHTML = `<div class="empty"><p>Recipe not found.</p><p><a href="#/">Back to recipes</a></p></div>`; return; }
    document.title = r.title;
    const f = ui.scale[id] || 1;
    const fav = S.favorites.includes(id);
    const n = r.nutrition;
    const safeUrl = /^https?:\/\//i.test(r.source_url || '') ? r.source_url : '';

    app.innerHTML = `
      <header class="top">
        <a class="icon-btn" href="#/" aria-label="Back to recipes">${I.back}</a>
        <span class="spacer"></span>
        <button class="icon-btn fav ${fav ? 'on' : ''}" style="position:static" data-a="fav" data-id="${esc(id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${I.heart}</button>
        <a class="icon-btn" href="#/edit/${encodeURIComponent(id)}" aria-label="Edit recipe">${I.edit}</a>
      </header>
      <article class="detail">
        <h1>${esc(r.title)}</h1>
        ${r.servings ? `<p class="meta"><span><b>Servings</b>&nbsp;${esc(scaleText(r.servings, f))}</span></p>` : ''}
        ${n && n.calories != null ? `<p class="nut">${esc(nutritionFull(n, f))}</p>` : ''}
        ${n?.note ? `<p class="nut-note">${esc(n.note)}</p>` : ''}
        ${f !== 1 && n && !isWholeRecipe(n.per) && n.calories != null ? `<p class="nut-note">Nutrition is per ${esc(n.per || 'serving')}, so it stays the same when scaling.</p>` : ''}

        <div class="scaler">
          <div class="seg" role="group" aria-label="Scale recipe">
            ${SCALES.map((s) => `<button data-a="scale" data-id="${esc(id)}" data-s="${s}" aria-pressed="${s === f}">${s === 0.5 ? '½' : s}×</button>`).join('')}
          </div>
          <button class="btn primary cook-btn" data-a="cook" data-id="${esc(id)}" ${r.instructions.length ? '' : 'disabled'}>${I.flame}Cook mode</button>
        </div>
        <button class="btn block log-btn" data-a="cook-start" data-id="${esc(id)}">${I.plus}Log a cook${f !== 1 ? ` (${fmtN(f)}×)` : ''}</button>

        <div class="section-h"><h2>Ingredients</h2></div>
        ${ingredientGroups(r).map((g) => `
          ${g.label ? `<h3 class="sub">${esc(g.label)}</h3>` : ''}
          <ul class="ing-list">${g.items.map((it) => `<li>${esc(scaleText(it.text, f))}</li>`).join('')}</ul>`).join('') || '<p class="hint">No ingredients yet.</p>'}
        ${f !== 1 ? '<p class="hint">Amounts written inside the steps aren\'t scaled.</p>' : ''}

        <div class="section-h"><h2>Instructions</h2></div>
        <ol class="steps">${(() => { const re = ingredientRegex(r); return r.instructions.map((s) => `<li>${withPills(s, re)}</li>`).join(''); })()}</ol>

        ${(() => {
          const hist = cooksOf(id);
          if (!hist.length) return '';
          return `<div class="section-h"><h2>History</h2></div>
            <p class="hint">Cooked ${hist.length} time${hist.length === 1 ? '' : 's'} · last ${esc(fmtDate(hist[0].date))}</p>
            <ul class="history">${hist.map((c) => `<li>
              <a class="hist-link" href="#/c/${encodeURIComponent(c._id)}">
                <span class="hist-top"><b>${esc(fmtDate(c.date))}</b>${ratingChip(c.rating)}${c.locked ? '' : '<span class="tag">In progress</span>'}</span>
                ${c.comment ? `<span class="hist-comment">${esc(c.comment)}</span>` : ''}
              </a>
              <button class="btn small" data-a="cook-again" data-id="${esc(c._id)}">Cook again</button></li>`).join('')}</ul>`;
        })()}

        ${safeUrl ? `<p class="source">Source: <a href="${esc(safeUrl)}" target="_blank" rel="noopener">${esc(safeUrl)}</a></p>` : ''}
      </article>`;
  }

  /* =========================================================================
     Cook mode (one step at a time, screen kept awake)
     ========================================================================= */
  let wakeLock = null;
  async function requestWake() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener?.('release', () => { wakeLock = null; renderCookStatus(); });
      }
    } catch { wakeLock = null; }
    renderCookStatus();
  }
  function renderCookStatus() {
    const el = $('#cook-status');
    if (el) el.textContent = wakeLock ? 'Screen will stay on' : ('wakeLock' in navigator ? 'Tap a step to keep the screen on' : 'Keep-awake isn’t supported in this browser');
  }

  function openCook(id, cookId) {
    const r = findRecipe(id);
    if (!r?.instructions.length) return;
    ui.cook = { id, step: 0, cookId: cookId || null };
    document.body.classList.add('noscroll');
    $('#cook').hidden = false;
    renderCook();
    requestWake();
  }
  function closeCook() {
    ui.cook = null;
    $('#cook').hidden = true;
    $('#cook').innerHTML = '';
    document.body.classList.remove('noscroll');
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
  }
  function renderCook() {
    const r = findRecipe(ui.cook.id);
    const steps = r.instructions;
    const i = ui.cook.step;
    const last = i === steps.length - 1;
    $('#cook').innerHTML = `
      <div class="cook-top">
        <span class="t">${esc(r.title)}</span>
        <button class="icon-btn" data-a="cook-close" aria-label="Exit cook mode">${I.x}</button>
      </div>
      <div class="cook-progress" aria-hidden="true">${steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
      <p class="cook-status" id="cook-status"></p>
      <div class="cook-body" data-a="cook-tap">
        <p class="cook-n">Step ${i + 1} of ${steps.length}</p>
        <p class="cook-step" aria-live="polite">${withPills(steps[i], ingredientRegex((ui.cook.cookId && findCooked(ui.cook.cookId)) || r))}</p>
      </div>
      <div class="cook-nav">
        <button class="btn" data-a="cook-prev" ${i === 0 ? 'disabled' : ''}>Back</button>
        <button class="btn primary" data-a="${last ? 'cook-close' : 'cook-next'}">${last ? 'Done' : 'Next step'}</button>
      </div>`;
    renderCookStatus();
  }
  function cookGo(d) {
    if (!ui.cook) return;
    const n = findRecipe(ui.cook.id).instructions.length;
    const next = Math.min(n - 1, Math.max(0, ui.cook.step + d));
    if (next !== ui.cook.step) { ui.cook.step = next; renderCook(); }
  }

  /* =========================================================================
     Cooks: each time a recipe is made — date, servings made, the ingredients
     as actually used (the recipe isn't changed), nutrition, rating, comment
     ========================================================================= */
  const RATINGS = [['bad', 'Bad'], ['neutral', 'Neutral'], ['good', 'Good']];
  const RATING_LABEL = Object.fromEntries(RATINGS);
  const findCooked = (id) => S.cooks.find((c) => c._id === id);
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0);
  const cooksOf = (recipeId) => S.cooks.filter((c) => c.recipe_id === recipeId).sort(byDateDesc);
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  function fmtDate(iso) {
    const d = new Date(`${iso}T00:00`);
    if (!iso || isNaN(d)) return iso || 'No date';
    const opts = { weekday: 'short', month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }
  const ratingChip = (v) => (v ? `<span class="rate-chip ${esc(v)}">${esc(RATING_LABEL[v] || v)}</span>` : '');

  // Ingredients in recipe format (grouped object or flat list) ⇄ editable rows.
  function ingredientRows(ing) {
    const rows = [];
    if (Array.isArray(ing)) ing.forEach((t) => rows.push({ text: t, cat: '' }));
    else if (ing) groupOrder(ing).forEach((k) => (ing[k] || []).forEach((t) => rows.push({ text: t, cat: k })));
    return rows;
  }
  function rowsToIngredients(rows) {
    const used = rows.filter((x) => x.text.trim());
    if (used.every((x) => !x.cat)) return used.map((x) => x.text.trim());
    const out = { protein: [], produce: [], shelf: [], seasonings: [], pantry: [] };
    used.forEach((x) => (out[x.cat || 'shelf'] ||= []).push(x.text.trim()));
    return out;
  }
  const ingredientKey = (ing, servings) => JSON.stringify([rowsToIngredients(ingredientRows(ing)), normTitle(servings)]);
  function scaleIngredients(ing, f) {
    if (Array.isArray(ing)) return ing.map((t) => scaleText(t, f));
    return Object.fromEntries(Object.entries(ing || {}).map(([k, v]) => [k, (v || []).map((t) => scaleText(t, f))]));
  }

  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; save(); }, 600); }
  function flushSave() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(); } }

  function startCook({ recipe_id, recipe_title, servings, ingredients }) {
    const c = {
      recipe_id: recipe_id || null, recipe_title: recipe_title || 'Untitled', date: todayIso(),
      servings: servings || '', ingredients: clone(ingredients || []), nutrition: null,
      locked: false, rating: null, comment: '', created: Date.now(), _id: uid(),
    };
    S.cooks.push(c);
    save();
    location.hash = `#/c/${encodeURIComponent(c._id)}`;
  }

  function viewCookLog(id) {
    const c = findCooked(id);
    if (!c) { app.innerHTML = `<div class="empty"><p>Cook not found.</p><p><a href="#/cooked">Back to Cooked</a></p></div>`; return; }
    const r = c.recipe_id ? findRecipe(c.recipe_id) : null;
    document.title = `${c.recipe_title} · ${fmtDate(c.date)}`;
    if (!c.locked && (!ui.cookRows || ui.cookRows.id !== id)) {
      const rows = ingredientRows(c.ingredients);
      ui.cookRows = { id, rows: rows.length ? rows : [{ text: '', cat: 'protein' }] };
    }
    const n = c.nutrition;
    const calculating = ui.calculating === id;
    const catOptions = (cat) => [['', 'Uncategorized'], ...GROUPS].map(([k, l]) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${l}</option>`).join('');

    const nutritionHtml = n && n.calories != null
      ? `<p class="nut">${esc(nutritionFull(n, 1))}</p>${n.note ? `<p class="nut-note">${esc(n.note)}</p>` : ''}`
      : calculating ? '<p class="hint">Calculating nutrition with Claude… (can take up to a minute)</p>'
      : c.locked ? `<button class="btn block add-row" data-a="cook-nutrition" data-id="${esc(id)}">${I.sparkle}Calculate nutrition</button>`
      : '<p class="hint">Calculated when you lock in the ingredients.</p>';

    const ingredientsHtml = c.locked
      ? `${ingredientGroups({ ingredients: c.ingredients }).map((g) => `
          ${g.label ? `<h3 class="sub">${esc(g.label)}</h3>` : ''}
          <ul class="ing-list">${g.items.map((it) => `<li>${esc(it.text)}</li>`).join('')}</ul>`).join('') || '<p class="hint">No ingredients.</p>'}
         <button class="btn block add-row" data-a="cook-unlock" data-id="${esc(id)}">${I.edit}Edit ingredients</button>`
      : `<p class="hint">Change anything you swapped or adjusted. The recipe itself isn't changed.</p>
         <div class="form">
         ${ui.cookRows.rows.map((it, i) => `<div class="row-item">
            <label for="ci-${i}" class="sr-only">Ingredient ${i + 1}</label>
            <input id="ci-${i}" data-cing="${i}" value="${esc(it.text)}" placeholder="e.g. 1 pound ground turkey">
            <div class="ctrl">
              <select id="ci-cat-${i}" data-cing-cat="${i}" aria-label="Group for ingredient ${i + 1}">${catOptions(it.cat)}</select>
              <button type="button" class="icon-btn" data-a="cing-del" data-i="${i}" aria-label="Remove ingredient ${i + 1}">${I.x}</button>
            </div></div>`).join('')}
         </div>
         <button type="button" class="btn block add-row" data-a="cing-add">${I.plus}Add ingredient</button>
         <button type="button" class="btn primary block add-row" data-a="cook-lock" data-id="${esc(id)}" ${calculating ? 'disabled' : ''}>${I.check}Lock in ingredients</button>
         <p class="hint">Locking saves the list and calculates nutrition.</p>`;

    app.innerHTML = `
      <header class="top">
        <a class="icon-btn" href="${esc(ui.cookOrigin || '#/cooked')}" aria-label="${ui.cookOrigin?.startsWith('#/r/') ? 'Back to recipe' : 'Back to Cooked'}">${I.back}</a>
        <span class="spacer"></span>
        ${r?.instructions.length ? `<button class="btn small cook-btn" data-a="cook" data-id="${esc(r._id)}" data-cook="${esc(id)}">${I.flame}Cook mode</button>` : ''}
      </header>
      <article class="detail">
        <p class="eyebrow">Cooked</p>
        <h1>${r ? `<a class="title-link" href="#/r/${encodeURIComponent(r._id)}">${esc(c.recipe_title)}</a>` : esc(c.recipe_title)}</h1>
        <div class="form">
          <div class="grid2">
            <div><label for="c-date">Date</label><input id="c-date" type="date" data-cf="date" value="${esc(c.date)}"></div>
            <div><label for="c-servings">Servings made</label><input id="c-servings" data-cf="servings" value="${esc(c.servings)}"></div>
          </div>
          <span class="field-lbl">Rating</span>
          <div class="seg rating" role="group" aria-label="Rating">
            ${RATINGS.map(([v, l]) => `<button type="button" data-a="rate" data-id="${esc(id)}" data-v="${v}" aria-pressed="${c.rating === v}">${l}</button>`).join('')}
          </div>
          <label for="c-comment">Comments</label>
          <textarea id="c-comment" data-cf="comment" placeholder="What worked, what to change next time…">${esc(c.comment || '')}</textarea>
        </div>

        <div class="section-h"><h2>Nutrition</h2></div>
        ${nutritionHtml}

        <div class="section-h"><h2>Ingredients</h2></div>
        ${ingredientsHtml}

        <div class="stack cook-actions">
          <button class="btn" data-a="cook-again" data-id="${esc(id)}">${I.plus}Cook again</button>
          ${r ? `<button class="btn" data-a="cook-to-recipe" data-id="${esc(id)}">Use these ingredients in the recipe</button>` : ''}
          <button class="btn danger" data-a="cook-delete" data-id="${esc(id)}">Delete this cook</button>
        </div>
      </article>`;
  }

  function cookCardHtml(c) {
    const n = c.nutrition;
    return `<article class="card">
      <a class="card-link" href="#/c/${encodeURIComponent(c._id)}">
        <h2>${esc(c.recipe_title)}</h2>
        <div class="card-line">
          <span class="card-date">${esc(fmtDate(c.date))}</span>
          ${ratingChip(c.rating)}
          ${c.locked ? '' : '<span class="tag">In progress</span>'}
          ${n?.calories != null ? `<span class="card-nut">${esc(cardNutrition(n))}</span>` : ''}
        </div>
        ${c.comment ? `<p class="card-comment">${esc(c.comment)}</p>` : ''}
      </a>
    </article>`;
  }

  function viewCookedList() {
    document.title = 'Cooked';
    const filter = ui.cookFilter || '';
    const all = [...S.cooks].sort(byDateDesc);
    const shown = filter ? all.filter((c) => c.rating === filter) : all;
    app.innerHTML = `
      <header class="top"><h1 class="page-title">Cooked</h1></header>
      ${all.length ? `<div class="chips" role="group" aria-label="Filter by rating">
        ${[['', 'All'], ...RATINGS].map(([v, l]) => `<button class="chip" data-a="cook-filter" data-v="${v}" aria-pressed="${filter === v}">${l}</button>`).join('')}
      </div>` : ''}
      ${shown.length ? `<div class="cards">${shown.map(cookCardHtml).join('')}</div>`
        : all.length ? '<div class="empty"><p>No cooks with that rating.</p></div>'
        : '<div class="empty"><p class="big">Nothing cooked yet.</p><p>Open a recipe and tap <b>Log a cook</b>.</p></div>'}`;
  }

  // Shared by the recipe edit form and the cook screen.
  async function estimateWithAI(payload) {
    const key = getAiKey();
    if (!key) throw new Error('Add your Anthropic API key in Settings to calculate nutrition.');
    let ai;
    try { ai = await import('./ai.js'); } catch { throw new Error("Couldn't load the AI helper. Check your connection."); }
    try { return await ai.estimateNutrition(key, payload, getAiModel()); } catch (err) { throw new Error(ai.errorMessage(err)); }
  }
  const aiIngredients = (ing) => ingredientRows(ing).filter((x) => x.text.trim()).map((x) => ({ group: GROUP_LABEL[x.cat] || '', text: x.text.trim() }));

  async function calcCookNutrition(c) {
    const r = c.recipe_id ? findRecipe(c.recipe_id) : null;
    ui.calculating = c._id;
    refreshCookView(c._id);
    try {
      const n = await estimateWithAI({
        title: c.recipe_title, servings: c.servings, per: r?.nutrition?.per || '',
        ingredients: aiIngredients(c.ingredients), instructions: r?.instructions || [],
      });
      c.nutrition = { per: n.per, calories: n.calories, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g, fiber_g: n.fiber_g, note: n.note || null };
      save();
      toast('Nutrition calculated by Claude');
    } catch (err) {
      toast(err.message);
    } finally {
      ui.calculating = null;
      refreshCookView(c._id);
    }
  }
  function refreshCookView(id) {
    const [view, cur] = location.hash.replace(/^#\/?/, '').split('/');
    if (view === 'c' && decodeURIComponent(cur || '') === id) rerender(() => viewCookLog(id));
  }

  /* =========================================================================
     Add / Edit
     ========================================================================= */
  function draftFrom(r) {
    const ing = [];
    if (Array.isArray(r?.ingredients)) r.ingredients.forEach((t) => ing.push({ text: t, cat: '' }));
    else if (r?.ingredients) groupOrder(r.ingredients).forEach((k) => (r.ingredients[k] || []).forEach((t) => ing.push({ text: t, cat: k })));
    const n = r?.nutrition || {};
    return {
      key: r ? r._id : 'new',
      id: r?._id || null,
      title: r?.title || '', description: r?.description || '',
      source_name: r?.source_name || '', source_url: r?.source_url || '', author: r?.author || '',
      prep_time: r?.prep_time || '', cook_time: r?.cook_time || '', total_time: r?.total_time || '', servings: r?.servings || '',
      tags: (r?.tags || []).join(', '),
      category: String(r?.category || '').toLowerCase(),
      ing: ing.length ? ing : [{ text: '', cat: 'protein' }],
      steps: r?.instructions?.length ? [...r.instructions] : [''],
      nut: {
        per: n.per || 'serving',
        calories: n.calories ?? '', protein_g: n.protein_g ?? '', carbs_g: n.carbs_g ?? '', fat_g: n.fat_g ?? '', fiber_g: n.fiber_g ?? '',
        note: n.note || '',
      },
      paste: '',
    };
  }

  function viewEdit(id) {
    const r = id ? findRecipe(id) : null;
    if (id && !r) { app.innerHTML = `<div class="empty"><p>Recipe not found.</p><p><a href="#/">Back to recipes</a></p></div>`; return; }
    const key = r ? r._id : 'new';
    if (!(ui.draft && ui.draft.key === key && ui.dirty)) { ui.draft = draftFrom(r); ui.dirty = false; }
    document.title = r ? `Edit ${r.title}` : 'New recipe';
    renderEdit();
  }

  function renderEdit() {
    const d = ui.draft;
    const isNew = !d.id;
    const field = (f, label, attrs = '') => `<label for="f-${f}">${label}</label><input id="f-${f}" data-f="${f}" value="${esc(d[f])}" ${attrs}>`;
    const nutField = (f, label) => `<div><label for="n-${f}">${label}</label><input id="n-${f}" data-f="nut.${f}" inputmode="decimal" value="${esc(d.nut[f])}"></div>`;
    const catOptions = (cat) => [['', 'Uncategorized'], ...GROUPS].map(([k, l]) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${l}</option>`).join('');

    app.innerHTML = `
      <header class="top">
        <a class="icon-btn" href="${isNew ? '#/' : `#/r/${encodeURIComponent(d.id)}`}" data-a="cancel-edit" aria-label="Cancel">${I.back}</a>
        <h1 class="page-title" style="font-size:24px">${isNew ? 'New recipe' : 'Edit recipe'}</h1>
      </header>
      <form class="form" id="edit-form" novalidate>
        <details class="paste" ${isNew && !d.title ? '' : ''}>
          <summary>Paste recipe text</summary>
          <p class="hint">Paste a recipe from a website, note, or message. It fills in the title, times, servings, ingredients (with a best-guess category), and steps. Check everything before saving.</p>
          <label for="f-paste" class="sr-only">Recipe text</label>
          <textarea id="f-paste" data-f="paste" placeholder="Title&#10;Serves 4&#10;&#10;Ingredients&#10;1 lb chicken&#10;…&#10;&#10;Instructions&#10;1. …">${esc(d.paste)}</textarea>
          <button type="button" class="btn block add-row" data-a="parse">Fill form from text</button>
        </details>

        ${field('title', 'Title', 'required autocomplete="off"')}
        ${field('servings', 'Servings')}
        <span class="field-lbl">Category</span>
        <div class="chips tag-pick" id="cat-pick" role="radiogroup" aria-label="Category">${catPickHtml(d)}</div>
        <div class="inline-form tag-new">
          <label for="f-newcat" class="sr-only">New category</label>
          <input id="f-newcat" placeholder="New category" autocomplete="off" autocapitalize="none">
          <button type="button" class="btn" data-a="cat-add">Add</button>
        </div>

        <section class="fieldset">
          <h2>Ingredients</h2>
          <p class="hint">Pick a group for each item. Leave them all Uncategorized to save a simple list.</p>
          ${d.ing.map((it, i) => `<div class="row-item">
            <label for="ing-${i}" class="sr-only">Ingredient ${i + 1}</label>
            <input id="ing-${i}" data-ing="${i}" value="${esc(it.text)}" placeholder="e.g. 1 pound ground turkey">
            <div class="ctrl">
              <select data-ing-cat="${i}" aria-label="Group for ingredient ${i + 1}">${catOptions(it.cat)}</select>
              <button type="button" class="icon-btn" data-a="ing-del" data-i="${i}" aria-label="Remove ingredient ${i + 1}">${I.x}</button>
            </div></div>`).join('')}
          <button type="button" class="btn block add-row" data-a="ing-add">${I.plus}Add ingredient</button>
        </section>

        <section class="fieldset">
          <h2>Instructions</h2>
          ${d.steps.map((s, i) => `<div class="row-item">
            <div class="ctrl" style="margin:0 0 6px">
              <span class="step-n">Step ${i + 1}</span>
              <button type="button" class="icon-btn" data-a="step-move" data-i="${i}" data-d="-1" aria-label="Move step ${i + 1} up" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
              <button type="button" class="icon-btn" data-a="step-move" data-i="${i}" data-d="1" aria-label="Move step ${i + 1} down" ${i === d.steps.length - 1 ? 'disabled' : ''}>${I.down}</button>
              <button type="button" class="icon-btn" data-a="step-del" data-i="${i}" aria-label="Remove step ${i + 1}">${I.x}</button>
            </div>
            <label for="step-${i}" class="sr-only">Step ${i + 1}</label>
            <textarea id="step-${i}" data-step="${i}">${esc(s)}</textarea></div>`).join('')}
          <button type="button" class="btn block add-row" data-a="step-add">${I.plus}Add step</button>
        </section>

        <section class="fieldset">
          <h2>Nutrition</h2>
          <button type="button" class="btn block add-row" data-a="ai-nutrition">${I.sparkle}Calculate with AI</button>
          <p class="hint">Claude estimates from the ingredients and servings above. Check the numbers before saving.</p>
          <label for="n-per">Per</label>
          <input id="n-per" data-f="nut.per" value="${esc(d.nut.per)}" placeholder="serving, bite, pint (entire recipe)…">
          <p class="hint">Include “entire recipe” if the numbers are for the whole batch, so scaling updates them.</p>
          <div class="grid3">${nutField('calories', 'Calories')}${nutField('protein_g', 'Protein g')}${nutField('carbs_g', 'Carbs g')}</div>
          <div class="grid3">${nutField('fat_g', 'Fat g')}${nutField('fiber_g', 'Fiber g')}<div></div></div>
          <label for="n-note">Note</label>
          <input id="n-note" data-f="nut.note" value="${esc(d.nut.note)}" placeholder="e.g. Excludes optional toppings.">
        </section>

        <section class="fieldset">
          <h2>Source</h2>
          ${field('source_url', 'Source URL', 'type="url" inputmode="url" autocapitalize="none" placeholder="https://…"')}
        </section>

        ${isNew ? '' : `<button type="button" class="btn danger block" style="margin-top:20px" data-a="delete-recipe">Delete recipe</button>`}

        <div class="savebar">
          <button type="button" class="btn" data-a="cancel-edit">Cancel</button>
          <button type="submit" class="btn primary">Save recipe</button>
        </div>
      </form>`;
  }

  // Category: tap one to choose it (tap again to clear), or type a new one.
  function catPickHtml(d) {
    const all = allCategories();
    if (d.category && !all.includes(d.category)) all.push(d.category);
    return all.length
      ? all.map((c) => `<button type="button" class="chip" role="radio" data-a="cat-pick" data-c="${esc(c)}" aria-checked="${d.category === c}" aria-pressed="${d.category === c}">${esc(cap(c))}</button>`).join('')
      : '<p class="hint">No categories yet. Add one below.</p>';
  }
  function setDraftCategory(c) {
    ui.draft.category = c;
    ui.dirty = true;
    $('#cat-pick').innerHTML = catPickHtml(ui.draft);
  }
  function addTypedCategory() {
    const input = $('#f-newcat');
    const c = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!c) return;
    setDraftCategory(c);
    input.value = '';
  }

  function setDraftField(path, value) {
    const [a, b] = path.split('.');
    if (b) ui.draft[a][b] = value; else ui.draft[a] = value;
    ui.dirty = true;
  }

  function saveDraft() {
    const d = ui.draft;
    if (!d.title.trim()) { toast('Add a title first'); $('#f-title')?.focus(); return; }
    const rows = d.ing.filter((x) => x.text.trim());
    let ingredients;
    if (rows.every((x) => !x.cat)) ingredients = rows.map((x) => x.text.trim());
    else {
      ingredients = { protein: [], produce: [], shelf: [], seasonings: [], pantry: [] };
      rows.forEach((x) => (ingredients[x.cat || 'shelf'] ||= []).push(x.text.trim()));
    }
    const num = (v) => (String(v).trim() === '' || !isFinite(+v) ? null : +v);
    const data = {
      title: d.title.trim(),
      source_name: blankToNull(d.source_name),
      source_url: blankToNull(d.source_url),
      author: blankToNull(d.author),
      description: blankToNull(d.description),
      prep_time: blankToNull(d.prep_time),
      cook_time: blankToNull(d.cook_time),
      total_time: blankToNull(d.total_time),
      servings: blankToNull(d.servings),
      ingredients,
      instructions: d.steps.map((s) => s.trim()).filter(Boolean),
      nutrition: {
        per: blankToNull(d.nut.per) || 'serving',
        calories: num(d.nut.calories), protein_g: num(d.nut.protein_g), carbs_g: num(d.nut.carbs_g),
        fat_g: num(d.nut.fat_g), fiber_g: num(d.nut.fiber_g),
        note: blankToNull(d.nut.note),
      },
      category: blankToNull(d.category),
      tags: d.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    };
    let r;
    if (d.id) {
      r = findRecipe(d.id);
      Object.assign(r, data); // keeps the original key order and any extra fields
    } else {
      r = normalizeRecipe(data);
      S.recipes.push(r);
    }
    recategorize([r]);
    save();
    ui.draft = null; ui.dirty = false;
    toast('Recipe saved');
    location.hash = `#/r/${encodeURIComponent(r._id)}`;
  }

  /* =========================================================================
     AI nutrition (see ai.js). The Anthropic API key is the user's own and is kept
     in this device's storage only: never in recipes.json, Firebase, or the repo.
     ========================================================================= */
  const AI_KEY = 'recipeapp.anthropicKey';
  const getAiKey = () => { try { return localStorage.getItem(AI_KEY) || ''; } catch { return ''; } };
  // Model choice is per device too. Kept here (not in ai.js) so Settings works offline.
  const AI_MODEL_KEY = 'recipeapp.aiModel';
  const AI_MODELS = [
    ['claude-haiku-5-5', 'Haiku 5.5 · about 0.1¢ each'],
    ['claude-sonnet-5-5', 'Sonnet 5.5 · about 1–2¢ each'],
    ['claude-opus-5-5', 'Opus 5.5 · about 5–7¢ each'],
  ];
  const getAiModel = () => {
    let m = '';
    try { m = localStorage.getItem(AI_MODEL_KEY) || ''; } catch { /* storage blocked */ }
    return AI_MODELS.some(([id]) => id === m) ? m : AI_MODELS[0][0];
  };
  const setAiKey = (k) => { try { k ? localStorage.setItem(AI_KEY, k) : localStorage.removeItem(AI_KEY); return true; } catch { return false; } };

  function aiPanelHtml() {
    const key = getAiKey();
    const body = key
      ? `<p class="sync-line ok">API key saved on this device (ends in …${esc(key.slice(-4))})</p>
         <button class="btn block add-row" data-a="ai-key-remove">Remove key</button>`
      : `<form class="form" id="ai-key-form" novalidate>
           <label for="ai-key">Anthropic API key</label>
           <input id="ai-key" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="sk-ant-…">
           <button class="btn primary block add-row" type="submit">Save key</button>
         </form>`;
    return `<section class="panel" id="ai-panel"><h2>AI nutrition</h2>
      <p>Lets <b>Calculate with AI</b> on the edit screen fill in nutrition facts. The key is saved on this device only and sent only to Anthropic.</p>
      ${body}
      <div class="form">
        <label for="ai-model">Model</label>
        <select id="ai-model">${AI_MODELS.map(([id, label]) => `<option value="${id}" ${id === getAiModel() ? 'selected' : ''}>${label}</option>`).join('')}</select>
      </div>
      <p class="hint">Haiku is plenty for nutrition estimates. Try Sonnet if a result looks off. Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a> and set a monthly spend limit there.</p>
    </section>`;
  }

  function renderAiPanel() {
    const panel = $('#ai-panel');
    if (panel) panel.outerHTML = aiPanelHtml();
  }

  /* =========================================================================
     Backup / import / settings
     ========================================================================= */
  function viewMore() {
    document.title = 'Settings';
    app.innerHTML = `
      <header class="top"><h1 class="page-title">Settings</h1></header>
      ${syncPanelHtml()}
      ${aiPanelHtml()}
      <section class="panel">
        <h2>Export</h2>
        <p>Export a copy now and then to keep in Dropbox, or to move recipes without signing in.</p>
        <div class="stack">
          <button class="btn primary" data-a="export-backup">Export full backup (.json)</button>
          <button class="btn" data-a="export-recipes">Export recipes.json only</button>
        </div>
        <p class="hint">Full backup includes recipes, cooks, pantry essentials, and favorites. <b>recipes.json only</b> matches the file in your repo, so you can replace it there.</p>
      </section>
      <section class="panel">
        <h2>Import</h2>
        <p>Accepts a full backup or a plain recipes.json list.</p>
        <div class="stack">
          <button class="btn" data-a="import" data-mode="merge">Import and merge</button>
          <button class="btn" data-a="import" data-mode="replace">Import and replace everything</button>
        </div>
        <p class="hint">Merge adds new recipes and updates ones with the same title. Replace overwrites what's on this device.</p>
        <input type="file" id="import-file" accept="application/json,.json" hidden>
      </section>
      <section class="panel">
        <h2>Appearance</h2>
        <div class="seg" role="group" aria-label="Theme" style="margin-top:8px">
          ${['auto', 'light', 'dark'].map((t) => `<button data-a="theme" data-t="${t}" aria-pressed="${(S.theme || 'auto') === t}">${cap(t)}</button>`).join('')}
        </div>
      </section>
      <p class="hint" style="text-align:center">${S.recipes.length} recipes · ${S.favorites.length} favorites</p>`;
  }

  function download(filename, data) {
    const text = JSON.stringify(data, null, 2) + '\n';
    const file = new File([text], filename, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      navigator.share({ files: [file], title: filename }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function importData(data, mode) {
    let recipes, pantry = null, favTitles = [], cooks = [];
    if (Array.isArray(data)) recipes = data;
    else if (data && Array.isArray(data.recipes)) {
      recipes = data.recipes;
      if (Array.isArray(data.pantry_essentials)) pantry = data.pantry_essentials;
      if (Array.isArray(data.favorites)) favTitles = data.favorites;
      if (Array.isArray(data.cooks)) cooks = data.cooks;
    } else throw new Error('Expected a list of recipes or a backup file.');
    recipes = recipes.filter((r) => r && typeof r === 'object' && r.title);
    if (!recipes.length) throw new Error('No recipes with a title were found.');

    if (mode === 'replace') {
      const keep = { theme: S.theme };
      S = Object.assign(blankState(), keep);
      S.pantry_essentials = pantry || ['olive oil'];
    } else if (pantry) {
      for (const p of pantry) if (!S.pantry_essentials.includes(p)) S.pantry_essentials.push(p);
    }
    let added = 0, updated = 0;
    for (const raw of recipes) {
      const existing = S.recipes.find((r) => r.title.trim().toLowerCase() === String(raw.title).trim().toLowerCase());
      if (existing) {
        const fresh = normalizeRecipe(raw, existing._id);
        Object.keys(existing).forEach((k) => delete existing[k]);
        Object.assign(existing, fresh);
        updated++;
      } else { S.recipes.push(normalizeRecipe(raw)); added++; }
    }
    for (const t of favTitles) {
      const r = S.recipes.find((x) => x.title === t);
      if (r && !S.favorites.includes(r._id)) S.favorites.push(r._id);
    }
    for (const { id, ...c } of cooks) {
      if (!c || typeof c !== 'object' || S.cooks.some((x) => x._id === id)) continue;
      const r = S.recipes.find((x) => normTitle(x.title) === normTitle(c.recipe_title));
      S.cooks.push({ ...c, _id: id || uid(), recipe_id: r ? r._id : c.recipe_id || null });
    }
    S.pantry_essentials = S.pantry_essentials.map((p) => String(p).trim().toLowerCase()).filter(Boolean);
    recategorize(S.recipes);
    save();
    return { added, updated };
  }

  function applyTheme() {
    const t = S?.theme || 'auto';
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }

  /* =========================================================================
     Actions (event delegation)
     ========================================================================= */
  const actions = {
    chip(el) {
      const c = el.dataset.chip;
      ui.chips.has(c) ? ui.chips.delete(c) : ui.chips.add(c);
      el.setAttribute('aria-pressed', ui.chips.has(c));
      renderList();
    },
    'clear-filters'() { ui.q = ''; ui.chips.clear(); viewHome(); },
    fav(el) {
      const id = el.dataset.id;
      const i = S.favorites.indexOf(id);
      i >= 0 ? S.favorites.splice(i, 1) : S.favorites.push(id);
      save();
      const on = i < 0;
      el.classList.toggle('on', on);
      el.setAttribute('aria-pressed', on);
      el.setAttribute('aria-label', `${on ? 'Remove from' : 'Add to'} favorites`);
      if (ui.chips.has('★')) renderList();
    },
    scale(el) {
      ui.scale[el.dataset.id] = +el.dataset.s;
      rerender(() => viewRecipe(el.dataset.id));
    },
    'ing-add'() {
      const last = ui.draft.ing[ui.draft.ing.length - 1];
      ui.draft.ing.push({ text: '', cat: last ? last.cat : 'protein' });
      ui.dirty = true;
      rerender(renderEdit);
      $(`#ing-${ui.draft.ing.length - 1}`)?.focus();
    },
    'ing-del'(el) { ui.draft.ing.splice(+el.dataset.i, 1); ui.dirty = true; rerender(renderEdit); },
    'step-add'() {
      ui.draft.steps.push(''); ui.dirty = true; rerender(renderEdit);
      $(`#step-${ui.draft.steps.length - 1}`)?.focus();
    },
    'step-del'(el) { ui.draft.steps.splice(+el.dataset.i, 1); ui.dirty = true; rerender(renderEdit); },
    'step-move'(el) {
      const i = +el.dataset.i, j = i + +el.dataset.d, s = ui.draft.steps;
      if (j < 0 || j >= s.length) return;
      [s[i], s[j]] = [s[j], s[i]];
      ui.dirty = true;
      rerender(renderEdit);
      $(`[data-a="step-move"][data-i="${j}"][data-d="${el.dataset.d}"]`)?.focus();
    },
    parse() {
      const d = ui.draft;
      if (!d.paste.trim()) { toast('Paste some recipe text first'); return; }
      const p = parseRecipeText(d.paste);
      if (p.title && !d.title) d.title = p.title;
      if (p.servings) d.servings = p.servings;
      if (p.ing.length) d.ing = p.ing;
      if (p.steps.length) d.steps = p.steps;
      ui.dirty = true;
      renderEdit();
      toast(`Found ${p.ing.length} ingredients and ${p.steps.length} steps. Check the groups before saving.`);
    },
    'cancel-edit'(el, e) {
      e.preventDefault();
      if (ui.dirty && !confirm('Discard your changes?')) return;
      const id = ui.draft?.id;
      ui.draft = null; ui.dirty = false;
      location.hash = id ? `#/r/${encodeURIComponent(id)}` : '#/';
    },
    'delete-recipe'() {
      const r = findRecipe(ui.draft.id);
      if (!r || !confirm(`Delete “${r.title}”? Export a backup first if you might want it back.`)) return;
      S.recipes = S.recipes.filter((x) => x._id !== r._id);
      S.favorites = S.favorites.filter((x) => x !== r._id);
      save();
      ui.draft = null; ui.dirty = false;
      toast('Recipe deleted');
      location.hash = '#/';
    },
    'export-backup'() {
      download(`recipes-backup-${new Date().toISOString().slice(0, 10)}.json`, {
        app: 'recipe-app', version: 1, exported: new Date().toISOString(),
        recipes: S.recipes.map(cleanRecipe),
        pantry_essentials: S.pantry_essentials,
        favorites: S.recipes.filter((r) => S.favorites.includes(r._id)).map((r) => r.title),
        cooks: S.cooks.map(({ _id, ...c }) => ({ id: _id, ...c })),
      });
    },
    'export-recipes'() { download('recipes.json', S.recipes.map(cleanRecipe)); },
    import(el) {
      const input = $('#import-file');
      input.dataset.mode = el.dataset.mode;
      input.value = '';
      input.click();
    },
    async 'ai-nutrition'(el) {
      if (!getAiKey()) { toast('Add your Anthropic API key in Settings first'); return; }
      const d = ui.draft;
      const ingredients = d.ing.filter((x) => x.text.trim()).map((x) => ({ group: GROUP_LABEL[x.cat] || '', text: x.text.trim() }));
      if (!ingredients.length) { toast('Add ingredients first'); return; }
      const label = el.innerHTML;
      el.disabled = true;
      el.textContent = 'Calculating… (can take up to a minute)';
      try {
        const n = await estimateWithAI({
          title: d.title, servings: d.servings, per: d.nut.per, ingredients,
          instructions: d.steps.map((s) => s.trim()).filter(Boolean),
        });
        if (ui.draft !== d) return; // left the form while waiting
        Object.assign(d.nut, {
          per: n.per, calories: String(n.calories), protein_g: String(n.protein_g), carbs_g: String(n.carbs_g),
          fat_g: String(n.fat_g), fiber_g: String(n.fiber_g), note: n.note,
        });
        ui.dirty = true;
        rerender(renderEdit);
        toast('Filled in by Claude. Check the numbers, then save.');
      } catch (err) {
        toast(err.message);
        el.disabled = false;
        el.innerHTML = label;
      }
    },
    'cook-start'(el) {
      const r = findRecipe(el.dataset.id);
      const f = ui.scale[r._id] || 1;
      startCook({ recipe_id: r._id, recipe_title: r.title, servings: scaleText(r.servings || '', f), ingredients: scaleIngredients(r.ingredients, f) });
    },
    'cook-again'(el) {
      const c = findCooked(el.dataset.id);
      const r = c.recipe_id ? findRecipe(c.recipe_id) : null;
      startCook({ recipe_id: c.recipe_id, recipe_title: r ? r.title : c.recipe_title, servings: c.servings, ingredients: c.ingredients });
    },
    rate(el) {
      const c = findCooked(el.dataset.id);
      c.rating = c.rating === el.dataset.v ? null : el.dataset.v;
      save();
      el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === c.rating));
    },
    'cat-pick'(el) { setDraftCategory(ui.draft.category === el.dataset.c ? '' : el.dataset.c); },
    'cat-add'() { addTypedCategory(); },
    'cing-add'() {
      const rows = ui.cookRows.rows;
      rows.push({ text: '', cat: rows.length ? rows[rows.length - 1].cat : 'protein' });
      const id = ui.cookRows.id;
      rerender(() => viewCookLog(id));
      $(`#ci-${rows.length - 1}`)?.focus();
    },
    'cing-del'(el) {
      const id = ui.cookRows.id;
      ui.cookRows.rows.splice(+el.dataset.i, 1);
      findCooked(id).ingredients = rowsToIngredients(ui.cookRows.rows);
      save();
      rerender(() => viewCookLog(id));
    },
    'cook-unlock'(el) {
      const c = findCooked(el.dataset.id);
      ui.unlocked = { id: c._id, key: ingredientKey(c.ingredients, c.servings) };
      c.locked = false;
      save();
      rerender(() => viewCookLog(c._id));
    },
    async 'cook-lock'(el) {
      const c = findCooked(el.dataset.id);
      if (ui.cookRows?.id === c._id) c.ingredients = rowsToIngredients(ui.cookRows.rows);
      if (!ingredientRows(c.ingredients).length) { toast('Add at least one ingredient'); return; }
      const key = ingredientKey(c.ingredients, c.servings);
      const r = c.recipe_id ? findRecipe(c.recipe_id) : null;
      c.locked = true;
      ui.cookRows = null;
      // No AI call when nothing changed: reuse what's already known.
      if (c.nutrition?.calories != null && ui.unlocked?.id === c._id && ui.unlocked.key === key) {
        ui.unlocked = null; save(); rerender(() => viewCookLog(c._id)); toast('Ingredients locked'); return;
      }
      ui.unlocked = null;
      if (r?.nutrition?.calories != null && ingredientKey(r.ingredients, r.servings) === key) {
        c.nutrition = clone(r.nutrition);
        save(); rerender(() => viewCookLog(c._id));
        toast('Locked. Same as the recipe, so its nutrition was copied.');
        return;
      }
      c.nutrition = null;
      save();
      rerender(() => viewCookLog(c._id));
      if (!getAiKey()) { toast('Locked. Add an Anthropic API key in Settings to calculate nutrition.'); return; }
      await calcCookNutrition(c);
    },
    'cook-nutrition'(el) { calcCookNutrition(findCooked(el.dataset.id)); },
    'cook-to-recipe'(el) {
      const c = findCooked(el.dataset.id);
      const r = findRecipe(c.recipe_id);
      if (!r || !confirm(`Replace the ingredients and servings in “${r.title}” with this cook's? Past cooks keep their own copies.`)) return;
      r.ingredients = clone(c.ingredients);
      r.servings = c.servings || r.servings;
      if (c.nutrition?.calories != null) r.nutrition = clone(c.nutrition);
      recategorize([r]);
      save();
      toast('Recipe updated');
      location.hash = `#/r/${encodeURIComponent(r._id)}`;
    },
    'cook-delete'(el) {
      const c = findCooked(el.dataset.id);
      if (!confirm(`Delete this cook of “${c.recipe_title}” from ${fmtDate(c.date)}?`)) return;
      S.cooks = S.cooks.filter((x) => x._id !== c._id);
      save();
      toast('Cook deleted');
      location.hash = ui.cookOrigin || '#/cooked';
    },
    'cook-filter'(el) { ui.cookFilter = el.dataset.v; viewCookedList(); },
    cook(el) { openCook(el.dataset.id, el.dataset.cook); },
    'cook-close'() { closeCook(); },
    'cook-next'() { cookGo(1); },
    'cook-prev'() { cookGo(-1); },
    'cook-tap'() { if (!wakeLock) requestWake(); },
    'ai-key-remove'() {
      setAiKey('');
      toast('API key removed from this device');
      renderAiPanel();
    },
    async 'sign-out'() {
      try { await sync?.signOut(); toast('Signed out. Recipes stay on this device.'); } catch { toast("Couldn't sign out. Try again."); }
    },
    theme(el) {
      S.theme = el.dataset.t; save(); applyTheme();
      el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el));
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.a];
    if (fn) fn(el, e);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'q') { ui.q = t.value; renderList(); return; }
    if (t.dataset.cf) {
      const c = findCooked(location.hash.split('/')[2] ? decodeURIComponent(location.hash.split('/')[2]) : '');
      if (c) { c[t.dataset.cf] = t.value; saveSoon(); }
      return;
    }
    if (t.dataset.cing != null && ui.cookRows) {
      ui.cookRows.rows[+t.dataset.cing].text = t.value;
      findCooked(ui.cookRows.id).ingredients = rowsToIngredients(ui.cookRows.rows);
      saveSoon();
      return;
    }
    if (!ui.draft) return;
    if (t.dataset.f) setDraftField(t.dataset.f, t.value);
    else if (t.dataset.ing != null) { ui.draft.ing[+t.dataset.ing].text = t.value; ui.dirty = true; }
    else if (t.dataset.step != null) { ui.draft.steps[+t.dataset.step] = t.value; ui.dirty = true; }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'ai-model') {
      try { localStorage.setItem(AI_MODEL_KEY, t.value); } catch { /* storage blocked */ }
      toast(`AI nutrition will use ${t.options[t.selectedIndex].text.split(' · ')[0]}`);
      return;
    }
    if (t.dataset.cingCat != null && ui.cookRows) {
      ui.cookRows.rows[+t.dataset.cingCat].cat = t.value;
      findCooked(ui.cookRows.id).ingredients = rowsToIngredients(ui.cookRows.rows);
      save();
      return;
    }
    if (t.dataset.ingCat != null && ui.draft) { ui.draft.ing[+t.dataset.ingCat].cat = t.value; ui.dirty = true; return; }
    if (t.id === 'import-file' && t.files[0]) {
      const mode = t.dataset.mode;
      t.files[0].text().then((txt) => {
        let data;
        try { data = JSON.parse(txt); } catch { throw new Error('That file isn’t valid JSON.'); }
        if (mode === 'replace' && !confirm('Replace all recipes on this device with this file?')) return;
        const { added, updated } = importData(data, mode);
        toast(`Imported: ${added} added, ${updated} updated`);
        viewMore();
      }).catch((err) => toast(err.message));
    }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'edit-form') saveDraft();
    if (e.target.id === 'ai-key-form') {
      const input = $('#ai-key');
      const key = input.value.trim();
      if (!key) { toast('Paste your API key first'); return; }
      if (!key.startsWith('sk-ant-')) { toast('That doesn’t look like an Anthropic API key (they start with sk-ant-)'); return; }
      if (!setAiKey(key)) { toast("Couldn't save the key. Storage is blocked in this browser."); return; }
      input.value = '';
      toast('API key saved on this device');
      renderAiPanel();
    }
    if (e.target.id === 'sync-form') {
      const email = $('#sync-email').value.trim();
      const pw = $('#sync-password').value;
      if (!email || !pw) { toast('Enter your email and password'); return; }
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      sync.signIn(email, pw)
        .then(() => { document.activeElement?.blur(); toast('Signed in. Syncing your recipes…'); renderSyncUI(); })
        .catch((err) => { toast(authMessage(err)); btn.disabled = false; btn.textContent = 'Sign in'; });
    }
  });

  // Cook mode: keyboard + swipe
  // Enter in the new-category box sets the category instead of saving the whole recipe.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'f-newcat') { e.preventDefault(); addTypedCategory(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!ui.cook) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); cookGo(1); }
    else if (e.key === 'ArrowLeft') cookGo(-1);
    else if (e.key === 'Escape') closeCook();
  });
  let touchX = null;
  $('#cook').addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  $('#cook').addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) cookGo(dx < 0 ? 1 : -1);
  });
  // Wake locks are dropped when the page is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => {
    if (ui.cook && document.visibilityState === 'visible' && !wakeLock) requestWake();
  });

  /* =========================================================================
     Boot
     ========================================================================= */
  async function init() {
    S = store.get(LS_KEY);
    if (S && Array.isArray(S.recipes)) {
      S = Object.assign(blankState(), S);
      if (migrateCategories(S.recipes)) store.set(LS_KEY, S);
    } else {
      try { await seed(); }
      catch (err) { S = blankState(); S.pantry_essentials = ['olive oil']; seedError = err.message; }
    }
    applyTheme();
    window.addEventListener('hashchange', route);
    route();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    startSync();
  }

  // Exposed for quick checks in the console; not used by the app.
  window.__recipeApp = { scaleText, parseIngredient, parseRecipeText, guessCategory, ingredientTerms };
  init();
})();
