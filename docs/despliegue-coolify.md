# Despliegue en Coolify (`bigboy-vcm`)

Guía para desplegar en el servidor **Coolify** de Vinculación con el Medio (`https://coolifybb.codepulse.cl`, equipo **VcM**, servidor **bigboy-vcm**, proyecto **ConectaSur**) la aplicación web (`web/`) y el servicio continuo de notificaciones push (`supabase/tools/fcm-worker.mjs`), sin almacenar claves ni secretos en Git.

---

## 1. Preparación previa en Coolify

1. Ingresa al panel de Coolify usando tu cuenta administradora y verifica arriba a la izquierda que estás dentro del equipo **`VcM`** (no `Root Team`).
2. Entra al proyecto **`ConectaSur`** y selecciona el servidor **`bigboy-vcm`**.
3. Enlaza el repositorio público **`https://github.com/fabi1092/ConectaSur`** en la rama **`main`**.

---

## 2. App 1 — Web ConectaSur (`conectasur-web`)

Crea un recurso **Public Repository** (o **Private Repository** con GitHub App/Deploy Key) dentro de **ConectaSur**:

- **Nombre sugerido:** `conectasur-web`
- **Build Pack:** `Dockerfile`
- **Base Directory:** `/web`
- **Dockerfile Location:** `/Dockerfile`
- **Ports Exposes:** `80`

### Variables de entorno (marcar **Available at Buildtime**)

Como Vite inyecta las variables públicas durante `npm run build`, debes activar **Buildtime** en todas las variables siguientes:

| Variable | Valor / origen |
|---|---|
| `VITE_SUPABASE_URL` | URL pública HTTPS de la instancia Supabase (`https://supabase-surcode.codepulse.cl`) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública `anon` entregada por el docente para clientes |
| `VITE_FIREBASE_API_KEY` | API key web pública de Firebase (`conectasur-dev`, opcional si usas Google) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio Auth de Firebase (`conectasur-dev.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | ID del proyecto Firebase (`conectasur-dev`) |
| `VITE_FIREBASE_APP_ID` | App ID web de Firebase (`conectasur-dev`) |

> Nunca agregues `service_role`, contraseñas de Studio ni secretos privados en las variables `VITE_*`.

### Dominio autorizado para Google Sign-In

Si despliegas la web con un dominio asignado por Coolify (distinto de `conectasur-dev.web.app`), agrégalo en **Firebase Console -> Authentication -> Settings -> Authorized domains** para que funcione **Continuar con Google** en `#ingresar`.

---

## 3. App 2 — Servicio continuo de notificaciones push (`conectasur-push-worker`)

Este contenedor ejecuta `node tools/fcm-worker.mjs watch` de forma continua para enviar notificaciones FCM apenas se publiquen avisos en Supabase, sin depender de un computador encendido.

Crea un segundo recurso dentro de **ConectaSur**:

- **Nombre sugerido:** `conectasur-push-worker`
- **Build Pack:** `Dockerfile`
- **Base Directory:** `/supabase`
- **Dockerfile Location:** `/Dockerfile.push-worker`
- **Dominio público:** dejar vacío (no expone puertos HTTP)

### Variables de entorno (solo Runtime, secretas en Coolify)

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | URL HTTPS de Supabase del grupo (`https://supabase-surcode.codepulse.cl`) |
| `SUPABASE_STUDIO_USER` | Usuario Basic Auth de Studio entregado al grupo |
| `SUPABASE_STUDIO_PASSWORD` | Contraseña Basic Auth de Studio entregada al grupo |
| `FCM_SERVICE_ACCOUNT_BASE64` | JSON de cuenta de servicio Firebase codificado en Base64 (o usa `FCM_SERVICE_ACCOUNT_JSON`) |
| `CONECTASUR_WEB_URL` | URL pública de la web (`https://conectasur-dev.web.app` o el dominio en Coolify) |
| `PUSH_INTERVAL_SECONDS` | Opcional: segundos entre pasadas (por defecto `5`) |

Para generar `FCM_SERVICE_ACCOUNT_BASE64` en Windows PowerShell desde el archivo JSON privado (fuera del repositorio) sin guardarlo en Git:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("RUTA\A\TU\firebase-adminsdk.json"))
```

---

## 4. Verificación tras desplegar

- **Web:** abrir el dominio configurado y revisar la vitrina pública (`#inicio`), `#ferias`, `#privacidad` y `#ingresar`.
- **Worker push:** abrir la pestaña **Logs** del servicio `conectasur-push-worker` en Coolify y comprobar que aparece `claves de Firebase al dia` y `Servicio push activo cada 5 s` sin errores de credenciales.
