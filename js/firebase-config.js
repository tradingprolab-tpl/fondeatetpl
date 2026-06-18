// ============================================================
// firebase-config.js — Configuración de Firebase
//
// 1) Crea un proyecto en https://console.firebase.google.com
// 2) Activa Authentication (método: Correo/contraseña).
// 3) Crea una base de datos Firestore (modo producción).
// 4) Pega aquí tus credenciales (Configuración del proyecto > Tus apps > Web).
//
// Este archivo es el ÚNICO lugar donde deberías pegar tus llaves.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAltKiRObF8gzJixqNwzFEnLnM_RHhQnEg",
  authDomain: "fondeatetpl.firebaseapp.com",
  projectId: "fondeatetpl",
  storageBucket: "fondeatetpl.firebasestorage.app",
  messagingSenderId: "834750370648",
  appId: "1:834750370648:web:4ded007bc4ed89819d0b2d",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Correo del administrador (acceso total al panel admin.html).
// Cámbialo por tu correo real antes de desplegar.
export const ADMIN_EMAIL = "tradingprolab@gmail.com";
