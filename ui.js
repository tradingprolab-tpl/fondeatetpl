// ============================================================
// ui.js — Helpers de interfaz compartidos por todas las páginas
// Toasts, modales genéricos, tema oscuro/claro, nav móvil.
// ============================================================

let toastStack = null;

function ensureToastStack() {
  if (toastStack) return toastStack;
  toastStack = document.createElement("div");
  toastStack.className = "toast-stack";
  document.body.appendChild(toastStack);
  return toastStack;
}

/** Muestra un toast. type: 'success' | 'danger' | 'warning' | 'info'. */
export function showToast(message, type = "info", duration = 3800) {
  const stack = ensureToastStack();
  const toast = document.createElement("div");
  toast.className = `toast is-${type}`;
  toast.innerHTML = `<span>${iconFor(type)}</span><span>${escapeHtml(message)}</span>`;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 200ms ease";
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

function iconFor(type) {
  return { success: "✓", danger: "✕", warning: "!", info: "i" }[type] || "i";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Abre un modal genérico a partir de un id de template existente en el DOM. */
export function openModal(modalEl) {
  modalEl.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

export function closeModal(modalEl) {
  modalEl.classList.add("hidden");
  document.body.style.overflow = "";
}

/** Cierra el modal si se hace click fuera del contenido (en el backdrop). */
export function bindBackdropClose(backdropEl, modalContentEl) {
  backdropEl.addEventListener("click", (e) => {
    if (!modalContentEl.contains(e.target)) closeModal(backdropEl);
  });
}

/* ================= TEMA OSCURO / CLARO ================= */

const THEME_KEY = "tpl_theme";

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(saved);
}

export function applyTheme(theme) {
  if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY) || "dark";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/* ================= NAV MÓVIL ================= */

export function bindMobileNav() {
  const toggle = document.querySelector(".mobile-nav-toggle");
  const sidebar = document.querySelector(".sidebar");
  if (!toggle || !sidebar) return;

  let backdrop = null;
  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("is-open");
    if (sidebar.classList.contains("is-open")) {
      backdrop = document.createElement("div");
      backdrop.className = "sidebar-backdrop";
      backdrop.addEventListener("click", () => {
        sidebar.classList.remove("is-open");
        backdrop.remove();
      });
      document.body.appendChild(backdrop);
    } else if (backdrop) {
      backdrop.remove();
    }
  });
}

/* ================= ESTADOS DE CARGA ================= */

export function renderLoadingState(container, message = "Cargando información...") {
  container.innerHTML = `
    <div class="state-block">
      <div class="spinner"></div>
      <div class="state-title">${escapeHtml(message)}</div>
    </div>`;
}

export function renderEmptyState(container, { icon = "📂", title, hint = "" }) {
  container.innerHTML = `
    <div class="state-block">
      <div class="state-icon">${icon}</div>
      <div class="state-title">${escapeHtml(title)}</div>
      ${hint ? `<div class="text-tertiary">${escapeHtml(hint)}</div>` : ""}
    </div>`;
}

export function renderErrorState(container, message = "Algo salió mal. Intenta de nuevo.") {
  container.innerHTML = `
    <div class="state-block">
      <div class="state-icon">⚠️</div>
      <div class="state-title">${escapeHtml(message)}</div>
    </div>`;
}

/** Confirmación simple (reemplaza confirm() nativo con estilo consistente más adelante si se desea). */
export function confirmAction(message) {
  return window.confirm(message);
}
