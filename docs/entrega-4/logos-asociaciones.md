# Logo de asociaciones — W12

Hito del 3 de noviembre de 2026. El administrador puede crear o editar una asociación con nombre, descripción, sector, contacto y logo. En el listado aparece el logo o una inicial cuando no hay imagen disponible.

## Demostración

1. Ingresar como administrador y abrir Asociaciones.
2. Crear una asociación o editar una existente. Completar sus datos y elegir un logo JPG, PNG o WebP.
3. Revisar la vista previa y guardar. La imagen se convierte a JPEG y se reduce a un máximo de 1024 px y 2 MiB antes de subirla.
4. Recargar, volver a Asociaciones y comprobar el logo guardado. Editar otros datos no lo elimina.
5. Elegir otra imagen para reemplazarlo. Quitar logo prepara el retiro; se confirma al guardar. Cancelar o salir con cambios pide confirmación y permite descartarlos.

Los controles y ayudas siguen el diseño vigente, con texto, foco, tamaños grandes, contraste y lectura de instrucciones. Las imágenes inválidas muestran un error y conservan la selección anterior válida.

## Datos y permisos

El campo existente associations.logo_url guarda la referencia HTTPS. La migración 005_logos_asociaciones.sql crea el bucket público association-images con límite de 2 MiB y tipos JPEG, PNG y WebP. Solo un administrador activo puede subir, actualizar, listar o borrar objetos mediante Storage. Compradores, emprendedoras y visitantes no pueden escribir en ese bucket; las imágenes publicadas se pueden consultar por su URL pública.

La pantalla usa uploadAssociationLogo y saveAssociation de la capa de datos, sin acceso directo al SDK. La configuración del cliente sigue usando únicamente URL y anon key. El cambio no modifica permisos del bucket de tiendas ni requiere service_role. Ver [control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control).

Al fallar la subida o el guardado se conserva el formulario. Si una imagen ya subió, se recuerda su URL en memoria para reintentar sin generar otra copia. La asociación nueva mantiene el mismo ID durante los reintentos. Si el servidor guardó pero se perdió la respuesta, reintentar confirma el mismo registro y referencia.

Retirar o reemplazar el logo actualiza la referencia de la asociación. Los archivos anteriores o de un guardado sin confirmar no se borran automáticamente: evita eliminar una imagen que haya quedado referenciada tras una respuesta perdida. Su limpieza debe hacerse de forma controlada comprobando referencias; no se incluye un recolector automático en este hito. Las pruebas limpian exclusivamente sus propios objetos temporales.

## Verificación

security/association-logo-check.mjs prueba la API, RLS y Storage reales con asociación/cuenta/tienda ficticias propias. Comprueba escritura solo administradora, lectura pública, formatos/tamaño, vista previa, creación, recarga, conservación al editar, cancelación, reemplazo, errores, pérdida de respuesta, reutilización de la subida y retiro del logo. La vista móvil se revisa a 390 px y a 320 px con texto grande y alto contraste.

ASSOCIATION_LOGO_URL permite elegir la web local o publicada. Resultados y capturas en security/reports/association-logo/. Los fallos de red se simulan; los guardados y permisos se comprueban contra Supabase real. La emulación de celular no sustituye una prueba física ni un ensayo con usuarias.

Resultado: 13 comprobaciones aprobadas en local y 13 en https://conectasur-dev.web.app. Se revisaron las capturas de escritorio/celular, la compilación Vite terminó correctamente y la publicación respondió HTTP 200 con los mismos archivos de la compilación verificada. La migración 005 quedó aplicada en la instancia del grupo. Los fixtures propios se eliminaron al finalizar.

Este hito cubre la capacidad W12 y comprueba que los otros datos de asociación se conservan. No cierra los pendientes de tipos de emprendimiento, otras cuentas administradoras, búsqueda/filtros ni Google.
