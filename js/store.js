// ============================================================
// store.js — Capa de datos (Firestore)
// Modelo de datos (ver README.md para el detalle de colecciones):
//   users      -> perfil + whitelist (approved) + rol
//   accounts   -> cuentas de fondeo del trader (fases embebidas)
//   trades     -> journal de operaciones (accountId, phaseId, pnl...)
//
// Todas las funciones de escritura/lectura viven aquí. La UI nunca
// debe llamar a Firestore directamente: siempre pasa por store.js.
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uid } from "./utils.js";

const ACCOUNTS = "accounts";
const TRADES = "trades";
const USERS = "users";

/* ================= CUENTAS ================= */

/** Crea una cuenta nueva a partir de los datos del wizard (sección 4 del PRD). */
export async function createAccount(userId, data) {
  const phases = buildInitialPhases(data);
  const payload = {
    userId,
    name: data.name,
    company: data.company,
    type: data.type, // 'instant' | '1phase' | '2phase' | '3phase'
    capital: Number(data.capital),
    status: "active",
    currentPhaseIndex: 0,
    riskMode: data.riskMode || "static",
    riskBasePct: Number(data.riskBasePct),
    rr: Number(data.rr),
    autoMode: data.autoMode !== false,
    avgOpsPerDay: Number(data.avgOpsPerDay || 2),
    minDays: Number(data.minDays || 0),
    consistencyRule: data.consistencyRule || "",
    phases,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, ACCOUNTS), payload);
  return ref.id;
}

function buildInitialPhases(data) {
  const phaseCountMap = { instant: 1, "1phase": 1, "2phase": 2, "3phase": 3 };
  const totalPhases = phaseCountMap[data.type] || 1;
  const phases = [];
  for (let i = 0; i < totalPhases; i++) {
    phases.push({
      id: uid("phase"),
      phaseNumber: i + 1,
      targetPct: Number(data.targetPctByPhase?.[i] ?? data.targetPct ?? 8),
      dailyLossPct: data.dailyLossPct !== "" ? Number(data.dailyLossPct) : null,
      dailyLossAmount: data.dailyLossAmount ? Number(data.dailyLossAmount) : null,
      maxLossPct: data.maxLossPct !== "" ? Number(data.maxLossPct) : null,
      maxLossAmount: data.maxLossAmount ? Number(data.maxLossAmount) : null,
      drawdownType: data.drawdownType || "static", // static | trailing | daily_balance | daily_equity
      status: i === 0 ? "in_progress" : "pending",
    });
  }
  return phases;
}

/** Lectura en tiempo real de todas las cuentas de un usuario. */
export function watchAccounts(userId, callback) {
  const q = query(collection(db, ACCOUNTS), where("userId", "==", userId));
  return onSnapshot(q, (snap) => {
    const accounts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(accounts);
  });
}

export async function getAccount(accountId) {
  const snap = await getDoc(doc(db, ACCOUNTS, accountId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchAccount(accountId, callback) {
  return onSnapshot(doc(db, ACCOUNTS, accountId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function updateAccount(accountId, patch) {
  await updateDoc(doc(db, ACCOUNTS, accountId), { ...patch, updatedAt: serverTimestamp() });
}

export async function setAccountStatus(accountId, status) {
  await updateAccount(accountId, { status });
}

export async function deleteAccount(accountId) {
  await deleteDoc(doc(db, ACCOUNTS, accountId));
  // Nota: las operaciones asociadas en /trades quedan huérfanas por accountId.
  // Si se quiere borrado en cascada real, mover esta lógica a una Cloud Function.
}

export async function duplicateAccount(account) {
  const { id, createdAt, updatedAt, ...rest } = account;
  const ref = await addDoc(collection(db, ACCOUNTS), {
    ...rest,
    name: `${account.name} (copia)`,
    status: "draft",
    currentPhaseIndex: 0,
    phases: rest.phases.map((p) => ({ ...p, status: p.phaseNumber === 1 ? "in_progress" : "pending" })),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Avanza la cuenta a la siguiente fase (sección 23: ciclo de vida por fases). */
export async function advancePhase(account) {
  const idx = account.currentPhaseIndex;
  const phases = [...account.phases];
  phases[idx] = { ...phases[idx], status: "completed" };

  const isLastPhase = idx === phases.length - 1;
  if (isLastPhase) {
    await updateAccount(account.id, { phases, status: "passed" });
    return;
  }
  phases[idx + 1] = { ...phases[idx + 1], status: "in_progress" };
  await updateAccount(account.id, { phases, currentPhaseIndex: idx + 1, status: "in_progress" });
}

export async function markPhaseFailed(account, reason) {
  const idx = account.currentPhaseIndex;
  const phases = [...account.phases];
  phases[idx] = { ...phases[idx], status: "failed", failReason: reason };
  await updateAccount(account.id, { phases, status: "failed" });
}

/* ================= TRADES (JOURNAL) ================= */

/** Registra una operación. Mínimo indispensable según sección 9 del PRD. */
export async function addTrade({ accountId, phaseId, pnl, date, note }) {
  const payload = {
    accountId,
    phaseId,
    result: Number(pnl) >= 0 ? "win" : "loss",
    pnl: Number(pnl),
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    note: note || "",
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, TRADES), payload);
  return ref.id;
}

export async function updateTrade(tradeId, patch) {
  await updateDoc(doc(db, TRADES, tradeId), patch);
}

export async function deleteTrade(tradeId) {
  await deleteDoc(doc(db, TRADES, tradeId));
}

/**
 * Lectura en tiempo real de las operaciones de una cuenta, ordenadas por fecha.
 * Nota: el orden se aplica aquí en el cliente (en vez de usar orderBy() en la
 * consulta) a propósito, para no depender de un índice compuesto de Firestore
 * (where + orderBy en campos distintos lo requiere) y evitar que la lectura
 * falle silenciosamente si ese índice no existe.
 */
export function watchTrades(accountId, callback) {
  const q = query(collection(db, TRADES), where("accountId", "==", accountId));
  return onSnapshot(
    q,
    (snap) => {
      const trades = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      trades.sort((a, b) => new Date(a.date) - new Date(b.date));
      callback(trades);
    },
    (error) => {
      console.error("Error leyendo trades:", error);
    }
  );
}

/* ================= ADMIN / WHITELIST ================= */

export function watchAllUsers(callback) {
  return onSnapshot(collection(db, USERS), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function setUserApproval(uidToApprove, approved) {
  await updateDoc(doc(db, USERS, uidToApprove), { approved });
}

export async function setUserRole(uidToUpdate, role) {
  await updateDoc(doc(db, USERS, uidToUpdate), { role });
}
