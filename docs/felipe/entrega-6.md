# Entrega 6 — Informe de Felipe Gallardo (backend)

**SurCode / ConectaSur · lunes 9 de noviembre de 2026 · EVA 4 (50 %).**

## Lo realizado

El backend de Supabase suma tres migraciones nuevas (009 a 011) que sostienen lo que la entrega 6 pide en mapas, ferias y navegación anónima. Las migraciones anteriores no se modificaron.

- **Ferias con ubicación (009).** Tabla `fairs` con nombre, descripción, imagen, lugar, latitud y longitud, fecha y horario, organizador y estado (borrador, publicada, cancelada). Solo el administrador la crea y edita (RLS) y cada cambio queda en `admin_actions`. El público lee la vista `public_fairs`: nunca ve borradores y las canceladas aparecen como tales.
- **Mapa de próximas ferias (009).** La función `upcoming_fairs(lat, lng)` entrega las ferias publicadas que aún no terminan. Con la ubicación de la persona las ordena por distancia en km; sin ella, por fecha. La función no escribe en la base de datos, por lo que la ubicación de la persona no se guarda en el servidor.
- **Navegación anónima (010).** Tabla de configuración `platform_settings` con tres opciones: permitir, invitar con opción de omitir u obligar el ingreso. Es legible sin sesión, porque la app la consulta al abrir; solo el administrador la cambia, mediante `set_anonymous_navigation`, con auditoría.
- **Punto de venta o retiro opcional (011).** La emprendedora puede marcar su local en el mapa; es público solo si ella lo define, y las coordenadas van siempre en pareja.
- **Pruebas.** Se añadió un bloque de 11 pruebas a `supabase/test/sql.test.js` (permisos por perfil, borradores ocultos, orden por distancia y por fecha, ubicación inválida, auditoría, navegación anónima y punto de venta).
- **Documentación.** El modelo de datos (`docs/felipe/modelo-datos.md`) incluye la ampliación de esta entrega.

Resultado de `npm --prefix supabase test` en mi equipo: **COMPLETAR (aprobadas / total)**.

## Requisitos cubiertos (por ID)

| Requisito | Aporte de backend |
|---|---|
| RF-FER-01 | Tabla `fairs` y estados borrador, publicada y cancelada, administrados por el administrador |
| RF-MAP-01 | La ubicación marcada en el mapa se guarda como latitud y longitud validadas |
| RF-MAP-02 | `public_fairs` entrega coordenadas y lugar para el mapa y "Cómo llegar" |
| RF-MAP-03, RNF-PRI-04 | `upcoming_fairs`: orden por distancia o por fecha, sin guardar la ubicación |
| RF-MAP-04 (Importante) | Columnas `pickup_*` en `shops` y en `public_shops` |
| RF-ACC-06, RF-ADM-02 | `platform_settings` y `set_anonymous_navigation` |
| RNF-PRI-03 | Solo es público lo que la emprendedora decide mostrar (punto de venta nulo por defecto) |
| RF-CMP-04 (datos) | `public_fairs` permite el calendario y la ficha de cada feria |

Los requisitos de la entrega 5 asignados a mi parte (A12, A13, A14 y A17 del servidor: edición, eliminación, cambio masivo de disponibilidad y sincronización) siguen cubiertos por las migraciones 002 a 004 y la documentación de la entrega 5; no cambian en esta entrega.

## Pendiente y plan

- Las pantallas de mapa en Android y web, el compartir y el QR, y el panel de ferias usan estas tablas y funciones, pero se construyen en sus propias partes del grupo.
- Aplicar las migraciones 009 a 011 en la instancia Supabase del grupo con `npm --prefix supabase run migrate`, que exige las credenciales privadas de Studio. Hasta entonces la instancia no tiene estas tablas.
- Revisión del pull request por otro integrante.

## Reparto del trabajo

Este informe describe el aporte de Felipe Gallardo (backend, migraciones, RPC y sincronización). El reparto del grupo completo está en [docs/entrega-5/informe.md](../entrega-5/informe.md).
