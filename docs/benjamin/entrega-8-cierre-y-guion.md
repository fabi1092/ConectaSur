# Cierre de Entrega 8 — APK firmado, cuentas de prueba y guión del jurado

**SurCode / ConectaSur · 24 de noviembre de 2026 · Responsable: Benjamín.**

Este documento consolida los entregables de cierre correspondientes a **Benjamín** (`A01`, `A07`, `C01`, `C02`) junto con el guión ordenado para la demostración final y el checklist previo al miércoles 25.

---

## 1. APK `release` firmado e instalable (`A01`)

- **Paquete:** `cl.surcode.conectasur`
- **Versión:** `1.0.0` (`versionCode 8`)
- **Compatibilidad declarada:** `minSdkVersion = 26` (Android 8.0 Oreo) hasta `targetSdkVersion = 36` (Android 16)
- **Compilación no depurable:** `debuggable = false` (`application-debuggable` ausente en `aapt2 dump badging`)
- **Esquemas de firma verificados (`apksigner`):** `APK Signature Scheme v2` y `APK Signature Scheme v3` (`Verifies`, compatibles desde Android 7.0 / API 24+, cubriendo el mínimo definido API 26).
- **Configuración segura:** [android/app/build.gradle.kts](../../android/app/build.gradle.kts) lee la firma desde `android/keystore.properties` (ignorado por Git en [.gitignore](../../.gitignore)). Plantilla sin secretos en [android/keystore.properties.example](../../android/keystore.properties.example). El almacén `.jks` y las contraseñas nunca se suben al repositorio.

### Datos del artefacto generado en la compilación actual
- **Tamaño del binario (`app-release.apk`):** `7 117 187` bytes
- **SHA-256 del archivo APK:** `9E6BFAEB248066F7B1A182E7762769E9B254148E539BA640A6079890C24E3FFF`
- **Certificado firmante:** `CN=ConectaSur SurCode, OU=Desarrollo, O=SurCode, L=Puerto Montt, ST=Los Lagos, C=CL` (`RSA 2048`)
- **Huella SHA-1 del certificado:** `4C:3E:B3:2A:B8:5F:33:9B:C5:88:67:35:F0:79:51:BA:59:3E:65:0D`
- **Huella SHA-256 del certificado:** `BD:26:87:47:04:E2:13:AF:A1:35:EB:DB:DA:BE:0B:17:27:D4:A0:1C:A6:61:36:96:04:0B:E6:FB:57:5F:3D:5B`

> **Importante antes de probar Google Sign-In en `release`:** registrar las huellas `SHA-1` y `SHA-256` del certificado `release` en Firebase Console (`conectasur-dev` -> Configuración del proyecto -> App Android) y compartir el archivo `app-release.apk` + su `SHA-256` con Felipe para su verificación en el informe (`C05`).

---

## 2. Validación de seguimiento y push en vivo (`A07`)

Antes de la demostración en el teléfono con el APK `release` instalado:

1. Iniciar el servicio de envío push en el computador de demo (fuera del repositorio, con `FCM_SERVICE_ACCOUNT_FILE` y credenciales locales):
   ```powershell
   & "$env:USERPROFILE\.codex\secrets\iniciar-push-conectasur.ps1"
   ```
2. En el teléfono (APK `release`):
   - Abrir la app sin sesión -> tocar `Seguir tienda` (o `Seguir asociación`) -> iniciar sesión con Google -> verificar que al volver queda siguiendo sin repetir la acción.
   - Ir a `Avisos y tiendas seguidas` -> `Activar avisos con mi permiso` -> otorgar consentimiento explícito y permiso `POST_NOTIFICATIONS` de Android.
   - Desde la web administrativa (`https://conectasur-dev.web.app`) o desde la app emprendedora, confirmar participación de esa tienda/asociación en una feria publicada -> comprobar llegada de la notificación push con el nombre de la feria.
   - Verificar también `Dejar de seguir` y `Darse de baja` de notificaciones.

---

## 3. Etiqueta de cierre y commit de demostración (`C01`)

La etiqueta `entrega-8` debe crearse **exclusivamente al final**, una vez que todas las ramas/PRs pendientes del equipo (Kisho, Dan, Alonso, Fabián y Felipe) estén integradas en `main`, la web desplegada en Firebase Hosting y el APK `release` final recompilado sobre ese commit:

```powershell
git pull --ff-only origin main
git tag -a entrega-8 -m "Entrega 8: producto terminado"
git push origin entrega-8
```

---

## 4. Cuentas de prueba y preparación de datos (`C02`)

Las contraseñas reales **no se guardan en Git**. En el equipo de desarrollo autorizado se consultan localmente ejecutando `.\supabase\tools\local-access.ps1 -Action accounts`, y se llevan en un apunte privado el día de la evaluación.

| Rol en la demo | Cuenta / Acceso | Uso principal ante el jurado |
|---|---|---|
| Administrador web | `admin@demo.conectasur.cl` | Bitácora (`W08`), ferias (`W03`), recuperación, gestión de admins (`W07`) |
| Emprendedora 1 (Android / Web) | `ana@demo.conectasur.cl` | Catálogo, ventas, horario de avisos, calificaciones, ferias (`A02–A06`, `W04`) |
| Emprendedora 2 (Android) | `bea@demo.conectasur.cl` | Segunda tienda confirmada, rechazo o invitación de feria |
| Comprador Android | Cuenta Google personal en el teléfono | Seguir tiendas/asociaciones, calificar con nombre, recibir push (`A07`) |
| Comprador Web | `comprador@demo.conectasur.cl` o Google Web | Vitrina pública, calendario de ferias, seguir y aviso web (`W05`) |
| Navegación anónima | Sin iniciar sesión (incógnito o visitante) | Exploración pública, política de privacidad y retorno tras login |

