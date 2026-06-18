// ============================================================
// calculations.js — Motor de cálculo matemático
// Capa de cálculo independiente de la UI, tal como exige el PRD
// (sección 16: "implementar la lógica como una capa de cálculo
// independiente para que sea fácil mantenerla y escalarla").
//
// Todas las funciones son puras: reciben datos, devuelven datos.
// No tocan el DOM ni Firebase.
// ============================================================

/**
 * Normaliza un campo que puede venir como porcentaje (ej. 8 = 8%) o
 * como monto fijo. Si pct está definido se usa porcentaje sobre la
 * base indicada; si no, se usa el monto fijo directamente.
 */
export function resolveLimit({ pct, amount, base }) {
  if (pct !== null && pct !== undefined && pct !== "") return base * (Number(pct) / 100);
  return Number(amount || 0);
}

/** Target restante de la fase actual. */
export function targetRestante({ capitalInicial, targetPct, profitAcumuladoFase }) {
  const targetAbs = capitalInicial * (targetPct / 100);
  return Math.max(targetAbs - profitAcumuladoFase, 0);
}

/** Buffer diario disponible antes de tocar el daily loss. */
export function bufferDiario({ dailyLossLimitAbs, perdidaAcumuladaHoy }) {
  // perdidaAcumuladaHoy se espera como número negativo o cero (pnl del día)
  const perdidaAbs = Math.max(-perdidaAcumuladaHoy, 0);
  return Math.max(dailyLossLimitAbs - perdidaAbs, 0);
}

/** Buffer general disponible antes de tocar el max loss / drawdown. */
export function bufferGeneral({ maxLossLimitAbs, drawdownAcumuladoTotal }) {
  const ddAbs = Math.max(-drawdownAcumuladoTotal, 0);
  return Math.max(maxLossLimitAbs - ddAbs, 0);
}

/** Riesgo monetario por operación según balance actual y % de riesgo. */
export function riesgoMonetario({ balanceActual, riesgoPct }) {
  return Math.max(balanceActual * (riesgoPct / 100), 0);
}

/** Ganancia esperada de una operación ganadora dado el riesgo y el RR fijo. */
export function gananciaEsperadaSiGana({ riesgoMonetario, rr }) {
  return riesgoMonetario * rr;
}

/** Pérdida esperada de una operación perdedora (= riesgo arriesgado). */
export function perdidaEsperadaSiPierde({ riesgoMonetario }) {
  return riesgoMonetario;
}

/**
 * Expectancy promedio por operación.
 * winRate en 0–1. avgWin / avgLoss en moneda (avgLoss positivo = magnitud).
 */
export function expectancy({ winRate, avgWin, avgLoss }) {
  return winRate * avgWin - (1 - winRate) * avgLoss;
}

/** Win rate, profit factor, avgWin, avgLoss a partir del historial de trades. */
export function statsFromTrades(trades) {
  if (!trades || trades.length === 0) {
    return { winRate: null, avgWin: null, avgLoss: null, profitFactor: null, totalTrades: 0, expectancy: null };
  }
  const wins = trades.filter((t) => Number(t.pnl) > 0);
  const losses = trades.filter((t) => Number(t.pnl) < 0);
  const totalTrades = trades.length;
  const winRate = wins.length / totalTrades;
  const avgWin = wins.length ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0;
  const avgLossMag = losses.length
    ? Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length)
    : 0;
  const grossWin = wins.reduce((s, t) => s + Number(t.pnl), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : wins.length ? Infinity : null;
  const exp = expectancy({ winRate, avgWin, avgLoss: avgLossMag });
  return { winRate, avgWin, avgLoss: avgLossMag, profitFactor, totalTrades, expectancy: exp };
}

/** Operaciones estimadas para alcanzar el target restante, dado expectancy promedio. */
export function operacionesEstimadas({ targetRestanteAbs, expectancyPromedio }) {
  if (!expectancyPromedio || expectancyPromedio <= 0) return null; // no convergente con expectancy actual
  return targetRestanteAbs / expectancyPromedio;
}

