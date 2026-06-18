// ============================================================
// utils.js — Helpers de formato y utilidades generales
// Sin dependencias de Firebase. Reutilizable en toda la app.
// ============================================================

/** Formatea un número como moneda. Por defecto USD, sin decimales si es entero. */
export function formatMoney(value, currency = "USD") {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/** Formatea un número 0-1 o un porcentaje ya calculado (0-100) como "12.3%". */
export function formatPercent(value, { fromRatio = false, decimals = 1 } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const pct = fromRatio ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

/** Clamp numérico simple. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Genera un id corto único (suficiente para uso de cliente, no criptográfico). */
export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Formatea una fecha (Date o timestamp) como "DD MMM YYYY". */
export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

/** Formatea fecha y hora corta. */
export function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${formatDate(d)} · ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Devuelve la clave "YYYY-MM-DD" en horario local, usada para agrupar por día. */
export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Agrupa un array de trades por día (clave dayKey) sumando el pnl. */
export function groupPnlByDay(trades) {
  const map = new Map();
  for (const t of trades) {
    const key = dayKey(t.date);
    map.set(key, (map.get(key) || 0) + Number(t.pnl || 0));
  }
  return map;
}

/** Debounce simple para inputs de búsqueda/filtros. */
export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Lee un valor numérico de un input, devolviendo 0 si está vacío o inválido. */
export function numFromInput(el) {
  const v = parseFloat(el?.value);
  return Number.isFinite(v) ? v : 0;
}

/** Capitaliza la primera letra. */
export function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Mapea el estado de cuenta a la clase de badge correspondiente. */
export const STATUS_BADGE_CLASS = {
  draft: "badge-draft",
  active: "badge-active",
  in_progress: "badge-progress",
  passed: "badge-passed",
  failed: "badge-failed",
  archived: "badge-archived",
};

export const STATUS_LABEL = {
  draft: "Borrador",
  active: "Activa",
  in_progress: "En progreso",
  passed: "Pasada",
  failed: "Fallida",
  archived: "Archivada",
};
