// ============================================================
// cuenta.js — Lógica de cuenta.html (dashboard de cuenta individual)
// ============================================================

import { requireSession, signOut } from "./auth.js";
import {
  watchAccount,
  watchTrades,
  updateAccount,
  setAccountStatus,
  deleteAccount,
  advancePhase,
  markPhaseFailed,
  addTrade,
  updateTrade,
  deleteTrade,
} from "./store.js";
import { showToast, initTheme, toggleTheme, bindMobileNav, confirmAction, renderEmptyState, openModal, closeModal } from "./ui.js";
import { formatMoney, formatPercent, formatDateTime, numFromInput, capitalize, STATUS_BADGE_CLASS, STATUS_LABEL } from "./utils.js";
import { buildAccountSnapshot } from "./calculations.js";
import { RISK_MODES, suggestRisk, resultsSequence } from "./risk-modes.js";
import { renderBalanceLineChart, renderPnlBarChart, renderWinLossPie } from "./charts.js";
import { renderCalendar, shiftMonth, monthLabel } from "./calendar.js";

initTheme();
bindMobileNav();

const $ = (id) => document.getElementById(id);

const accountId = new URLSearchParams(window.location.search).get("id");
if (!accountId) window.location.href = "dashboard.html";

const accountContent = $("accountContent");
const accountTemplate = $("accountTemplate");

let account = null;
let trades = [];
let initialized = false;
let activeTab = "resumen";
let pnlGranularity = "day";
const now = new Date();
let calState = { year: now.getFullYear(), month: now.getMonth() };
let editingTradeId = null;

const session = await requireSession();
$("userAvatar") && ($("userAvatar").textContent = (session.user.email || "?").slice(0, 2).toUpperCase());
if (session.profile.role === "admin") $("adminNavLink")?.classList.remove("hidden");

$("themeToggleBtn").addEventListener("click", () => toggleTheme());
$("logoutBtn").addEventListener("click", async () => {
  await signOut();
  window.location.href = "index.html";
});

watchAccount(accountId, (acc) => {
  if (!acc) {
    accountContent.innerHTML = `
      <div class="state-block">
        <div class="state-icon">⚠️</div>
        <div class="state-title">No se encontró esta cuenta.</div>
        <a class="btn btn-primary" href="dashboard.html" style="margin-top: var(--sp-3);">Volver a mis cuentas</a>
      </div>`;
    return;
  }
  account = acc;
  renderAll();
});

watchTrades(accountId, (t) => {
  trades = t;
  renderAll();
});

/* ================= RENDER PRINCIPAL ================= */

function renderAll() {
  if (!account) return;
  ensureTemplate();

  const currentPhase = account.phases[account.currentPhaseIndex];
  const snapshot = buildAccountSnapshot({ account, phase: currentPhase, trades });

  renderHeader();
  renderPhasePills();
  renderPhaseActions();
  renderCriticalBanner(snapshot);
  renderKpiStrip(snapshot);
  renderResumenPanel(snapshot);
  renderTradesTable();
  renderRiskPanel(snapshot);
  renderSettingsForm();

  if (activeTab === "charts") renderCharts();
  if (activeTab === "calendar") renderCalendarPanel();
}

function ensureTemplate() {
  if (initialized) return;
  accountContent.innerHTML = "";
  accountContent.appendChild(accountTemplate.content.cloneNode(true));
  bindStaticListeners();
  initialized = true;
}

/* ================= HEADER / FASES ================= */

function renderHeader() {
  $("breadcrumbName").textContent = account.name;
  $("accountName").textContent = account.name;
  $("accountMeta").textContent = `${account.company} · ${typeLabel(account.type)} · Capital inicial ${formatMoney(account.capital)}`;
  const badge = $("accountStatusBadge");
  badge.className = `badge ${STATUS_BADGE_CLASS[account.status] || "badge-draft"}`;
  badge.textContent = STATUS_LABEL[account.status] || account.status;
}

