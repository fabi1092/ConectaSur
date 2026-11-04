# Cierre de integración de Entrega 4

Esta hoja separa los avances programados de su comprobación real. No declara cerrada la entrega ni sustituye el checklist del profesor.

| Frente | Estado comprobado al preparar este cierre | Próximo paso / responsable |
|---|---|---|
| Pantalla y guardado W06/W07 | Migración 007 aplicada por reasignación expresa del usuario; siete comprobaciones reales de permisos, persistencia y recarga en la URL pública, con limpieza confirmada | Cerrado técnicamente; [contrato y evidencia](contrato-cuenta-emprendedora.md), [issue #4](https://github.com/fabi1092/ConectaSur/issues/4) |
| Google web/Android | Código actualizado por el compañero; web PKCE integrado con 14 pruebas de Google aprobadas y última consulta de Auth google=false. El ingreso Google real sigue sin demostrar | Compañero Parte 2: habilitar proveedor y comprobar ingreso/salida reales; la integración visual solo comprobó la web |
| Asociaciones Android | Cancelación corregida por la Parte 2, con prueba específica aprobada; error y reintento diferenciados | Benjamín: recorrido práctico en app; no sigue pendiente una corrección de código |
| Backend B01–B13 | Modelo, siete migraciones, pruebas por perfil, consultas y justificación de índices preparados | [Demostración](backend-demostracion.md); presentar en consola y explicar la adaptación Supabase. Producción independiente sin verificar (B12) |
| Recuperación W27 | Desafío y cambio reales probados con enlace obtenido para fixtures; buzón real sin verificar | Equipo: comprobar recepción de un correo real; conservar la alternativa de pegar enlace |
| Publicación web | Hosting actualizado; W06/W07 comprobados desde https://conectasur-dev.web.app/ | Compartir la URL pública; Google conserva su bloqueo externo |
| Diseño de toda la web | Nueva capa visual común, buscador de productos y tablas móviles en fichas; compilación y revisión de escritorio/celular aprobadas | [Registro visual](redisenio-web.md); la publicación conserva las dependencias de acceso indicadas arriba |
| Git y etiqueta | Cierre actual en [PR #9](https://github.com/fabi1092/ConectaSur/pull/9), enlazado a issues #4 y #8 | Integrar tras CI y registrar entrega-4-cierre sobre el commit comprobado. Conservar la etiqueta anterior; no inventar revisión humana |

## Qué automatiza el nuevo hito

[Issue #5](https://github.com/fabi1092/ConectaSur/issues/5): el pipeline de seguridad ejecuta nueve pruebas de la capa de cuenta y diez de modelos/reintentos web, además de las pruebas SQL existentes. Estas 19 pruebas web no requieren credenciales ni acceso al servidor del profesor. Validan comportamiento del cliente; no prueban que la función remota exista.

El PR de este hito enlaza el issue #5. El issue #4 debe seguir abierto hasta comprobar W06/W07 de verdad. Esta trazabilidad corresponde al avance actual; no convierte en PR revisados los commits anteriores ni cierra por sí sola todo B20.

## Comprobaciones restantes del usuario

1. Seguir [verificacion-manual.md](verificacion-manual.md): huella, tienda/logo al cerrar y abrir, cuenta desactivada, texto grande y datos Android/web coincidentes.
2. Comprobar la llegada del correo a un buzón real y recuperar una contraseña usando la alternativa de pegar el enlace.
3. Presentar backend con consola y evidencias; aclarar B12 y los ítems que todavía nombran Firebase.
4. Google necesita activación por quien administra el servidor del docente. El código PKCE está integrado; no se declara ingreso real.
5. Revisar humanamente el PR y confirmar con el profesor la referencia de cierre. Una ejecución de CI no equivale a esa revisión.

La configuración privada de pruebas se mantiene fuera de Git. No incluir contraseñas, claves privadas, enlaces de recuperación o service_role en el informe ni en los issues.
