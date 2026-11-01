# Avances de Benjamín Tampier

## Hito 1: base Android

Preparado en `feat/benjamin/hito-1-base-android` e integrado a main hasta el commit `1d59a24`. Incluye configuración Gradle, logo, pantalla inicial XML para Palette y prueba de lanzamiento. Se corrigió el nombre de fuente para la vista previa del IDE.

## Hito 2: pantallas y accesibilidad

Rama: `feat/benjamin/hito-2-pantallas`. Incluye navegación XML, catálogo y detalle de ejemplo, tienda, ayuda, ajustes de letras y botones, contraste, lectura opcional y logo local. La pantalla de ventas sigue reservada para integrar el trabajo de Alonso.

Ver `hito-2-pantallas.md` para las referencias, contratos y límites. El hito se guarda por separado del primero y no declara implementados los módulos del resto del equipo.

## Hito 3: pruebas e informe de seguridad

Rama: `feat/benjamin/hito-3-seguridad`. Incluye la auditoría y endurecimiento de `firebase/firestore.rules`, ampliación de la suite automática a 27 pruebas por perfil en Firebase Emulator Suite (`firebase/test/rules.test.js`), corrección del error bloqueante de Android Lint (`InvalidFragmentVersionForActivityResult`), reglas de extracción y respaldo para Android 12+ (`data_extraction_rules.xml` y `backup_rules.xml`), limpieza de advertencias en vistas/preferencias y el informe detallado en `hito-3-seguridad.md`.

## Forma de entrega

Commits con mensajes simples, separados por hitos. El usuario solicitó los envíos de estos avances a main. La protección de main y los pull requests revisados que exige la pauta siguen pendientes de acuerdo con el equipo.