function renderPhasePills() {
  $("phasePills").innerHTML = account.phases
    .map((p, idx) => {
      let cls = "";
      if (idx === account.currentPhaseIndex && account.status !== "passed" && account.status !== "failed") cls = "is-current";
      else if (p.status === "completed") cls = "is-done";
      const mark = p.status === "completed" ? " ✓" : p.status === "failed" ? " ✕" : "";
      return `<span class="phase-pill ${cls}">Fase ${p.phaseNumber}${mark}</span>`;
    })
    .join("");
}

function renderPhaseActions() {
  const el = $("phaseActions");
  if (["passed", "failed", "archived"].includes(account.status)) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = `
    <button class="btn btn-secondary" id="markFailedBtn">Marcar cuenta fallida</button>
    <button class="btn btn-primary" id="advancePhaseBtn">Marcar fase superada</button>
  `;
  $("advancePhaseBtn").addEventListener("click", async () => {
    if (!confirmAction("¿Confirmas que esta fase alcanzó el target? Esto avanzará a la siguiente fase (o marcará la cuenta como pasada si era la última)."))
      return;
    await advancePhase(account);
    showToast("Fase actualizada.", "success");
  });
  $("markFailedBtn").addEventListener("click", async () => {
    if (!confirmAction("¿Confirmas marcar esta cuenta como FALLIDA? Esta acción refleja una violación de regla de la empresa de fondeo y no se puede deshacer fácilmente."))
      return;
    await markPhaseFailed(account, "Marcado manualmente desde el panel.");
    showToast("Cuenta marcada como fallida.", "danger");
  });
}

function renderCriticalBanner(snapshot) {
  const el = $("criticalBannerWrap");
  if (snapshot.bufferGeneralPct <= 0) {
    el.innerHTML = `<div class="critical-banner"><span class="banner-icon">⛔</span><div><strong>Max loss alcanzado.</strong> El drawdown total llegó al límite configurado para esta fase. Revisa la operativa y considera marcar la cuenta como fallida.</div></div>`;
  } else if (snapshot.bufferDiarioPct <= 0) {
    el.innerHTML = `<div class="critical-banner"><span class="banner-icon">⚠️</span><div><strong>Daily loss alcanzado.</strong> Ya se consumió el límite de pérdida diaria: no deberías abrir más operaciones hoy.</div></div>`;
  } else if (snapshot.bufferGeneralPct <= 20) {
    el.innerHTML = `<div class="critical-banner" style="background: var(--color-warning-bg); border-color: rgba(255,178,62,0.4);"><span class="banner-icon">🛡️</span><div><strong>Buffer general bajo (${formatPercent(snapshot.bufferGeneralPct)}).</strong> Considera reducir el riesgo o activar el modo Recuperación en la pestaña de motor de riesgo.</div></div>`;
  } else {
    el.innerHTML = "";
  }
}

/* ================= KPIs ================= */

function renderKpiStrip(snapshot) {
  const el = $("accountKpiStrip");
  el.innerHTML = [
    kpiBlock("Balance actual", formatMoney(snapshot.balanceActual)),
    kpiBlock("Profit de la fase", formatMoney(snapshot.profitAcumuladoFase), snapshot.profitAcumuladoFase >= 0 ? "is-success" : "is-danger"),
    kpiBlock("Target restante", formatMoney(snapshot.targetRestante)),
    kpiBlock("Progreso", formatPercent(snapshot.progresoPct)),
    kpiBlock("Buffer diario", formatMoney(snapshot.bufferDiario), snapshot.bufferDiarioPct <= 30 ? "is-warning" : "", formatPercent(snapshot.bufferDiarioPct) + " disponible"),
    kpiBlock("Buffer general", formatMoney(snapshot.bufferGeneral), snapshot.bufferGeneralPct <= 20 ? "is-danger" : "", formatPercent(snapshot.bufferGeneralPct) + " disponible"),
    kpiBlock("Drawdown total", formatMoney(snapshot.drawdownTotal)),
    kpiBlock("Win rate", snapshot.stats.winRate !== null ? formatPercent(snapshot.stats.winRate, { fromRatio: true }) : "—"),
  ].join("");
}

