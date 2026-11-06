# Recipes

A recipe box web app you can install on your phone's home screen. It's plain HTML, CSS, and JavaScript with no build step, and it works offline.

- **Recipes:** search by title or ingredient, filter by tag or favorites
- **Recipe page:** ingredients grouped Protein → Produce → Shelf → Seasonings → Pantry Essentials, with tap-to-check boxes. Scale to ½×, 1×, 2×, or 3×.
- **Cook mode:** big text, one step at a time, screen kept on
- **Shopping list:** built from the recipes you pick, with matching ingredients merged
- **Pantry Essentials:** things you always have on hand. Adding one moves matching ingredients into that group.
- **Backup:** export and import JSON to back up or move between devices

## Files

| File | What it is |
|---|---|
| `recipes.json` | Your recipes, the source of truth. The app loads it the first time it opens. |
| `pantry_essentials.json` | Starting pantry list (`["olive oil"]`) |
| `index.html`, `styles.css`, `app.js` | The app |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |

## How data works

The first time the app opens on a device, it copies `recipes.json` and `pantry_essentials.json` into the browser's storage (localStorage). After that, every add, edit, favorite, and checkbox is saved **on that device only**.

- **Back up or move to a new phone:** Backup tab → **Export full backup**. On the other device, **Import and merge** (or **replace**).
- **Update the repo copy:** Backup tab → **Export recipes.json only**. Replace `recipes.json` in the repo with that file and push.
- **Pull new recipes from the repo:** Backup tab → **Add new recipes from recipes.json**. This adds recipes whose titles aren't on the device yet and doesn't touch the rest.

> Clearing Safari's website data deletes the on-device copy, so export a backup now and then.

## Adding a recipe

**In the app (easiest):** tap **+** on the Recipes screen. Fill in the form, or open **Paste recipe text**, paste a recipe, and tap **Fill form from text**. Pick a group for each ingredient, then tap **Save recipe**.

**In `recipes.json`:** add an object to the list with the same fields as the others:

```json
{
  "title": "My New Recipe",
  "source_name": null,
  "source_url": null,
  "author": null,
  "description": "One sentence about it.",
  "prep_time": "10 minutes",
  "cook_time": "20 minutes",
  "total_time": "30 minutes",
  "servings": "4",
  "ingredients": {
    "protein": ["1 pound chicken thighs"],
    "produce": ["1 onion, diced"],
    "shelf": ["1 cup rice"],
    "seasonings": ["1 teaspoon cumin"],
    "pantry": ["1 tablespoon olive oil"]
  },
  "instructions": ["First step.", "Second step."],
  "nutrition": {
    "per": "serving",
    "calories": 400, "protein_g": 30, "carbs_g": 40, "fat_g": 12, "fiber_g": 3,
    "note": null
  },
  "tags": ["dinner", "under 30 min", "high protein"]
}
```

Notes:
- `ingredients` can also be a plain list of strings: `["1 cup milk", "Pinch of salt"]`.
- Put a number first (`1½ cups`, `15–20 g`, `2 to 3`) so scaling and the shopping list can do the math.
- If the nutrition numbers are for the whole batch, include "entire recipe" in `per`, for example `"pint (entire recipe)"`. Scaling then multiplies the totals. Per-serving numbers stay the same when scaling.
- `tags` power the filter chips. The current ones are `under 30 min`, `high protein`, `breakfast`, `dinner`, `snack`, `dessert`, `meal prep`, and `ninja creami`. Any new tag becomes a chip automatically.

After you push the change, open the app and go to Backup → **Add new recipes from recipes.json**.

## Try it on your computer

The app has to be served over http. Opening `index.html` directly won't work because browsers block reading `recipes.json` from `file://`.

```bash
cd recipe-app
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Host it for free

### Option A: GitHub Pages

1. Create a new repository on GitHub, for example `recipes`. It can be public or private; Pages on private repos needs a paid plan.
2. Upload this folder's contents to the repo root. Either drag the files into the web UI (**Add file → Upload files**), or from Terminal:
   ```bash
   cd recipe-app
   git init && git add . && git commit -m "Recipe app"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/recipes.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Pick `main` and `/ (root)`, then **Save**.
4. After a minute, the app is live at `https://YOUR-USERNAME.github.io/recipes/`.

**This copy is live at https://samantha-flaim.github.io/recipes/** (repo: https://github.com/samantha-flaim/recipes).

### Option B: Netlify

1. Go to https://app.netlify.com/drop.
2. Drag the `recipe-app` folder onto the page. You'll get a URL like `https://something.netlify.app`.
3. To update later, drag the folder again, or connect the GitHub repo so it redeploys on every push.

## Add it to your iPhone home screen

1. Open the app's URL in **Safari**. It must be Safari; other iOS browsers can't install web apps on older iOS versions.
2. Tap the **Share** button (square with an up arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Open it from the new **Recipes** icon. It runs full screen and works offline after the first load.

> The home-screen app has its own storage, separate from Safari. If you added recipes in Safari first, export a backup there and import it in the home-screen app.

**Android (Chrome):** open the URL, tap the **⋮** menu, then **Install app** or **Add to Home screen**.

## Updating the app

Push your changes. The app checks the network first, so installed copies get the new version the next time they open with a connection. If you add or rename files, add them to the `ASSETS` list in `sw.js` and bump `CACHE` (for example `recipes-v1` → `recipes-v2`).
