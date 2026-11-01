# Hito 3: pruebas e informe de seguridad

Fecha: 31 de octubre de 2026. Responsable: Benjamín Tampier (en coordinación con Felipe Gallardo para el entorno de reglas de Firebase).

Cubre **RNF-SEG-01, RNF-SEG-02, RNF-SEG-03, RNF-SEG-04, RNF-SEG-05, RNF-SEG-08** y **RNF-PRI-01, RNF-PRI-03**, dejando documentado el estado de **RNF-SEG-06** y **RNF-SEG-07**.

---

## 1. Comandos de verificación

### Pruebas automatizadas de reglas de Firestore y Storage (RNF-SEG-04)

Desde la carpeta `firebase` (con JDK 21 en `JAVA_HOME`):

```sh
npm ci
npm test
```

El script inicia `firebase emulators:exec --only firestore,storage --project demo-conectasur` y ejecuta la suite `firebase/test/rules.test.js`.

### Compilación, pruebas unitarias y análisis estático Android (RNF-SEG-05)

Desde la carpeta `android`:

```sh
./gradlew assembleDebug testDebugUnitTest lintDebug
```

---

## 2. Resultados de las pruebas de reglas por perfil (RNF-SEG-01, RNF-SEG-04, RN-10)

Se ejecutaron **27 casos de prueba automatizados** distribuidos en 5 suites (**27 aprobados, 0 fallidos** en `6,94 s`), verificando tanto operaciones permitidas como intentos de acceso no autorizado por cada perfil:

| Perfil / Suite | Caso probado | Tipo | Resultado |
|---|---|---|---|
| **Visitante (sin sesión)** | Leer catálogo público (`publicProducts`) y tiendas (`shops`) | Permitido | Aprobado |
| **Visitante (sin sesión)** | Leer productos privados (`shops/{id}/products`) o ventas (`sales`) | Rechazado | Aprobado (Denegado) |
| **Visitante (sin sesión)** | Leer perfiles (`users/{uid}`) o escribir en catálogo público | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Editar los datos permitidos de su propia tienda (`shopA`) | Permitido | Aprobado |
| **Emprendedora** | Editar la tienda de otra emprendedora (`shopB`) | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Cambiar `ownerUid` o `active` de su propia tienda | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Dejar el nombre de su tienda vacío (`""`) o guardar tipos inválidos (`showPrices: "si"`) | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Publicar un producto válido en `publicProducts` para su tienda | Permitido | Aprobado |
| **Emprendedora** | Filtrar stock privado (`quantity`) en `publicProducts` o publicar en tienda ajena | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Publicar en `publicProducts` con precio negativo (`-1000`) o `id` incoherente con el documento | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Borrar o modificar productos públicos de otra emprendedora | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Leer y escribir su catálogo privado y su historial de ventas | Permitido | Aprobado |
| **Emprendedora** | Leer el catálogo privado o las ventas de otra emprendedora | Rechazado | Aprobado (Denegado) |
| **Emprendedora (desactivada)** | Editar su tienda tras haber sido desactivada (`active: false`) | Rechazado | Aprobado (Denegado) |
| **Emprendedora** | Crear asociaciones o nuevas tiendas | Rechazado | Aprobado (Denegado) |
| **Administrador** | Crear asociaciones, tiendas y cuentas de emprendedora | Permitido | Aprobado |
| **Administrador** | Desactivar la cuenta de una emprendedora | Permitido | Aprobado |
| **Administrador** | Leer un documento o la colección de ventas de una emprendedora (**RN-10**) | Rechazado | Aprobado (Denegado) |
| **Comprador** | Leer el catálogo público (`publicProducts`) | Permitido | Aprobado |
| **Comprador** | Crear asociaciones o editar tiendas | Rechazado | Aprobado (Denegado) |
| **Comprador** | Crear su propio perfil con rol `comprador` (y rechazo si intenta rol `admin`) | Permitido / Rechazado | Aprobado |
| **Comprador** | Crear perfil con `displayName` vacío o escalar su rol a `admin` mediante `update` | Rechazado | Aprobado (Denegado) |
| **Storage** | Emprendedora sube imagen (`image/png`, < 2 MB) a la carpeta de su tienda (`shops/shopA/`) | Permitido | Aprobado |
| **Storage** | Emprendedora intenta subir imagen a la carpeta de otra tienda (`shops/shopB/`) | Rechazado | Aprobado (Denegado) |
| **Storage** | Emprendedora intenta subir un archivo no imagen (`text/plain`) | Rechazado | Aprobado (Denegado) |
| **Storage** | Emprendedora intenta subir una imagen de 2 MB o más (`>= 2 MB`) | Rechazado | Aprobado (Denegado) |
| **Storage** | Visitante sin sesión intenta subir archivo a una tienda | Rechazado | Aprobado (Denegado) |

