# Dashboard y navegación con sesión

Hito del 3 de noviembre de 2026. Continúa el diseño navy, verde y crema, las ayudas A tu manera y los datos compartidos con Android en Supabase.

## Navegación

- Sin sesión, la cabecera y el pie permiten Ingresar.
- La emprendedora con sesión ve Mi tienda; el administrador, Mi panel. Los nombres y destinos se conservan en la portada, el directorio, las fichas y los editores.
- Volver a las tiendas abre el directorio #tiendas con un clic. Mi tienda vuelve al dashboard sin pedir de nuevo correo o contraseña mientras la sesión sea válida.
- El enlace funciona incluso desde un editor o listado que comparte el mismo hash. Se mantienen las confirmaciones si existen cambios sin guardar o ventas pendientes.
- Recuperar foco comprueba la cuenta y tienda sin reemplazar el DOM de una pantalla válida. Las respuestas tardías no actualizan pantallas que ya se abandonaron.
- Cerrar sesión retira el panel privado y restablece Ingresar. El rol proviene del perfil validado en Supabase; la navegación visual no concede permisos.

## Resumen de la emprendedora

| Dato | Fuente y significado |
| --- | --- |
| Productos en tu catálogo | Catálogo privado de su tienda; incluye visibles y ocultos. |
| Productos en la vitrina | Consulta pública de su tienda; respeta productos ocultos y reglas de agotados. |
| Ventas guardadas hoy | Operaciones guardadas cuya fecha corresponde al día de America/Santiago. Indica sus unidades. |
| Total guardado hoy | Suma exacta con BigInt de cantidad × precio registrado, en pesos chilenos. |
| Últimas ventas | Hasta cuatro operaciones guardadas, incluidas fechas anteriores. |
| Disponibilidad | Productos por unidades o piezas únicas agotados o con 1 a 3 unidades. Las modalidades por encargo o sin conteo no se consideran agotadas por no tener cantidad. |

Los avisos de disponibilidad se calculan por el total del producto. En productos con tallas o colores se debe revisar cada opción desde Mis productos; no se afirma detectar todas las opciones agotadas cuando el total es alto.

Las ventas sin detalle durante periodos con historial desactivado no forman parte del resumen. Se informa cuando el historial está desactivado y se evita presentar estos totales como todas las ventas del negocio. Un fallo parcial muestra — y una explicación, conserva los datos que sí se pudieron consultar y ofrece Actualizar información. No se inventan ceros para una consulta fallida.

Mis productos, Mis ventas y Editar tienda siguen disponibles como acciones principales. El panel administrativo conserva su dashboard propio; no obtiene las ventas ni inventario privados de las emprendedoras.

## Verificación

security/dashboard-navigation-check.mjs comprueba una tienda ficticia propia: ingreso, cabecera y pie con sesión, un clic para salir y regresar, foco, ruta con el mismo hash, ficha pública, recarga, Atrás/Adelante, estadísticas con una venta de hoy y otra de ayer, datos parcialmente no disponibles, historial desactivado, cierre de sesión y administrador. Elimina sus operaciones, solicitudes idempotentes, productos, tienda y cuenta al terminar. No modifica productos del equipo.

DASHBOARD_URL selecciona la URL; CONECTASUR_PRIVATE se carga solo en memoria y PLAYWRIGHT_MODULE identifica Playwright. Las capturas y resultados quedan en security/reports/dashboard-navigation/. Las capturas sustituyen el correo efímero por cuenta-ficticia@ejemplo.cl. supabase/test/dashboard-model.test.js verifica la clasificación de stock y los totales/días chilenos.

La revisión móvil es emulada y no reemplaza pruebas físicas de comprensión, lectores de pantalla y voces con las emprendedoras. No cambia el esquema, RLS ni las cuentas reales. El dashboard complementa el acceso W25–W26 y el panel de administrador W01–W02; no declara completado el resto del checklist.

Resultados locales: 13 comprobaciones de dashboard/navegación, 21 de regresión de acceso y 2 pruebas de cálculos y stock aprobadas. Compilación Vite completada.

Las 13 comprobaciones del dashboard también pasaron en https://conectasur-dev.web.app/ el 3 de noviembre de 2026. La publicación final respondió HTTP 200 y sirvió los mismos recursos que la compilación local. Los datos ficticios se eliminaron al terminar.
