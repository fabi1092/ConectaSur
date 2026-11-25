# ConectaSur

Plataforma de **SurCode** que conecta a emprendedoras locales de Puerto Montt y Alerce con compradores mediante una aplicación Android en Kotlin/Views y una aplicación web publicada en Firebase Hosting.

- **Sitio público:** [https://conectasur-dev.web.app](https://conectasur-dev.web.app)
- **Backend activo:** Supabase (PostgreSQL con RLS/RPC, Auth y Storage), complementado con Firebase Authentication (Google Sign-In de compradores) y Firebase Cloud Messaging (notificaciones push).

---

## Requisitos previos

Para ejecutar el proyecto completo desde cero en local:

- **Git**
- **Node.js 22 o superior** (recomendado **24.12.0+**, declarado en `web/package.json` y `supabase/package.json`)
- **JDK 21** (incluido en Android Studio como `jbr`)
- **Android Studio / Android SDK** con `compileSdk 36`, `Build Tools 36.0.0` y soporte mínimo `API 26` (Android 8.0)

---

## 1. Clonar el repositorio

```sh
git clone https://github.com/fabi1092/ConectaSur.git
cd ConectaSur
```

---

## 2. Ejecutar la aplicación web (`web/`)

### 2.1 Instalar dependencias y configurar entorno
En Linux/macOS (`bash`):

```sh
npm --prefix web ci
cp web/supabase-config.example.js web/supabase-config.js
```

En Windows PowerShell:

```powershell
npm --prefix web ci
Copy-Item web\supabase-config.example.js web\supabase-config.js
```

Edita `web/supabase-config.js` con la **URL pública** y la **clave `anon`** de tu instancia Supabase (y opcionalmente los datos públicos web de Firebase para acceso con Google). Nunca coloques `service_role` ni contraseñas en este archivo.

### 2.2 Levantar servidor local y compilar

```sh
# Desarrollo local con Vite
npm --prefix web run dev

# Compilar versión estática en web/dist/
npm --prefix web run build

# Previsualizar versión compilada
npm --prefix web run preview
```

### 2.3 Publicar en Firebase Hosting (`--only hosting`)

```sh
npx firebase-tools login
npx firebase-tools deploy --only hosting --project conectasur-dev --config firebase.hosting.json
```

La web incluye:
- Vitrina pública sin sesión (`#inicio`, `#productos`, `#tiendas`, `#asociaciones`, `#ferias`, `#privacidad`), fichas `#tienda/<id>`, `#producto/<id>`, `#asociacion/<id>`, `#feria/<id>`.
- Acceso único (`#ingresar`), recuperación de contraseña (`#recuperar`), registro de comprador (`#registro`), panel de emprendedora (`Resumen`, `Mis productos`, `Mis ventas`, `Editar tienda`) y panel administrativo (`Emprendedoras`, `Asociaciones`, `Ferias y Acceso`, `Administradores`, `Bitácora` y `Catálogo base`).

---

## 3. Ejecutar la aplicación Android (`android/`)

### 3.1 Opción A — Modo demostración local (sin backend ni credenciales)
Compila e instala la app con datos de ejemplo integrados usando `-PconectaDemo=true`:

En Windows PowerShell (desde `android/`):

```powershell
Set-Location android
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat -PconectaDemo=true assembleDebug
```

En Linux/macOS (`bash`):

```sh
cd android
./gradlew -PconectaDemo=true assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

### 3.2 Opción B — Modo conectado a Supabase / Firebase
Antes de compilar:
1. Copiar `android/supabase.properties.example` a `android/supabase.properties` y completar `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
2. (Opcional, para Google Sign-In) Copiar `android/firebase.properties.example` a `android/firebase.properties` con `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID` y `GOOGLE_WEB_CLIENT_ID`.
3. (Opcional, para notificaciones FCM) Colocar `android/app/google-services.json` de tu proyecto Firebase y registrar las huellas `SHA-1` / `SHA-256` del certificado en Firebase Console.

Luego abrir la carpeta `android/` en **Android Studio** (o ejecutar `.\gradlew.bat assembleDebug` / `.\gradlew.bat installDebug`).

### 3.3 APK `release` firmado (`A01`)
1. Copiar `android/keystore.properties.example` a `android/keystore.properties` y completar ruta del almacén `.jks`, alias y contraseñas de firma locales.
2. Ejecutar desde `android/`:

```powershell
.\gradlew.bat assembleRelease
```

El artefacto firmado queda en `android/app/build/outputs/apk/release/app-release.apk`.

---

## 4. Ejecutar pruebas y verificaciones automatizadas (sin credenciales)

### 4.1 Pruebas de reglas y políticas RLS/RPC en Supabase (`C04`)
Instala dependencias y ejecuta en local todas las migraciones (`001`–`015`) desde cero usando **PGlite** en memoria (no requiere instalar PostgreSQL ni conectar a la nube):

```sh
npm --prefix supabase ci
npm --prefix supabase test
```

En CI, la suite completa (incluida la prueba de ventas concurrentes) corre también contra PostgreSQL 15 mediante `npm --prefix supabase run test:postgres`.

### 4.2 Pruebas unitarias y análisis estático Android

```powershell
Set-Location android
.\gradlew.bat testDebugUnitTest lintDebug
```

Pruebas instrumentadas locales en modo demo (con emulador o dispositivo conectado por `adb`):

```powershell
.\gradlew.bat -PconectaDemo=true connectedDebugAndroidTest
```

### 4.3 Pruebas de modelos y seguridad web (Node 22+)

```sh
node --test security/entrepreneur-account-data.test.mjs security/parte2-web-google.test.mjs security/firebase-buyer-session.test.mjs supabase/test/dashboard-model.test.js supabase/test/read-retry.test.js supabase/test/sales-model.test.js
```

---

## 5. Manejo seguro de credenciales

Los siguientes archivos contienen configuración local o secretos y permanecen excluidos en `.gitignore`:

- `web/supabase-config.js`
- `android/supabase.properties`
- `android/firebase.properties`
- `android/keystore.properties` y archivos `*.jks` / `*.keystore`
- `android/app/google-services.json`

Las contraseñas administrativas y `service_role` nunca se incluyen en los clientes ni en Git.

---

## 6. Documentación de cierre — Entrega 8

- [Guión de demostración, cuentas de prueba y cierre APK (Benjamín)](docs/benjamin/entrega-8-cierre-y-guion.md)
- [Pruebas Android, casos de prueba y matriz final de requisitos (Fabián)](docs/fabian/pruebas-android-matriz-requisitos.md)
- [Informe de seguridad y verificación de Entrega 8 (Felipe)](docs/felipe/entrega-8-seguridad.md)
- [Manual breve de la emprendedora](docs/Alonso/manual-emprendedora.md)
- [Manual breve del administrador](docs/Alonso/manual-administrador.md)
- [Diseño de módulo de IA desacoplado (`RNF-MAN-02`)](docs/Alonso/modulo-ia-desacoplado.md)
- [Modelo de datos y permisos Supabase](docs/felipe/modelo-datos.md)
- [Publicación web en Firebase Hosting](docs/publicacion-web.md)
- [Despliegue en Coolify (`bigboy-vcm`)](docs/despliegue-coolify.md)
