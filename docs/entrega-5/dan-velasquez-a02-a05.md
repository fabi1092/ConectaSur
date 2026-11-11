# Aporte de Dan Velásquez — A02 a A05

Este registro se basa en la distribución del equipo compartida en la imagen y en el código presente en el proyecto recibido. No cambia la autoría histórica de los archivos ni crea commits en nombre de otra persona.

## Alcance asignado

- **A02–A05:** cámara y galería para adjuntar una foto al producto.
- **Datos base:** captura y persistencia de los datos principales del producto.
- **Campos por tipo:** muestra atributos específicos del tipo de producto seleccionado.

## Dónde está en el proyecto

- `android/app/src/main/java/cl/surcode/conectasur/ProductEditorActivity.kt`: selección de cámara (`TakePicture`) y galería (`GetContent`), preparación de foto, selección del tipo y renderizado de sus campos específicos.
- `android/app/src/main/java/cl/surcode/conectasur/domain/ProductDraftAndPreview.kt`: representación de datos de producto y borrador/previa.
- `android/app/src/main/java/cl/surcode/conectasur/data/OwnerWorkspaceRepository.kt` y `data/SupabaseRepositories.kt`: persistencia y acceso al catálogo según la configuración del proyecto.
- `android/app/src/main/res/layout/`: controles visuales del editor de productos.

Los campos concretos de tipos administrados se cargan desde los datos configurados en el servidor; el editor también contempla los tipos incorporados en la aplicación.

## Revisión manual sugerida

1. Abrir **Mi tienda → Mis productos → Agregar**.
2. En el paso **Foto**, elegir una imagen de galería y revisar la vista previa; repetir con **Tomar foto** en un dispositivo con cámara.
3. Completar nombre, descripción, categoría, precio y tipo, avanzar y volver para confirmar que se conservan.
4. Cambiar entre tipos (por ejemplo artesanía, alimento y ropa) y confirmar que cambian los campos específicos.
5. Guardar y comprobar el producto en el catálogo de la tienda.

La cámara física debe comprobarse en un teléfono o emulador con cámara disponible; la revisión de código por sí sola no acredita esa prueba práctica.
