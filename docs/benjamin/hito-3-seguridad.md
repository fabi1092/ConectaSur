# Hito 3: pruebas e informe de seguridad

Fecha: 31 de octubre de 2026 (Chile). Responsable: Benjamín Tampier.
Revisión de cierre: 1 de noviembre de 2026. Las evidencias conservan la fecha real de cada ejecución.
Revisión local sobre el código del grupo; coordinación pendiente con Felipe y los responsables de las pantallas finales.

## 1. Alcance y estado de requisitos

| Requisito | Evidencia y estado |
|---|---|
| RNF-SEG-01 | Reglas por perfil verificadas sobre usuarios, tiendas, catálogo, ventas y fotos. Ferias y los módulos que aún no existen requieren pruebas al integrarse. |
| RNF-SEG-02 | **Pendiente:** la huella todavía no está implementada. No solicitarla al iniciar no equivale a implementar BiometricPrompt. |
| RNF-SEG-03 | Exclusiones de Git y revisión acotada de archivos versionados. No se declara auditado todo el historial ni garantizada la ausencia de cualquier secreto. |
| RNF-SEG-04 | Suite automatizada contra Authentication, Firestore y Storage locales. Incluye operaciones permitidas y rechazadas por perfil. |
| RNF-SEG-05 | Android Lint, inventario Maven consultado en OSV, npm audit y revisión manual de la capa web existente. No se ejecutó MobSF y todavía no hay un panel web visual que permita evaluar XSS, cabeceras o despliegue. |
| RNF-SEG-06 | **Pendiente:** activar y verificar App Check en el proyecto compartido. |
| RNF-SEG-07 | **Pendiente:** registro consultable de acciones del administrador. |
| RNF-SEG-08 | Este informe reúne resultados, fuentes, correcciones, riesgos residuales y pendientes. Debe repetirse con el producto final. |
| RNF-PRI-01 | **Pendiente:** esta revisión técnica no acredita por sí sola el cumplimiento normativo de privacidad. |
| RNF-PRI-03 | Stock y ventas separados del catálogo público; pruebas de acceso. Falta validar de extremo a extremo los cambios de visibilidad y precios con las pantallas reales. |

La planificación permite completar RNF-SEG-06 y 07 en la entrega 8 si no alcanzan en la 5. No se presentan como implementados.

## 2. Reproducción

Requiere **Node.js >=24.12.0**, JDK 21 y el SDK Android indicado en el README. Node 20 no cumple los requisitos de las versiones actuales del SDK de Firebase.

Desde la raíz:

~~~sh
npm --prefix web ci
npm --prefix firebase ci
npm --prefix firebase test
~~~

La prueba usa exclusivamente el proyecto ficticio **demo-conectasur** y los emuladores locales. Las pruebas web abortan si faltan las variables de conexión a los emuladores. No se desplegaron reglas ni se usaron cuentas o datos reales.

Desde Android:

~~~sh
./gradlew assembleDebug testDebugUnitTest lintDebug
./gradlew -I ../security/dependencies.init.gradle :app:securityDependencies
~~~

Guardar la salida de la segunda orden en security/reports/dependencies.log y, desde la raíz, consultar el inventario:

~~~sh
node security/check-android-dependencies.mjs
npm --prefix firebase audit --json
npm --prefix web audit --json
~~~

La consulta a OSV envía únicamente coordenadas Maven y versiones, no código ni credenciales.

El workflow **Pruebas de seguridad** instala ambas carpetas, ejecuta los emuladores y comprueba auditorías. Falla con alertas altas en las herramientas Firebase y con moderadas o superiores en las dependencias web. Las moderadas de desarrollo permanecen abiertas y documentadas; ese umbral no las elimina ni equivale a certificar el producto.

## 3. Resultados y evidencias

- **81 pruebas aprobadas, 0 fallidas, 9 suites**: 73 casos de reglas/integración de datos y 8 de la capa web real.
- **15 pruebas unitarias Android**, sin fallos ni errores: CatalogTest (8) y SalesTest (7).
- Compilación debug correcta y Android Lint: **0 errores, 10 advertencias**; las advertencias no se ocultan ni equivalen a pruebas fallidas.
- Auditoría npm: **web sin alertas**; herramientas Firebase **17 moderadas, 0 altas y 0 críticas** después de actualizar dependencias compatibles y fijar grpc-js corregido.
- La primera consulta OSV detectó Guava 32.1.3-android con GHSA-xxph-c9ww-hj94; se actualizó a 33.7.2-android y se repitió el análisis: **108 dependencias consultadas, 0 con avisos conocidos** en esa ejecución. Esto no certifica ausencia de vulnerabilidades desconocidas.

Archivos revisables:

