// ============================================================
// risk-modes.js — Modos de gestión de riesgo + umbrales dinámicos
// Implementa secciones 6 y 7 del PRD.
//
// Reglas que esta capa NUNCA rompe (sección 3 del PRD):
//  - El RR fijo no se toca aquí, solo el % de riesgo por operación.
//  - Las recomendaciones son conservadoras por defecto.
//  - Una racha negativa nunca incrementa el riesgo.
// ============================================================

export const RISK_MODES = {
  static: {
    label: "Estático",
    description: "Mantiene el mismo riesgo durante toda la cuenta.",
  },
  conservative: {
    label: "Conservador",
    description: "Arranca bajo y reduce aún más cerca del target o del drawdown.",
  },
  dynamic: {
    label: "Dinámico",
    description: "Ajusta el riesgo según balance, drawdown y distancia al target.",
  },
  recovery: {
    label: "Recuperación",
    description: "Reduce el riesgo al mínimo razonable tras una pérdida relevante.",
  },
};

/**
 * Tabla de umbrales por avance hacia el target (sección 7).
 * factor = multiplicador sobre el riesgo base.
 */
const PROGRESS_THRESHOLDS = [
  { max: 30, factor: 1.0, note: "Plan normal, sin sobreoperar." },
  { max: 60, factor: 0.75, note: "Empezar a proteger margen." },
  { max: 80, factor: 0.5, note: "Reducir exposición, priorizar cierre de fase." },
  { max: 100, factor: 0.35, note: "Máxima prudencia: el objetivo está cerca." },
];

const DRAWDOWN_ALERT_FACTOR = 0.2; // 25% o menos de la base cuando hay racha negativa / drawdown alto
const DRAWDOWN_ALERT_BUFFER_PCT = 30; // si el buffer general cae por debajo de esto, se considera "drawdown alto"

/** Determina si la cuenta está en zona de racha negativa / drawdown alto. */
function isHighDrawdownZone(snapshot) {
  return snapshot.bufferGeneralPct <= DRAWDOWN_ALERT_BUFFER_PCT || snapshot.bufferDiarioPct <= DRAWDOWN_ALERT_BUFFER_PCT;
}

/** Factor de progreso según el % de avance hacia el target. */
function progressFactor(progresoPct) {
  const tier = PROGRESS_THRESHOLDS.find((t) => progresoPct <= t.max) || PROGRESS_THRESHOLDS[PROGRESS_THRESHOLDS.length - 1];
  return tier;
}

/**
 * Calcula el riesgo sugerido (en %) para la siguiente operación según
 * el modo de gestión activo, el riesgo base configurado y el snapshot
 * de la cuenta (progreso, buffers, racha).
 *
 * Devuelve { riskPct, factor, reason, isProtectionMode }
 */
export function suggestRisk({ mode, riskBasePct, snapshot, lastTradesResults = [] }) {
  const highDrawdown = isHighDrawdownZone(snapshot);
  const lastWasLoss = lastTradesResults.length > 0 && lastTradesResults[lastTradesResults.length - 1] === "loss";
  const lossStreak = countTrailingLosses(lastTradesResults);

  switch (mode) {
    case "static": {
      return {
        riskPct: riskBasePct,
        factor: 1,
        isProtectionMode: highDrawdown,
        reason: highDrawdown
          ? "Modo estático: el riesgo no cambia automáticamente, pero la cuenta está cerca de un límite. Evalúa bajar manualmente."
          : "Modo estático: se mantiene el riesgo base configurado durante toda la cuenta.",
      };
    }

    case "conservative": {
      const tier = progressFactor(snapshot.progresoPct);
      let factor = Math.min(tier.factor, 0.75); // el conservador nunca usa el 100% de la base
      if (highDrawdown) factor = Math.min(factor, DRAWDOWN_ALERT_FACTOR);
      return {
        riskPct: riskBasePct * factor,
        factor,
        isProtectionMode: highDrawdown,
        reason: highDrawdown
          ? "Conservador + buffer bajo: riesgo reducido al mínimo para proteger la cuenta."
          : `Conservador: ${tier.note}`,
      };
    }

    case "dynamic": {
      const tier = progressFactor(snapshot.progresoPct);
      let factor = tier.factor;
      if (lastWasLoss) factor = Math.min(factor, 0.75); // nunca sube tras una pérdida
      if (lossStreak >= 2) factor = Math.min(factor, 0.5);
      if (highDrawdown) factor = Math.min(factor, DRAWDOWN_ALERT_FACTOR);
      return {
        riskPct: riskBasePct * factor,
        factor,
        isProtectionMode: highDrawdown,
        reason: highDrawdown
          ? "Dinámico: buffer crítico detectado, riesgo llevado al mínimo de protección."
          : lossStreak >= 2
          ? `Dinámico: racha de ${lossStreak} pérdidas consecutivas, riesgo reducido.`
          : `Dinámico: ${tier.note}`,
      };
    }

    case "recovery": {
      // Recuperación: riesgo mínimo matemáticamente razonable, nunca aumenta para "vengarse" de la pérdida.
      const factor = highDrawdown ? DRAWDOWN_ALERT_FACTOR * 0.75 : 0.35;
      return {
        riskPct: riskBasePct * factor,
        factor,
        isProtectionMode: true,
        reason: "Recuperación: riesgo mínimo mientras se reconstruye el colchón antes de volver al plan normal.",
      };
    }

    default:
      return { riskPct: riskBasePct, factor: 1, isProtectionMode: false, reason: "Modo no reconocido, se usa riesgo base." };
  }
}

function countTrailingLosses(results) {
  let count = 0;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] === "loss") count++;
    else break;
  }
  return count;
}

/** Construye el array de resultados ("win"/"loss") en orden cronológico a partir de trades. */
export function resultsSequence(trades) {
  return [...trades]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((t) => (Number(t.pnl) >= 0 ? "win" : "loss"));
}
