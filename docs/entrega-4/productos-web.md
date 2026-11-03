# Productos y stock desde la web

Desde Ingresar, la cuenta de emprendedora abre Mi tienda. Mis productos permite agregar, editar y eliminar sus productos, buscar por nombre, filtrar por categoría y actualizar la disponibilidad de los seleccionados. Se mantiene el diseño y la marca del prototipo, con acciones con texto, controles de al menos 48 px y revisión móvil con letras ampliadas.

## Recorrido

1. Elegir Mis productos y Agregar producto.
2. Foto: elegir o tomar una imagen con las opciones que ofrezca el dispositivo. Se prepara una vista previa JPEG de hasta 1024 px y 2 MiB, sin subirla todavía. Se aceptan archivos JPG, PNG y WebP de hasta 20 MiB antes de reducirlos.
3. Datos: nombre, descripción, precio entero en pesos chilenos, categoría, tipo y campos específicos mantenidos por el administrador. Para ocho mil pesos se escribe 8000. La categoría la decide la emprendedora: una artesanía hecha con fibras vegetales puede seguir siendo Artesanías.
4. Variantes: tallas, colores u otras opciones, cada una con identificador estable, cantidad, precio opcional y foto opcional. Sin precio o foto propios se usa el valor del producto. Una pieza única no admite variantes.
5. Stock y publicación: elegir unidades, pieza única, por encargo o sin conteo; configurar qué ocurre al agotarse y si se publica y muestra su precio. Guardar producto escribe el mismo registro que consulta Android. Un producto publicado requiere foto; puede guardarse oculto sin ella.

Las preferencias para productos nuevos se guardan en shops.default_products y son compartidas con Android. No modifican productos existentes. Actualizar varios productos aplica publicación, precios o comportamiento al agotarse exclusivamente a los seleccionados, previa confirmación.

## Guardado y permisos

La capa de datos comprueba el perfil activo y la tienda asignada antes de cada operación. RLS sigue controlando las filas: el catálogo privado y las cantidades pertenecen solo a su dueña. El visitante consulta public_products, sin stock privado. Los precios se ocultan si lo indica el producto o la tienda. Una pieza única vendida siempre queda fuera de la proyección pública.

Una edición y una eliminación incluyen updated_at de la versión cargada. Si otro dispositivo cambió el producto, se exige actualizarlo; no se repone el stock de una versión antigua. Crear usa un identificador estable e inserción: un reintento idéntico reconoce el registro ya guardado y una colisión con contenido diferente no lo sobrescribe. Las subidas confirmadas se reutilizan si falla después la escritura.

Durante la verificación, la instancia del profesor devolvió errores 502 intermitentes en consultas de tienda. La capa web admite hasta dos reintentos adicionales para lecturas GET/HEAD ante 502, 503 o 504, con espera breve. No repite automáticamente escrituras ni rechazos de permisos. Si persiste el fallo, se muestra el estado de error y se permite reintentar desde la interfaz.

El formulario conserva los cambios mientras está abierto cuando falla el guardado. Cancelar y salir con cambios piden confirmación; cerrar la pestaña muestra el aviso del navegador cuando este lo permite. No se promete recuperación de borradores después de cerrar el navegador ni guardado sin conexión. Los archivos subidos no se borran automáticamente al reemplazar una foto, para no eliminar una imagen que otro dispositivo todavía esté usando.

## Verificación

security/owner-catalog-check.mjs ejecuta el recorrido en Chromium y consultas reales de Supabase con una cuenta, tienda, productos e imágenes temporales propios. Comprueba permisos, precio CLP, campos específicos, fotos reducidas, fallo/reintento, variantes, modalidades de stock, concurrencia, actualización grupal, preferencias, búsqueda, eliminación y cuatro pasos a 320 px con texto al 200 %. Los fixtures se eliminan al terminar.

Resultados y capturas: security/reports/owner-catalog/. CATALOG_URL permite repetir contra la web publicada; CONECTASUR_PRIVATE se carga solo en memoria y PLAYWRIGHT_MODULE señala la instalación de Playwright. La prueba móvil es emulada. Comprueba las filas y API compartidas con Android, sin sustituir una prueba física con emprendedoras.

Verificación del 2 de noviembre de 2026: 17 comprobaciones del catálogo aprobadas en https://conectasur-dev.web.app, 7 de la capa de datos real, 14 de regresión del editor de tienda/logo y 3 sobre los reintentos limitados de lectura. La compilación de producción finalizó correctamente. El backend conserva sus migraciones y políticas existentes.

Este hito no incorpora registro de ventas o historial web. Tampoco completa los pendientes del checklist sobre compradores, Google y recuperación de contraseña.
