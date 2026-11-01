# Hito 3: seguridad con Supabase

Fecha de cierre: 1 de noviembre de 2026. Responsable: Benjamín Tampier.
Este informe sustituye el estado Firebase conservado en docs/historico/hito-3-firebase.md. La migración fue solicitada después de recibir la instancia exclusiva SurCode del profesor.

## Resultados verificados

| Verificación | Resultado | Alcance |
|---|---|---|
| Auth, API PostgreSQL/RLS/RPC y Storage reales | 40 aprobadas, 0 fallidas | Instancia exclusiva del grupo; cuentas y fixtures temporales |
| Capa web real con supabase-js | 7 aprobadas, 0 fallidas | Login, permisos, administración, catálogo y cierre de sesión |
| Repositorios Android reales | 5 aprobadas | API 36: login/logout, refresh token, producto/venta, caché/borrador offline y JPEG real en Storage |
| Navegación y accesibilidad existentes | 6 aprobadas | API 36, build de demostración: inicio, catálogo, CLP, regreso, tienda pública y preferencias |
| Pruebas unitarias de dominio | 15 aprobadas | Catálogo y lógica de venta |
| Compilación Android y Lint | Build correcto; 0 errores, 7 advertencias | Kotlin, Views/XML y dependencias actuales |
| Dependencias Maven consultadas en OSV | 44 consultadas, 0 con avisos conocidos | Inventario realmente resuelto para debug |
| Dependencias npm | Auditorías adjuntas | Web y herramientas Supabase, por separado |

Las pruebas UI tuvieron una primera ejecución bloqueada por un diálogo “System UI isn't responding” del emulador; se cerró ese diálogo y se repitieron las seis pruebas con resultado correcto. No se interpreta el bloqueo como una prueba de aplicación aprobada.

No se declara validación completa de TalkBack en teléfonos reales, prueba de todas las versiones Android ni auditoría de producción. El APK revisado es debug. La prueba real Android se habilita explícitamente y recibe cuentas ficticias por argumentos del runner; sus contraseñas no están en el APK de aplicación ni en Git.

## Modelo de autorización

- La anon key identifica al cliente. Cada usuario inicia sesión y recibe su JWT propio.
- Las tablas privadas tienen RLS; solo la dueña activa consulta y administra su stock y ventas.
- El rol administrativo de ConectaSur puede gestionar tiendas, perfiles y asociaciones, y consultar el registro de acciones; no lee stock ni ventas de emprendedoras.
- El panel Studio es una herramienta privilegiada del grupo/profesor. Su acceso no acredita los permisos de un usuario de aplicación; las pruebas usan anon y JWT por perfil.
- Nuevas cuentas reciben rol comprador por trigger. La metadata de signup no permite convertirse en admin.
- La aplicación no utiliza service_role ni credenciales de Studio.
- Las vistas públicas seleccionan campos explícitos y aplican visibilidad/precio. No se entrega stock al cliente para ocultarlo solamente en pantalla.

## Correcciones y mejoras respecto de Firebase

| Hallazgo anterior | Medida aplicada en Supabase | Evidencia |
|---|---|---|
| Escrituras privadas sin validar | Tipos SQL, NOT NULL, CHECK, claves foráneas y trigger de variantes | Rechazo de cantidades, precios, modalidades, opciones e IDs inválidos |
| Copia pública podía quedar desactualizada | Vistas calculadas public_products/public_shops | Ocultar precios de tienda retira también los publicados; agotados/invisibles no se consultan |
| Precio/stock de variantes inconsistente | IDs únicos, validación por elemento y total calculado en servidor | Stock total normalizado, duplicados rechazados, precio de venta tomado de la variante |
| Venta podía escribirse evitando descuento | Clientes sin INSERT/UPDATE/DELETE sobre sales; venta mediante RPC | Inserción directa rechazada para todos los perfiles, incluso admin de aplicación |
| Riesgo de sobreventa concurrente | Bloqueo FOR UPDATE y transacción única | Dos ventas de la última unidad permiten una sola |
| Reintento tras una respuesta perdida | UUID y recibo de idempotencia por dueño/solicitud | Repetir la solicitud no descuenta otra vez; reutilizarla con datos distintos se rechaza |
| Stock/ventas filtrables a otros perfiles | RLS por dueño, perfil activo y tienda activa | Otras emprendedoras, comprador, visitante y admin no acceden a esos datos |
| Storage de Firebase no disponible en Spark | Bucket y políticas en la instancia Supabase suministrada | Subida/descarga reales en API y desde Android, bloqueo de carpeta ajena y cuenta desactivada |
| Sesión/caché privada expuesta en el teléfono | AES-GCM con clave en Android Keystore y almacenamiento excluido del respaldo | Se comprueba que preferencias no contienen UID/token en claro; restauración cifrada verificada |
| Pérdida de productos por cortes de red | Borrador cifrado por UID y cola recuperable | Se simula conexión fallida y luego se reenvía con la misma cuenta |
| Caché web persistente en equipo compartido | Sesión por pestaña, sin persistencia local de documentos | Diseño de la capa web; verificación de cierre de sesión |
| Falta de auditoría administrativa | Triggers generan actor, acción, destino y fecha; clientes sin escritura | Registro de cambios permitido para admin, falsificación/lectura de comprador rechazada |
| Alertas de firebase-tools/Guava | Retiro del SDK/herramientas Firebase y sus dependencias | Nuevas auditorías npm e inventario Maven |

