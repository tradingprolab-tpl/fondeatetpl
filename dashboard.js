// ============================================================
// dashboard.js — Lógica de dashboard.html
// ============================================================

import { requireSession, signOut } from "./auth.js";
import { watchAccounts, createAccount, setAccountStatus, deleteAccount, duplicateAccount } from "./store.js";
import { showToast, initTheme, toggleTheme, bindMobileNav, renderEmptyState, renderLoadingState, confirmAction } from "./ui.js";
import { formatMoney, formatPercent, STATUS_BADGE_CLASS, STATUS_LABEL, debounce } from "./utils.js";

initTheme();
bindMobileNav();

const accountsContainer = document.getElementById("accountsContainer");
const globalKpiStrip = document.getElementById("globalKpiStrip");
const searchInput = document.getElementById("searchInput");
const filterStatus = document.getElementById("filterStatus");
const filterType = document.getElementById("filterType");
const adminNavLink = document.getElementById("adminNavLink");
const userAvatar = document.getElementById("userAvatar");

renderLoadingState(accountsContainer, "Cargando tus cuentas...");

let allAccounts = [];
let currentUserId = null;

const session = await requireSession();
currentUserId = session.user.uid;
userAvatar.textContent = (session.user.email || "?").slice(0, 2).toUpperCase();
if (session.profile.role === "admin") adminNavLink.classList.remove("hidden");

watchAccounts(currentUserId, (accounts) => {
  allAccounts = accounts;
  renderGlobalKpis(allAccounts);
  applyFiltersAndRender();
});

document.getElementById("themeToggleBtn").addEventListener("click", () => toggleTheme());
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut();
  window.location.href = "index.html";
});

searchInput.addEventListener("input", debounce(applyFiltersAndRender, 200));
filterStatus.addEventListener("change", applyFiltersAndRender);
filterType.addEventListener("change", applyFiltersAndRender);

function applyFiltersAndRender() {
  const term = searchInput.value.trim().toLowerCase();
  const status = filterStatus.value;
  const type = filterType.value;

  const filtered = allAccounts.filter((a) => {
    const matchesTerm = !term || a.name.toLowerCase().includes(term) || a.company.toLowerCase().includes(term);
    const matchesStatus = !status || a.status === status;
    const matchesType = !type || a.type === type;
    return matchesTerm && matchesStatus && matchesType;
  });

  renderAccountCards(filtered);
}

function renderGlobalKpis(accounts) {
  const activeCount = accounts.filter((a) => ["active", "in_progress"].includes(a.status)).length;
  const passedCount = accounts.filter((a) => a.status === "passed").length;
  const failedCount = accounts.filter((a) => a.status === "failed").length;
  const totalCapital = accounts.reduce((s, a) => s + Number(a.capital || 0), 0);

  globalKpiStrip.innerHTML = `
    ${kpiBlock("Cuentas activas", activeCount, "")}
    ${kpiBlock("Cuentas pasadas", passedCount, "", "is-success")}
    ${kpiBlock("Cuentas fallidas", failedCount, "", failedCount > 0 ? "is-danger" : "")}
    ${kpiBlock("Capital total bajo gestión", formatMoney(totalCapital), "")}
  `;
}

function kpiBlock(label, value, sub, extraClass = "") {
  return `
    <div class="kpi ${extraClass}">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ""}
    </div>`;
}

function renderAccountCards(accounts) {
  if (accounts.length === 0) {
    renderEmptyState(accountsContainer, {
      icon: "📊",
      title: "Todavía no tienes cuentas registradas",
      hint: "Crea tu primera cuenta de fondeo para empezar a controlar el proceso.",
    });
    return;
  }

  accountsContainer.innerHTML = accounts.map((a) => accountCardHtml(a)).join("");

  accountsContainer.querySelectorAll("[data-open-account]").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-action]")) return; // los botones de acción no navegan
      window.location.href = `cuenta.html?id=${card.dataset.openAccount}`;
    });
  });

  accountsContainer.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.closest("[data-open-account]").dataset.openAccount;
      const action = btn.dataset.action;
      await handleCardAction(id, action);
    });
  });
}

function accountCardHtml(a) {
  const currentPhase = a.phases?.[a.currentPhaseIndex];
  const phaseLabel = currentPhase ? `Fase ${currentPhase.phaseNumber}/${a.phases.length}` : "—";
  return `
    <div class="account-card" data-open-account="${a.id}">
      <div class="account-card-head">
        <div>
          <div class="account-card-name">${escapeHtml(a.name)}</div>
          <div class="account-card-meta">${escapeHtml(a.company)} · ${typeLabel(a.type)}</div>
        </div>
        <span class="badge ${STATUS_BADGE_CLASS[a.status] || "badge-draft"}">${STATUS_LABEL[a.status] || a.status}</span>
      </div>
      <div class="account-card-stats">
        <span>Capital: ${formatMoney(a.capital)}</span>
        <span>${phaseLabel}</span>
      </div>
      <div class="account-card-actions">
        <button class="btn-icon btn-sm" data-action="duplicate" data-tooltip="Duplicar">⧉</button>
        <button class="btn-icon btn-sm" data-action="archive" data-tooltip="Archivar">🗄</button>
        <button class="btn-icon btn-sm" data-action="delete" data-tooltip="Eliminar">✕</button>
      </div>
    </div>`;
}

