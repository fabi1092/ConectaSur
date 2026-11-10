# Flujo guiado, persistencia de borrador, vista previa y modo sin conexión — Benjamín Tampier

Implementación, integración y validación en Android para los criterios **A01, A10, A11, A16 y A17** del módulo de catálogo y productos (`RF-PRO-01`, `RF-PRO-09`, `RN-09`, `RNF-USA-04`, `RF-PRO-12` y `RNF-DAT-03`).

## Comportamiento

- **A01 — Alta guiada paso a paso (`RF-PRO-01`)**: En `ProductEditorActivity`, la función `showStep()` junto con `ProductDraftAndPreview.kt` divide la creación del producto en cuatro etapas secuenciales con barra de progreso y botones `pe_previous` / `pe_next`:
  1. **Paso 1 de 4: Foto** (`pe_step_0`).
  2. **Paso 2 de 4: Datos del producto** (`pe_step_1`).
  3. **Paso 3 de 4: Variantes** (`pe_step_2`).
  4. **Paso 4 de 4: Disponibilidad y publicación** (`pe_step_3`), donde se muestra el resumen (`formatDraftReviewSummary`) y el botón de confirmación `pe_save`.
- **A10 — Disponible o no disponible (`RF-PRO-09`, `RN-09`)**: La casilla `pe_visible` marca si el producto se publica o no. Cuando está desmarcada (`visible = false`), el producto desaparece de la vitrina pública (`toPublicOrNull() == null`), pero permanece visible en el catálogo privado de la emprendedora identificado como **No disponible** (`privateAvailabilityLabel`).
- **A11 — Recuperación de borrador al cerrar la aplicación (`RNF-USA-04`)**: Cada cambio en los controles y el evento `onStop()` invocan `persist()`, guardando el borrador cifrado por tienda (`workspace.saveDraft`). Al volver a abrir `ProductEditorActivity` o pulsar «Continuar borrador» en `ProductManagerActivity`, `shouldResumeDraft` restaura el paso exacto, fotografías, atributos y variantes sin perder lo ingresado.
- **A16 — Vista previa del catálogo en la app (`RF-PRO-12`)**: En `ProductManagerActivity`, el botón `pm_preview` alterna entre el catálogo privado (`formatPrivateCatalogDetails`) y la vista previa pública (`formatPublicPreviewDetails`). La vista previa respeta la modalidad, disponibilidad, precios visibles y estado al agotarse (`Agotado`, `A pedido`, `Disponible`) sin exponer las cantidades privadas de stock.
- **A17 — Consulta sin red y sincronización al recuperar conexión (`RNF-DAT-03`)**: `OwnerWorkspaceRepository` conserva el catálogo en caché local cifrada (`cached`) y encola altas, ediciones y eliminaciones en `pending` y `deleted` (`mergeOfflineCatalog`). Sin conexión, la emprendedora consulta y modifica su catálogo viendo el aviso de cambios pendientes (`formatCatalogSyncStatus`); al volver la red, `sync()` sube las fotografías locales y sincroniza las operaciones con Supabase.

## Archivos principales

- `android/app/src/main/java/cl/surcode/conectasur/domain/ProductDraftAndPreview.kt`: funciones de navegación por pasos (`PRODUCT_EDITOR_STEPS`, `formatEditorStepHeader`, `nextEditorStep`, `previousEditorStep`), resumen de borrador (`formatDraftReviewSummary`), reanudación (`shouldResumeDraft`), vista previa (`formatPublicPreviewDetails`, `formatPrivateCatalogDetails`) y fusión sin red (`mergeOfflineCatalog`, `formatCatalogSyncStatus`).
- `android/app/src/main/java/cl/surcode/conectasur/ProductEditorActivity.kt`: integración del flujo guiado (`showStep`), guardado automático (`persist`, `onStop`) y recuperación (`onOwnerReady`).
- `android/app/src/main/java/cl/surcode/conectasur/ProductManagerActivity.kt`: alternancia de vista previa pública (`pm_preview`) y estado de sincronización (`refresh`, `render`).
- `android/app/src/main/java/cl/surcode/conectasur/data/OwnerWorkspaceRepository.kt`: almacenamiento local cifrado de borradores, caché offline y cola de sincronización con Supabase.
- `android/app/src/test/java/cl/surcode/conectasur/domain/ProductDraftAndPreviewTest.kt`: pruebas unitarias de los 4 pasos guiados, reanudación de borrador, visibilidad privada vs pública, vista previa sin stock privado y fusión offline.
