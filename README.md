# ConectaSur

Aplicación de SurCode para conectar emprendedoras y compradores de Puerto Montt y Alerce.

## Avance actual: hito 2

Android en Kotlin y Views, con pantallas XML editables con Palette. Incluye inicio, catálogo de ejemplo, detalle, tienda, ayuda, preferencias de accesibilidad y lectura opcional. Nombres y precios son ficticios; las fotografías provienen de la visita.

Las funciones de acceso, edición de productos, ventas y Firebase aún deben integrarse con el trabajo de los otros integrantes. La pantalla de ventas informa que esa función estará disponible más adelante.

## Abrir en Android Studio

1. Abrir la carpeta real `android` del proyecto.
2. Usar JDK 21, SDK Android 36 y Build Tools 36.0.0; sincronizar Gradle.
3. Ejecutar `app` en un teléfono o emulador Android 8.0 o superior.

La versión mínima API 26 es provisional y debe contrastarse con los teléfonos de las emprendedoras. No se han probado todas las versiones Android.

## Editar con Palette

En la vista Android: `app > res > layout > screen_home.xml`. Seleccionar **Design** o **Split**. En Code no se muestra Palette.

`activity_main.xml` contiene la navegación y una inclusión de inicio para mostrarla en el editor. Las demás pantallas están en `screen_catalog.xml`, `item_product.xml`, `screen_detail.xml`, `screen_store.xml`, `screen_settings.xml`, `screen_help.xml`, `screen_sales.xml` y `dialog_menu.xml`.

El logo usa una subclase de ImageView para mostrar la variante horizontal del original. Si el editor necesita cargarla, compilar el proyecto. Kotlin contiene el comportamiento y XML distribuye los componentes. Si la vista se ve demasiado ampliada, usar Zoom to Fit.

## Compilar y comprobar

Desde la carpeta `android`:

```sh
./gradlew assembleDebug testDebugUnitTest lintDebug
./gradlew connectedDebugAndroidTest
```

En Windows se puede usar `gradlew.bat`. El APK queda en `app/build/outputs/apk/debug/app-debug.apk`. La primera compilación descarga dependencias. Las pruebas de dispositivo necesitan un emulador o teléfono conectado.

## Trabajo por hitos

1. Base Android y logo.
2. Pantallas, navegación y accesibilidad.
3. Pruebas e informe de seguridad.

Cada hito se prepara y comprueba por separado, con mensajes de commit simples. El usuario solicitó enviar estos hitos directamente a main. Para cumplir la pauta del profesor, el equipo debe acordar la protección de main y el flujo de pull requests revisados; no se declara cumplido ese criterio con este envío.

Fabián se encarga de acceso y tienda; Dan de productos; Alonso de ventas; Felipe de Firebase y Kisho del panel web. Benjamín desarrolla la base, navegación, accesibilidad y pruebas de seguridad. Todos deben registrar sus propias contribuciones.

Consulta [la guía del hito 2](docs/benjamin/hito-2-pantallas.md) para los puntos de integración y las referencias de accesibilidad.

## Datos y permisos

Esta demostración no usa Firebase ni credenciales. Guarda preferencias visuales y una referencia local al logo elegido. El selector del sistema permite elegir una imagen sin acceso general al almacenamiento. La lectura usa una voz instalada y comienza solo al pulsar Escuchar. Compartir abre un selector de aplicaciones y utiliza texto marcado como ejemplo, sin inventar enlaces públicos.

La app no solicita cámara, micrófono ni huella al iniciar y no incluye permiso de Internet. Estas decisiones no sustituyen las reglas y pruebas de seguridad de Firebase del hito 3.

No subir `local.properties`, `google-services.json`, claves privadas, contraseñas, archivos de firma ni archivos generados de build.
