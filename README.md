# App Fondeo · Trading Pro Lab

App web para gestionar y simular cuentas de fondeo (prop firm), construida con HTML/CSS/JavaScript vanilla, Firebase (Auth + Firestore) y Chart.js. Mismo patrón de arquitectura que **Journal del Rey**: sitio estático en GitHub Pages, sin backend propio, con control de acceso por whitelist desde un panel admin.

---

## 1. Estructura del proyecto

```
fondeo-app/
├── index.html          → Login / registro
├── dashboard.html       → Listado de cuentas + wizard de creación
├── cuenta.html           → Dashboard de una cuenta individual (journal, gráficas, calendario, riesgo, settings)
├── simulador.html        → Simulador previo a la compra (Monte Carlo)
├── admin.html             → Panel de whitelist y roles (solo admin)
├── css/
│   ├── tokens.css        → Colores, tipografía, espaciado (fuente única de verdad)
│   ├── base.css           → Reset + utilidades globales
│   ├── components.css     → Botones, cards, badges, modales, tablas, etc.
│   └── pages.css           → Layout específico de cada pantalla
└── js/
    ├── firebase-config.js  → Credenciales de Firebase (EDITAR antes de desplegar)
    ├── utils.js              → Formato de moneda/fecha/porcentaje
    ├── calculations.js        → Motor de cálculo (target, buffers, expectancy...)
    ├── risk-modes.js            → Modos de gestión de riesgo + umbrales dinámicos
    ├── simulator.js               → Simulación Monte Carlo + proyección determinista
    ├── auth.js                      → Login/registro/whitelist + guard de sesión
    ├── store.js                       → Toda la lectura/escritura a Firestore
    ├── ui.js                            → Toasts, modales, tema oscuro/claro, nav móvil
    ├── charts.js                          → Wrappers de Chart.js
    ├── calendar.js                          → Calendario mensual con P&L
    ├── auth-page.js                           → Lógica de index.html
    ├── dashboard.js                             → Lógica de dashboard.html
    ├── cuenta.js                                  → Lógica de cuenta.html
    ├── simulador.js                                 → Lógica de simulador.html
    └── admin.js                                       → Lógica de admin.html
```

No falta ningún archivo: estas son todas las piezas necesarias para que la app funcione completa. No hay nada que borrar.

---

## 2. Configurar Firebase (antes de subir a GitHub)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto nuevo (puede llamarse `fondeatetpl` o como prefieras).
2. **Authentication** → método **Correo/contraseña** → activarlo.
3. **Firestore Database** → crear base de datos en **modo producción** (las reglas de seguridad del paso 4 son las que de verdad protegen los datos).
4. **Configuración del proyecto** → **Tus apps** → ícono web (`</>`) → registra la app → copia el objeto `firebaseConfig`.
5. Abre `js/firebase-config.js` y reemplaza los valores `TU_API_KEY`, `TU_PROYECTO`, etc. con los reales.
6. En el mismo archivo, cambia `ADMIN_EMAIL` por tu correo real. Ese correo queda **auto-aprobado y con rol admin** apenas se registre, así no dependes de nadie más para entrar al panel admin la primera vez.

---

## 3. Reglas de seguridad de Firestore (obligatorio)

Pega esto en **Firestore Database → Reglas**, reemplazando lo que haya por defecto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }
    function isApproved() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.approved == true;
    }
    function isAdmin() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
    }

    match /users/{userId} {
      allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());
      allow create: if isSignedIn() && request.auth.uid == userId;
      allow update: if isAdmin();
    }

    match /accounts/{accountId} {
      allow read, update, delete: if isApproved() && resource.data.userId == request.auth.uid;
      allow create: if isApproved() && request.resource.data.userId == request.auth.uid;
    }

    match /trades/{tradeId} {
      allow read, update, delete: if isApproved() &&
        get(/databases/$(database)/documents/accounts/$(resource.data.accountId)).data.userId == request.auth.uid;
      allow create: if isApproved() &&
        get(/databases/$(database)/documents/accounts/$(request.resource.data.accountId)).data.userId == request.auth.uid;
    }
  }
}
```

Esto garantiza que cada usuario solo pueda leer y escribir sus propias cuentas y operaciones, que nadie pueda aprobarse a sí mismo, y que solo el admin pueda cambiar `approved`/`role` en `users`.

---

## 4. Subir a GitHub Pages (repo `fondeatetpl`)

```bash
cd fondeo-app
git init
git add .
git commit -m "App Fondeo Trading Pro Lab — versión inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/fondeatetpl.git
git push -u origin main
```

Luego en GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)** → Save.

La app quedará publicada en algo como `https://TU_USUARIO.github.io/fondeatetpl/`.

---

## 5. Primer uso

1. Entra a la URL publicada, da clic en **Regístrate** y crea tu cuenta con el correo que pusiste en `ADMIN_EMAIL`. Quedas aprobado automáticamente y verás el link **Panel admin** en el menú lateral.
2. Desde ahí, cuando tus estudiantes se registren, podrás aprobarlos (switch ON) y, si quieres, darles rol admin (no recomendado salvo casos especiales).
3. Crea tu primera cuenta de fondeo desde **Mis cuentas → + Nueva cuenta** y empieza a registrar operaciones.

---

## 6. Decisiones de arquitectura y simplificaciones vs. el PRD

El PRD sugiere un modelo de datos con colecciones separadas (`phases`, `metrics_snapshots`, etc.) marcándolo explícitamente como "puede" (sugerencia, no obligación). Para mantener la app dentro del tier gratuito de Firestore y reducir lecturas, se tomaron estas decisiones:

- **Fases embebidas dentro del documento de la cuenta** (`accounts/{id}.phases[]`) en vez de una colección `phases` separada. Esto evita una lectura extra por cada fase y simplifica el ciclo de vida (avanzar de fase es una sola escritura).
- **Sin colección `metrics_snapshots`**: todas las métricas (balance, drawdown, buffers, expectancy, progreso) se calculan en tiempo real en el cliente a partir de `account` + `trades`, vía `calculations.js`. Esto cumple el requisito del PRD de "recalculo en tiempo real" sin necesidad de mantener snapshots sincronizados.
- **`trades` sí es una colección independiente** (no embebida), porque puede crecer indefinidamente y necesita consultas/ordenamiento eficientes por fecha.

### Supuestos del simulador (`js/simulator.js`)

- El **daily loss** y el **max loss** se calculan como porcentaje fijo del **capital inicial** de la fase (no sobre balance/equity dinámico día a día). Es la forma estándar en que la mayoría de empresas de fondeo define estos límites, y es razonable para una proyección *previa a operar*.
- El **drawdown** puede ser `static` (medido desde el capital inicial) o `trailing` (medido desde el balance pico alcanzado).
- El simulador **reutiliza la misma lógica de `risk-modes.js`** que usa el motor en vivo (`cuenta.js`), para que la proyección y el comportamiento real de la cuenta nunca diverjan.
- Los resultados siempre se muestran como **probabilidad y rango** (nunca un número único), tal como exige el PRD.

---

## 7. Mantenimiento

Todo el cálculo matemático vive en `calculations.js`, `risk-modes.js` y `simulator.js` — son funciones puras, sin DOM ni Firebase, así que se pueden testear o ajustar sin tocar el resto de la app. Si en algún momento cambias una fórmula, ese es el único lugar donde hay que tocar código.