---

## 3. Vulnerabilidades y hallazgos detectados (RNF-SEG-05, RNF-SEG-08)

Se ejecutó la auditoría de reglas de Firestore y Storage, Android Lint (`:app:lintDebug`), revisión de manifiesto/APK (criterios OWASP MASVS / MobSF) y auditoría de paquetes (`npm audit`). Todos los hallazgos se detallan a continuación con su gravedad y estado:

| ID | Componente / Herramienta | Gravedad | Hallazgo detectado | Corrección aplicada o justificación |
|---|---|---|---|---|
| **VULN-01** | Android (`build.gradle.kts`) · Android Lint (`InvalidFragmentVersionForActivityResult`) | **Alta** | Al incorporar `firebase-auth`, se resolvió transitivamente una versión antigua de `androidx.fragment` (< 1.3.0) que hacía fallar `:app:lintDebug` con error bloqueante y exponía el manejo de códigos de solicitud en `registerForActivityResult`. | **Corregido:** Se fijó `implementation("androidx.fragment:fragment-ktx:1.8.6")` en `android/app/build.gradle.kts`. `:app:lintDebug` pasó a **0 errores**. |
| **VULN-02** | Firestore (`firestore.rules`) · Auditoría de reglas | **Moderada** | La función `validPublic()` en `/publicProducts/{productId}` permitía precios negativos (`priceClp < 0`), no exigía que el campo `id` coincidiera con `productId` ni acotaba el tamaño de `description`. | **Corregido:** Se actualizó `validPublic(d, productId)` exigiendo `d.id == productId`, `d.priceClp >= 0` y `description.size() <= 1000`. Se agregó prueba automática en `rules.test.js`. |
| **VULN-03** | Firestore (`firestore.rules`) · Auditoría de reglas | **Moderada** | En `/shops/{shopId}`, `allow update` para la dueña filtraba las claves modificadas (`hasOnly`), pero no validaba tipos ni longitudes, permitiendo dejar `name` vacío (`""`) o corromper el tipo booleano de `showPrices`. | **Corregido:** Se añadieron validaciones de tipo y longitud para `name` (1 a 120 caracteres), `showPrices` (`bool`) y `description` (`<= 1000` caracteres), más prueba automática en `rules.test.js`. |
| **VULN-04** | Android (`AndroidManifest.xml`) · Android Lint (`DataExtractionRules`) / MobSF | **Moderada** | En Android 12+ (`targetSdk = 36`), `android:allowBackup="false"` por sí solo está deprecado y no define reglas explícitas de extracción para transferencias dispositivo a dispositivo (D2D) ni respaldo en la nube, pudiendo incluir cachés locales de Firestore o sesiones futuras. | **Corregido:** Se crearon `res/xml/data_extraction_rules.xml` y `res/xml/backup_rules.xml` permitiendo únicamente `presentation.xml` (preferencias visuales de accesibilidad) y excluyendo el resto de datos internos. |
| **VULN-05** | Firestore (`firestore.rules`) · Auditoría de reglas | **Menor** | El registro de perfil propio de `comprador` en `/users/{uid}` no verificaba que `displayName`, cuando se envía, fuera un `string` no vacío con límite de longitud. | **Corregido:** Se exigió `displayName is string && size() > 0 && size() <= 120` en `firestore.rules` y se verificó con prueba en `rules.test.js`. |
| **VULN-06** | Android (`ProductPhotoView.kt`, `MainActivity.kt`, `AccessibilityPreferences.kt`) · Android Lint | **Menor** | Advertencias `DrawAllocation` (instanciación de `Matrix` en `onDraw`) y `UseKtx` (`SharedPreferences.edit` y `Uri.parse`). | **Corregido:** Se reutiliza una única instancia `cropMatrix` en `ProductPhotoView` y se adoptaron las extensiones KTX (`prefs.edit {}` y `String.toUri()`), reduciendo las advertencias de Lint de 17 a 10 avisos informativos. |
| **VULN-07** | Herramientas CLI (`firebase/package.json`) · `npm audit` | **Menor (Solo Dev)** | `npm audit` reporta avisos en subdependencias transitivas de `firebase-tools` y `@firebase/rules-unit-testing` (`@grpc/grpc-js`, `glob`, `minimatch`, `uuid`, `@opentelemetry/core`). | **Justificado:** Son paquetes exclusivos de `devDependencies` para ejecutar el emulador local en computador; no se empaquetan en el APK de Android ni en el sitio web. Ejecutar `npm audit fix --force` degradaría `firebase` a v9.14.0 y `firebase-tools` a v13.11.2, rompiendo la suite de pruebas actual. |

