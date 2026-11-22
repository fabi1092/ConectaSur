# Entrega 7 — Contrato del backend para web y Android

Todo se llama por la API de Supabase con la clave anon, como el resto de la app. En Supabase JS: `supabase.rpc('nombre', {parametros})`. En Android: `POST /rest/v1/rpc/nombre` con el cuerpo JSON de los parámetros. Los nombres de los parámetros son los de esta guía.

## Quién es quien llama

Las funciones de comprador (seguir, calificar, avisos, consentimiento, dispositivos) aceptan **una de dos identidades**:

| Comprador | Qué envía |
|---|---|
| Entró con correo y contraseña (sesión de Supabase) | Nada extra. La sesión ya lo identifica. |
| Entró con Google (Firebase) | El ID token de Firebase en el parámetro **`p_token`**. |

Cómo obtener el ID token: web `await auth.currentUser.getIdToken()`; Android `user.getIdToken(false).await().token`. Dura una hora: pedirlo en cada llamada (el SDK lo renueva solo). Si hay sesión de Supabase, `p_token` se ignora. Sin sesión ni token la función responde error `28000` «Inicia sesion para continuar»: es la señal para abrir el inicio de sesión (RF-ACC-08). Un token falso, vencido o de otro proyecto responde «Credencial de Google invalida».

`verify_buyer_identity(p_token?)` → `{subject, provider}`; sirve para comprobar que el token funciona.

Las funciones de administrador exigen la sesión del administrador. Las de dueña exigen la sesión de una emprendedora activa.

## Parte de cada integrante

### Kisho — Web admin de ferias (W01–W11)
La tabla `fairs` ya existe (entrega 6): publicar es `update status='published'`, cancelar es `status='cancelled'` (avisa a las tiendas). Para el resto:

| Acción | Función |
|---|---|
| W03/W04 Invitar | `admin_invite_participant(p_fair_id, p_shop_id` o `p_association_id)` → id del participante. Repetir no duplica; reinvitar a quien rechazó la deja pendiente. |
| W05 Agregar directo | `admin_add_participant(p_fair_id, p_shop_id` o `p_association_id)` |
| W06/W08 Checklist | `admin_fair_checklist(p_fair_id)` → `participant_id, kind (shop/association), shop_id, association_id, name, entrepreneur_type, association_ids[], association_names[], status (invited/confirmed/declined/added), attendance, invited_at, responded_at, last_reminded_at`. Buscar y filtrar por estado, tipo y asociación se hace sobre estas filas. |
| Asociaciones | `admin_set_participant_status(p_participant_id, p_status)` con `confirmed`, `declined` o `invited` (no tienen cuenta, responde el administrador) |
| Quitar | `admin_remove_participant(p_participant_id)` |
| W09 Recordatorio | `admin_send_fair_notice(p_fair_id, 'pending', p_message?)` → cantidad de dueñas avisadas |
| W10 Aviso | `admin_send_fair_notice(p_fair_id, 'confirmed', p_message?)` |
| W11 Asistencia | `admin_set_attendance(p_participant_id, p_attendance)` con `attended`, `absent` o nulo, solo para confirmadas o agregadas |

### Alonso — Web pública (W12–W14)
- Ficha: `fair_public_detail(p_fair_id)` (sin sesión) → `{fair:{id,name,description,image_url,place_name,latitude,longitude,starts_at,ends_at,organizer,status}, participants:[{kind,id,name,logo_url,...,sample:[{id,name,price_clp,photo}]}]}`; `null` si la feria no existe o es borrador. Solo trae confirmadas y agregadas, con hasta 3 productos públicos de cada tienda.
- Calendario: `upcoming_fairs(p_lat?, p_lng?)` (entrega 6) y `public_fairs`.

