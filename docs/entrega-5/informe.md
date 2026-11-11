# Entrega 5 — Catálogo, productos y ventas

**SurCode / ConectaSur · 2 de noviembre de 2026 · EVA 3 (35 %).**

## Resultado

La emprendedora entra en Mi tienda y administra productos, variantes, disponibilidad y ventas. El flujo de producto se divide en Foto, Datos, Variantes y Publicación. Los datos se conservan en un borrador cifrado al cerrar o interrumpir la edición. Se toma una foto con la cámara o se elige desde la galería; se convierte a JPEG y se reduce antes de subirla. Cada variante puede tener foto, precio y unidades propios. Los tipos muestran sus campos específicos y admiten tipos adicionales configurados por el administrador.

El catálogo admite productos regulares con o sin conteo de stock, a pedido y piezas únicas. La dueña decide si muestra precios y qué ocurre al agotarse un producto regular: ocultar, mostrar Agotado o pasar a pedido. Puede cambiar disponibilidad por selección, categoría o catálogo completo y guardar valores predeterminados para nuevos productos. Las piezas únicas vendidas siempre salen de la vista pública.

La venta elige producto, variante, cantidad y lugar; el servidor verifica permisos, toma el precio y descuenta stock en una transacción. Una solicitud sin respuesta confirmada se conserva para reintentar sin duplicar el descuento. El historial es voluntario y permite filtrar por fechas, producto y lugar o nombre de feria. Desactivar el historial afecta las ventas siguientes y conserva las anteriores.

El catálogo privado previamente descargado se consulta sin red. Las altas, ediciones, fotografías y eliminaciones pendientes quedan cifradas por cuenta y se sincronizan al recuperar conexión con esa cuenta. La aplicación informa cuándo hay cambios pendientes. Las ventas requieren conexión. Las preferencias de tienda requieren confirmación del servidor.

## Demostración de 5–10 minutos

1. Abrir la app: logo de ConectaSur, catálogo sin preguntar rol y ajustes de letras/botones/contraste.
2. Mi tienda: entrar con una cuenta ficticia de emprendedora. Mostrar el logo y los datos editables.
3. Mis productos: crear un producto de Artesanías con foto, precio CLP y una variante. Cerrar a mitad del flujo y recuperar el borrador. Guardar y revisar la vista previa pública.
4. Registrar una venta de esa variante y comprobar el descuento. Vender una pieza única y comprobar que deja de aparecer públicamente.
5. Consultar historial por producto o lugar. Mostrar la preferencia para desactivarlo.
6. Abrir el [panel publicado](https://conectasur-dev.web.app), entrar como administrador y mostrar tiendas/asociaciones/tipos. Las cuentas de aplicación se comparten por un canal privado.
7. Mostrar pruebas y el análisis MobSF desde los documentos de esta carpeta y GitHub Actions.

## Validación y evidencias

El cierre incluye pruebas reales de API/RLS/Storage/web, pruebas de dominio, pruebas instrumentadas Android y navegación de regresión. Los contadores, fechas, hashes y resultados están en [entrega5-verification.json](../../security/reports/entrega5-verification.json). El informe de [seguridad](seguridad.md) distingue los avisos, correcciones y límites. Las capturas de [cambios del prototipo](cambios-prototipo.md) proceden de las pantallas ejecutadas en el emulador con datos ficticios.

## Reparto y trazabilidad

| Integrante | Aporte o responsabilidad registrado |
|---|---|
| Benjamín Tampier | Base Android y accesibilidad, migración Supabase, integración y cierre de productos/ventas, publicación, pruebas y documentación de esta entrega. |
| Fabián Barroso | Acceso, edición de tienda y huella; rama fabian-acceso-tienda integrada preservando su commit. |
| Dan Velásquez | A02–A05: cámara y galería del producto, datos base y campos por tipo en el editor. La implementación se conserva en `ProductEditorActivity.kt`, `ProductDraftAndPreview.kt`, los layouts XML y la capa de productos; el informe previo registra además su espacio inicial de productos (commit 500fd16). Véase [detalle del aporte](dan-velasquez-a02-a05.md). |
| Alonso Nuñez | Documentación de ventas/inventario en f55908b; el cierre añadió la pantalla y conexión real. |
| Felipe Gallardo | Base de datos/reglas Firebase iniciales; el cierre migró el backend vigente a Supabase. |
| Kisho | Panel web como responsabilidad asignada del equipo; el código del panel se conserva desde c5ceb55. La atribución individual se verifica con los autores del historial, sin generar commits en su nombre. |

## Límites y plan

Se entrega APK de pruebas, no un APK de producción. Huella, TalkBack, dictado y cámara física requieren la revisión en los teléfonos de las usuarias; las pruebas automatizadas no sustituyen esa validación. Android mínimo 26 sigue provisional hasta disponer del inventario de celulares. Google OAuth requiere configurar el proveedor con el profesor. La equivalencia de App Check se reserva como Importante para el cierre final; Auth y RLS no prueban la autenticidad del APK. Ferias, mapas y seguidores pertenecen a las entregas siguientes.

El backend usado es la instancia Supabase del grupo entregada por el profesor; la adaptación técnica de los requisitos redactados originalmente para Firebase se registra en el modelo y en el informe de seguridad. La integración directa a main sigue la instrucción del grupo y no acredita la revisión independiente de PR que solicita la pauta. La etiqueta entrega-5 identifica el cierre presentado; no se inventan revisiones ni aportes de integrantes.