**Limpieza previa recomendada antes de entrar con el jurado:** revisar que en `public.fairs`, `public.shops` y `public.associations` no queden registros temporales de ensayo (por ejemplo nombres numéricos o de prueba rápida como `"1"` o `"dadad"`), dejando al menos una feria publicada de hoy con tiendas confirmadas y productos visibles, una feria futura y una feria en borrador.

---

## 5. Guión de demostración para el jurado (`C02`)

Duración sugerida: 15 a 20 minutos, siguiendo el flujo natural de visitante -> comprador -> emprendedora -> administrador -> seguridad:

1. **Web pública y vista móvil (`W02`, `W05`, `W09`):**
   - Abrir `https://conectasur-dev.web.app` sin sesión -> mostrar catálogo, tiendas, asociaciones, calendario de ferias y ficha de una feria con confirmadas y muestra pública.
   - Mostrar aviso/política de privacidad visible en web sin exponer datos privados (precios ocultos si `show_prices=false`, stock y correos privados ocultos).
   - Cambiar el navegador a ancho móvil (~390px) y mostrar diseño legible sin desbordes.
2. **Web emprendedora (`W04`) y administrador (`W01`, `W03`, `W06–W08`, `W11`):**
   - Ingresar como emprendedora en web y mostrar operación de tienda/productos/ventas.
   - Ingresar como administrador: gestionar cuentas administradoras (`W07`), probar flujo de recuperación (`W06`), publicar/invitar/confirmar ferias (`W03`), revisar bitácora administrativa con actor/acción/fecha (`W08`) y textos en `es-CL` (`W11`).
3. **App Android `release` (`A01–A10`):**
   - Mostrar APK `release` instalado (`debuggable=false`, `minSdk 26`), tamaño de letra grande (`A08`), español chileno (`A10`), modo sin conexión / corte de red sin pérdida de borradores (`A09`).
   - Emprendedora (`A02–A06`): acceso, edición de tienda, productos, ventas con sugerencia de feria y calendario/confirmación.
   - Comprador con Google (`A07`): seguir tienda y asociación, activar avisos con consentimiento, confirmar feria y mostrar llegada del push con `fcm-worker.mjs` en vivo, luego dejar de seguir / darse de baja.
4. **Seguridad y cierre documental (`A11`, `C01–C13`):**
   - Ejecutar `npm --prefix supabase test` (pruebas RLS/RPC locales reproducibles, `C04`).
   - Mostrar informe de seguridad actualizado (`C05–C06`), auditorías `npm audit`, evidencia de App Check (`A11`), manuales con prueba ajena (`W10`, `C03`, `C12`), diseño de módulo IA (`C13`), casos y matriz de requisitos (`C07–C10`), `README.md` (`C11`) y etiqueta `entrega-8` (`C01`).

---

## 6. Estado de pendientes antes del miércoles 25

| Responsable | Tareas asignadas | Estado en `main` | Acción siguiente |
|---|---|---|---|
| **Benjamín** (`A01`, `A07`, `C01–C02`) | APK firmado, push en vivo, guión, integración final y tag `entrega-8` | **Parcial listo:** `A01` (APK `release` `9E6BFAEB...24E3FFF` verificado) y `C02` (guión y cuentas documentados) | Validar `A07` push en vivo en el teléfono, esperar integraciones de `Dan` y `Fabián` y crear tag `entrega-8` (`C01`) al cierre |
| **Felipe** (`A11`, `C04–C06`) | Pruebas RLS, informe de seguridad, MobSF release y App Check | **Actualizado (`3e7c06b`):** `105/106` PGlite, `46/46` web, OSV sin avisos y verificación `apksigner` del APK definitivo en `docs/felipe/entrega-8-seguridad.md` | Documentado límite de `A11` en Supabase del curso y pendiente de MobSF `release` (`C05`) sin Docker local |
| **Kisho** (`W01`, `W03`, `W06–W08`, `W11`) | Visor de bitácora web, verificación admin y despliegue final | **Integrado y publicado (`ff09503`):** bitácora administrativa (`W08`) y errores `es-CL` (`W11`) vivos en `https://conectasur-dev.web.app` | Dejar respaldo de logs en caso de consulta por SMTP externo en `W06` |
| **Dan** (`W02`, `W04–W05`, `W09`, `C11`) | Privacidad en web, validación móvil/vitrina/emprendedora y `README.md` | **Integrado y publicado en `main`:** aviso `#privacidad` en pie de página y acceso web (`W09`) vivo en `https://conectasur-dev.web.app` y [README.md](../../README.md) actualizado desde cero (`C11`) | Probar vista móvil (`~390px`) y vitrina en vivo durante la demostración (`W02`, `W04–W05`) |
| **Alonso** (`W10`, `C03`, `C12`, `C13`) | Manuales breves, prueba con tercero y documento módulo IA | **Documentación en `main`:** [manual-emprendedora.md](../Alonso/manual-emprendedora.md), [manual-administrador.md](../Alonso/manual-administrador.md) y [modulo-ia-desacoplado.md](../Alonso/modulo-ia-desacoplado.md) | Ejecutar validación práctica de `W10` en sala con persona ajena al grupo siguiendo el manual |
| **Fabián** (`A02–A06`, `A08–A10`, `C07–C10`) | Pruebas Android, casos de prueba y matriz final de requisitos | **Integrado en `main`:** `EntregaFinalRequirementsTest` (119 pruebas unitarias en 15 suites, `0` errores de Lint) y [pruebas-android-matriz-requisitos.md](../fabian/pruebas-android-matriz-requisitos.md) | Ejecutar recorrido físico en teléfono con el APK `release` durante la demo ante el jurado (sección 1.2) |
