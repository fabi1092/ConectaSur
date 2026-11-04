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

El hito posterior Editar tienda desde la web incorpora un formulario con vista previa del logo, confirmación al descartar y conservación del formulario ante errores. Sigue la misma paleta, superficies, tipografía y tamaños de control. Ver docs/entrega-4/acceso-emprendedoras.md y security/reports/shop-editor/.

El rediseño inicial no añadió pagos, carrito ni edición web de productos. Los hitos posteriores incorporaron edición de productos, ventas, [registro e ingreso del comprador](acceso-compradores.md) y [recuperación pegando el enlace del correo](recuperacion-contrasena.md). Los compradores consultan las publicaciones y contactan a cada tienda. Google y la redirección automática de recuperación siguen pendientes de configuración externa.

## Actualización visual — 4 de noviembre

El usuario pidió aplicar good-taste-design a toda la web. Se mantiene la identidad navy/verde/crema, Segoe UI y las fotografías de la visita; se añade una capa visual común en `web/src/design.css`. El fondo crema pasa a #F7F5EF y los textos secundarios usan #496159. La publicación de este hito queda pendiente de la integración de acceso del compañero.

- Vitrina con portada más compacta, navegación Inicio/Productos/Tiendas y galería de cuatro columnas en escritorio, dos en celular y una al ampliar letras en pantallas estrechas.
- Búsqueda de productos por nombre, descripción, categoría y tienda, combinable con los filtros existentes. Informa cantidad de resultados y distingue una búsqueda sin coincidencias de un catálogo vacío. No crea productos ni asigna fotos ajenas a las tiendas.
- Ingreso y registro con formulario destacado, fotografía de contexto en escritorio, ayuda posterior al formulario en celular y separación visual entre correo y Google. Conserva los manejadores de Auth existentes; no habilita OAuth ni corrige su retorno pendiente.
- Espacio de la emprendedora con resumen, accesos a productos/ventas/edición, formularios y superficies consistentes. Conserva sus datos y acciones existentes.
- Administración con estadísticas legibles y listas consistentes. En móvil las tablas se reorganizan en fichas con etiquetas y acciones a todo el ancho; conservan roles explícitos de tabla, fila y celda y encabezados disponibles al lector de pantalla.
- Ayudas de lectura, contraste, tamaño y foco conservadas. La barra de ayudas utiliza menos altura en escritorio, sin esconder opciones.

### Verificación del hito

Compilación Vite aprobada y 19 pruebas existentes de cuenta/modelos/reintentos aprobadas. Se recorrieron 52 estados renderizados: portada, búsqueda sin resultados, detalle de producto, ficha pública, ingreso, registro, recuperación, tienda, productos, ventas, edición de tienda y siete secciones administrativas; escritorio de 1440 px, celular emulado de 390 px y 320 px con texto al 150 % y contraste alto. Después de adaptar las tablas se repitieron los 21 estados administrativos y se comprobó que sus botones caben en el ancho móvil con al menos 48 px de altura. Sin errores JavaScript ni desbordes horizontales del documento en esos recorridos.

Se comprobó además búsqueda combinada con categoría y apertura/cierre del detalle. La revisión usó lectura e ingreso con cuentas existentes, sin crear ni editar registros. No equivale a pruebas con personas mayores, validación física de TalkBack, guardado W06/W07, entrega de correo real o ingreso Google. Esos pendientes conservan su estado en el [cierre de integración](cierre-integracion.md).
