// Firebase sync: mirrors the app's state to Firestore under users/<uid>/ so every
// signed-in device sees the same recipes. Loaded by app.js with a dynamic import;
// if this file or the Firebase SDK can't load (e.g. offline on first visit), the app
// keeps working from the copy saved on the device.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const META = ['pantry', 'favorites', 'shopping'];

// JSON with sorted keys, so the same data always compares equal.
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/**
 * hooks:
 *   getState()            → the app's current state object
 *   onRemote(remote, first) → apply data from Firestore ({recipes, pantry, favorites, shopping});
 *                           `first` is true for the first full load after sign-in
 *   onStatus(status)      → {signedIn, email, uid, state: 'signed-out'|'loading'|'synced'|'offline'|'error', error?}
 */
export function start(hooks) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });

  let uid = null;
  let email = '';
  let unsubs = [];
  let ready = false;           // first full load done; safe to push
  const known = new Map();     // path → stable JSON of what Firestore has (or will have)
  let remote = {};
  let got = {};
  let status = { signedIn: false, email: '', state: 'signed-out' };

  const setStatus = (patch) => { status = { ...status, ...patch }; hooks.onStatus(status); };
  const ref = (path) => doc(db, 'users', uid, ...path.split('/'));

  function fail(err) {
    const code = err?.code || '';
    setStatus({ state: 'error', error: code.includes('permission-denied') ? 'permission' : (err?.message || 'unknown') });
  }

  function stop() {
    unsubs.forEach((u) => u());
    unsubs = [];
    ready = false;
    known.clear();
    remote = {};
    got = {};
  }

  function arrived(key, fromCache) {
    got[key] = true;
    const all = ['recipes', ...META].every((k) => got[k]);
    if (!all) return;
    if (!ready) {
      ready = true;
      hooks.onRemote({ ...remote }, true);
      push(); // upload anything the device had that Firestore didn't
    } else {
      hooks.onRemote({ ...remote }, false);
    }
    setStatus({ state: fromCache ? 'offline' : 'synced', error: undefined });
  }

  function subscribe() {
    unsubs.push(onSnapshot(collection(db, 'users', uid, 'recipes'), { includeMetadataChanges: true }, (snap) => {
      for (const path of [...known.keys()]) if (path.startsWith('recipes/')) known.delete(path);
      remote.recipes = snap.docs.map((d) => {
        const data = d.data();
        known.set(`recipes/${d.id}`, stable(data));
        return { _id: d.id, ...data };
      });
      arrived('recipes', snap.metadata.fromCache);
    }, fail));
    for (const name of META) {
      unsubs.push(onSnapshot(ref(`recipeMeta/${name}`), { includeMetadataChanges: true }, (snap) => {
        const data = snap.exists() ? snap.data() : null;
        if (data) known.set(`recipeMeta/${name}`, stable(data)); else known.delete(`recipeMeta/${name}`);
        remote[name] = data;
        arrived(name, snap.metadata.fromCache);
      }, fail));
    }
  }

  // What Firestore should hold, built from the app's state.
  function desired() {
    const S = hooks.getState();
    const out = new Map();
    S.recipes.forEach((r, i) => {
      const body = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => k !== '_id'))));
      body._order = i; // keeps the list in the same order on every device
      out.set(`recipes/${r._id}`, body);
    });
    out.set('recipeMeta/pantry', { items: [...S.pantry_essentials] });
    out.set('recipeMeta/favorites', { ids: [...S.favorites] });
    out.set('recipeMeta/shopping', { recipes: { ...S.shopping }, checked: { ...S.shopChecks } });
    return out;
  }

  // Write only what changed since Firestore last told us. Writes are queued by the
  // Firestore SDK while offline and sent when the device reconnects.
  function push() {
    if (!uid || !ready) return;
    const want = desired();
    for (const [path, body] of want) {
      const s = stable(body);
      if (known.get(path) === s) continue;
      known.set(path, s);
      setDoc(ref(path), body).catch(fail);
    }
    for (const path of [...known.keys()]) {
      if (path.startsWith('recipes/') && !want.has(path)) {
        known.delete(path);
        deleteDoc(ref(path)).catch(fail);
      }
    }
  }

  onAuthStateChanged(auth, (user) => {
    stop();
    uid = user?.uid || null;
    email = user?.email || '';
    if (!uid) { setStatus({ signedIn: false, email: '', uid: null, state: 'signed-out', error: undefined }); return; }
    setStatus({ signedIn: true, email, uid, state: 'loading', error: undefined });
    subscribe();
  });

  return {
    push,
    async signIn(em, pw) { await signInWithEmailAndPassword(auth, em, pw); },
    async signOut() { await signOut(auth); },
    status: () => status,
  };
}
