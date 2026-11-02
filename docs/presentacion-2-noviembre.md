> Estado actualizado: esta nota refleja la integración inicial. El cierre posterior con productos, ventas y publicación está en [Entrega 5](entrega-5/informe.md).

# Integración para la presentación del 2 de noviembre de 2026

## Avances reunidos

Se actualizó main con el panel web administrativo y la documentación de ventas ya publicados. Se incorporó la rama fabian-acceso-tienda (5d6fdd1), preservando la autoría del acceso, tienda y huella Android. La rama feature/productos-dan coincide con el main recibido (075ce30); no contiene un editor Android adicional. La rama antigua de Felipe ya forma parte del historial; la conexión vigente es Supabase.

No se reescribió el historial ni se añadieron aportes en nombre de otros integrantes. La unión directa a main responde a lo solicitado por Benjamín; no acredita la revisión de un PR por otro integrante.

## Recorrido para mostrar

1. Android: Inicio, catálogo público conectado a Supabase, detalle de producto con pesos chilenos, tienda pública y ajustes de accesibilidad.
2. Android: Mi tienda, ingresar con una cuenta ficticia de emprendedora, editar datos, guardar y volver a abrir para comprobar persistencia. El logo se elige desde el selector del teléfono. La huella es voluntaria después de entrar y requiere un dispositivo compatible.
3. Web: ejecutar npm ci y npm run dev desde web con Node 24.12 o superior. Ingresar con una cuenta de administrador. Recorrer Emprendedoras, Asociaciones, Categorías y Tipos de productos. Cerrar sesión al terminar.

Las configuraciones locales de Android y web incluyen únicamente URL y clave anon. Las contraseñas de las cuentas ficticias se comparten por un canal privado y no se agregan al repositorio. El administrador web y la emprendedora Android tienen funciones distintas.

## Verificación de esta integración

- Android: assembleDebug y assembleDebugAndroidTest correctos; 26 pruebas unitarias aprobadas; lint sin errores, con 14 advertencias.
- Emulador API 36 contra Supabase: acceso con emprendedora, edición de descripción, guardado, reapertura con sesión y cierre de sesión aprobados; la descripción original se restauró al terminar. También aprobaron las dos pruebas del conversor de logos. Prueba de inicio aprobada.
- Se corrigió el tipo de retorno de la prueba instrumentada de acceso para que JUnit pueda ejecutarla.
- Web: versión de producción generada con Vite; 7 pruebas de la capa de datos contra Supabase aprobadas.
- Navegador Chromium: ingreso real de administrador, carga de las cuatro secciones, cierre de sesión y ausencia de errores JavaScript comprobados.
- npm ci y auditoría web: sin vulnerabilidades notificadas al comprobar esta integración.

Estos resultados complementan el informe de seguridad de la migración; no sustituyen pruebas físicas de huella o TalkBack.

## Pendientes que se deben presentar como pendientes

El editor Android de productos y las pantallas de ventas/inventario no llegaron en las ramas disponibles. Existen contratos, lógica de dominio, repositorios y RPC de venta, pero esto no equivale a tener sus pantallas terminadas. El commit de Alonso f55908b aporta documentación; no añade una pantalla de ventas. Google OAuth, las ferias y la validación física de huella/TalkBack conservan sus límites documentados.
