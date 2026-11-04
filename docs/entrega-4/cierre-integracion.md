# Cierre de integración de Entrega 4

Esta hoja separa los avances programados de su comprobación real. No declara cerrada la entrega ni sustituye el checklist del profesor.

| Frente | Estado comprobado al preparar este cierre | Próximo paso / responsable |
|---|---|---|
| Pantalla Editar cuenta | Preparada en 75b51ea; nueve pruebas de datos y nueve de interfaz. Escritura simulada | Benjamín: comprobar el guardado real cuando exista la función |
| Guardado W06/W07 | No se encontró update_entrepreneur_account en el catálogo SQL consultado | Compañero Parte 2: implementar/aplicar [contrato](contrato-cuenta-emprendedora.md); [seguimiento #4](https://github.com/fabi1092/ConectaSur/issues/4) |
| Google web/Android | Código actualizado por el compañero; web PKCE integrado con 14 pruebas de Google aprobadas y última consulta de Auth google=false. El ingreso Google real sigue sin demostrar | Compañero Parte 2: habilitar proveedor y comprobar ingreso/salida reales; la integración visual solo comprobó la web |
| Asociaciones Android | Código preparado; prueba focalizada reprodujo restauración de estado tras cancelar consulta al salir | Compañero Parte 2: corregir cancelación y comprobar salida |
| Backend B01–B13 | Modelo, migraciones y pruebas existentes; preparación de consola y demostración asignadas al compañero | Compañero Parte 2: datos ficticios, perfiles, modelo/índices y equivalencia con la pauta que nombra Firebase |
| Recuperación W27 | Desafío y cambio reales probados con enlace obtenido para fixtures; buzón real sin verificar | Equipo: comprobar recepción de un correo real; conservar la alternativa de pegar enlace |
| Publicación web | La última comprobación sirvió el JS anterior a los commits de Google y Editar cuenta | Publicar después de resolver las dependencias y verificar ambos trabajos |
| Diseño de toda la web | Nueva capa visual común, buscador de productos y tablas móviles en fichas; compilación y revisión de escritorio/celular aprobadas | [Registro visual](redisenio-web.md); la publicación conserva las dependencias de acceso indicadas arriba |
| Git y etiqueta | Historial real con aportes, etiqueta previa y nuevos issues; no acredita revisiones históricas | Verificar el commit final, etiqueta y trazabilidad. No inventar revisiones de otro integrante |

## Qué automatiza el nuevo hito

[Issue #5](https://github.com/fabi1092/ConectaSur/issues/5): el pipeline de seguridad ejecuta nueve pruebas de la capa de cuenta y diez de modelos/reintentos web, además de las pruebas SQL existentes. Estas 19 pruebas web no requieren credenciales ni acceso al servidor del profesor. Validan comportamiento del cliente; no prueban que la función remota exista.

El PR de este hito enlaza el issue #5. El issue #4 debe seguir abierto hasta comprobar W06/W07 de verdad. Esta trazabilidad corresponde al avance actual; no convierte en PR revisados los commits anteriores ni cierra por sí sola todo B20.

## Orden de integración

1. Traer los commits de ambas partes y revisar cambios locales antes de mezclarlos.
2. El compañero implementa/aplica la función del contrato y aporta sus pruebas de permisos, reintentos y conflictos.
3. Ejecutar security/entrepreneur-account-live-check.mjs contra la instancia real. El comando devuelve 2 si aún falta la función; no lo registra como aprobado ni crea fixtures en ese caso.
4. Si existe la función, el recorrido real debe aprobar permisos, guardado, lectura posterior y recarga del navegador. Solo entonces cerrar W06/W07 y el issue #4.
5. Corregir y comprobar Google y la cancelación Android; después actualizar informe, compilar y publicar Hosting. Verificar que la URL pública sirva los archivos compilados y probar el acceso desde esa URL.
6. Marcar la etiqueta de cierre y la revisión requerida por el profesor sobre el commit efectivamente revisado. No reescribir el historial para aparentar revisiones pasadas.

La configuración privada de pruebas se mantiene fuera de Git. No incluir contraseñas, claves privadas, enlaces de recuperación o service_role en el informe ni en los issues.
