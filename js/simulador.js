// ============================================================
// simulador.js — Lógica de simulador.html
// ============================================================

import { requireSession, signOut } from "./auth.js";
import { initTheme, toggleTheme, bindMobileNav } from "./ui.js";
import { formatPercent } from "./utils.js";
import { runMonteCarlo, deterministicProjection, buildRiskWarnings } from "./simulator.js";

initTheme();
bindMobileNav();

const $ = (id) => document.getElementById(id);

const session = await requireSession();
$("userAvatar").textContent = (session.user.email || "?").slice(0, 2).toUpperCase();
if (session.profile.role === "admin") $("adminNavLink").classList.remove("hidden");

$("themeToggleBtn").addEventListener("click", () => toggleTheme());
$("logoutBtn").addEventListener("click", async () => {
  await signOut();
  window.location.href = "index.html";
});

$("simForm").addEventListener("submit", (e) => {
  e.preventDefault();
  runSimulation();
});

function runSimulation() {
  const fd = new FormData($("simForm"));
  const data = Object.fromEntries(fd.entries());

  const capital = Number(data.capital);
  const targetPct = Number(data.targetPct);
  const dailyLossPct = Number(data.dailyLossPct);
  const maxLossPct = Number(data.maxLossPct);
  const drawdownType = data.drawdownType;
  const winRate = Number(data.winRate) / 100;
  const rr = Number(data.rr);
  const riskBasePct = Number(data.riskBasePct);
  const riskMode = data.riskMode;
  const opsPerDay = Number(data.opsPerDay);

  const mc = runMonteCarlo({
    capital,
    targetPct,
    dailyLossPct,
    maxLossPct,
    drawdownType,
    winRate,
    rr,
    riskBasePct,
    riskMode,
    opsPerDay,
  });

  const det = deterministicProjection({ capital, targetPct, winRate, rr, riskPct: riskBasePct, opsPerDay });
  const warnings = buildRiskWarnings({ riskBasePct, rr, dailyLossPct, maxLossPct });

  renderResults(mc, det, warnings);
}

function renderResults(mc, det, warnings) {
  $("simEmptyState").classList.add("hidden");
  $("simResults").classList.remove("hidden");

  const passPct = mc.passRate * 100;
  const failPct = mc.failRate * 100;
  const inconclusivePct = mc.inconclusiveRate * 100;

  $("simProbBar").innerHTML = `
    ${passPct > 0 ? `<div class="seg-pass" style="width:${passPct}%;" data-tooltip="${formatPercent(passPct)} pasa"></div>` : ""}
    ${failPct > 0 ? `<div class="seg-fail" style="width:${failPct}%;" data-tooltip="${formatPercent(failPct)} falla"></div>` : ""}
    ${inconclusivePct > 0 ? `<div class="seg-inconclusive" style="width:${inconclusivePct}%;" data-tooltip="${formatPercent(inconclusivePct)} inconcluso"></div>` : ""}
  `;

  $("simKpiGrid").innerHTML = [
    kpiBlock("Probabilidad de pasar", formatPercent(passPct), "is-success"),
    kpiBlock("Probabilidad de fallar", formatPercent(failPct), failPct > 50 ? "is-danger" : ""),
    kpiBlock("Operaciones para pasar (rango)", mc.rangeOpsToPass ? `${Math.round(mc.rangeOpsToPass[0])} – ${Math.round(mc.rangeOpsToPass[1])}` : "—"),
    kpiBlock("Días para pasar (rango)", mc.rangeDaysToPass ? `${Math.round(mc.rangeDaysToPass[0])} – ${Math.round(mc.rangeDaysToPass[1])}` : "—"),
  ].join("");

  let readout;
  if (passPct >= 60) {
    readout = `Con esta configuración, la simulación pasó en el <strong>${formatPercent(passPct)}</strong> de los escenarios. Es una configuración razonable: el riesgo base y el modo de gestión elegidos respetan tus límites de daily y max loss la mayoría de las veces.`;
  } else if (passPct >= 35) {
    readout = `La probabilidad de pasar fue de <strong>${formatPercent(passPct)}</strong>, un resultado intermedio. Antes de comprar, considera bajar el riesgo base, subir el win rate de tu sistema (con más backtesting) o cambiar a un modo de gestión más conservador.`;
  } else {
    readout = `Solo el <strong>${formatPercent(passPct)}</strong> de los escenarios pasó la fase con esta configuración. Con los datos actuales (win rate, R:R y riesgo) el reto es matemáticamente difícil de superar: revisa tu edge antes de arriesgar el costo de la cuenta.`;
  }
  if (det.convergente) {
    readout += ` De forma determinista (sin aleatoriedad), tu expectancy promedio sugeriría cerca de <strong>${Math.ceil(det.opsEstimadas)} operaciones</strong> y <strong>${det.diasEstimados ? Math.ceil(det.diasEstimados) : "—"} días</strong> para llegar al target, asumiendo que el win rate se mantiene estable.`;
  } else {
    readout += ` De forma determinista, la expectancy promedio con este win rate y R:R es negativa o nula: matemáticamente no convergerías hacia el target con esta estrategia.`;
  }
  $("simReadout").innerHTML = readout;

  $("simWarnings").innerHTML = warnings.length
    ? warnings.map((w) => `<div class="alert alert-warning" style="margin-bottom: var(--sp-3);">${w}</div>`).join("")
    : "";
}

function kpiBlock(label, value, extraClass = "") {
  return `
    <div class="kpi ${extraClass}">
      <div class="kpi-accent-bar"></div>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
    </div>`;
}
