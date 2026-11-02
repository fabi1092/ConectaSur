# Rediseño de la web

Motivo comunicado por Benjamín: la versión anterior se veía demasiado simple y vacía. Se conserva el acceso único por rol, la identidad de ConectaSur y la lectura sencilla; se da protagonismo a los productos y a las fotografías del terreno.

## Referencias revisadas

| Referencia | Qué se tomó como orientación |
| --- | --- |
| [Etsy](https://www.etsy.com/) y [su ayuda de búsqueda](https://help.etsy.com/hc/es/articles/115015627947-C%C3%B3mo-buscar-art%C3%ADculos-y-tiendas-en-Etsy) | Recorrer productos por categorías, mostrar imágenes antes de textos extensos y distinguir artículos de tiendas. |
| [Chile a Mano](https://www.chileamano.com/) | Dar protagonismo a las piezas y al origen de las creaciones, con secciones visuales para conocer los oficios. |
| [Tienda de Artesanías de Chile](https://artesaniasdechile.cl/tienda/) | Categorías y filtros de piezas, con precios legibles en la galería. |

Se usan estos patrones como referencias de estructura. No se copian sus fotografías, marcas, reseñas, cifras, descuentos ni textos comerciales. Las imágenes locales son las fotos que Benjamín compartió y que ya estaban en Android; el archivo original del logo se conserva y se muestra mediante una ventana de CSS.

## Cambios

- Portada con composición de fotos de la visita y dos acciones: explorar productos o conocer tiendas.
- Galería pública conectada a public_products, filtros por las categorías existentes y detalle de producto en un diálogo accesible con cierre y tecla Escape.
- Precios en CLP; cuando el servidor oculta un precio, se muestra Consultar precio. Las variantes no disponibles no definen el precio mínimo mostrado.
- Tarjetas de tiendas con una imagen de sus propios productos cuando existe. Los emprendimientos sin imágenes usan un estado neutro; no se les asignan fotografías de otra tienda.
- Ficha de tienda con sus datos de contacto y productos publicados.
- Cabecera con el logo y navegación por productos/tiendas; el único acceso de cuenta sigue siendo Ingresar.
- Panel administrativo con el mismo lenguaje visual, tablas legibles, navegación activa, accesos rápidos y cantidades obtenidas de las consultas reales. Un error del resumen deja la cantidad sin completar, sin inventar cifras.

## Guía aplicada

Navy #103D50 para identidad y títulos; verde #17694E para acciones; fondos claros y crema #F6F4EE; superficies blancas y bordes suaves. Se mantiene Segoe UI con alternativa Arial/sans-serif. Controles de al menos 48 px, íconos con texto, foco visible y adaptación a texto ampliado. Sin carruseles automáticos ni movimiento obligatorio.

Los recursos están en web/public/assets. Las fotografías conservan los bytes de los originales de Android; los recortes son de presentación con object-fit, sin retocar el contenido. La portada identifica las fotografías como imágenes de la visita para distinguirlas de las publicaciones actuales de cada tienda.

## Comprobación

Se amplía security/public-shops-check.mjs con dos productos ficticios propios: uno con precio visible y otro oculto. Comprueba categorías, diálogo, Escape, CLP, navegación hacia la tienda y que las solicitudes públicas solo accedan a las vistas públicas. Conserva pruebas de campos de tienda, desactivación, errores, contenido hostil y texto al 200 % en pantalla estrecha.

security/entrepreneur-access-check.mjs comprueba ingreso por rol, cierre de sesión, cuenta desactivada, restauración y acceso a la tienda propia. Las capturas quedan en security/reports/public-shops y security/reports/entrepreneur-access. La revisión de celular usa emulación; no sustituye la prueba con personas mayores en un equipo físico.

Resultado del 2 de noviembre: 19 comprobaciones de la galería/ficha pública y 21 del acceso por rol aprobadas; compilación Vite correcta. Durante un primer intento de la suite de acceso, una actualización del fixture recibió HTTP 502 del backend; la ejecución repetida terminó sin fallos. No se atribuye esa respuesta a un cambio de permisos.

Este cambio no añade pagos, carrito ni edición web de productos. Los compradores consultan las publicaciones y contactan a cada tienda. El registro de comprador, recuperación de contraseña y Google siguen siendo bloques pendientes del checklist.