function kpiBlock(label, value, extraClass = "", sub = "") {
  return `
    <div class="kpi ${extraClass}">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ""}
    </div>`;
}

/* ================= RESUMEN ================= */

function renderResumenPanel(snapshot) {
  $("progressPctLabel").textContent = formatPercent(snapshot.progresoPct);
  const fill = $("progressFill");
  fill.style.width = `${snapshot.progresoPct}%`;
  fill.className = `progress-fill ${snapshot.bufferGeneralPct <= 20 ? "is-danger" : snapshot.bufferDiarioPct <= 30 ? "is-warning" : ""}`;

  const box = $("projectionBox");
  if (snapshot.stats.totalTrades === 0) {
    box.innerHTML = "Aún no hay operaciones registradas en esta fase. Registra tu primera operación en la pestaña Journal para activar la proyección.";
  } else if (snapshot.operacionesEstimadas === null) {
    box.innerHTML = "La expectancy promedio con el historial actual es negativa o nula. Con la estrategia actual, el sistema no puede proyectar un cierre de fase: revisa tu plan de riesgo antes de seguir operando.";
  } else {
    box.innerHTML = `Con tu expectancy promedio actual (${formatMoney(snapshot.stats.expectancy)} por operación), se estiman <strong>${Math.ceil(snapshot.operacionesEstimadas)} operaciones</strong> y <strong>${Math.ceil(snapshot.diasEstimados)} días</strong> para alcanzar el target restante de esta fase, a un promedio de ${account.avgOpsPerDay} operaciones/día. Esta es una proyección determinista basada en tu historial, no una garantía.`;
  }

  const stats = snapshot.stats;
  $("statsGrid").innerHTML = [
    kpiBlock("Win rate", stats.winRate !== null ? formatPercent(stats.winRate, { fromRatio: true }) : "—"),
    kpiBlock("Ganada promedio", stats.avgWin !== null ? formatMoney(stats.avgWin) : "—"),
    kpiBlock("Perdida promedio", stats.avgLoss !== null ? formatMoney(stats.avgLoss) : "—"),
    kpiBlock("Profit factor", stats.profitFactor === null ? "—" : stats.profitFactor === Infinity ? "∞" : stats.profitFactor.toFixed(2)),
  ].join("");

  $("lockedStrategyBox").innerHTML = `
    ${lockedRow("Ratio R:R fijo", `1:${account.rr}`)}
    ${lockedRow("Riesgo base por operación", formatPercent(account.riskBasePct))}
    ${lockedRow("Modo de gestión", RISK_MODES[account.riskMode]?.label || account.riskMode)}
    ${lockedRow("Modo automático", account.autoMode ? "Activado" : "Desactivado")}
  `;
}

function lockedRow(label, value) {
  return `<div style="display:flex; justify-content:space-between; font-size: var(--fs-sm); padding-bottom: var(--sp-2); border-bottom: 1px solid var(--border-subtle);">
    <span class="text-secondary">${label}</span><strong>${value}</strong>
  </div>`;
}

/* ================= JOURNAL ================= */

