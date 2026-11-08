# Variantes, modalidades, stock, al agotarse y valores por defecto — Fabián

Implementación y validación en Android para los puntos **A06, A07, A08, A09 y A15** del módulo de catálogo y productos (`RF-PRO-05`, `RF-PRO-06`, `RF-PRO-07`, `RF-PRO-08` y `RF-PRO-11`).

## Comportamiento

- **A06 — Variantes (`RF-PRO-05`)**: En el paso **Variantes** de `ProductEditorActivity`, la emprendedora agrega hasta 20 opciones con identificador único, nombre obligatorio, precio propio opcional, foto propia opcional y unidades disponibles. Cuando una variante omite precio o foto, la proyección pública (`OwnerProduct.toPublicOrNull` y `variantPhoto` en `ProductRules.kt`) utiliza el precio y la foto principales del producto. En `item_variant_editor.xml` e `item_owner_product.xml` cada tarjeta agrupa sus controles en un contenedor vertical accesible.
- **A07 — Modalidades (`RF-PRO-06`)**: Se admiten productos regulares con conteo (`UNITS`), piezas únicas (`UNIQUE`), productos a pedido (`ON_REQUEST`) y regulares sin conteo (`UNLIMITED`). Una pieza única admite únicamente `0` o `1` unidad y bloquea la adición o guardado de variantes.
- **A08 — Stock y conteo de unidades (`RF-PRO-07`)**: En `UNITS`, si el producto tiene variantes, el stock total se calcula como la suma de las unidades de sus opciones; en `ON_REQUEST` y `UNLIMITED` se ocultan los campos de unidades por producto y por variante, se normaliza `quantity = null` y las ventas no descuentan unidades.
- **A09 — Al agotarse (`RF-PRO-08`)**: Cuando un producto `UNITS` queda sin stock (`0` unidades), la proyección pública respeta `soldOut`:
  - `HIDE`: se retira del catálogo público.
  - `SHOW`: permanece visible como **Agotado** sin exponer la cantidad privada.
  - `ORDER`: pasa a mostrarse como **A pedido** (`onRequest = true`) y permite registrar pedidos mediante `sell()` / `saleError()` sin producir stock negativo.
  - Las piezas únicas (`UNIQUE`) con stock `0` se retiran siempre del catálogo público, independientemente de `soldOut`.
- **A15 — Valores por defecto (`RF-PRO-11`)**: Desde **Mis productos → Preferencias de productos e historial** (`ProductManagerActivity`), la dueña configura modalidad, comportamiento al agotarse, publicación inicial y visibilidad de precio mediante `ProductDefaults`. Al abrir el editor para un producto nuevo, este nace con esos valores predeterminados; los productos ya creados conservan sus propios valores.

## Archivos principales

- `android/app/src/main/java/cl/surcode/conectasur/domain/ProductRules.kt`: modelo `ProductDefaults`, proyección pública `OwnerProduct.toPublicOrNull`, resolución de foto/precio por variante y validación `validatedForCatalog`.
- `android/app/src/main/java/cl/surcode/conectasur/domain/Catalog.kt` y `Repositories.kt`: consistencia de agotamiento (`HIDE`, `SHOW`, `ORDER`) y soporte de pedidos sin stock negativo en `sell()`.
- `android/app/src/main/java/cl/surcode/conectasur/ProductEditorActivity.kt` y `ProductManagerActivity.kt`: conexión del flujo guiado, vista previa pública con estado por variante y pantalla de valores por defecto.
- `android/app/src/main/res/layout/item_variant_editor.xml` e `item_owner_product.xml`: disposición vertical de controles para edición de variantes y tarjetas del catálogo privado.
- `android/app/src/test/java/cl/surcode/conectasur/domain/Entrega5RulesTest.kt`: pruebas unitarias de variantes, herencia de precio/foto, validación de modalidades, agotamiento y valores por defecto.

## Verificación

- `gradlew.bat assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug`: APK debug y APK de pruebas instrumentadas compilados, Android Lint aprobado y **83 pruebas unitarias aprobadas** (9 en `Entrega5RulesTest`).
- La validación visual en teléfono físico o emulador, cámara y galería por variante permanece sujeta a las pruebas instrumentadas y manuales descritas en la entrega.
