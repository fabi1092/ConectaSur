# Backend para la revisión de Entrega 4

Backend vigente: instancia Supabase exclusiva de SurCode entregada por el profesor. Firebase Hosting sirve la web; no almacena los perfiles ni las tiendas de esta versión. El [modelo actual](../felipe/modelo-datos.md) describe PostgreSQL, Auth, Storage y repositorios. El [modelo Firestore histórico](../historico/modelo-firestore.md) y el commit `f87cc6a` son antecedentes, no prueba de reglas Firebase publicadas.

## Qué mostrar y con qué evidencia

| Puntos | Demostración preparada | Límite |
|---|---|---|
| B01/B02 | Políticas RLS en `public` y `storage`; buckets `shop-images` y `association-images`; migraciones aplicadas | Es Supabase, no publicación de reglas Firestore. Explicar la adaptación de la pauta |
| B03/B04 | Pruebas con dos emprendedoras temporales: no pueden editar la tienda ni sobrescribir archivos de la otra | Auth, PostgREST y Storage reales; no usar Studio para simular permisos de cliente |
| B05/B06/B07 | Cuenta compradora sin facultades administrativas; administrador gestiona cuentas, asociaciones y catálogos | Comprobar por API con JWT de cada perfil, no con permisos de Studio |
| B08/B10 | Abrir tablas, claves y relaciones en Studio junto al modelo del repositorio | La consola debe ser la misma instancia que usan Android y web |
| B09 | Comparar los índices reales con la justificación siguiente | No se añade un índice solo para aparentar cumplimiento |
| B11 | `supabase/tools/admin.mjs seed`, procedimiento descrito abajo | No volver a sembrar una instancia ya preparada ni copiar datos personales |
| B12 | Entornos y configuración separados por propósito, descritos abajo | Una instancia de producción independiente no está aprovisionada/verificada en este repositorio |
| B13 | Pruebas reales de lectura/escritura por administrador, emprendedora y comprador/visitante | No acredita operaciones contra Firebase; corresponde al backend Supabase actual |

Evidencia sin secretos: `security/reports/entrega4-backend/estado-servidor.json` recoge la consola por solo lectura. `security/reports/entrega4-backend/verification.json` registra las pruebas reales de permisos. `security/reports/entrepreneur-account-live/verification.json` acredita guardar el nombre y recargar en la web publicada.

Resultado del cierre: 42 pruebas reales de Auth, PostgREST/RLS y Storage aprobadas; incluye creación/desactivación de asociaciones y mantenimiento de los tres catálogos solo por admin. La primera ampliación encontró un HTTP 502 en una lectura de catálogo; se añadió un reintento acotado únicamente para GET 502/503/504 y la repetición completa aprobó. No se reintentan escrituras. W06/W07 aprobaron además siete comprobaciones reales en Hosting, con limpieza de fixtures confirmada. Las operaciones administrativas dejan sus eventos legítimos de auditoría.

## Índices y por qué se usan

Se comprobaron 13 índices públicos: claves primarias, una restricción única y dos índices explícitos. Las restricciones de clave primaria/única crean sus índices automáticamente.

| Índice o grupo | Consulta o garantía |
|---|---|
| `profiles_pkey` | Resolver `profiles.id = auth.uid()` en acceso y autorización; una identidad por usuario de Auth |
| `shops_pkey` | Consultar y editar la tienda concreta por ID, incluida la ficha pública |
| `shops_owner_uid_key` | Una tienda por dueña; consulta por identidad sin recorrer todas las tiendas |
| `products_pkey`, `sales_pkey` | Lectura/edición por identificador y unicidad de productos y ventas |
| `products_shop_idx (shop_id)` | Listar el catálogo de la tienda autenticada; también apoya filtros y relaciones por tienda |
| `sales_shop_date_idx (shop_id, date_millis DESC)` | Historial de una tienda en orden reciente y filtros por fecha; el prefijo `shop_id` conserva el aislamiento de la consulta |
| `shop_associations_pkey (shop_id, association_id)` | Consultar asociaciones de una tienda y evitar asignaciones duplicadas |
| Claves de asociaciones, categorías y tipos | Editar cada registro por ID sin cambiar referencias |
| `admin_actions_pkey` | Identificar cada evento de auditoría sin duplicarlo |

