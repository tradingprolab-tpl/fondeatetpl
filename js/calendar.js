// ============================================================
// calendar.js — Calendario mensual con P&L diario (sección 10 del PRD)
// ============================================================

import { groupPnlByDay, formatMoney, dayKey } from "./utils.js";

const DOW_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

/**
 * Pinta el calendario del mes (year, monthIndex 0-11) dentro de containerEl.
 * trades: array completo de la cuenta (se filtra internamente por mes).
 */
export function renderCalendar(containerEl, { year, month, trades }) {
  const pnlByDay = groupPnlByDay(trades);
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(new Date());

  let html = `<div class="calendar-grid">`;
  DOW_LABELS.forEach((d) => (html += `<div class="calendar-dow">${d}</div>`));

  for (let i = 0; i < startOffset; i++) html += `<div class="calendar-day is-empty"></div>`;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = dayKey(date);
    const pnl = pnlByDay.get(key);
    const hasTrades = pnl !== undefined;
    const cls = ["calendar-day"];
    if (hasTrades) cls.push(pnl >= 0 ? "is-positive" : "is-negative");
    if (key === todayKey) cls.push("is-today");

    html += `
      <div class="${cls.join(" ")}" data-tooltip="${hasTrades ? formatMoney(pnl) : "Sin operaciones"}">
        <span class="day-num">${day}</span>
        ${hasTrades ? `<span class="day-pnl">${pnl >= 0 ? "+" : ""}${Math.round(pnl)}</span>` : ""}
      </div>`;
  }

  html += `</div>`;
  containerEl.innerHTML = html;
}

/** Devuelve { year, month } del mes siguiente/anterior dado uno actual. */
export function shiftMonth(year, month, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}
