# Editar cuenta de emprendedora — W06 / W07

Estado: pantalla y contrato preparados por Benjamín. **El guardado real depende de una función de backend a cargo del compañero de la Parte 2.** La consulta al catálogo SQL del servidor no encontró esa función al iniciar este hito; no se confirmó que ya esté trabajando en ella. No se aplicó una migración ni se modificó Auth, Google o Android para esta pantalla.

En Emprendedoras, el panel muestra el nombre de la persona junto a su tienda. **Editar cuenta** cambia el nombre de la persona; **Editar tienda** conserva el editor de la ficha comercial. La búsqueda admite ambos nombres. El formulario conserva los datos ante errores, confirma antes de descartar y vuelve a consultar el perfil después de guardar. La cuenta puede estar activa o inactiva; editar el nombre no cambia su estado, rol, tienda, correo ni contraseña.

## Contrato que necesita el compañero

Función pública de PostgreSQL, llamada por PostgREST con la sesión del administrador:

~~~sql
public.update_entrepreneur_account(
  p_uid uuid,
  p_shop_id text,
  p_name text,
  p_expected_name text
) returns void
~~~

| Parámetro | Significado |
|---|---|
| p_uid | ID de profiles de la emprendedora |
| p_shop_id | Tienda que figuraba asignada a esa cuenta al abrir la edición |
| p_name | Nombre solicitado, recortado en extremos, entre 1 y 120 caracteres |
| p_expected_name | Nombre leído al abrir el formulario, para detectar cambios de otra sesión |

La respuesta exitosa es null (void). La pantalla confirma el valor mediante SELECT de profiles antes de anunciar éxito. No envía role, active, correo ni contraseña.

## Condiciones de servidor pendientes de implementar y probar

1. Autorizar únicamente al administrador activo según el perfil del servidor, no según metadatos de Auth o campos enviados por el cliente.
2. Validar nombre y parámetros. Buscar la cuenta con bloqueo de fila; exigir rol emprendedora y shop_id coincidente. Mantener todos los otros campos.
3. Si el nombre actual ya es el solicitado, tratarlo como reintento exitoso. Si difiere tanto del solicitado como de p_expected_name, rechazar el formulario desactualizado. Actualizar solamente display_name.
4. Conservar la auditoría existente de profiles. No abrir UPDATE directo al rol authenticated, que está revocado desde la migración 006.
5. Usar SECURITY DEFINER con search_path vacío y nombres cualificados, retirar EXECUTE de PUBLIC/anon y concederlo solo a authenticated. La función debe comprobar además al actor en su cuerpo.
6. Probar en una base aislada permisos, nombres inválidos, tienda o rol cambiados, cuentas inactivas, reintentos y conflictos. Luego probar lectura/guardado/recarga contra la instancia del grupo con fixtures propios.

Códigos esperados por el cliente:

| Código | Resultado |
|---|---|
| 42501 | Actor sin permiso |
| 23514 | Datos inválidos |
| CS004 | Conflicto de nombre con otra edición |
| CS005 | Cuenta, rol o tienda ya no coinciden |
| PGRST202 | PostgREST no encuentra la función; el panel informa que el cambio aún no está habilitado |

La implementación se integra en un archivo nuevo de migración del compañero. No editar migraciones ya aplicadas ni incluir credenciales en Git. Este contrato propone el nombre y los parámetros; si el compañero ya eligió otro contrato, adaptar el pequeño módulo web/entrepreneur-account-data.js antes de la integración.

## Verificación y cierre

security/entrepreneur-account-data.test.mjs prueba la capa de datos con respuestas simuladas. Las pruebas del formulario deben distinguir lectura real, escritura simulada y guardado real. **W06/W07 no se marcan cerrados hasta que la función esté aplicada y el cambio persista al recargar contra Supabase real.**

La publicación final se coordina con el cierre de Google y los otros pendientes de la Parte 2; agregar este formulario no corrige por sí mismo el retorno OAuth revisado.

Resultado del hito de interfaz, 3 de noviembre de 2026: nueve pruebas de la capa de datos y nueve comprobaciones del editor aprobadas; las lecturas y el caso de función ausente usan la instancia real, mientras que los guardados, reintentos y conflictos se simulan. El informe security/reports/entrepreneur-account-editor/verification.json registra backendReady=false. También aprobaron 14 comprobaciones de tipos de emprendimiento, 21 de acceso y diez pruebas compartidas de modelos/reintentos. Vite compiló correctamente y se revisaron capturas de escritorio y celular con texto ampliado y contraste. Los fixtures reales se eliminaron al terminar. No se publicó Hosting en este hito.