/** Tiempo estimado en días dado el número de operaciones y el promedio de operaciones/día. */
export function tiempoEstimadoDias({ operacionesEstimadas, opsPorDia }) {
  if (!operacionesEstimadas || !opsPorDia) return null;
  return operacionesEstimadas / opsPorDia;
}

/**
 * Calcula el drawdown actual según el tipo configurado.
 * - static: medido desde el capital inicial.
 * - trailing: medido desde el balance pico alcanzado.
 */
export function calcularDrawdown({ tipo, capitalInicial, balancePico, balanceActual }) {
  const referencia = tipo === "trailing" ? balancePico : capitalInicial;
  return Math.max(referencia - balanceActual, 0);
}

/**
 * Snapshot completo de métricas de una cuenta/fase, listo para pintar
 * en los KPI del dashboard de cuenta individual.
 */
export function buildAccountSnapshot({ account, phase, trades }) {
  const capitalInicial = account.capital;
  const tradesFase = trades.filter((t) => t.phaseId === phase.id);
  const profitAcumuladoFase = tradesFase.reduce((s, t) => s + Number(t.pnl), 0);
  const balanceActual = capitalInicial + profitAcumuladoFase;

  const balancePico = tradesFase.reduce(
    (peak, t, idx) => {
      const running = capitalInicial + tradesFase.slice(0, idx + 1).reduce((s, x) => s + Number(x.pnl), 0);
      return Math.max(peak, running);
    },
    capitalInicial
  );

  const dailyLossLimitAbs = resolveLimit({ pct: phase.dailyLossPct, amount: phase.dailyLossAmount, base: capitalInicial });
  const maxLossLimitAbs = resolveLimit({ pct: phase.maxLossPct, amount: phase.maxLossAmount, base: capitalInicial });

  const today = new Date();
  const todayKey = today.toDateString();
  const perdidaHoy = tradesFase
    .filter((t) => new Date(t.date).toDateString() === todayKey)
    .reduce((s, t) => s + Number(t.pnl), 0);

  const drawdownTotal = calcularDrawdown({
    tipo: phase.drawdownType,
    capitalInicial,
    balancePico,
    balanceActual,
  });

  const targetRest = targetRestante({ capitalInicial, targetPct: phase.targetPct, profitAcumuladoFase });
  const bufferDia = bufferDiario({ dailyLossLimitAbs, perdidaAcumuladaHoy: Math.min(perdidaHoy, 0) });
  const bufferGral = bufferGeneral({ maxLossLimitAbs, drawdownAcumuladoTotal: -drawdownTotal });

  const stats = statsFromTrades(tradesFase);
  const opsEstimadas = operacionesEstimadas({ targetRestanteAbs: targetRest, expectancyPromedio: stats.expectancy });
  const opsPorDia = account.avgOpsPerDay || 1;
  const diasEstimados = tiempoEstimadoDias({ operacionesEstimadas: opsEstimadas, opsPorDia });

  const targetAbs = capitalInicial * (phase.targetPct / 100);
  const progresoPct = targetAbs > 0 ? clampPct((profitAcumuladoFase / targetAbs) * 100) : 0;

  return {
    capitalInicial,
    balanceActual,
    equityActual: balanceActual, // sin flotante en este modelo de journal simplificado
    profitAcumuladoFase,
    targetAbs,
    targetRestante: targetRest,
    progresoPct,
    dailyLossLimitAbs,
    perdidaHoy,
    bufferDiario: bufferDia,
    bufferDiarioPct: dailyLossLimitAbs > 0 ? clampPct((bufferDia / dailyLossLimitAbs) * 100) : 100,
    maxLossLimitAbs,
    drawdownTotal,
    bufferGeneral: bufferGral,
    bufferGeneralPct: maxLossLimitAbs > 0 ? clampPct((bufferGral / maxLossLimitAbs) * 100) : 100,
    stats,
    operacionesEstimadas: opsEstimadas,
    diasEstimados,
  };
}

function clampPct(v) {
  return Math.min(Math.max(v, 0), 100);
}
