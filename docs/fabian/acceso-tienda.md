# Fabián: acceso y tienda Android

Implementación desde `Mi tienda` en Inicio. `StoreActivity` usa Kotlin, layouts XML editables en Design/Palette y los contratos `AuthRepository`/`ShopRepository` existentes. No requiere cambios de SQL ni credenciales administrativas.

## Comportamiento

- Inicio por correo/contraseña con Supabase Auth. Solo una emprendedora activa con tienda asignada entra al editor. Una cuenta sin tienda recibe una explicación y su sesión se cierra.
- Recupera la sesión cifrada al abrir nuevamente. Supabase vuelve a comprobar el perfil y renueva el token mediante el cliente existente.
- Cierre de sesión elimina tokens, caché privada, borrador de tienda en memoria y preferencia de huella del teléfono. Los borradores de productos existentes conservan su comportamiento por cuenta.
- Edita nombre, descripción, tipo de emprendimiento, sector, contacto público y visibilidad de precios. Las longitudes coinciden con el modelo SQL. El nombre es obligatorio.
- Elegir logo abre el selector del sistema sin pedir acceso general al almacenamiento. La imagen se reduce a un máximo de 1024 píxeles, se convierte a JPEG sobre fondo blanco y se valida hasta 2 MiB antes de subirla con `uploadLogo`. Quitar logo guarda `logo_url = null`.
- Guardar realiza la escritura y consulta de nuevo la tienda; solo anuncia éxito si coincide con lo enviado. Los fallos de conexión mantienen el borrador en memoria para reintentar. No se anuncia un guardado sin conexión. Un logo subido correctamente se conserva en el borrador si falla el guardado posterior de los demás campos.
- Los cambios sin guardar se conservan al girar el teléfono y se pide confirmación antes de descartarlos. No se guardan borradores del formulario al terminar el proceso. La tienda confirmada se vuelve a leer del servidor al abrir.
- Respeta letras, botones y contraste existentes; incluye lectura voluntaria y etiquetas de campos. No lee la contraseña.

## Huella opcional

Se activa después del acceso con contraseña. Utiliza AndroidX Biometric 1.1.0 estable, `BIOMETRIC_STRONG` y un `CryptoObject` con clave AES en Android Keystore que exige autenticación por operación. Se guarda una prueba cifrada ligada al UID, no la contraseña ni una plantilla de huella. La sesión de Supabase continúa cifrada por `SecureBackendStore` y sus permisos se validan en el servidor.

Al abandonar la pantalla se oculta el formulario y se exige desbloqueo antes de mostrarlo de nuevo. Si se cancela, no hay sensor compatible, cambian las huellas o hay bloqueo del sensor, se permite cerrar la sesión local e ingresar con contraseña. Cancelar nunca abre la tienda. La huella no crea una sesión en Supabase ni recupera una sesión cerrada. Las ventanas de acceso/tienda usan `FLAG_SECURE` para ocultar su contenido en capturas y recientes.

Referencias: [guía oficial de autenticación biométrica](https://developer.android.com/identity/sign-in/biometric-auth), [versión estable de AndroidX Biometric](https://developer.android.com/jetpack/androidx/releases/biometric).

## Configurar y compilar

1. Abrir `android` en Android Studio con JDK 21 y SDK 36.
2. Copiar `supabase.properties.example` a `supabase.properties` y completar URL y clave anon privadas del equipo. No incluir contraseñas, Basic Auth ni `service_role`.
3. Ejecutar `gradlew.bat assembleDebug testDebugUnitTest lintDebug`.

Sin configuración, el catálogo de ejemplo sigue disponible y Mi tienda explica que el acceso no está habilitado en esa instalación. No se inventan credenciales ni una sesión de demostración.

## Verificación

`StoreViewModelTest` cubre persistencia simulada entre nuevas pantallas, cierre de sesión, rol incorrecto, bloqueo antes de consultar la sesión, edición sin conexión, publicación/retiro del logo, reintentos parciales, validación, expiración y operaciones en segundo plano.

`StoreAccessTest` verifica la conversión de imágenes en Android e incluye una prueba de aceptación real optativa: entrar, editar, cerrar, abrir, comprobar y cerrar sesión. La prueba real usa los mismos argumentos privados que `SupabaseIntegrationTest` (`supabaseLive`, `testEmail`, `testPassword`) con una cuenta ficticia y restaura la descripción de la tienda al terminar. No enviar credenciales por commits ni escribirlas en scripts compartidos.

Verificación local de la entrega: APK generado, 26 pruebas unitarias aprobadas y lint sin errores. Se comprobó la API pública de la instancia del equipo con 5 productos y 3 tiendas. El ingreso y la edición reales quedan pendientes de una cuenta ficticia; la prueba de huella requiere un teléfono compatible. La configuración local y los APK se mantienen fuera del commit.

Prueba manual de huella en un teléfono con bloqueo y biometría fuerte configurados:

1. Entrar con una cuenta ficticia de emprendedora y activar huella, confirmando la solicitud del sistema.
2. Salir a Inicio o a otra aplicación y volver: el formulario queda bloqueado.
3. Cancelar o usar una huella incorrecta: la tienda no aparece.
4. Desbloquear con una huella registrada: se comprueba la sesión y aparece la tienda.
5. Elegir ingresar con contraseña o cerrar sesión: el acceso biométrico anterior queda eliminado.
6. Editar todos los campos, cambiar el logo, guardar, cerrar completamente y volver: permanecen los datos confirmados.

El formulario de ventas y el editor de productos siguen correspondiendo a sus integrantes.
