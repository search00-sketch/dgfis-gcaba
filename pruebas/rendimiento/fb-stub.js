// Simulador mínimo de Firebase (app/app-check/auth/firestore) en memoria.
// Los datos vienen de window.__STUB_DATA (inyectado antes de cargar la página).
const LAT = window.__STUB_LAT ?? 60; // ms de "red" por operación
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const store = window.__STUB_STORE || (window.__STUB_STORE = new Map(Object.entries(window.__STUB_DATA || {})));
window.__STUB_OPS = window.__STUB_OPS || { reads: 0, writes: 0 };
const clone = (o) => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
export function initializeApp() { return {}; }
export function deleteApp() { return Promise.resolve(); }
export function initializeAppCheck() {}
export class ReCaptchaV3Provider {}
// ---- auth
const user = { uid: 'uid_admin', email: 'admin@test' };
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(auth, cb) { setTimeout(() => cb(user), LAT); return () => {}; }
export async function signInWithEmailAndPassword() { return { user }; }
export async function signOut() {}
export async function reauthenticateWithCredential() {}
export async function updatePassword() {}
export async function sendPasswordResetEmail() {}
export async function createUserWithEmailAndPassword() { return { user }; }
export const EmailAuthProvider = { credential: () => ({}) };
// ---- firestore
const DEL = { __del: true };
export function getFirestore() { return {}; }
export function doc(db, col, id) { return { path: col + '/' + id, id, _col: col }; }
export function collection(db, col) { return { col }; }
export function collectionGroup(db, col) { return { col, group: true }; }
export function deleteField() { return DEL; }
export function arrayUnion(...v) { return { __union: v }; }
export function arrayRemove(...v) { return { __remove: v }; }
function snap(ref, data) { return { id: ref.id, ref, exists: () => data !== undefined, data: () => clone(data) }; }
export async function getDoc(ref) { await sleep(LAT); window.__STUB_OPS.reads++; return snap(ref, store.get(ref.path)); }
export async function getDocs(q) {
  await sleep(LAT);
  const docs = [...store.entries()].filter(([p]) => p.startsWith(q.col + '/')).map(([p, d]) => { window.__STUB_OPS.reads++; return snap(doc(null, q.col, p.slice(q.col.length + 1)), d); });
  return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
}
function aplicar(obj, campos) {
  for (const [k, v] of Object.entries(campos)) {
    const parts = k.split('.'); let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === 'object' ? o[parts[i]] : {}; o = o[parts[i]]; }
    const last = parts[parts.length - 1];
    if (v === DEL) delete o[last]; else o[last] = clone(v);
  }
}
export async function setDoc(ref, data, opts) { await sleep(LAT); window.__STUB_OPS.writes++; const cur = opts && opts.merge ? (store.get(ref.path) || {}) : {}; store.set(ref.path, Object.assign(cur, clone(data))); }
export async function updateDoc(ref, campos) { await sleep(LAT); window.__STUB_OPS.writes++; const cur = store.get(ref.path); if (!cur) { const e = new Error('not-found'); e.code = 'not-found'; throw e; } aplicar(cur, campos); }
export async function deleteDoc(ref) { await sleep(LAT); window.__STUB_OPS.writes++; store.delete(ref.path); }
export function writeBatch() { const ops = []; return { set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, c) => ops.push(() => updateDoc(r, c)), delete: (r) => ops.push(() => deleteDoc(r)), commit: async () => { for (const op of ops) await op(); } }; }
export async function runTransaction(db, fn) { const tx = { get: getDoc, set: (r, d, o) => setDoc(r, d, o), update: (r, c) => updateDoc(r, c), delete: deleteDoc }; return fn(tx); }
