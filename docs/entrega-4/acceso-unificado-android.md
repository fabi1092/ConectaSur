# Acceso común en Android

Cambio solicitado por Benjamín el 4 de noviembre de 2026. Seguimiento: [issue #10](https://github.com/fabi1092/ConectaSur/issues/10).

## Comportamiento y decisión

La portada ofrece **Ingresar** y permite explorar productos sin cuenta. El mismo formulario de correo y contraseña acepta los perfiles activos de Supabase:

| Perfil confirmado | Destino y acceso |
|---|---|
| Comprador | **Modo comprador**, consultar productos y volver a **Mi cuenta**. |
| Emprendedora con tienda asignada | **Mi tienda**, con los productos, ventas, ficha, logo y huella opcional existentes. |
| Administrador | **Cuenta administradora** y enlace al panel web. No se incluye un panel de administración de plataforma en Android. |

El nombre del correo no concede permisos: `SupabaseClient.loadProfile` comprueba identidad, estado activo y rol del perfil, y la interfaz usa `Session.role`. Una cuenta compradora llamada “admin” sigue siendo compradora. RLS conserva la autorización efectiva del servidor. Una emprendedora sin tienda asignada no obtiene acceso privado.

El formulario anterior cerraba la sesión cuando el perfil no era emprendedora. `StoreViewModel` ahora conserva compradores y administradores sin consultar ni editar una tienda privada. La portada cambia a **Mi cuenta** o **Mi tienda**. Cerrar sesión funciona en cualquiera de los perfiles y elimina también la preferencia biométrica local. Las contraseñas se borran del campo al enviar y no se guardan en el modelo ni al rotar.

La sesión sigue cifrada por `SecureBackendStore` y Android Keystore, se restaura al reabrir y mantiene la renovación existente. Cerrar la pantalla no cierra la sesión. Los errores temporales conservan el tratamiento existente; un perfil desactivado o una sesión realmente inválida siguen siendo rechazados. El catálogo vuelve a la actividad existente mediante un resultado, sin duplicar el inicio ni sustituir su Intent.

**Diferencia con la pauta:** A10/RN-07 pedía Google como acceso principal del comprador. Por petición expresa del usuario, esta versión permite también correo y contraseña, como la web. Esto no demuestra autorización del docente para modificar ese criterio. Google queda como botón secundario del formulario; si el proveedor no está habilitado, el mensaje permite continuar con contraseña. El ingreso Google real sigue pendiente de la configuración del servidor del profesor.

## Archivos

- `StoreActivity.kt` y `activity_store.xml`: formulario común y pantalla por perfil, conservando Views/XML editables con Palette.
- `StoreViewModel.kt`: restauración y selección por rol; guarda privada limitada a la tienda de la emprendedora.
- `MainActivity.kt` y `BuyerViewModel.kt`: acceso único, etiqueta de cuenta, retorno al catálogo, salida y cancelación de consultas antiguas antes de abrir el acceso.
- `StoreViewModelTest.kt`, `BuyerViewModelTest.kt` y `UnifiedAccessTest.kt`: regresión y recorrido real por perfiles.

## Verificación

La compilación debug, las 66 pruebas unitarias y Android Lint terminaron correctamente. La prueba instrumentada recibe las cuentas ficticias únicamente mediante argumentos del ejecutor; el código y el APK no contienen contraseñas.

`UnifiedAccessTest` aprobó contra Supabase real en un emulador Android API 36 aislado, en 64,587 segundos: contraseña inválida rechazada; Google deshabilitado sin bloquear correo; ingreso de comprador, emprendedora y administrador desde el mismo formulario; ningún formulario privado de tienda para los otros perfiles; enlace administrativo solo para administrador; retorno al catálogo y al inicio; etiqueta correcta; cierre y reapertura de actividades con sesión restaurada; salida de cada perfil y retorno a visitante. No se editaron perfiles, tiendas, productos ni contraseñas del grupo. La prueba no simula Auth ni los roles.

Evidencia sin credenciales: `security/reports/android-unified-access/verification.json`. Los primeros intentos en el emulador compartido se interrumpieron por un diálogo ANR de System UI y reinstalaciones/cierres externos de la app; no se cuentan como aprobados. Se creó un AVD independiente y se repitió el recorrido completo con resultado satisfactorio. La prueba de reapertura cierra y relanza actividades; no acredita por sí sola reinicio del teléfono, biometría física o TalkBack.

El cambio se publica mediante [PR #11](https://github.com/fabi1092/ConectaSur/pull/11), vinculado al issue #10. No se atribuye revisión humana independiente.

Versión: `0.5.1-acceso-unificado`, código 5. No requiere cambiar el esquema de Supabase ni volver a desplegar la web. La validación física de huella/TalkBack y el ingreso Google real no se sustituyen por las pruebas del emulador.

## Continuidad

El MCP de Obsidian no estuvo disponible al iniciar la tarea; se recuperó durante la comprobación y se consultaron CONTINUAR, PROGRESO y DECISIONES de ConectaSur. El cierre registra allí los resultados finales, sin sustituir la evidencia del repositorio. La copia del escritorio tenía cambios ajenos sin confirmar en acceso, huella y web: no se sustituyó ni se restauró esa carpeta.
