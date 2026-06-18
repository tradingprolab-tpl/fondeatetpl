// ============================================================
// simulator.js — Simulador previo a la compra + proyección estadística
// Implementa sección 8 (simulador) y 24 (cálculo determinista +
// simulación estadística) del PRD.
//
// Dos niveles, tal como exige el PRD:
//  1) Cálculo determinista: usa expectancy/operaciones directas.
//  2) Simulación Monte Carlo: corre miles de secuencias aleatorias
//     de trades respetando daily loss, max loss y target, y devuelve
//     probabilidades + rangos (nunca un número único).
// ============================================================

import { suggestRisk } from "./risk-modes.js";

/**
 * Proyección determinista simple (sin aleatoriedad), usada cuando aún
 * no hay suficiente historial o como complemento de la Monte Carlo.
 */
export function deterministicProjection({ capital, targetPct, winRate, rr, riskPct, opsPerDay }) {
  const targetAbs = capital * (targetPct / 100);
  const riskAbs = capital * (riskPct / 100);
  const avgWin = riskAbs * rr;
  const avgLoss = riskAbs;
  const expectancyPerTrade = winRate * avgWin - (1 - winRate) * avgLoss;

  if (expectancyPerTrade <= 0) {
    return {
      expectancyPerTrade,
      opsEstimadas: null,
      diasEstimados: null,
      convergente: false,
    };
  }

  const opsEstimadas = targetAbs / expectancyPerTrade;
  const diasEstimados = opsPerDay > 0 ? opsEstimadas / opsPerDay : null;
  return { expectancyPerTrade, opsEstimadas, diasEstimados, convergente: true };
}

/**
 * Simulación Monte Carlo día por día.
 *
 * Supuestos explícitos (documentados también en el README para que el
 * usuario los pueda ajustar si lo necesita):
 *  - El daily loss y el max loss se calculan como % fijo del capital
 *    inicial de la fase (no balance/equity dinámico día a día), lo
 *    cual es razonable para una proyección previa a operar.
 *  - El drawdown puede ser "static" (desde capital inicial) o
 *    "trailing" (desde balance pico).
 *  - El riesgo por operación respeta el modo de gestión elegido
 *    (estático, conservador, dinámico, recuperación) reutilizando
 *    risk-modes.js, para que el simulador y el motor en vivo nunca
 *    diverjan en su lógica.
 */
export function runMonteCarlo({
  capital,
  targetPct,
  dailyLossPct,
  maxLossPct,
  drawdownType = "static",
  winRate,
  rr,
  riskBasePct,
  riskMode = "static",
  opsPerDay = 2,
  maxDays = 120,
  trials = 1500,
}) {
  const targetAbs = capital * (targetPct / 100);
  const dailyLossAbs = capital * (dailyLossPct / 100);
  const maxLossAbs = capital * (maxLossPct / 100);

  let passed = 0;
  let failedDaily = 0;
  let failedMax = 0;
  let inconclusive = 0;

  const opsOnSuccess = [];
  const daysOnSuccess = [];

  for (let trial = 0; trial < trials; trial++) {
    const result = simulateOneTrial({
      capital,
      targetAbs,
      dailyLossAbs,
      maxLossAbs,
      drawdownType,
      winRate,
      rr,
      riskBasePct,
      riskMode,
      opsPerDay,
      maxDays,
    });

    if (result.outcome === "passed") {
      passed++;
      opsOnSuccess.push(result.totalOps);
      daysOnSuccess.push(result.totalDays);
    } else if (result.outcome === "failed_daily") failedDaily++;
    else if (result.outcome === "failed_max") failedMax++;
    else inconclusive++;
  }

  const passRate = passed / trials;
  const failRate = (failedDaily + failedMax) / trials;
  const inconclusiveRate = inconclusive / trials;

  return {
    trials,
    passRate,
    failRate,
    inconclusiveRate,
    failedDailyRate: failedDaily / trials,
    failedMaxRate: failedMax / trials,
    avgOpsToPass: average(opsOnSuccess),
    avgDaysToPass: average(daysOnSuccess),
    rangeOpsToPass: percentileRange(opsOnSuccess),
    rangeDaysToPass: percentileRange(daysOnSuccess),
  };
}

