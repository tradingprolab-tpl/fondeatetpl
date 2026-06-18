// ============================================================
// auth.js — Autenticación + control de whitelist (allowedEmails)
//
// Mismo patrón que Journal del Rey: el admin aprueba correos desde
// el panel admin.html, y solo esos usuarios pueden entrar a la app.
// ============================================================

import { auth, db, ADMIN_EMAIL } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** Registra un nuevo usuario. Queda como "approved: false" hasta que el admin lo apruebe. */
export async function registerUser(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  await setDoc(doc(db, "users", cred.user.uid), {
    email,
    role: isAdmin ? "admin" : "trader",
    approved: isAdmin, // el admin queda auto-aprobado
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

/** Inicia sesión con correo/contraseña. */
export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut() {
  await fbSignOut(auth);
}

/** Lee el documento de perfil (rol + estado de aprobación) de un usuario. */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * Suscribe a cambios de sesión. El callback recibe { user, profile } o
 * null si no hay sesión activa. Pensado para inicializar cada página.
 */
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback(null);
      return;
    }
    const profile = await getUserProfile(user.uid);
    callback({ user, profile });
  });
}

/**
 * Guard de página: redirige a index.html si no hay sesión o si el
 * usuario no está aprobado todavía. Si requireAdmin es true, además
 * exige role === "admin".
 */
export function requireSession({ requireAdmin = false } = {}) {
  return new Promise((resolve) => {
    watchAuthState((session) => {
      if (!session) {
        window.location.href = "index.html";
        return;
      }
      if (!session.profile?.approved) {
        window.location.href = "index.html?pending=1";
        return;
      }
      if (requireAdmin && session.profile.role !== "admin") {
        window.location.href = "dashboard.html";
        return;
      }
      resolve(session);
    });
  });
}
