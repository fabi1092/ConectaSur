# Editar cuenta de emprendedora — W06 / W07

Estado actual, 4 de noviembre: **implementado y comprobado contra Supabase real**. El usuario reasignó expresamente el cierre de esta función a Benjamín/este chat. La migración `007_editar_cuenta_emprendedora.sql` está aplicada; el panel guarda el nombre y lo conserva al recargar desde la URL pública. No se modificaron correo, contraseña, rol, estado ni tienda de las cuentas existentes. La evidencia actual es `security/reports/entrepreneur-account-live/verification.json`.

En Emprendedoras, el panel muestra el nombre de la persona junto a su tienda. **Editar cuenta** cambia el nombre de la persona; **Editar tienda** conserva el editor de la ficha comercial. La búsqueda admite ambos nombres. El formulario conserva los datos ante errores, confirma antes de descartar y vuelve a consultar el perfil después de guardar. La cuenta puede estar activa o inactiva; editar el nombre no cambia su estado, rol, tienda, correo ni contraseña.

## Contrato implementado

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

## Condiciones implementadas y probadas

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

La implementación se añadió en la migración 007, sin editar ninguna ya aplicada y sin abrir escritura directa sobre perfiles. Comparte el bloqueo de administración de la migración 006 y vuelve a comprobar al actor antes de actualizar. No incluye credenciales en Git.

## Verificación y cierre

`security/entrepreneur-account-data.test.mjs` conserva las nueve pruebas de la capa cliente. Siete nuevas pruebas SQL comprueban autorización, cuenta inactiva, validación, vínculos inconsistentes, reintentos, conflicto e invariantes. El verificador real ejecutó siete comprobaciones contra la URL pública: permisos directos, lectura posterior, conflicto, auditoría, guardado/recarga y reingreso con las mismas credenciales. Los fixtures propios se eliminaron y la limpieza quedó confirmada.

La web actualizada se publicó conservando Google como bloqueo externo del servidor. W06/W07 no dependen de habilitar ese proveedor. El verificador antiguo del editor deriva al recorrido real cuando detecta la función instalada; no usa escrituras simuladas para acreditar este cierre.

Resultado del hito de interfaz, 3 de noviembre de 2026: nueve pruebas de la capa de datos y nueve comprobaciones del editor aprobadas; las lecturas y el caso de función ausente usan la instancia real, mientras que los guardados, reintentos y conflictos se simulan. El informe security/reports/entrepreneur-account-editor/verification.json registra backendReady=false. También aprobaron 14 comprobaciones de tipos de emprendimiento, 21 de acceso y diez pruebas compartidas de modelos/reintentos. Vite compiló correctamente y se revisaron capturas de escritorio y celular con texto ampliado y contraste. Los fixtures reales se eliminaron al terminar. No se publicó Hosting en este hito.