| Archivo | Qué contiene |
|---|---|
| ../../security/reports/verification.json | Totales, permisos del manifiesto combinado, revisión acotada de secretos y SHA-256 de fuentes probadas. |
| ../../security/reports/audit-firebase.json | Salida completa de npm audit para las herramientas del emulador. |
| ../../security/reports/audit-web.json | Salida completa de npm audit para la dependencia web. |
| ../../security/reports/android-dependencies.json | Versiones Maven efectivamente resueltas y avisos encontrados en OSV. |
| ../../firebase/test/rules.test.js | Casos de reglas y operaciones de publicación/venta contra Firestore y Storage. |
| ../../firebase/test/web.test.js | Prueba de las funciones reales de web/firebase-data.js con Authentication y Firestore emulados. |

Los JSON describen una ejecución local y una instantánea de las fuentes. Los logs completos y los reportes HTML/XML de Gradle se generan localmente y no se versionan. security/collect-evidence.mjs reconstruye el resumen a partir de esas salidas; falla si falta una ejecución o hay pruebas fallidas. El resultado del workflow remoto debe comprobarse por separado en GitHub Actions.

### Casos cubiertos

| Grupo | Operaciones y ataques probados |
|---|---|
| Visitante | Lectura pública permitida; stock, ventas y perfiles privados denegados; publicación denegada. |
| Emprendedora | Editar tienda y datos propios; bloqueo de tienda ajena, cambio de dueño y campos administrativos; copia pública sin stock; bloqueo de productos públicos ajenos. |
| Cuenta desactivada | Bloqueo de edición de tienda, productos, ventas, publicación, subida y borrado de fotos. |
| Administrador | Gestión permitida de cuentas, tiendas y asociaciones; lectura de ventas y stock privado denegada; mantenimiento de fotos permitido. |
| Comprador | Catálogo público permitido; stock y ventas privados denegados; administración y subida/borrado de fotos denegados; registro de perfil sin escalamiento de rol. |
| Producto privado | Rechazo al crear y actualizar con stock negativo, fraccionario, textual o fuera de Int; precio negativo o textual; nombre vacío; descripción excesiva; modalidad inválida; pieza única con más de una unidad; ID/tienda incoherentes; campos inesperados y variantes inválidas. |
| Venta | Rechazo al crear y actualizar con cantidad cero, negativa, fraccionaria o textual; precio inválido; producto sin ID; nombre vacío; variante con tipo incorrecto; fecha/lugar inválidos y campos inesperados. Se rechazan documentos incompletos. |
| Fotos | Carpeta propia permitida; ajena denegada; MIME no imagen y tamaño >=2 MiB rechazados; borrado controlado por perfil. El MIME declarado no certifica el contenido real ni reemplaza una validación de imagen. |
| Publicación | Un batch con producto privado inválido falla completo: no queda una copia pública creada a medias. |
| Venta integrada de datos | Publicación de pieza única, descuento de stock, retiro de copia pública e historial en transacción; una segunda venta por ese flujo se rechaza al no existir stock. |
| Capa web | Rechazo sin administrador antes de crear una cuenta; rechazo y cierre de sesión de perfiles inactivos, ausentes o con rol desconocido; creación administrativa conservando su sesión; cierre de la sesión secundaria y logout; bloqueo de colecciones arbitrarias en listas. |

## 4. Hallazgos y correcciones

Las severidades técnicas siguientes son estimaciones del proyecto, salvo las procedentes de npm/OSV, cuya clasificación se conserva. Se separan problemas de compatibilidad y mantenimiento de vulnerabilidades.

