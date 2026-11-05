# Contacto y configuración de tienda — Fabián

Implementado el 5 de noviembre de 2026 sobre el acceso unificado vigente del equipo.

## Comportamiento

En **Mi tienda**, la emprendedora elige **WhatsApp**, **Formulario** o **WhatsApp y formulario**. WhatsApp requiere un teléfono válido con código de país; los celulares chilenos de nueve dígitos se normalizan con `56`. **Guardar cambios** confirma la preferencia contra el servidor. Al elegir solo formulario se retira el número de WhatsApp almacenado. Los datos generales de contacto siguen siendo públicos.

La ficha pública web y la tienda pública de Android ofrecen los canales elegidos. WhatsApp abre `https://wa.me/` con el número validado. El formulario solicita nombre, correo o teléfono de respuesta y mensaje; informa que esos datos los recibe la dueña. No requiere iniciar sesión. Un fallo conserva el texto y permite reintentar; el mismo intento usa un UUID para evitar duplicados. La confirmación de envío solo aparece después de la respuesta del servidor.

**Mi tienda → Mensajes recibidos** en Android muestra remitente, contacto, texto, fecha y estado leído/nuevo. Permite actualizar, consultar páginas anteriores de 50 mensajes y marcar como leído. Utiliza la misma comprobación de cuenta y huella que las otras pantallas privadas. No permite editar el texto recibido.

**Mostrar precios** se conserva en la ficha. Ocultarlos sigue retirando los precios de la proyección pública de productos; no se cambió el mecanismo existente ni se publican los precios privados como parte del contacto.

## Backend y privacidad

La migración `008_contacto_tienda.sql` añade `contact_mode`, `whatsapp_number`, la tabla privada `shop_messages` y los RPC `send_shop_message` / `read_shop_message`. Fue aplicada y registrada por checksum en la instancia del curso usando Studio; no requiere `service_role` ni cambios al servidor Auth.

Visitantes y compradores pueden enviar a una tienda activa que habilite el formulario. No pueden leer mensajes ni insertar directamente en la tabla. Solo la dueña activa lee su bandeja y marca mensajes como leídos; otra dueña y el administrador no reciben acceso. Se validan límites y se limita a tres envíos por contacto y tienda en diez minutos. Es una limitación básica, no una protección contra emisores que cambien el contacto deliberadamente.

Los nuevos campos tienen valor inicial **Formulario**, sin número de WhatsApp. El cuerpo de los mensajes se presenta como texto y no como HTML. Las credenciales de Studio no forman parte del cliente ni del repositorio.

## Corrección de huella

Antes, `unlock()` publicaba un estado desbloqueado sin sesión antes de comprobar la sesión existente. El render interpretaba ese estado como cierre y borraba la activación biométrica. Ahora se conserva el bloqueo hasta terminar la comprobación. Si la app pasa a segundo plano mientras espera, el resultado no la desbloquea; se exige otro intento. Desactivar la huella expresamente mantiene el cierre de sesión implementado para A08.

## Verificación

- 73 pruebas unitarias Android aprobadas, incluidas reactivación del bloqueo, desbloqueos repetidos, reintentos de contacto y persistencia de preferencias/precios.
- APK conectado y pruebas instrumentadas compilados; Android Lint aprobado.
- 19 pruebas web de contacto y Google aprobadas; compilación Vite correcta.
- PostgreSQL de pruebas mediante PGlite: 45 aprobadas y una omitida, contando las cinco pruebas web de contacto. Se omite la prueba existente de concurrencia real entre conexiones; no se atribuye esa cobertura a PGlite.
- API real de Supabase: envío anónimo, reintento sin duplicado, lectura por la dueña, aislamiento entre dueñas, rechazo de lectura anónima, marcado leído, persistencia de canales/precios y rechazo del formulario en modo solo WhatsApp. Se crearon dos cuentas y tiendas ficticias temporales y se eliminaron al terminar.
- Revisión visual del formulario web en la vista previa local con datos públicos de demostración. No se enviaron mensajes de prueba a las tiendas existentes del equipo.
- La huella física y la interacción Android requieren un teléfono o emulador disponible. Las pruebas unitarias verifican el fallo de estado corregido, pero no sustituyen una prueba del sensor real.

## Recorrido de demostración

1. Ingresar como emprendedora en Android y abrir Mi tienda.
2. Seleccionar ambos canales, escribir un número ficticio válido y guardar. Reabrir para comprobar la selección.
3. Desde la ficha pública de esa tienda, enviar una consulta ficticia por formulario; abrir Mensajes recibidos con la dueña y marcarla como leída.
4. Comprobar que otra cuenta no puede leer esa bandeja. Cambiar a WhatsApp y verificar que ya no se ofrece formulario.
5. Ocultar precios, guardar y actualizar el catálogo: aparece Consultar precio. Volver a activarlos para restaurar la demo.
6. Activar huella, salir, desbloquear, salir y desbloquear otra vez. La opción debe seguir diciendo Desactivar huella. Desactivarla y comprobar que vuelve a pedir contraseña.
