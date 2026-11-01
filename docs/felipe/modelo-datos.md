# Modelo de datos, reglas y pruebas (Felipe Gallardo)

Responsable: Felipe Gallardo. Base de datos: Cloud Firestore (+ Cloud Storage para imagenes). Cubre RNF-DAT-01, 02, 03, 04 y RNF-SEG-01, 04.

## 1. Colecciones

| Coleccion | Quien lee | Quien escribe | Contenido |
|---|---|---|---|
| `users/{uid}` | el propio usuario y el admin | admin (el comprador crea solo su perfil de comprador) | `role` (admin / emprendedora / comprador), `active`, `shopId`, `displayName` |
| `shops/{shopId}` | todos | admin crea y borra; la dueña edita sus datos visibles | `ownerUid`, `name`, `description`, `logoUrl`, `entrepreneurType`, `sector`, `contact`, `showPrices`, `active`, `associationIds` |
| `shops/{shopId}/products/{productId}` | solo su dueña | solo su dueña | producto **privado**: datos comunes, `stockMode`, `quantity`, `visible`, `photo`, `variants[]` |
| `shops/{shopId}/sales/{saleId}` | solo su dueña (ni el admin) | solo su dueña | `productId`, `productName`, `variantId`, `quantity`, `priceClp`, `place`, `dateMillis` |
| `publicProducts/{productId}` | todos | la dueña de `shopId` | copia **publica** sin stock ni precio oculto: `id`, `shopId`, `name`, `description`, `category`, `priceClp`, `onRequest`, `photo` |
| `associations/{id}` | todos | admin | `name`, `sector`, `description`, `active` |
| `categories`, `productTypes`, `entrepreneurTypes` | todos | admin | `name` |

## 2. Decisiones y justificacion

1. **Roles en `users/{uid}`**, no en custom claims: los claims requieren Admin SDK o Cloud Functions; asi el plan gratuito basta. Las reglas leen el rol con `get()`.
2. **Catalogo privado y publico separados.** Las reglas de Firestore no pueden ocultar campos de un documento: si el stock estuviera en el documento publico, cualquiera podria descargarlo. Por eso el stock vive en `shops/{id}/products` (privado) y el catalogo publico es una copia sin datos privados (`publicProducts`) que se escribe en el mismo `WriteBatch` o transaccion. Las reglas validan que la copia publica solo tenga los campos permitidos.
3. **Ventas privadas** (RN-10): solo la dueña las lee; el administrador no tiene acceso.
4. **Venta con transaccion:** descuenta solo la opcion vendida, retira la pieza unica y guarda el historial en una sola operacion atomica.
5. **Sin conexion** (RNF-DAT-03): Android conserva la caché local de Firestore. La web usa memoria para evitar documentos persistentes en computadores compartidos: la caché web dura mientras la página permanezca abierta. La tolerancia a cortes de red debe probarse en las pantallas finales.
6. **Acceso solo por repositorios** (RNF-DAT-02): las pantallas usan las interfaces de `domain/Repositories.kt`; la web usa `web/firebase-data.js`.

## 3. Consultas principales (y sus indices)

- Catalogo publico: `publicProducts` completo (o filtrado por `shopId`): indice automatico.
- Productos de una tienda: `shops/{id}/products`: indice automatico.
- Historial: `shops/{id}/sales` ordenado por `dateMillis` descendente: indice automatico de un solo campo. Filtros por fecha/producto se hacen sobre ese resultado; si se agregan filtros combinados en el servidor, Firestore indicara el indice compuesto a crear y se agrega a `firebase/firestore.indexes.json`.

## 4. Reglas de seguridad

Archivos: `firebase/firestore.rules` y `firebase/storage.rules`. Todo lo no listado queda denegado. Storage: solo imagenes de menos de 2 MB, dentro de `shops/{shopId}/`, y solo su dueña o el admin pueden subir.

## 5. Pruebas automaticas (RNF-SEG-04)

Archivo: `firebase/test/rules.test.js`, ejecutado con Firebase Emulator Suite. Comando (desde `firebase/`): `npm test`.

Casos por perfil (permitidos y rechazados):

- Visitante: lee catalogo publico y tiendas; NO lee productos privados, ventas ni perfiles; NO escribe.
- Emprendedora: edita su tienda; NO edita la de otra; NO cambia dueño ni se reactiva sola; publica producto publico valido; NO publica con stock ni en tienda ajena; NO toca productos publicos ajenos; lee sus ventas; NO lee ventas ajenas; desactivada no edita.
- Administrador: crea asociaciones, tiendas y cuentas; desactiva emprendedoras; NO lee ventas (RN-10).
- Comprador: lee catalogo; NO crea asociaciones ni edita tiendas; crea su perfil solo como comprador.
- Storage: sube imagen a su carpeta; NO a la de otra; NO archivos que no son imagen; visitante NO sube.

**Verificación vigente:** 81 pruebas aprobadas (73 de reglas/integración de datos y 8 de la capa web). Ver [informe de Benjamín](../benjamin/hito-3-seguridad.md) y [evidencia JSON](../../security/reports/verification.json). La salida anterior de 23 casos se sustituye por esta referencia para evitar resultados contradictorios.

## 6. Datos ficticios (RNF-DAT-04)

`firebase/seed/seed.mjs` (`npm run seed`) carga 2 emprendedoras, 1 asociacion, categorias, tipos y 5 productos en un proyecto de **desarrollo**, separado del real.

## 7. Limites

- Las pruebas de reglas comprueban las reglas, no la app completa; la integracion con las pantallas la prueba cada integrante.
- Firebase App Check y el registro de acciones del administrador (RNF-SEG-06 y 07) estan pendientes.
- Las fotos de los productos de ejemplo siguen siendo recursos locales de la app; la subida a Storage esta lista en el repositorio, pero cada pantalla debe adoptarla.

## 8. Validaciones reforzadas del hito 3

Productos privados y ventas ahora exigen los campos y tipos emitidos por los repositorios Android, con stock no negativo, cantidad de venta positiva, precio no negativo y coherencia de identificadores. Las variantes en lista se limitan a 10 y se valida cada elemento. Dan debe reflejar este límite técnico en el editor; para más opciones, migrar a documentos separados. Ver el contrato y los límites de consistencia en el informe de seguridad.