| ID | Gravedad / tipo | Hallazgo | Corrección o estado |
|---|---|---|---|
| SEC-01 | Moderada: integridad | La dueña podía escribir productos privados y ventas con cualquier forma o tipo de dato. | Reglas con campos permitidos/obligatorios, tipos, identificadores, límites, modalidades y cantidades; pruebas negativas de creación y actualización. |
| SEC-02 | Moderada: privacidad web | La capa web guardaba documentos en IndexedDB incluso en un computador compartido. | Caché en memoria. La sesión de navegador se limita a la pestaña y la sesión secundaria es solo en memoria. Si una versión anterior ya se usó, cerrar sesión y borrar sus datos de sitio en ese equipo: el cambio no borra retroactivamente una caché anterior. |
| SEC-03 | Moderada: acceso web | Se intentaba crear la cuenta Authentication antes de verificar que la sesión fuera administradora. | Comprobación previa de perfil activo/admin en funciones administrativas y cierre de la sesión secundaria con finally. Las reglas siguen verificando autorización aunque se omita la UI. |
| SEC-04 | Moderada: sesión web | Un fallo al leer el perfil podía dejar una sesión autenticada sin validar. | login cierra sesión ante errores, perfiles ausentes, inactivos o roles desconocidos. Pruebas contra emuladores. |
| SEC-05 | Alta según npm: dependencias de desarrollo | grpc-js 1.9.16 generaba alertas altas directas y propagadas. | Actualización compatible mediante override ^1.14.7 y lockfile; las cinco alertas altas de la revisión inicial desaparecieron. Suite repetida después de npm ci. |
| SEC-06 | Moderada según aviso Guava | Guava 32.1.3-android, transitiva de Firestore, aparece afectada por asignación excesiva de memoria al deserializar colecciones. | Se fija Guava 33.7.2-android, versión corregida. Inventario Maven/OSV y compilación repetidos. No se identificó una ruta de deserialización nativa de entradas externas en el código propio; se actualiza igualmente la dependencia. |
| SEC-07 | Moderada: validación pública | Precios negativos, ID público incoherente y descripción excesiva. | Correcciones del hito original conservadas y verificadas. |
| SEC-08 | Moderada: validación de tienda | Nombre vacío y showPrices de tipo incorrecto. | Correcciones del hito original conservadas y verificadas. |
| HARD-01 | Endurecimiento de respaldo | El manifiesto no definía listas explícitas de extracción/transferencia. | Se conservan las reglas que incluyen únicamente presentation.xml. allowBackup=false sigue deshabilitando Auto Backup; no se afirma que las preferencias se respalden efectivamente ni que ese atributo esté deprecado. |
| COMP-01 | Compatibilidad, no vulnerabilidad alta demostrada | InvalidFragmentVersionForActivityResult al incorporar Firebase. | Se conserva Fragment 1.8.6 y Lint pasa sin errores. No se acredita explotación ni se asigna gravedad alta solo por ser un error bloqueante del build. |
| MANT-01 | Rendimiento y estilo | DrawAllocation y UseKtx. | Se conservan las mejoras anteriores; no se presentan como vulnerabilidades de seguridad. |

### Alertas moderadas de herramientas Firebase que siguen abiertas

npm audit informa 17 paquetes afectados directa o transitivamente, derivados de cuatro avisos raíz. **No son 17 fallos independientes ni se reclasifican como menores.**

| Dependencia / aviso | Impacto y alcance observado | Tratamiento |
|---|---|---|
| @opentelemetry/core · GHSA-8988-4f7v-96qf | Posible agotamiento de memoria mediante Baggage. Llega por Pub/Sub dentro de firebase-tools, no por el APK ni por la capa web. | Abierto. La suite usa Auth/Firestore/Storage local, no un servidor público de Pub/Sub. Actualizar la CLI y repetir auditoría cuando haya una resolución compatible. |
| glob · GHSA-3g3m-2fjr-6pw4 | Recorrido de archivos posterior a cancelación/timeout. Dependencia de herramientas que trabajan con archivos del equipo. | Abierto. No ejecutar estas herramientas sobre proyectos o archivos no confiables. No imponer una versión mayor incompatible sin probar las funciones afectadas de la CLI. |
| minimatch · GHSA-g3hv-75wg-m249 | Denegación de servicio por patrones de glob. Varias dependencias de la CLI mantienen versiones antiguas. | Abierto. No aceptar patrones de usuarios externos en scripts de mantenimiento. Actualizar la cadena de herramientas al existir una solución compatible. |
| uuid · GHSA-w5hq-g745-h8pq | Problema de límites al usar determinadas versiones de UUID con un buffer proporcionado. La copia de gaxios revisada invoca v4 sin ese buffer. | Abierto como dependencia vulnerable; la ruta observada no coincide con la descrita por el aviso. Actualizar gaxios/CLI cuando sea compatible. |

No se ejecutó audit fix --force: propone reemplazos mayores o retrocesos de SDK/CLI, y no es una reparación validada. Estas herramientas permanecen en devDependencies; las dependencias reales de la capa web se auditan por separado. El riesgo del equipo de desarrollo sigue existiendo.

## 5. Revisión de Android, web y repositorio