El MIME declarado y el límite del bucket no son un antivirus. Solo se alojan imágenes publicables JPEG/PNG/WebP hasta 2 MiB; el bucket es público para lectura. Los documentos privados requieren otro almacenamiento y políticas.

## Ejecución reproducible

Requisitos: Node >=24.12, JDK 21 y SDK Android 36.

~~~sh
npm --prefix web ci
npm --prefix supabase ci
~~~

### Entorno SQL desechable (GitHub Actions)

Crear PostgreSQL 15 local con una base vacía llamada conectasur_test y definir TEST_DATABASE_URL. Ejecutar npm test desde supabase. Las pruebas abortan si el destino no es local o tiene otro nombre; bootstrap-local.sql simula los contratos SQL de auth/storage para probar políticas y RPC con roles PostgreSQL reales. No reemplaza la verificación de los servicios HTTP reales.

El workflow Pruebas de seguridad Supabase utiliza esa base desechable, sin credenciales del profesor, y ejecuta las auditorías npm. El estado remoto se comprueba por separado en GitHub Actions.

### Instancia real del grupo

npm run test:live desde supabase usa la configuración privada, crea fixtures aislados y los limpia al terminar. Studio solo prepara/limpia: las operaciones verificadas usan clientes anon/JWT.

En el equipo de Benjamín, local-access.ps1 -Action test carga la configuración cifrada con Windows DPAPI. No se copian esas credenciales a los workflows públicos.

### Android

~~~sh
./gradlew assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug
./gradlew -PconectaDemo=true -Pandroid.testInstrumentationRunnerArguments.class=cl.surcode.conectasur.LaunchTest,cl.surcode.conectasur.NavigationTest connectedDebugAndroidTest
~~~

SupabaseIntegrationTest requiere supabaseLive=true y testEmail/testPassword por argumentos del runner. No incluye ni solicita credenciales de Studio. Se ejecutaron sus cinco casos contra la instancia real.

Las salidas completas quedan en security/reports/*.log (ignoradas en Git); verification.json reúne contadores, permisos, hashes normalizados y revisión acotada de archivos privados. Las auditorías npm y el inventario OSV se adjuntan como JSON. La búsqueda de patrones no acredita ausencia de cualquier secreto ni revisa todo el historial.

## Estado de requisitos y límites

| Requisito | Estado |
|---|---|
| RNF-SEG-01 | Control por perfil implementado y probado en RLS/RPC/Storage para módulos existentes. Ferias y módulos futuros deben añadir políticas y casos. |
| RNF-SEG-02 | Huella opcional con API del sistema pendiente de la pantalla de acceso de Fabián. |
| RNF-SEG-03 | Configuraciones completas y credenciales privadas excluidas de Git; cifrado local y revisión de patrones. |
| RNF-SEG-04 | Pruebas de permisos migradas a Supabase; las 81 de Firebase quedan como históricas. |
| RNF-SEG-05 | Lint, auditorías npm, OSV y revisión manual del código activo. MobSF no se ejecutó. |
| RNF-SEG-06 | Pendiente acordar con el profesor el control de integridad de cliente equivalente a Firebase App Check. Auth/RLS por sí solos no prueban autenticidad del APK. |
| RNF-SEG-07 | Auditoría implementada para perfiles, tiendas, asociaciones y sus vínculos. Se debe ampliar cuando exista gestión de ferias. |
| RNF-SEG-08 | Informe y evidencias actualizados. Repetir sobre pantallas finales y despliegue definitivo. |
| RNF-PRI-01 | La revisión técnica no certifica cumplimiento legal de privacidad; pendiente revisión normativa. |
| RNF-DAT-03 | Android: lectura de caché y borradores cifrados; ventas requieren conexión. La web no implementa una experiencia offline completa. |

Google OAuth está deshabilitado en el servidor actual, comprobado con /auth/v1/settings. El ingreso por correo funciona. Habilitar Google requiere coordinación con el profesor y configuración del proveedor.

El panel web visual y las pantallas finales de acceso, productos y ventas siguen en desarrollo por sus integrantes. Se probaron los adaptadores reales; esto no reemplaza las pruebas finales con las pantallas ni con las emprendedoras.

## Referencias

- [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [Seguridad de Storage](https://supabase.com/docs/guides/storage/security/access-control).
- [Auth](https://supabase.com/docs/guides/auth).
- [Claves de API](https://supabase.com/docs/guides/api/api-keys).
- [Instancias administradas por el profesor / self-hosting](https://supabase.com/docs/guides/self-hosting/docker).
- [API de OSV](https://google.github.io/osv.dev/api/).