El registro de reintentos de ventas y altas administrativas también usa claves primarias en `app_private`, sin acceso de clientes. Los catálogos pequeños se filtran en memoria después de su lectura autorizada; no se declara una búsqueda de texto indexada en servidor. Con pocos datos PostgreSQL puede elegir un recorrido secuencial: eso no demuestra que falte el índice.

Para mostrar los índices y las migraciones reales, ejecutar las consultas SELECT de [consultas-profesor.sql](../../supabase/demo/consultas-profesor.sql). `node supabase/tools/entrega4-state.mjs` actualiza la evidencia de metadatos usando la configuración privada del desarrollador; no modifica datos.

## Desarrollo, pruebas y producción

| Uso | Recurso | Estado |
|---|---|---|
| Desarrollo y revisión de clase | `https://supabase-surcode.codepulse.cl` | Configurado por el profesor; datos de demostración y fixtures temporales |
| Pruebas SQL aisladas | PostgreSQL local/CI vacío `conectasur_test` | Las migraciones se prueban sin conectarse al backend de clase. PGlite local omite la prueba de concurrencia real; CI PostgreSQL la ejecuta |
| Publicación de la interfaz | `https://conectasur-dev.web.app` | Hosting público de desarrollo, conectado al backend anterior; publicar la interfaz no crea producción |
| Producción independiente | Otra instancia/proyecto, otras cuentas y credenciales | No configurado/verificado. No afirmar que B12 ya está demostrado solo porque existe una URL pública |

Para producción se requiere otra instancia y configuración de cliente, aplicar las migraciones versionadas y crear las cuentas iniciales correspondientes sin importar los datos demo. No se crea infraestructura de producción dentro de la instancia de clase para aparentar una separación que no existe.

## Carga de datos ficticios y repetición de pruebas

1. Usar exclusivamente la instancia de desarrollo del grupo. Guardar las credenciales de Studio en el almacenamiento privado del desarrollador, fuera de Git. Los clientes reciben solo URL, anon key y sesión propia.
2. Ejecutar `node supabase/tools/admin.mjs migrate` con esa configuración en memoria. Comprueba hashes y aplica solo las migraciones pendientes; no editar archivos SQL ya aplicados.
3. Para una instancia vacía, ejecutar `node supabase/tools/admin.mjs seed` con `CONECTASUR_PRIVATE_OUTPUT` apuntando a un archivo privado temporal. La herramienta genera cuentas ficticias y deja la información de acceso fuera del repositorio. Cifrar ese resultado y retirar el temporal. En el computador de Benjamín el procedimiento existente `supabase/tools/local-access.ps1 -Action seed` realiza ese guardado cifrado. No ejecutar de nuevo sobre la demo que ya tiene cuentas.
4. Las pruebas `node --test --test-concurrency=1 supabase/test/security.test.js` crean sus propias identidades y tiendas, realizan operaciones con JWT de usuario y las eliminan al terminar. Las pruebas no necesitan `service_role`. Se conservan los eventos legítimos de auditoría.
5. Ejecutar `node security/entrepreneur-account-live-check.mjs` con la configuración privada y `ACCOUNT_EDITOR_URL=https://conectasur-dev.web.app/` para comprobar W06/W07. Requiere Playwright disponible; no simula el guardado. El resultado solo se registra como aprobado después de confirmar la limpieza.

El PDF y esta demostración tienen nombres de tecnologías distintos. El equipo debe mostrar el backend que realmente está usando y explicar la instancia Supabase suministrada por el docente; este documento no registra una exención de evaluación ni inventa evidencias de Firebase.