function simulateOneTrial({
  capital,
  targetAbs,
  dailyLossAbs,
  maxLossAbs,
  drawdownType,
  winRate,
  rr,
  riskBasePct,
  riskMode,
  opsPerDay,
  maxDays,
}) {
  let balance = capital;
  let balancePico = capital;
  let profit = 0;
  let totalOps = 0;
  const recentResults = [];

  for (let day = 1; day <= maxDays; day++) {
    let dailyPnl = 0;
    const opsToday = Math.max(1, Math.round(opsPerDay));

    for (let op = 0; op < opsToday; op++) {
      const drawdownActual = drawdownType === "trailing" ? balancePico - balance : capital - balance;
      const bufferGeneralAbs = Math.max(maxLossAbs - Math.max(drawdownActual, 0), 0);
      const bufferDiarioAbs = Math.max(dailyLossAbs - Math.max(-dailyPnl, 0), 0);

      const snapshot = {
        progresoPct: targetAbs > 0 ? Math.min(Math.max((profit / targetAbs) * 100, 0), 100) : 0,
        bufferGeneralPct: maxLossAbs > 0 ? (bufferGeneralAbs / maxLossAbs) * 100 : 100,
        bufferDiarioPct: dailyLossAbs > 0 ? (bufferDiarioAbs / dailyLossAbs) * 100 : 100,
      };

      const { riskPct } = suggestRisk({
        mode: riskMode,
        riskBasePct,
        snapshot,
        lastTradesResults: recentResults,
      });

      const riskAbs = balance * (riskPct / 100);
      const isWin = Math.random() < winRate;
      const pnl = isWin ? riskAbs * rr : -riskAbs;

      balance += pnl;
      profit += pnl;
      dailyPnl += pnl;
      balancePico = Math.max(balancePico, balance);
      totalOps++;
      recentResults.push(isWin ? "win" : "loss");

      const drawdownAfter = drawdownType === "trailing" ? balancePico - balance : capital - balance;
      if (drawdownAfter >= maxLossAbs) {
        return { outcome: "failed_max", totalOps, totalDays: day };
      }
      if (-dailyPnl >= dailyLossAbs) {
        return { outcome: "failed_daily", totalOps, totalDays: day };
      }
      if (profit >= targetAbs) {
        return { outcome: "passed", totalOps, totalDays: day };
      }
    }
  }

  return { outcome: "inconclusive", totalOps, totalDays: maxDays };
}

function average(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/** Devuelve un rango [p25, p75] para evitar mostrar un número único (exigido por sección 24). */
function percentileRange(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)];
  const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
  return [p25, p75];
}

/** Genera alertas de riesgo si la configuración ingresada es demasiado agresiva. */
export function buildRiskWarnings({ riskBasePct, rr, dailyLossPct, maxLossPct }) {
  const warnings = [];
  if (riskBasePct > 2) {
    warnings.push("El riesgo base supera el 2% por operación: una racha corta de pérdidas puede consumir gran parte del daily loss.");
  }
  if (rr > 3) {
    warnings.push("El RR configurado supera 1:3, fuera del rango de referencia recomendado por el PRD (máximo 1:3).");
  }
  if (dailyLossPct > 0 && riskBasePct >= dailyLossPct) {
    warnings.push("El riesgo por operación es igual o mayor al daily loss permitido: una sola operación podría romper el límite diario.");
  }
  if (maxLossPct > 0 && riskBasePct * 5 >= maxLossPct) {
    warnings.push("Cinco operaciones perdedoras consecutivas al riesgo configurado consumirían todo (o casi todo) el max loss.");
  }
  return warnings;
}