### Dan — Web seguidores y avisos (W15–W18)
- Seguir: `follow_target(p_target_type: 'shop'|'association', p_target_id, p_token?)`. Dejar: `unfollow_target(...)`. Lista: `my_follows(p_token?)`.
- W16: si responde `28000`, guardar la acción pendiente (tipo, id), abrir el inicio de sesión y, al volver, llamar `follow_target` solo.
- W18: `set_notification_consent(true, p_token?)` al pedir permiso; luego consultar `my_notifications(p_limit?, p_token?)` cada 15 s (como el catálogo) y mostrar `new Notification(title, {body})` si el navegador dio permiso. Los avisos de seguidas tienen `kind = 'follow_fair_confirmed'` y `data = {fair_id, fair_name, target_type, target_id}`. `mark_notifications_read(p_ids[], p_token?)`.

### Fabián — Android emprendedora (A02–A06, A15–A16)
- A01/A04: `my_fair_invitations()` → `fair_id, name, description, image_url, place_name, latitude, longitude, starts_at, ends_at, fair_status, my_status (invited/confirmed/added/declined), responded_at`. Ocultar las rechazadas si no se quieren mostrar.
- A02/A03: `respond_fair_invitation(p_fair_id, p_participate: true|false)` → `'confirmed'|'declined'`.
- A05/A06: `suggest_fairs_for_sale(p_shop_id, p_lat?, p_lng?)` → ferias de **hoy** donde la tienda está confirmada o agregada, con `in_progress` y `distance_km` (nulo sin ubicación). Sin ubicación se sugiere la de la fecha (A05); con ubicación y `in_progress` y `distance_km` bajo (por ejemplo menos de 1,5) se sugiere por GPS (A06). La función no guarda la ubicación.
- A15: columnas de `shops` editables por la dueña con el update de siempre: `contact_notifications` (boolean), `notify_from` y `notify_until` (hora `'HH:MM'`, hora de Santiago; iguales = todo el día; desde mayor que hasta cruza la medianoche).
- A16: `shops.allow_ratings` (boolean, por defecto activo).

### Benjamín — Android push y comprador (A01, A07–A14, A17)
- Consentimiento (A14), antes de pedir el permiso de notificaciones: `set_notification_consent(p_granted, p_token?)`; leer con `get_notification_consent`. Retirar el consentimiento borra los dispositivos. Dejar de seguir: `unfollow_target`.
- Registrar el dispositivo (solo con consentimiento): `register_device(p_fcm_token, 'android', p_token?)`; al cerrar sesión o dar de baja: `unregister_device(p_fcm_token, p_token?)`. Las dueñas también registran su dispositivo para recibir las invitaciones (A01), con el mismo consentimiento.
- A07: `fair_public_detail`. A09–A12: `follow_target`, `unfollow_target`, `my_follows`.
- A13: el push llega con `data` = `kind`, `notification_id`, `fair_id`, `fair_name`, y el título ya trae el nombre de la feria. Requiere `fcm-worker.mjs watch` en ejecución.
- A17: `rate_target(p_shop_id, p_product_id|null, p_stars 1–5, p_comment?, p_token?)`; con las calificaciones desactivadas responde «Esta tienda no recibe calificaciones» (usar `public_shops.allow_ratings` para ocultar el control). Mis notas: `my_ratings(p_shop_id, p_token?)`. Promedios públicos: vista `public_ratings` (`shop_id, product_id, average, total`; `product_id` nulo = la tienda) y `rating_comments(p_shop_id, p_product_id?, p_limit?)`.

## Avisos: tipos (`notifications.kind`)

`invitation` (te invitaron o agregaron), `fair_notice` (recordatorio o aviso del administrador), `fair_cancelled`, `contact` (mensaje del formulario, dentro del horario) y `follow_fair_confirmed` (para seguidores). Todos llevan `data` con `fair_id` y `fair_name` cuando corresponde.

## Errores frecuentes

| Código | Significado |
|---|---|
| `28000` | Falta iniciar sesión o el token de Google no es válido |
| `42501` | Sin permiso (no eres la dueña, no eres administrador, calificaciones desactivadas, falta consentimiento) |
| `23503` | La tienda, asociación, producto o feria no existe |
| `23514` | Dato inválido (estrellas fuera de 1–5, estado inválido, feria cancelada o terminada) |
| `23505` | Ya participa en la feria |