function renderTradesTable() {
  const tbody = $("tradesTableBody");
  const tableWrap = document.querySelector(".tpl-table-wrap");
  const emptyEl = $("tradesEmptyState");

  if (trades.length === 0) {
    tbody.innerHTML = "";
    tableWrap.style.display = "none";
    renderEmptyState(emptyEl, {
      icon: "📝",
      title: "Aún no registras operaciones",
      hint: "Usa el botón “+ Registrar operación” para comenzar tu journal.",
    });
    return;
  }

  tableWrap.style.display = "";
  emptyEl.innerHTML = "";

  const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));
  tbody.innerHTML = sorted
    .map(
      (t) => `
    <tr data-trade-id="${t.id}">
      <td>${formatDateTime(t.date)}</td>
      <td><span class="result-pill is-${t.result}">${t.result === "win" ? "▲ Ganada" : "▼ Perdida"}</span></td>
      <td style="color: ${Number(t.pnl) >= 0 ? "var(--color-success)" : "var(--color-danger)"}; font-weight:700;">${formatMoney(t.pnl)}</td>
      <td>${escapeHtml(t.note || "—")}</td>
      <td style="text-align:right;">
        <button class="btn-icon btn-sm" data-action="edit-trade">✎</button>
        <button class="btn-icon btn-sm" data-action="delete-trade">✕</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll('[data-action="edit-trade"]').forEach((btn) => {
    btn.addEventListener("click", () => openTradeModal(btn.closest("tr").dataset.tradeId));
  });
  tbody.querySelectorAll('[data-action="delete-trade"]').forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirmAction("¿Eliminar esta operación del journal? No se puede deshacer.")) return;
      await deleteTrade(btn.closest("tr").dataset.tradeId);
      showToast("Operación eliminada.", "success");
    });
  });
}

function openTradeModal(tradeId) {
  editingTradeId = tradeId || null;
  const form = $("tradeForm");
  const resultSwitch = $("tradeResultSwitch");
  const modal = $("tradeModal");

  if (editingTradeId) {
    const t = trades.find((x) => x.id === editingTradeId);
    if (!t) return;
    $("tradeModalTitle").textContent = "Editar operación";
    form.amount.value = Math.abs(Number(t.pnl));
    form.date.value = toDatetimeLocalValue(t.date);
    form.note.value = t.note || "";
    setResultSwitch(resultSwitch, t.result);
  } else {
    $("tradeModalTitle").textContent = "Registrar operación";
    form.reset();
    form.date.value = toDatetimeLocalValue(new Date());
    setResultSwitch(resultSwitch, "win");
  }
  openModal(modal);
}

function setResultSwitch(switchEl, result) {
  switchEl.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.result === result));
}

function toDatetimeLocalValue(date) {
  const d = date ? new Date(date) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ================= GRÁFICAS ================= */

function renderCharts() {
  renderBalanceLineChart("balanceChart", { capitalInicial: account.capital, trades });
  renderPnlBarChart("pnlBarChart", { trades, granularity: pnlGranularity });
  renderWinLossPie("winLossChart", { trades });
}

/* ================= CALENDARIO ================= */

function renderCalendarPanel() {
  $("calMonthLabel").textContent = capitalize(monthLabel(calState.year, calState.month));
  renderCalendar($("calendarContainer"), { year: calState.year, month: calState.month, trades });
}

/* ================= MOTOR DE RIESGO ================= */

function renderRiskPanel(snapshot) {
  const grid = $("riskModeGrid");
  grid.innerHTML = Object.entries(RISK_MODES)
    .map(
      ([key, m]) => `
    <button type="button" class="risk-mode-btn ${account.riskMode === key ? "is-active" : ""}" data-mode="${key}">
      <span class="mode-name">${m.label}</span>
      <span class="mode-desc">${m.description}</span>
    </button>`
    )
    .join("");
  grid.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateAccount(account.id, { riskMode: btn.dataset.mode });
      showToast("Modo de gestión actualizado.", "success");
    });
  });

  const autoSwitch = $("riskAutoModeSwitch");
  autoSwitch.classList.toggle("is-on", !!account.autoMode);
  autoSwitch.onclick = async () => {
    await updateAccount(account.id, { autoMode: !account.autoMode });
  };

  const currentPhase = account.phases[account.currentPhaseIndex];
  const phaseTrades = trades.filter((t) => t.phaseId === currentPhase.id);
  const seq = resultsSequence(phaseTrades);
  const suggestion = suggestRisk({ mode: account.riskMode, riskBasePct: account.riskBasePct, snapshot, lastTradesResults: seq });
  $("riskSuggestionValue").textContent = formatPercent(suggestion.riskPct);
  $("riskSuggestionReason").textContent = suggestion.reason;
}

/* ================= CONFIGURACIÓN ================= */

function renderSettingsForm() {
  const form = $("settingsForm");
  form.name.value = account.name;
  form.company.value = account.company;
  form.riskBasePct.value = account.riskBasePct;
  form.rr.value = String(account.rr);
  form.avgOpsPerDay.value = account.avgOpsPerDay;

  const hasTrades = trades.length > 0;
  $("rrSelect").disabled = hasTrades;
  $("rrLockHint").style.display = hasTrades ? "block" : "none";

  renderPhasesEditor();
}

function renderPhasesEditor() {
  const el = $("phasesEditor");
  el.innerHTML = account.phases
    .map(
      (p, idx) => `
    <div class="tpl-card-tight" style="border:1px solid var(--border-subtle); border-radius: var(--radius-md);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: var(--sp-3);">
        <strong>Fase ${p.phaseNumber}</strong>
        <span class="badge ${phaseBadgeClass(p.status)}">${phaseStatusLabel(p.status)}</span>
      </div>
      <div class="wizard-fields-grid" data-phase-idx="${idx}">
        <div class="field-group"><label class="field-label">Target (%)</label><input class="input phase-field" data-field="targetPct" type="number" step="0.1" value="${p.targetPct}" /></div>
        <div class="field-group"><label class="field-label">Daily loss (%)</label><input class="input phase-field" data-field="dailyLossPct" type="number" step="0.1" value="${p.dailyLossPct ?? ""}" /></div>
        <div class="field-group"><label class="field-label">Max loss (%)</label><input class="input phase-field" data-field="maxLossPct" type="number" step="0.1" value="${p.maxLossPct ?? ""}" /></div>
        <div class="field-group">
          <label class="field-label">Drawdown</label>
          <select class="select phase-field" data-field="drawdownType">
            <option value="static" ${p.drawdownType === "static" ? "selected" : ""}>Static</option>
            <option value="trailing" ${p.drawdownType === "trailing" ? "selected" : ""}>Trailing</option>
            <option value="daily_balance" ${p.drawdownType === "daily_balance" ? "selected" : ""}>Daily balance</option>
            <option value="daily_equity" ${p.drawdownType === "daily_equity" ? "selected" : ""}>Daily equity</option>
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm save-phase-btn" data-phase-idx="${idx}" style="margin-top: var(--sp-3);">Guardar fase ${p.phaseNumber}</button>
    </div>`
    )
    .join("");

  el.querySelectorAll(".save-phase-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.phaseIdx);
      const wrap = el.querySelector(`.wizard-fields-grid[data-phase-idx="${idx}"]`);
      const phases = [...account.phases];
      const updated = { ...phases[idx] };
      wrap.querySelectorAll(".phase-field").forEach((input) => {
        const field = input.dataset.field;
        updated[field] = field === "drawdownType" ? input.value : input.value === "" ? null : Number(input.value);
      });
      phases[idx] = updated;
      await updateAccount(account.id, { phases });
      showToast(`Fase ${updated.phaseNumber} actualizada.`, "success");
    });
  });
}

function phaseStatusLabel(status) {
  return { pending: "Pendiente", in_progress: "En curso", completed: "Completada", failed: "Fallida" }[status] || status;
}
function phaseBadgeClass(status) {
  return { pending: "badge-draft", in_progress: "badge-progress", completed: "badge-passed", failed: "badge-failed" }[status] || "badge-draft";
}

/* ================= LISTENERS ESTÁTICOS (solo se enlazan una vez) ================= */

function bindStaticListeners() {
  document.querySelectorAll(".account-tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      activeTab = tabBtn.dataset.tab;
      document.querySelectorAll(".account-tab").forEach((b) => b.classList.toggle("is-active", b === tabBtn));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("is-active", p.dataset.tab === activeTab));
      if (activeTab === "charts") renderCharts();
      if (activeTab === "calendar") renderCalendarPanel();
    });
  });

  document.querySelectorAll("#pnlGranularitySwitch button").forEach((btn) => {
    btn.addEventListener("click", () => {
      pnlGranularity = btn.dataset.gran;
      document.querySelectorAll("#pnlGranularitySwitch button").forEach((b) => b.classList.toggle("is-active", b === btn));
      renderPnlBarChart("pnlBarChart", { trades, granularity: pnlGranularity });
    });
  });

  $("calPrevBtn").addEventListener("click", () => {
    calState = shiftMonth(calState.year, calState.month, -1);
    renderCalendarPanel();
  });
  $("calNextBtn").addEventListener("click", () => {
    calState = shiftMonth(calState.year, calState.month, 1);
    renderCalendarPanel();
  });

  $("openAddTradeBtn").addEventListener("click", () => openTradeModal(null));
  $("closeTradeModalBtn").addEventListener("click", () => closeModal($("tradeModal")));
  $("cancelTradeBtn").addEventListener("click", () => closeModal($("tradeModal")));
  $("tradeModal").addEventListener("click", (e) => {
    if (e.target === $("tradeModal")) closeModal($("tradeModal"));
  });

  $("tradeResultSwitch").querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => setResultSwitch($("tradeResultSwitch"), btn.dataset.result));
  });

  $("saveTradeBtn").addEventListener("click", async () => {
    const form = $("tradeForm");
    const amount = numFromInput(form.amount);
    if (!amount || amount <= 0) {
      showToast("Ingresa un monto válido.", "warning");
      return;
    }
    const result = $("tradeResultSwitch").querySelector(".is-active").dataset.result;
    const pnl = result === "win" ? amount : -amount;
    const dateVal = form.date.value;
    const note = form.note.value;
    const currentPhase = account.phases[account.currentPhaseIndex];

    try {
      if (editingTradeId) {
        await updateTrade(editingTradeId, { pnl, result, date: new Date(dateVal).toISOString(), note });
        showToast("Operación actualizada.", "success");
      } else {
        await addTrade({ accountId: account.id, phaseId: currentPhase.id, pnl, date: dateVal, note });
        showToast("Operación registrada.", "success");
      }
      closeModal($("tradeModal"));
    } catch (err) {
      showToast("No se pudo guardar la operación.", "danger");
    }
  });

  $("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const patch = {
      name: form.name.value,
      company: form.company.value,
      riskBasePct: Number(form.riskBasePct.value),
      avgOpsPerDay: Number(form.avgOpsPerDay.value),
    };
    if (!$("rrSelect").disabled) patch.rr = Number(form.rr.value);
    try {
      await updateAccount(account.id, patch);
      showToast("Cambios guardados.", "success");
    } catch (err) {
      showToast("No se pudo guardar. Intenta de nuevo.", "danger");
    }
  });

  $("archiveAccountBtn").addEventListener("click", async () => {
    if (!confirmAction("¿Archivar esta cuenta? Podrás seguir viéndola, pero saldrá de tu lista activa.")) return;
    await setAccountStatus(account.id, "archived");
    showToast("Cuenta archivada.", "success");
    window.location.href = "dashboard.html";
  });

  $("deleteAccountBtn").addEventListener("click", async () => {
    if (!confirmAction(`¿Eliminar definitivamente "${account.name}"? Esta acción no se puede deshacer y borrará la cuenta (las operaciones quedarán huérfanas).`)) return;
    await deleteAccount(account.id);
    showToast("Cuenta eliminada.", "success");
    window.location.href = "dashboard.html";
  });
}

/* ================= HELPERS ================= */

function typeLabel(type) {
  return { instant: "Instantánea", "1phase": "1 fase", "2phase": "2 fases", "3phase": "3 fases" }[type] || type;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