- Se revisan el manifiesto de origen **y el combinado**: Firebase añade ACCESS_NETWORK_STATE y READ_GSERVICES además de INTERNET; AndroidX añade un permiso de firma para receptores internos. La lista exacta está en verification.json. No se declara cámara, micrófono, ubicación ni almacenamiento general.
- usesCleartextTraffic=false está activo. Esto es una configuración de plataforma, no una prueba completa de todo el tráfico de bibliotecas nativas ni de la configuración TLS de producción.
- La compilación revisada es **debug**, con depuración habilitada. No es un APK de producción auditado o firmado para distribución definitiva.
- El logo se elige mediante OpenDocument con permisos acotados al URI y decodificación escalada. No se solicita acceso general a las fotos.
- La capa web no usa eval, innerHTML, document.write ni almacenamiento propio de contraseñas. Solo existe la capa de datos: el renderizado, CSP, cabeceras y despliegue deben analizarse cuando exista el panel.
- Las reglas de Firestore/Storage son la barrera de autorización; requireAdmin en JavaScript solo evita acciones innecesarias. Un atacante puede modificar su JavaScript.
- Crear usuarios mediante un SDK cliente no convierte Authentication en un alta exclusivamente administrativa. Las cuentas sin perfil privilegiado no obtienen permisos; para restringir también el alta de identidad se necesita un mecanismo de aprovisionamiento confiable. Si falla el batch después de crear la identidad, puede quedar una cuenta sin perfil: requiere reconciliación administrativa.
- El escaneo de patrones de claves privadas y nombres de archivos revisa los archivos versionados, sin imprimir su contenido. No sustituye un escáner especializado ni una revisión del historial.
- No se ejecutaron MobSF ni una auditoría legal de privacidad. Se corrige la atribución ambigua del informe anterior.

## 6. Contrato de datos y límites de las reglas

Las validaciones respetan los mapas producidos por FirestoreMappers.kt y FirebaseSalesRepository.kt:

- Producto: id, shopId, name, description, category, priceClp, showPrice, stockMode, quantity, visible, photo y variants. updatedAt es opcional y, si existe, timestamp.
- Stock por unidades: entero entre 0 e Int.MAX_VALUE. Pieza única: 0 o 1, sin variantes. A pedido: admite quantity=null.
- Variantes: lista de hasta **10** mapas id/label/quantity. Cada elemento se valida, incluido el último. Es un límite técnico del esquema en lista para permanecer dentro del presupuesto de reglas de Firestore, no un hallazgo de terreno. Dan debe reflejarlo en el editor; si se necesitan más opciones, Felipe y Dan deben migrarlas a una subcolección con reglas por documento.
- Venta: productId, productName, variantId nullable, quantity entera positiva, priceClp no negativo, place, dateMillis y createdAt. Al crear, createdAt debe ser serverTimestamp; una actualización conserva esa fecha.
- Las ventas siguen siendo editables y borrables por su dueña, como antes; no se implementó un libro contable inmutable.
- Las reglas validan documentos y perfiles. **No certifican por sí solas** que la suma de variantes coincida con el stock total, que no existan IDs de variante duplicados o que toda escritura de venta incluya el descuento exacto de inventario. El caso integrado prueba ese flujo concreto en transacción; no todas las intercalaciones concurrentes ni clientes maliciosos.
- La copia pública no acepta quantity. La coherencia completa de esa copia con visible/showPrice y el ajuste global showPrices, incluida la retirada de precios ya publicados, aún debe verificarse e integrarse. No se presenta un simple campo de configuración como protección retroactiva del precio.

## 7. Verificación pendiente sobre las pantallas finales

| Prueba | Responsable de integración | Estado |
|---|---|---|
| Ingreso real, cuenta desactivada, cierre de sesión y huella opcional con BiometricPrompt | Fabián + Benjamín | Pendiente con pantalla final/proyecto compartido. |
| Crear/editar producto y variantes, errores comprensibles de validación y publicación sin stock/precio oculto | Dan + Felipe + Benjamín | Contrato probado en emulador; pantalla pendiente. |
| Dos ventas simultáneas, agotados, variantes e historial opcional usando el repositorio Android real | Alonso + Felipe + Benjamín | Transacción de ejemplo y lógica unitaria probadas; prueba completa pendiente. |
| Roles, renderizado seguro, caché/sesión tras cerrar la pestaña y configuración del servidor web | Kisho + Benjamín | Funciones de datos probadas; navegador/panel/despliegue pendientes. |
| App Check y registro de acciones del administrador | Felipe + Kisho + Benjamín | Pendiente; repetir informe al implementarse. |

## 8. Referencias técnicas

- [Validación de campos y límites de tipos en reglas](https://firebase.google.com/docs/firestore/security/rules-fields).
- [Condiciones, acceso a otros documentos y transacciones](https://firebase.google.com/docs/firestore/security/rules-conditions).
- [Persistencia de Authentication web](https://firebase.google.com/docs/auth/web/auth-state-persistence).
- [Caché offline y equipos compartidos](https://firebase.google.com/docs/firestore/manage-data/enable-offline).
- [Respaldo y extracción de datos Android](https://developer.android.com/identity/data/autobackup).
- [API OSV](https://google.github.io/osv.dev/api/).
- [Aviso del mantenedor de Guava](https://github.com/google/guava/security/advisories/GHSA-xxph-c9ww-hj94).
