# Migración de Firestore a Supabase

Solicitada por Benjamín el 1 de noviembre de 2026 a partir de la instancia SurCode entregada por el profesor.

## Hito 1: base de datos y permisos

Aplicado `supabase/migrations/001_conectasur.sql` a la instancia exclusiva del grupo (PostgreSQL 15). Se verificó previamente que no tenía tablas de aplicación, usuarios ni buckets. No se eliminó el proyecto Firebase ni sus datos.

- Tablas: perfiles, tiendas, productos privados, ventas, asociaciones, relaciones tienda/asociación, categorías, tipos y registro de acciones administrativas.
- Vistas públicas con campos seleccionados: productos sin stock ni precios ocultos, y tiendas activas. El cambio global de mostrar precios se refleja al consultar, sin duplicar documentos públicos.
- RLS por perfil. La emprendedora administra su tienda; el comprador y visitante consultan datos públicos. El administrador de la aplicación no consulta ventas ni stock privado.
- Ventas exclusivamente mediante RPC transaccional con bloqueo del producto, control de variante y recibo de idempotencia. El historial opcional se respeta.
- Auditoría de cambios administrativos mediante triggers; los clientes no insertan ni modifican registros de auditoría.
- Bucket `shop-images`: fotos públicas JPEG/PNG/WebP hasta 2 MiB; escritura restringida a la tienda propia o administrador. No utilizarlo para documentos privados.
- Cuatro cuentas ficticias (administrador, dos emprendedoras y comprador), dos tiendas y cinco productos equivalentes a los ejemplos anteriores. Los IDs de Authentication son nuevos; no se transfirieron contraseñas ni sesiones de Firebase.
- Las credenciales de Studio y cuentas de prueba se guardan localmente cifradas con Windows DPAPI, fuera del repositorio. La app usa únicamente URL, anon key y la sesión del usuario. No se usa service_role.

**Verificación:** 40 pruebas aprobadas, 0 fallidas, contra Auth, API PostgreSQL y Storage reales. Se crean cuentas y productos temporales aislados y se limpian al terminar. Ver `security/reports/supabase-backend.json`.

Las fotografías de ejemplo ya se cargaron y vincularon desde clientes autenticados. Las pruebas usan imágenes temporales que se eliminan al terminar.

## Hito 2: conexiones y cierre

Completado: se reemplazaron SDK y repositorios Firebase de Android y web, se conectaron el catálogo y las imágenes, se conservó la accesibilidad y se adaptaron caché, sesiones, borradores, pruebas y workflows. Ver informe vigente y guía de integración. Los resultados de las 81 pruebas anteriores son históricos y no acreditan Supabase.

El cambio de tecnología se registra expresamente: la pauta publicada decía Firestore; el grupo debe comunicar al profesor que está implementando la instancia Supabase suministrada para su curso.
