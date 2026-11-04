# Ajustes de acceso y tienda Android

## A08: desactivar huella

Desactivar huella elimina la preferencia y la clave biométrica local, cierra la sesión y muestra el formulario de correo y contraseña. Si hay cambios sin guardar, primero se permite seguir editando o descartarlos. Al volver a abrir la tienda ya no se restaura la sesión anterior. La prueba del modelo verifica el cierre, la limpieza del borrador y el nuevo ingreso por contraseña.

## A16 y A17: elegir tipo y sector

El tipo se elige entre los nombres de `entrepreneur_types` leídos mediante `ShopRepository`. Si falla la consulta, aparece un mensaje y la opción de reintentar. El sector se elige entre sectores de Puerto Montt definidos en `PUERTO_MONTT_SECTORS`, en la capa de dominio; no se toman todos los sectores escritos en tiendas públicas, pues estos pueden incluir otras comunas. La lista se mantiene en ese único lugar y no modifica datos del servidor.

La selección modifica el borrador. Solo **Guardar cambios** publica los datos. Un valor antiguo fuera de las listas se sigue mostrando y se conserva al editar otros campos; no se convierte automáticamente en la primera opción ni se ofrece como una nueva elección. El modelo rechaza nuevos valores ajenos a las opciones cargadas. Cancelar el diálogo deja la selección anterior.

Referencias municipales para la lista local: [Alerce, Centro, Isla Tenglo, Pichi Pelluco y Mirasol](https://www.puertomontt.cl/municipio-de-puerto-montt-propone-proyecto-que-asegura-conectividad-con-alerce/), [Chinquihue](https://www.puertomontt.cl/inversion-de-600-millones-mejorara-las-luminarias-en-puerto-montt/) y [El Tepual](https://www.puertomontt.cl/municipio-repara-mas-de-1-400-luminarias-en-los-sectores-de-mirasol-y-el-tepual/). Es una lista inicial de selección, no un inventario oficial exhaustivo.

## Verificación y límites

- Pruebas del modelo: sesión al desactivar huella, selección y guardado, valores históricos, error y reintento sin perder el borrador.
- Compilación del APK conectado, compilación de pruebas instrumentadas y Android Lint.
- Consulta pública real: los tipos disponibles incluyen Alimentos, Artesanías y Servicios.
- No había teléfono conectado ni emulador configurado al verificar; quedan pendientes la interacción visual en dispositivo, el sensor de huella y las comprobaciones reales de texto/logo después de cerrar por completo la app.
- Google Cloud tiene el cliente OAuth y la cuenta de prueba preparados. El proveedor del servidor sigue deshabilitado; no se afirma que A09/W28 funcionen de extremo a extremo.
- B01–B13 de la pauta mencionan Firebase. Las tablas y RLS de Supabase y el respaldo histórico `f87cc6a` no demuestran que las reglas estén publicadas en Firebase ni reemplazan esa demostración.
