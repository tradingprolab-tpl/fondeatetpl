// ============================================================
// admin.js — Lógica de admin.html (whitelist + roles)
// ============================================================

import { requireSession, signOut } from "./auth.js";
import { watchAllUsers, setUserApproval, setUserRole } from "./store.js";
import { showToast, initTheme, toggleTheme, bindMobileNav, renderEmptyState, confirmAction } from "./ui.js";
import { debounce } from "./utils.js";

initTheme();
bindMobileNav();

const $ = (id) => document.getElementById(id);

const session = await requireSession({ requireAdmin: true });
$("userAvatar").textContent = (session.user.email || "?").slice(0, 2).toUpperCase();

$("themeToggleBtn").addEventListener("click", () => toggleTheme());
$("logoutBtn").addEventListener("click", async () => {
  await signOut();
  window.location.href = "index.html";
});

let allUsers = [];
const usersListContainer = $("usersListContainer");
const searchInput = $("searchUserInput");

watchAllUsers((users) => {
  allUsers = users;
  renderStats(users);
  renderList(filterUsers());
});

searchInput.addEventListener("input", debounce(() => renderList(filterUsers()), 200));

function filterUsers() {
  const term = searchInput.value.trim().toLowerCase();
  if (!term) return allUsers;
  return allUsers.filter((u) => (u.email || "").toLowerCase().includes(term));
}

function renderStats(users) {
  $("statTotal").textContent = users.length;
  $("statPending").textContent = users.filter((u) => !u.approved).length;
  $("statApproved").textContent = users.filter((u) => u.approved).length;
}

function renderList(users) {
  if (users.length === 0) {
    renderEmptyState(usersListContainer, { icon: "👥", title: "No hay usuarios que coincidan con la búsqueda." });
    return;
  }

  usersListContainer.innerHTML = users
    .map(
      (u) => `
    <div class="whitelist-row" data-uid="${u.id}">
      <div>
        <div style="font-weight:600;">${escapeHtml(u.email || "—")}</div>
        <div class="text-tertiary" style="font-size: var(--fs-2xs);">${u.role === "admin" ? "Administrador" : "Trader"}</div>
      </div>
      <div class="tpl-row tpl-gap-3" style="display:flex; align-items:center; gap: var(--sp-4);">
        <select class="select role-select" style="width:auto; min-width:130px;" ${u.role === "admin" ? "disabled" : ""}>
          <option value="trader" ${u.role !== "admin" ? "selected" : ""}>Trader</option>
          <option value="admin" ${u.role === "admin" ? "selected" : ""}>Admin</option>
        </select>
        <button class="switch approve-switch ${u.approved ? "is-on" : ""}" data-tooltip="${u.approved ? "Aprobado" : "Pendiente"}"></button>
      </div>
    </div>`
    )
    .join("");

  usersListContainer.querySelectorAll(".approve-switch").forEach((sw) => {
    sw.addEventListener("click", async () => {
      const row = sw.closest("[data-uid]");
      const uid = row.dataset.uid;
      const isOn = sw.classList.contains("is-on");
      await setUserApproval(uid, !isOn);
      showToast(!isOn ? "Usuario aprobado." : "Acceso revocado.", !isOn ? "success" : "warning");
    });
  });

  usersListContainer.querySelectorAll(".role-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const row = sel.closest("[data-uid]");
      const uid = row.dataset.uid;
      if (sel.value === "admin" && !confirmAction("¿Convertir a este usuario en administrador? Tendrá acceso al panel admin.")) {
        sel.value = "trader";
        return;
      }
      await setUserRole(uid, sel.value);
      showToast("Rol actualizado.", "success");
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
