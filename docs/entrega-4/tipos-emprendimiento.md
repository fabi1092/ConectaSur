# Gestión de tipos de emprendimiento — W20

El panel administrativo incorpora Tipos de emprendimiento para crear y editar opciones como Artesanías, Alimentos o Servicios. El listado también permite buscar por nombre, sin distinguir mayúsculas ni tildes, y muestra un mensaje cuando no hay resultados. La búsqueda corresponde a un listado administrativo de catálogo del ítem W24; las demás secciones conservan su estado anterior.

## Recorrido

1. Ingresar como administrador y abrir Tipos de emprendimiento.
2. Agregar tipo, escribir su nombre y guardar. El identificador se genera automáticamente y no se pide a la persona.
3. Buscar el tipo, elegir Editar, cambiar su nombre y guardar. Recargar y comprobar el nombre nuevo.
4. Editar una tienda en el panel o ingresar como emprendedora y abrir Editar tienda en la web. Los nombres vigentes aparecen entre las sugerencias de Tipo de emprendimiento.
5. Elegir el nuevo nombre y guardar la ficha. El mismo dato queda en la base compartida con Android y en la ficha pública.

La interfaz conserva la paleta, iconos con texto, controles grandes, ayudas de lectura y contraste. Cancelar o salir de una edición con cambios solicita confirmación. Un error mantiene el nombre escrito y permite reintentar. El editor de asociaciones conserva su confirmación al cambiar de sección.

## Datos y permisos

Se utiliza entrepreneur_types, con id estable y name, y las políticas RLS ya existentes. Solo un administrador activo puede guardar. La lectura del catálogo es pública para que las tiendas consulten sus opciones. Las pantallas acceden a listItems y saveEntrepreneurType de la capa de datos; no consultan directamente al SDK.

Se validan nombres no vacíos y de hasta 120 caracteres, y se normalizan espacios. Antes de guardar se avisa si ya se encuentra otro nombre equivalente sin distinguir mayúsculas/tildes. Esta comprobación no constituye una restricción única frente a altas simultáneas de varios administradores.

La creación mantiene el mismo ID durante los reintentos. La edición compara el nombre original al actualizar; si otra sesión guardó un nombre distinto, se pide volver a la lista. Si la primera escritura se confirmó pero su respuesta se perdió, reintentar reconoce la misma fila y nombre sin agregar otra.

No se requiere migración: el catálogo y sus políticas ya estaban creados. Las categorías y los tipos de producto siguen siendo listas separadas.

## Decisión sobre las tiendas existentes

shops.entrepreneur_type contiene texto, no una clave foránea hacia entrepreneur_types. Renombrar un tipo cambia las sugerencias para próximas selecciones, pero no reclasifica automáticamente las tiendas ya guardadas. El formulario conserva el dato anterior y la persona puede elegir el nuevo nombre y guardar. Esta decisión también se explica al editar un tipo.

Este hito conecta los selectores de la web. Android mantiene su campo de texto actual y consume el mismo valor guardado de la tienda; no se afirma que incorpore un selector nuevo en este cambio.

## Verificación

security/entrepreneur-types-check.mjs crea y elimina una tienda/cuenta y tipos ficticios propios. Comprueba lectura pública y RLS, creación y edición persistentes, validaciones, búsqueda, cancelación, conflictos entre sesiones, pérdida de respuesta al crear/editar, reintentos, error de lectura y sugerencias en los dos editores web de tienda. Confirma que la ficha guardada no se reclasifica al renombrar el catálogo.

ENTREPRENEUR_TYPES_URL permite probar la web local o publicada. Evidencias y capturas en security/reports/entrepreneur-types/. Los errores de red se simulan; los accesos y guardados se verifican contra Supabase real. La revisión móvil usa Chromium emulado, no un teléfono físico ni una prueba con usuarias.

Resultado final: 14 comprobaciones aprobadas en local y 14 en https://conectasur-dev.web.app. Se revisaron capturas de escritorio/celular, Vite compiló correctamente y la publicación respondió HTTP 200 con los mismos archivos de la compilación verificada. Los fixtures se eliminaron al terminar. Un ensayo anterior agotó la espera del mensaje de conflicto; su causa no se determinó. El caso aislado en API/navegador y los recorridos completos finales en local y publicado aprobaron.
