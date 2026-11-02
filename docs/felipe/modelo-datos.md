# Modelo de datos y permisos: Supabase

Instancia exclusiva SurCode suministrada por el profesor. PostgreSQL 15, Supabase Auth y Storage. Sustituye el diseño Firestore anterior, conservado en docs/historico/modelo-firestore.md.

El ID de usuario es el UUID de auth.users. Una nueva cuenta recibe únicamente el perfil comprador por trigger; no puede elegir su rol enviando metadatos.

## Tablas y relaciones

| Tabla | Clave y relación | Lectura | Escritura |
|---|---|---|---|
| profiles | id → auth.users.id; shop_id → shops.id | Perfil propio o admin | Admin; alta inicial mediante trigger |
| shops | id; owner_uid único → auth.users.id | Dueña activa o admin | Admin crea; dueña edita campos permitidos |
| products | id; shop_id → shops.id | Solo dueña activa | Solo dueña activa, con validaciones/triggers |
| sales | UUID; shop_id → shops.id | Solo dueña activa, sin acceso del admin de aplicación | Exclusivamente RPC register_sale |
| associations | id | Pública | Admin |
| shop_associations | (shop_id, association_id) | Pública | Admin |
| categories | id | Pública | Admin |
| product_types | id; esquema de campos específicos en fields | Pública | Admin |
| entrepreneur_types | id | Pública | Admin |
| admin_actions | id secuencial; actor, acción, tabla, destino y fecha | Admin | Triggers; clientes sin permisos de escritura |
| app_private.sale_requests | UUID + dueño + huella de solicitud | Sin acceso de clientes | RPC; garantiza reintentos idempotentes |

## Proyecciones públicas

public_shops expone únicamente la ficha publicable de tiendas activas con dueña activa. public_products calcula el catálogo público desde products y shops:

- Nunca incluye quantity ni el stock de variantes.
- Excluye productos invisibles o agotados; mantiene productos a pedido sin cantidad.
- Oculta precios de producto y variantes cuando show_price=false o shops.show_prices=false.
- Una modificación global de precios/visibilidad se refleja en la siguiente consulta sin sincronizar copias físicas.

Son vistas deliberadamente propiedad del administrador de la base, con security_barrier, lista explícita de columnas y filtros. El acceso público a esas vistas no concede lectura a las tablas privadas. Las políticas RLS se prueban con usuarios de aplicación, no con Studio.

## Campos del producto

Comunes: id, shop_id, name, description, category, product_type, attributes, price_clp, show_price, stock_mode, quantity, visible, photo, variants y updated_at.

- stock_mode: UNITS, UNIQUE u ON_REQUEST.
- UNITS exige cantidad no negativa; UNIQUE permite 0 o 1 sin variantes; ON_REQUEST admite cantidad nula.
- variants es una lista de hasta 100 opciones con id único, label, quantity y precio/foto opcionales (priceClp, photo). Un trigger valida todos los elementos y calcula el stock total. Se eliminó el límite técnico anterior de 10 opciones.
- Los importes se expresan en pesos chilenos enteros; no se utiliza dólar como unidad.
- product_types.fields describe los campos particulares y attributes almacena sus valores. Ejemplos: artesanía (material, técnica, medidas), alimento (ingredientes, alérgenos, contenido, conservación), ropa (material, cuidados), planta viva (especie, cuidados).
- Flores tejidas o artesanía con material vegetal se clasifican por el producto terminado en Artesanías; Plantas corresponde a plantas vivas.

## Venta e historial

register_sale valida a la dueña en el servidor, bloquea el producto con FOR UPDATE, verifica cantidad y variante, descuenta stock y registra la venta en una sola transacción. El precio de una variante se toma desde la base. Una pieza agotada desaparece de la vista pública.

El UUID de solicitud evita descontar dos veces tras un reintento de la misma operación. Las ventas no se envían como operaciones optimistas sin conexión. Si history_enabled=false, el stock cambia pero no se guarda el detalle de historial. Un recibo privado conserva únicamente UUID, dueño y huella de solicitud para idempotencia.

## Fotos y logos

Bucket shop-images, público para imágenes publicables. MIME permitidos: JPEG, PNG, WebP, hasta 2 MiB. Los objetos se agrupan por shop_id como primera carpeta; RLS limita las escrituras a la dueña activa o admin. Cada cliente comprime antes de subir.

Las fotografías de ejemplo se han cargado y vinculado. No se usa este bucket público para documentos privados. La validación de MIME/metadatos no sustituye una inspección antivirus.

## Sesiones y funcionamiento sin conexión

Android guarda sesión, caché privada y borradores cifrados con una clave de Android Keystore. Conserva catálogo público para lectura offline y una cola de productos por UID. Al volver la red, solo la misma cuenta puede reenviar sus borradores; el servidor valida nuevamente. La pantalla de edición debe usar pendingDrafts para restaurarlos y mostrar errores pendientes.

La web guarda sesión por pestaña mediante sessionStorage y consulta datos sin caché persistente de tablas. La navegación offline completa de la web no está implementada.

La consulta del catálogo se actualiza mientras la pantalla está activa, cada 15 segundos. Es consulta periódica, no una suscripción a Supabase Realtime.

## Puesta en marcha

La migración versionada está en supabase/migrations/001_conectasur.sql y su registro SHA-256 se guarda en app_private.schema_migrations. Las migraciones aplicadas no se editan: se añaden nuevas.

Las herramientas administrativas se ejecutan solo en el equipo de desarrollo con las credenciales privadas de Studio; los clientes usan anon + JWT propio. No se solicita ni se utiliza service_role.

El bootstrap inicial creó cuatro cuentas ficticias y dos tiendas. Los UUID son nuevos; las contraseñas de Firebase no se copiaron. La instancia anterior permanece conservada.

## Ampliación de Entrega 5

Migraciones 002–004: products.sold_out toma HIDE, SHOW u ORDER; stock_mode admite UNLIMITED para productos regulares sin conteo. ON_REQUEST identifica productos a pedido y UNIQUE sigue limitado a una unidad. La vista public_products añade sold_out y un indicador available por variante, sin cantidades privadas. Una pieza única agotada siempre se retira. Un producto regular agotado con ORDER se presenta y vende a pedido sin generar stock negativo.

shops.default_products contiene stockMode, soldOut, visible y showPrice; solo se consulta mediante la tabla privada protegida por RLS. history_enabled controla si el RPC conserva el detalle de ventas futuras. set_product_availability valida las claves y aplica selección, categoría o catálogo en una transacción.

register_sale recibe p_quantity numeric y exige un entero positivo dentro del rango admitido, para evitar conversiones implícitas. Mantiene bloqueo de fila, precio de servidor e idempotencia.

Android conserva borradores completos, fotos por subir, ediciones y eliminaciones pendientes en OwnerWorkspaceRepository con AES-GCM, separados por UID y tienda. Las fotos se suben al recuperar red antes de enviar las filas. Las ventas exigen conexión y conservan la solicitud de reintento hasta recibir confirmación.
