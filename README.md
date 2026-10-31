# ConectaSur

Proyecto de SurCode para Programación en Android 2026.

## Hito 1 de Benjamín

Base Android en Kotlin y Views con diseño XML, con pantalla inicial, logo y colores de ConectaSur. Este hito permite abrir el proyecto, editarlo con Palette, compilarlo e instalarlo. Aún no incluye autenticación, navegación entre módulos ni conexión a Firebase.

### Editar con Palette

1. Abrir `android` en Android Studio y sincronizar Gradle.
2. En la vista Android del panel izquierdo, abrir `app > res > layout > activity_main.xml`.
3. Seleccionar **Design** o **Split**, arriba a la derecha del editor. En **Code** no aparece Palette.
4. Arrastrar componentes desde **Palette** al `ConstraintLayout` y asignar sus restricciones. Los textos y colores están en `res/values/strings.xml` y `colors.xml`.

El logo usa una subclase de `ImageView` para mostrar la variante horizontal de la imagen original. Compilar el proyecto si el editor necesita cargar esa clase para la vista previa. Kotlin contiene el comportamiento; la distribución de los componentes está en XML.

### Abrir y ejecutar

1. En Android Studio, abrir la carpeta `android`.
2. Usar el JDK integrado de Android Studio y un SDK Android 36 con Build Tools 36.0.0.
3. Sincronizar Gradle y ejecutar `app` en un dispositivo o emulador Android 8.0 o superior.

En una terminal, dentro de `android`:

```sh
./gradlew assembleDebug lintDebug
./gradlew connectedDebugAndroidTest
```

En Windows se puede usar `gradlew.bat`. El APK se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. La primera compilación descarga dependencias.

La versión mínima API 26 es provisional y debe contrastarse con los teléfonos registrados en el levantamiento. No se han probado todas las versiones Android.

## Trabajo por hitos

Cada hito se prepara en una rama, se demuestra y se envía mediante un pull request para revisión de otro integrante. No se mezclan todos los módulos en un solo commit ni se crean contribuciones en nombre de compañeros.

1. **Hito 1:** base Android compilable e instalable.
2. **Hito 2:** navegación, accesibilidad y vista previa del catálogo con datos de ejemplo.
3. **Hito 3:** pruebas de reglas, análisis e informe de seguridad; distinguir resultados ejecutados de casos pendientes.

Las funciones de acceso y tienda corresponden a Fabián; catálogo a Dan; ventas a Alonso; Firebase a Felipe y panel web a Kisho. Los contratos compartidos se acuerdan antes de integrar.

## Seguridad inicial

La app no solicita permisos de cámara, micrófono o almacenamiento, no guarda credenciales y no realiza conexiones de red en este hito. Se desactiva la copia de seguridad de sus datos y el tráfico de texto claro. La única actividad exportada es la de entrada. Estas medidas no acreditan todavía los permisos de Firebase ni sustituyen las pruebas de seguridad de la EVA 3.

No subir `local.properties`, `google-services.json`, claves privadas, contraseñas ni archivos de firma. No se requieren para ejecutar esta base.
