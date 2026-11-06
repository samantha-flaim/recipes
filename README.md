# Recipes

A recipe box web app you can install on your phone's home screen. It's plain HTML, CSS, and JavaScript with no build step, and it works offline.

- **Recipes:** search by title or ingredient, filter by tag or favorites
- **Recipe page:** ingredients grouped Protein → Produce → Shelf → Seasonings → Pantry Essentials. Scale to ½×, 1×, 2×, or 3×. Ingredient names in the steps are highlighted.
- **Cook mode:** big text, one step at a time, screen kept on
- **Pantry Essentials:** things you always have on hand. Adding one moves matching ingredients into that group.
- **Sync:** sign in once per device and recipes, favorites, and pantry essentials stay the same everywhere
- **Settings:** sync sign-in, appearance, and JSON export/import to back up or move between devices

## Files

| File | What it is |
|---|---|
| `recipes.json` | Your recipes, the source of truth. The app loads it the first time it opens. |
| `pantry_essentials.json` | Starting pantry list (`["olive oil"]`) |
| `index.html`, `styles.css`, `app.js` | The app |
| `sync.js`, `firebase-config.js` | Sync through Firebase (same project and login as the Card Deals tracker) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline support and home-screen install |

## How data works

The first time the app opens on a device, it copies `recipes.json` and `pantry_essentials.json` into the browser's storage (localStorage). Every add, edit, favorite, and checkbox is saved there, so the app works offline.

**Sync:** on the Settings tab, sign in with your Card Deals email and password. The app then keeps recipes, favorites, and pantry essentials in Firebase under your account (`users/<your id>/recipes` and `users/<your id>/recipeMeta`) and mirrors them on every signed-in device. Changes made offline sync when the device reconnects. The light/dark setting stays per device.

The first time you sign in on a device, anything only on that device (by title) is added to your account, so nothing is lost. After that, your account wins: a recipe deleted on one device disappears from the others.

`firebase-config.js` is safe to publish. It only says which Firebase project to use; your login and the database rules are what keep the data private. The rules must let a signed-in user read and write their own `users/<id>/...` documents, for example:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

If the Settings tab says Firebase refused to save recipes, paste that into Firebase console → Firestore Database → Rules and click **Publish**.

- **Back up or move without signing in:** Settings tab → **Export full backup**. On the other device, **Import and merge** (or **replace**).
- **Update the repo copy:** Settings tab → **Export recipes.json only**. Replace `recipes.json` in the repo with that file and push.

> If you're not signed in, clearing Safari's website data deletes the on-device copy, so export a backup now and then.

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
- Put a number first (`1½ cups`, `15–20 g`, `2 to 3`) so scaling can do the math.
- If the nutrition numbers are for the whole batch, include "entire recipe" in `per`, for example `"pint (entire recipe)"`. Scaling then multiplies the totals. Per-serving numbers stay the same when scaling.
- `tags` power the filter chips. The current ones are `under 30 min`, `high protein`, `breakfast`, `dinner`, `snack`, `dessert`, `meal prep`, and `ninja creami`. Any new tag becomes a chip automatically.

The app only reads `recipes.json` the very first time it opens on a device. To get a recipe you added to the file into the app, import the file: Settings tab → **Import and merge** (it adds new titles and updates matching ones).

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