---

## 4. Revisión de seguridad del APK, Manifiesto y Repositorio (RNF-SEG-02, RNF-SEG-03, RNF-PRI-03)

1. **Tráfico de red seguro:** `android:usesCleartextTraffic="false"` activo en `AndroidManifest.xml`, impidiendo conexiones HTTP en texto plano.
2. **Superficie de permisos mínima:** Solo se declara `android.permission.INTERNET` y la consulta `<queries>` para el motor de síntesis de voz (`TTS_SERVICE`). No se solicitan permisos de almacenamiento masivo, cámara, micrófono ni ubicación.
3. **Selección segura de imágenes y prevención de OOM:** El logo local utiliza `ActivityResultContracts.OpenDocument()` con permisos de lectura acotados al URI seleccionado y decodificación escalada (`inSampleSize`) con tope de `1024 px`.
4. **Credenciales fuera del repositorio (RNF-SEG-03):** `.gitignore` excluye `google-services.json`, `firebase-config.json`, `service-account*.json`, `*.jks`, `*.keystore` y `local.properties`. Se verificó que ninguno de estos archivos existe en el árbol de Git.
5. **Biometría (RNF-SEG-02):** La aplicación no solicita huella al iniciar ni almacena datos biométricos propios; cuando se integre el inicio de sesión de Fabián, delegará exclusivamente en `BiometricPrompt` del sistema operativo.

---

## 5. Estado de mecanismos de detección y límites (RNF-SEG-06, RNF-SEG-07)

- **Firebase App Check (RNF-SEG-06, prioridad Importante)** y **Registro auditable de acciones del administrador (RNF-SEG-07, prioridad Importante):** De acuerdo con la planificación oficial (Entrega 5 / Entrega 8) y los límites documentados en `docs/felipe/modelo-datos.md`, quedan registrados como pendientes para su activación sobre el proyecto Firebase compartido y el panel web administrativo antes de la entrega final.
- **Pruebas unitarias tras las correcciones:** 15 pruebas unitarias ejecutadas y aprobadas (`8` en `CatalogTest` + `7` en `SalesTest`), `0` errores en `lintDebug` y `27` pruebas de reglas aprobadas en el emulador.
