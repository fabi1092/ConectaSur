# Seguridad — Entrega 8

**SurCode / ConectaSur · 24 de noviembre de 2026 · Responsable: Felipe Gallardo.**

## Alcance y resultado

Se revisó el producto vigente en `main`: app Android, web, servicios Supabase, migraciones 001–014, ferias, participantes, seguidores, avisos y ubicación de mapas. La app y la web usan Supabase para sus operaciones; Firebase se conserva para acceso Google de compradores y notificaciones. El cliente usa la clave pública anon y las políticas del servidor; no contiene `service_role` ni credenciales de Studio.

| Comprobación repetible | Resultado en este cierre | Alcance |
|---|---:|---|
| `npm --prefix supabase test` | 105 aprobadas, 0 fallidas, 1 omitida, de 106 | PGlite; aplica desde cero las 14 migraciones y prueba permisos/RLS/RPC, incluido ferias, mapas y seguidores. La prueba omitida comprueba concurrencia real entre conexiones y sí queda en el PostgreSQL 15 de CI. |
| Regresión de modelos y acceso web sin credenciales | 46 aprobadas, 0 fallidas | Autorización, OAuth/PKCE, Google, recuperación, reintentos y ventas. |
| `npm --prefix web audit --omit=dev --audit-level=moderate` | 0 vulnerabilidades conocidas | Dependencias de producción web, según el registro consultado el 24-11-2026. |
| `npm --prefix supabase audit --audit-level=moderate` | 0 vulnerabilidades conocidas | Dependencias de herramientas y pruebas, incluido PGlite, según el registro consultado el 24-11-2026. |
| Revisión de reglas y código activo | Se documentan controles y límites abajo | Revisión estática acotada; no es un pentest ni certificación legal. |

Para repetir en Windows PowerShell con Node 24.12 o superior:

```powershell
npm --prefix supabase ci
npm --prefix web ci
npm --prefix supabase test
npm --prefix web audit --omit=dev --audit-level=moderate
npm --prefix supabase audit --audit-level=moderate
node --test security/entrepreneur-account-data.test.mjs security/parte2-web-google.test.mjs security/firebase-buyer-session.test.mjs supabase/test/dashboard-model.test.js supabase/test/read-retry.test.js supabase/test/sales-model.test.js
```

La suite SQL construye una base efímera con el bootstrap de prueba y aplica todas las migraciones ordenadas. No se conecta a la instancia del curso. En CI, PostgreSQL 15 ejecuta la misma suite, incluida la prueba de operaciones simultáneas para conservar cobertura que PGlite no ofrece.

## Hallazgos y tratamiento

| ID | Gravedad | Hallazgo | Corrección, justificación o siguiente paso |
|---|---|---|---|
| E8-S01 | Alta, bloquea A11 | No existe Firebase App Check integrado a las llamadas Android/web que usan Supabase. La base Supabase no valida tokens App Check. Activarlo solo en Firebase no protegería RLS/RPC; CORS, `Origin` o la anon key tampoco demuestran que una petición venga del APK legítimo. | A11 **pendiente**. Requiere acordar con el profesor una puerta verificadora de atestación compatible con Supabase o el mecanismo equivalente y configurarlo/probarlo en la consola del proyecto. No se afirma control de origen ni se presenta Auth/RLS como atestación del cliente. Las cuentas/permisos mantienen sus límites de datos mientras tanto. |
| E8-S02 | Alta para distribución | El último MobSF guardado detectó `android:debuggable=true` en un APK debug. Ese análisis es del commit `6c3a3bb` (Ent. 5, v0.5.0, APK SHA-256 `8d7920ebb5090609b9658a8650a14bcb02ce470833eae5563f100f99527aed66`); **no representa el binario de Entrega 8**. | El artefacto es de desarrollo y no se debe distribuir como versión final. La workflow MobSF ahora se ejecuta cuando cambian `android/**` o `security/**`; su nuevo informe se adjunta a GitHub Actions. Para cerrar el hallazgo hay que analizar el APK release firmado de Entrega 8 y confirmar `debuggable=false`. |
| E8-S03 | Advertencia | La configuración conservada fija `minSdk=26` (Android 8). Algunos aparatos podrían no recibir parches actuales. | Mínimo provisional; no se eleva sin inventario del grupo. Probar el APK en un dispositivo actualizado y en el mínimo acordado; retirar soporte a sistemas fuera de soporte en la distribución. |
| E8-S04 | Advertencia | El informe MobSF anterior señaló `ProfileInstallReceiver` de AndroidX exportado y protegido por `android.permission.DUMP`. | No es un componente funcional propio; AndroidX declara el permiso. Revalidar con el análisis MobSF que genera el cierre, junto con los componentes del APK actual. Las actividades privadas y `FileProvider` de ConectaSur declaran `exported=false`; el ingreso público es `MainActivity`. |
| E8-S05 | Sin vulnerabilidades conocidas en la consulta actual | `npm audit` no reportó vulnerabilidades en los paquetes incluidos en las dos auditorías. | Resultado fechado; puede cambiar cuando cambien los avisos públicos o dependencias. No demuestra ausencia de errores de código ni cubre Maven/Android. El pipeline MobSF y Gradle cubren el APK por vías distintas. |

