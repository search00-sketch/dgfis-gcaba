// Inicialización de Firebase del módulo Personas (se importa una sola vez).
// También deja en window lo que espera personal-auth.js (login compartido,
// sin cambios): _db, _auth y los _f* de autenticación.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteField, runTransaction, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, EmailAuthProvider,
  reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

if (typeof FIREBASE_CONFIG === 'undefined') { alert('Error: falta config.js'); throw new Error('Falta config.js'); }

const app = initializeApp(FIREBASE_CONFIG);
if (typeof RECAPTCHA_SITE_KEY !== 'undefined' && RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export const fs = { doc, getDoc, setDoc, updateDoc, deleteField, runTransaction, writeBatch };

Object.assign(window, {
  _db: db, _auth: auth, _fDoc: doc, _fGetDoc: getDoc,
  _fOnAuthStateChanged: onAuthStateChanged, _fSignIn: signInWithEmailAndPassword, _fSignOut: signOut,
  _fEmailAuthProvider: EmailAuthProvider, _fReauthenticate: reauthenticateWithCredential, _fUpdatePassword: updatePassword,
});
