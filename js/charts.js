// ============================================================
// charts.js — Wrappers de Chart.js (sección 10 del PRD)
// Requiere que Chart.js esté cargado globalmente vía CDN en el HTML.
// ============================================================

import { groupPnlByDay, dayKey } from "./utils.js";

const palette = {
  orange: "#FF6726",
  gold: "#FFD700",
  success: "#1FB37A",
  danger: "#E0394A",
  grid: "rgba(255,255,255,0.06)",
  text: "rgba(245,244,241,0.64)",
};

const registry = new Map();

function destroyIfExists(canvasId) {
  if (registry.has(canvasId)) {
    registry.get(canvasId).destroy();
    registry.delete(canvasId);
  }
}

/** Gráfica lineal de balance/equity acumulado por trade. */
export function renderBalanceLineChart(canvasId, { capitalInicial, trades }) {
  destroyIfExists(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  let running = capitalInicial;
  const points = [{ x: "Inicio", y: running }];
  sorted.forEach((t, i) => {
    running += Number(t.pnl);
    points.push({ x: `#${i + 1}`, y: running });
  });

  const chart = new window.Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => p.x),
      datasets: [
        {
          label: "Balance",
          data: points.map((p) => p.y),
          borderColor: palette.orange,
          backgroundColor: "rgba(255,103,38,0.12)",
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    },
    options: baseLineOptions(),
  });
  registry.set(canvasId, chart);
}

/** Gráfica de barras de PnL (diario, semanal o mensual según los buckets recibidos). */
export function renderPnlBarChart(canvasId, { trades, granularity = "day" }) {
  destroyIfExists(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const buckets = bucketTrades(trades, granularity);
  const labels = [...buckets.keys()];
  const values = [...buckets.values()];

  const chart = new window.Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "PnL",
          data: values,
          backgroundColor: values.map((v) => (v >= 0 ? palette.success : palette.danger)),
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    },
    options: baseBarOptions(),
  });
  registry.set(canvasId, chart);
}

/** Gráfica de pastel de distribución ganadas/perdidas. */
export function renderWinLossPie(canvasId, { trades }) {
  destroyIfExists(canvasId);
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const wins = trades.filter((t) => Number(t.pnl) >= 0).length;
  const losses = trades.length - wins;

  const chart = new window.Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Ganadas", "Perdidas"],
      datasets: [
        {
          data: [wins, losses],
          backgroundColor: [palette.success, palette.danger],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: { position: "bottom", labels: { color: palette.text, font: { size: 11 } } },
      },
    },
  });
  registry.set(canvasId, chart);
}

function bucketTrades(trades, granularity) {
  const map = new Map();
  const byDay = groupPnlByDay(trades);

  if (granularity === "day") {
    for (const [key, val] of [...byDay.entries()].sort()) {
      map.set(formatShortDay(key), val);
    }
    return map;
  }

  // semana / mes: se agrupa a partir de las claves diarias ya calculadas
  for (const [key, val] of [...byDay.entries()].sort()) {
    const d = new Date(key);
    const bucketKey =
      granularity === "month"
        ? d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" })
        : `Sem ${getWeekNumber(d)}`;
    map.set(bucketKey, (map.get(bucketKey) || 0) + val);
  }
  return map;
}

function formatShortDay(key) {
  const d = new Date(key);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function getWeekNumber(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function baseLineOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: palette.grid }, ticks: { color: palette.text, font: { size: 10 }, maxTicksLimit: 8 } },
      y: { grid: { color: palette.grid }, ticks: { color: palette.text, font: { size: 10 } } },
    },
  };
}

function baseBarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: palette.text, font: { size: 10 }, maxTicksLimit: 10 } },
      y: { grid: { color: palette.grid }, ticks: { color: palette.text, font: { size: 10 } } },
    },
  };
}