## Controles verificados

- **Acceso y datos:** las pruebas ejecutan los roles `anon` y `authenticated` con identidades ficticias. RLS separa el stock, las ventas, cuentas y mensajes de cada dueña; comprador y visitante no leen datos privados. Las funciones RPC limitan escrituras privilegiadas; no basta con ocultar botones en la interfaz.
- **Ferias y bitácora:** las ferias privadas solo son administrables por una cuenta administradora activa; la vista pública expone filas publicadas/canceladas, nunca borradores. Participantes, asistencia y avisos se consultan mediante funciones con identidad y estado. Triggers registran en `admin_actions` quién hizo la operación, qué objeto cambió y cuándo; el cliente no puede falsificar ese registro.
- **Seguidores y privacidad:** seguir/calificar requiere una identidad válida y no confiere rol administrativo. Se publica el promedio, no la identidad de quien calificó. El consentimiento controla el registro y retiro de tokens de notificación; las tablas de tokens/cola no son legibles por clientes.
- **Mapas:** la ubicación se solicita en el dispositivo; `upcoming_fairs` recibe coordenadas para ordenar y no persiste la ubicación de la persona. Sin permiso, el cliente consulta por fecha. Las coordenadas públicas corresponden a ferias y puntos de venta que el negocio decide publicar.
- **Web:** la clave pública no es un secreto; la autorización se aplica en servidor. OAuth usa PKCE, y las pruebas rechazan retornos OAuth de otro origen. La auditoría de npm abarca producción web; los paquetes de desarrollo no se cargan al sitio publicado.
- **Android:** `usesCleartextTraffic=false`; pantallas internas, servicio FCM y `FileProvider` no se exportan. Sesiones y borradores privados se cifran localmente según la documentación de cada flujo. El análisis estático anterior fue solo debug y no incluyó un análisis dinámico.

## Evidencia y límites

Las pruebas locales de RLS/RPC incluyen todas las migraciones 001–014. Cubren datos públicos/privados, ventas concurrentes solo en PostgreSQL, registro de administración, ferias, mapas, seguidores, notificaciones y calificaciones. Los 46 casos web son pruebas automatizadas de los módulos listados; no sustituyen el recorrido manual del panel ni certifican la política de privacidad.

El informe MobSF existente se conserva como antecedente trazable, no como evidencia del APK final. El workflow `Analisis MobSF` se dispara con cambios Android o seguridad y adjunta el resultado al run de GitHub Actions. MobSF escanea un APK debug sin secretos; el APK firmado para el jurado necesita un análisis separado. No se ejecutó pentest independiente, análisis dinámico ni prueba física de cada versión Android. A11 permanece abierto hasta decidir y demostrar el mecanismo de atestación que proteja el backend realmente usado.
