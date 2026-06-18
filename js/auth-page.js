// ============================================================
// auth-page.js — Lógica de index.html (login / registro / whitelist)
// ============================================================

import { registerUser, loginUser, watchAuthState } from "./auth.js";

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const showRegisterBtn = document.getElementById("showRegisterBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const backToLoginWrap = document.getElementById("backToLoginWrap");
const authToggleLogin = loginForm.closest(".auth-card").querySelector(".auth-toggle");
const loginError = document.getElementById("loginError");
const registerError = document.getElementById("registerError");
const pendingNotice = document.getElementById("pendingNotice");

if (new URLSearchParams(window.location.search).get("pending") === "1") {
  pendingNotice.classList.remove("hidden");
}

showRegisterBtn.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  authToggleLogin.classList.add("hidden");
  registerForm.classList.remove("hidden");
  backToLoginWrap.classList.remove("hidden");
});

backToLoginBtn.addEventListener("click", () => {
  registerForm.classList.add("hidden");
  backToLoginWrap.classList.add("hidden");
  loginForm.classList.remove("hidden");
  authToggleLogin.classList.remove("hidden");
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("loginSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Verificando...";
  try {
    await loginUser(email, password);
    // watchAuthState (más abajo) se encarga de redirigir según approved/role.
  } catch (err) {
    loginError.textContent = mapAuthError(err);
    loginError.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Entrar al panel";
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  registerError.classList.add("hidden");
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value;
  const btn = document.getElementById("registerSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Creando...";
  try {
    await registerUser(email, password);
    // watchAuthState se encarga de redirigir a la pantalla de "pendiente de aprobación".
  } catch (err) {
    registerError.textContent = mapAuthError(err);
    registerError.classList.remove("hidden");
    btn.disabled = false;
    btn.textContent = "Crear cuenta";
  }
});

// Si ya hay sesión activa (o se acaba de iniciar), redirige según corresponda.
watchAuthState((session) => {
  if (!session) return;
  if (!session.profile?.approved) {
    window.location.href = "index.html?pending=1";
    return;
  }
  window.location.href = session.profile.role === "admin" ? "dashboard.html" : "dashboard.html";
});

function mapAuthError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Ese correo ya tiene una cuenta. Inicia sesión.";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) return "Correo o contraseña incorrectos.";
  if (code.includes("user-not-found")) return "No existe una cuenta con ese correo.";
  if (code.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (code.includes("invalid-email")) return "Correo inválido.";
  return "Ocurrió un error. Intenta de nuevo.";
}
