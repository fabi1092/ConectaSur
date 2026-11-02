# Requisitos y aceptación — Entrega 5

La siguiente matriz distingue lo implementado de la validación pendiente en teléfonos reales. La conexión de datos se adapta a Supabase conforme a la migración del grupo. Las cuentas usadas en las pruebas son ficticias.

| Requisito | Implementación y criterio de aceptación |
|---|---|
| RF-PRO-01 | **Dado** una emprendedora con tienda, **cuando** agrega un producto, **entonces** recorre Foto → Datos → Variantes → Disponibilidad/Publicación y puede volver conservando lo ingresado. |
| RF-PRO-02 | **Dado** el formulario, **cuando** guarda datos válidos, **entonces** conserva foto principal, nombre, descripción, categoría, precio CLP y tipo. El servidor rechaza valores inválidos. |
| RF-PRO-03 | **Dado** un tipo elegido, **cuando** edita el producto, **entonces** aparecen sus campos específicos y se conservan en attributes. Incluye artesanía, alimentos, ropa/tejidos, planta viva y tipos adicionales del administrador. |
| RF-PRO-04 | **Dado** un producto propio, **cuando** lo edita o confirma eliminarlo, **entonces** el catálogo se actualiza; si está sin red, se informa la operación pendiente y se sincroniza después. |
| RF-PRO-05 | **Dado** un producto con variantes, **cuando** define cada opción, **entonces** guarda identificador, nombre, foto opcional, precio propio opcional y unidades. La foto o precio omitidos usan los principales. |
| RF-PRO-06 | **Dado** un producto, **cuando** elige modalidad, **entonces** puede ser regular, a pedido o pieza única. Una pieza única admite cero o una unidad y no admite variantes. |
| RF-PRO-07 | **Dado** un producto regular, **cuando** desactiva el conteo, **entonces** usa UNLIMITED y sus ventas no descuentan unidades. ON_REQUEST identifica a pedido. |
| RF-PRO-08 | **Dado** un regular que llega a cero, **cuando** se consulta públicamente, **entonces** HIDE lo oculta, SHOW muestra Agotado y ORDER muestra A pedido. Con ORDER y stock cero puede registrar pedidos sin producir stock negativo. |
| RF-PRO-09 | **Dado** un producto propio, **cuando** desmarca Disponible, **entonces** desaparece públicamente y permanece en su catálogo privado. |
| RF-PRO-10 | **Dado** una selección, categoría o catálogo completo, **cuando** confirma un cambio de disponibilidad, precio visible o al agotarse, **entonces** se aplica al conjunto elegido. En línea usa una transacción; sin red conserva cambios pendientes por producto. |
| RF-PRO-11 | **Dado** las preferencias, **cuando** guarda modalidad, visibilidad, precio y agotamiento predeterminados, **entonces** los próximos productos nacen con esos valores y los existentes no cambian. |
| RF-PRO-12 | **Dado** la configuración de producto y tienda, **cuando** abre la vista previa o catálogo público, **entonces** se respetan agotamiento y visibilidad, y no se exponen cantidades privadas ni precios ocultos. |
| RF-VEN-01 | **Dado** un producto con variantes y stock, **cuando** confirma una venta válida, **entonces** el servidor descuenta solo la variante elegida y toma su precio. Una venta rechazada no altera stock. |
| RF-VEN-02 | **Dado** una pieza única publicada, **cuando** se vende, **entonces** queda en cero y deja de aparecer públicamente, independientemente de sold_out. |
| RF-VEN-03 | **Dado** historial activo, **cuando** se confirma la venta, **entonces** se guardan cantidad, precio unitario, producto, variante, fecha del servidor y lugar. El campo lugar admite nombre de feria u otro lugar; la selección de ferias de la plataforma se ampliará con ese módulo. |
| RF-VEN-04 | **Dado** ventas guardadas, **cuando** aplica fechas, nombre de producto y lugar/feria, **entonces** se muestran las coincidentes y su total. |
| RF-CFG-06 | **Dado** el historial activado o desactivado, **cuando** cambia la preferencia, **entonces** las ventas futuras guardan o no su detalle; el descuento de stock sigue funcionando. |
| RNF-USA-04 | **Dado** un producto en edición, **cuando** cierra y vuelve a abrir el editor, **entonces** recupera el borrador completo cifrado, incluido el paso y las fotos. |
| RNF-DAT-03 | **Dado** su catálogo descargado, **cuando** pierde red, **entonces** lo consulta y guarda cambios localmente; al recuperar red se reenvían con su cuenta. Las ventas no se confirman sin respuesta del servidor. |
| RNF-REN-01 | **Dado** una foto, **cuando** la prepara, **entonces** se reduce hasta 1024 píxeles y se convierte a JPEG de hasta 2 MiB antes de subir. |
| RNF-USA-01/02/03 | **Dado** las preferencias de accesibilidad, **cuando** usa los formularios, **entonces** conserva lenguaje simple, pasos, texto escalable y controles de al menos 56 dp (72 con botones grandes). |
| RNF-SEG-04/05/08 | **Dado** los comandos y workflows documentados, **cuando** ejecuta las pruebas y análisis, **entonces** obtiene los resultados y hallazgos vinculados al código, con corrección o justificación. |

## Pruebas asociadas

- Entrega5Test: borrador cifrado, publicación guiada/foto/variante, venta de pieza única e historial, sincronización de alta y eliminación sin red.
- StoreAccessTest y LaunchTest: acceso/edición persistente/cierre, conversión y rechazo de logos e inicio.
- Entrega5RulesTest, CatalogTest y SalesTest: estados públicos, piezas únicas, stock y lectura CLP.
- entrega5.test.js: agotamiento, regular sin stock, variantes públicas, cambio masivo, configuración inválida y venta a pedido.
- security.test.js / web.test.js: permisos por perfil, transacciones, concurrencia, idempotencia, privacidad y Storage real.
- sql.test.js: RLS/RPC en PostgreSQL aislado dentro de GitHub Actions.

La cámara física, selección de foto por variante desde la galería, lectura TalkBack y dictado se implementan, pero su validación práctica completa con usuarias queda para la prueba en dispositivos. No se presenta esa validación como automatizada.
