# Entrega 7 — Informe de Felipe Gallardo (backend y push)

**SurCode / ConectaSur · lunes 23 de noviembre de 2026 · EVA 4 (50 %).**

## Lo realizado

El backend de Supabase suma tres migraciones nuevas (012 a 014) y un servicio de envío push. Las migraciones anteriores no se modificaron. El contrato para las demás partes del grupo está en [entrega-7-api.md](entrega-7-api.md).

- **Identidad de compradores Google verificada en el servidor (012).** Un comprador que entra con Google tiene identidad de Firebase, no una sesión de Supabase, y la instancia no permite cambiar su Auth ni usar `service_role`. La base verifica por sí misma el ID token de Firebase: firma RS256 con las claves públicas de Google (`app_private.firebase_keys`), proyecto, emisor, vigencia, proveedor `google.com` y correo verificado, las mismas reglas que ya aplica la app. Cada función de seguidores, avisos y calificaciones acepta una sesión de Supabase o un token de Google; ninguna otorga permisos de tienda ni de administración. `verify_buyer_identity` permite comprobarlo.
- **Consentimiento, dispositivos y avisos (012).** Tablas `notification_consents`, `device_tokens` y `notifications` (bandeja y cola de envío a la vez), sin permisos para clientes. Sin consentimiento no se guarda ningún dispositivo ni se crean avisos para seguidores; retirar el consentimiento borra los dispositivos (RNF-PRI-02).
- **Seguidores y calificaciones (013).** `follows` (tiendas y asociaciones, idempotente) y `ratings` (una por persona y destino, editable). Solo son públicos los promedios (`public_ratings`), sin revelar quién calificó. La tienda activa o desactiva las calificaciones con `shops.allow_ratings`, que `public_shops` expone.
- **Avisos de contacto con horario (013).** `shops.contact_notifications`, `notify_from` y `notify_until` (hora de Santiago, admite horarios que cruzan la medianoche). `send_shop_message` siempre guarda el mensaje y solo avisa a la dueña dentro del horario.
- **Ferias con participantes (014).** `fair_participants` con los cuatro estados (invitada, confirmada, rechazada, agregada) y la asistencia. Funciones para invitar, agregar, responder con un toque, confirmar por una asociación, registrar asistencia, enviar recordatorios o avisos, ver el checklist con datos para filtrar, ver el calendario de la dueña, sugerir la feria al vender (por fecha y, si autorizó, por distancia) y la ficha pública con confirmadas y muestra del catálogo público.
- **Aviso a seguidores.** Cuando una tienda o asociación confirma su participación en una feria publicada, quienes la siguen y dieron consentimiento reciben un aviso con el nombre de la feria, una sola vez. Cancelar una feria avisa a las tiendas invitadas o confirmadas.
- **Servicio de envío FCM (`supabase/tools/fcm-worker.mjs`).** Lee la cola, envía por FCM HTTP v1 con la cuenta de servicio de Firebase, descarta dispositivos desinstalados, reintenta fallos temporales (hasta 5 intentos) y mantiene al día las claves de Firebase. No tiene dependencias y se ejecuta solo en el equipo de desarrollo.
- **Pruebas.** 36 pruebas nuevas en `supabase/test/sql.test.js` (identidad con tokens firmados de verdad; rechazo de tokens alterados, vencidos o de otro proyecto; permisos; consentimiento; seguidores; ferias; avisos; ficha pública; sugerencia al vender; calificaciones; horario y cola) y 18 más para el servicio push y la verificación del servidor. En mi ejecución local sobre PostgreSQL: 106 de 106 aprobadas con `npm --prefix supabase test`.
- **Verificación en la instancia.** `node supabase/tools/entrega7-state.mjs` comprueba migraciones, permisos y respuestas de la API sin sesión, y recorre invitar, responder, seguir, avisar, ficha pública y calificar dentro de una transacción que se deshace siempre. Resultado en la instancia del grupo (22-11-2026 01:10): 28 de 28 comprobaciones correctas; evidencia en `security/reports/entrega7-backend/estado-servidor.json`.

## Requisitos cubiertos (por ID)

| Requisito | Aporte de backend |
|---|---|
| RF-FER-02, RF-FER-03 | `admin_invite_participant`, `admin_add_participant` |
| RF-FER-04, RF-FER-05 | `admin_fair_checklist` (estado, tipo de emprendimiento y asociaciones para filtrar) |
| RF-FER-06 | `admin_send_fair_notice` (pendientes y confirmadas) |
| RF-FER-07 | `admin_set_attendance` |
| RF-FER-08, RF-FER-09 | Aviso de invitación en `notifications`, `respond_fair_invitation`, `my_fair_invitations` |
| RF-FER-10 | `fair_public_detail` |
| RF-CMP-04 (datos) | `upcoming_fairs` y `fair_public_detail` |
| RF-CMP-06 | `follow_target`, `unfollow_target`, `my_follows` |
| RF-CMP-07, RF-CMP-08 | Avisos a seguidores, bandeja `my_notifications` y envío FCM |
| RF-CMP-09, RF-CFG-05 | `rate_target`, `public_ratings`, `shops.allow_ratings` |
| RF-CFG-04 | Horario y apagado de avisos de contacto en `shops` y `send_shop_message` |
| RF-ACC-08 | Seguir y calificar aceptan sesión de Supabase o token de Google verificado |
| RF-VEN-05, RF-MAP-05 | `suggest_fairs_for_sale` |
| RNF-PRI-02 | Consentimiento explícito, baja y borrado de dispositivos |

## Pendiente y plan

- Las pantallas de Android y web consumen estas funciones y se construyen en sus propias partes del grupo.
- La entrega real de un push depende de que `fcm-worker.mjs watch` esté en ejecución durante la demostración, con la cuenta de servicio del proyecto Firebase.
- El aviso de la web (RF-CMP-08) se entrega como bandeja `my_notifications`, que la web consulta, con notificación del navegador si la persona dio permiso. El envío por correo no está implementado: la instancia no tiene proveedor de correo para esto.
- Una asociación no tiene cuenta propia: el administrador confirma o rechaza en su nombre.
- No se comprobó con un teléfono real el push ni un ID token real de Google; se prueba con tokens firmados en las pruebas y con `FIREBASE_TEST_ID_TOKEN` en la verificación.
- Los cambios de esta parte se integraron directamente en `main`, sin pull request.

## Reparto del trabajo

Este informe describe el aporte de Felipe Gallardo (backend, migraciones, funciones, identidad y servicio push). El reparto del grupo completo está en [docs/entrega-5/informe.md](../entrega-5/informe.md).