function typeLabel(type) {
  return { instant: "Instantánea", "1phase": "1 fase", "2phase": "2 fases", "3phase": "3 fases" }[type] || type;
}

async function handleCardAction(id, action) {
  const account = allAccounts.find((a) => a.id === id);
  if (!account) return;

  if (action === "archive") {
    await setAccountStatus(id, "archived");
    showToast("Cuenta archivada.", "success");
  } else if (action === "delete") {
    if (!confirmAction(`¿Eliminar definitivamente "${account.name}"? Esta acción no se puede deshacer.`)) return;
    await deleteAccount(id);
    showToast("Cuenta eliminada.", "success");
  } else if (action === "duplicate") {
    await duplicateAccount(account);
    showToast("Cuenta duplicada como borrador.", "success");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* ================= WIZARD CREAR CUENTA ================= */

const createAccountModal = document.getElementById("createAccountModal");
const createAccountForm = document.getElementById("createAccountForm");
const wizardSteps = createAccountForm.querySelectorAll(".wizard-step");
const wizardDots = createAccountModal.querySelectorAll(".wizard-step-dot");
const wizardBackBtn = document.getElementById("wizardBackBtn");
const wizardNextBtn = document.getElementById("wizardNextBtn");
const wizardSubmitBtn = document.getElementById("wizardSubmitBtn");
const autoModeSwitch = document.getElementById("autoModeSwitch");

let currentStep = 1;
const totalSteps = wizardSteps.length;

document.getElementById("openCreateAccountBtn").addEventListener("click", () => {
  resetWizard();
  createAccountModal.classList.remove("hidden");
});
document.getElementById("closeCreateModalBtn").addEventListener("click", () => createAccountModal.classList.add("hidden"));
createAccountModal.addEventListener("click", (e) => {
  if (e.target === createAccountModal) createAccountModal.classList.add("hidden");
});

autoModeSwitch.addEventListener("click", () => {
  const isOn = autoModeSwitch.classList.toggle("is-on");
  autoModeSwitch.dataset.value = isOn ? "true" : "false";
});

wizardNextBtn.addEventListener("click", () => {
  if (!validateStep(currentStep)) return;
  if (currentStep < totalSteps) goToStep(currentStep + 1);
});
wizardBackBtn.addEventListener("click", () => {
  if (currentStep > 1) goToStep(currentStep - 1);
});

createAccountForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateStep(currentStep)) return;

  const formData = new FormData(createAccountForm);
  const data = Object.fromEntries(formData.entries());
  data.autoMode = autoModeSwitch.dataset.value === "true";

  wizardSubmitBtn.disabled = true;
  wizardSubmitBtn.textContent = "Creando...";
  try {
    const id = await createAccount(currentUserId, data);
    showToast("Cuenta creada con éxito.", "success");
    window.location.href = `cuenta.html?id=${id}`;
  } catch (err) {
    showToast("No se pudo crear la cuenta. Intenta de nuevo.", "danger");
    wizardSubmitBtn.disabled = false;
    wizardSubmitBtn.textContent = "Crear cuenta";
  }
});

function resetWizard() {
  currentStep = 1;
  createAccountForm.reset();
  autoModeSwitch.classList.add("is-on");
  autoModeSwitch.dataset.value = "true";
  goToStep(1);
}

function goToStep(step) {
  currentStep = step;
  wizardSteps.forEach((s) => s.classList.toggle("hidden", Number(s.dataset.step) !== step));
  wizardDots.forEach((d) => {
    const dotStep = Number(d.dataset.step);
    d.classList.toggle("is-active", dotStep === step);
    d.classList.toggle("is-done", dotStep < step);
  });
  wizardBackBtn.classList.toggle("hidden", step === 1);
  wizardNextBtn.classList.toggle("hidden", step === totalSteps);
  wizardSubmitBtn.classList.toggle("hidden", step !== totalSteps);
}

function validateStep(step) {
  const stepEl = createAccountForm.querySelector(`.wizard-step[data-step="${step}"]`);
  const requiredInputs = stepEl.querySelectorAll("[required]");
  for (const input of requiredInputs) {
    if (!input.value) {
      input.focus();
      showToast("Completa los campos obligatorios antes de continuar.", "warning");
      return false;
    }
  }
  return true;
}
