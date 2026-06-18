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
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Correo del administrador (acceso total al panel admin.html).
// Cámbialo por tu correo real antes de desplegar.
export const ADMIN_EMAIL = "admin@tradingprolab.com";
