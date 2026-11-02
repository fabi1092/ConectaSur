# Bloque 2: acceso de cuentas en la web

Revisión del miércoles 4 de noviembre de 2026. Continúa la portada y ficha pública del bloque 1.

## Qué se implementa

La cabecera pública ofrece un solo acceso, Ingresar (#ingresar). Después de validar correo y contraseña, se consulta el perfil activo en Supabase: admin abre el panel de plataforma y emprendedora abre su tienda. No se reconoce al administrador por una coincidencia de texto en el correo ni se le permite escoger su rol.

La emprendedora consulta la tienda asignada, abre su ficha pública, vuelve a consultar la información y cierra su sesión. Recargar la pestaña conserva una sesión válida de cualquiera de los dos perfiles; después de salir, recargar o usar Atrás no vuelve a abrir la vista privada. Los enlaces anteriores #mi-tienda y #administracion son alias del mismo acceso: escribirlos no cambia los permisos.

La consulta está limitada al perfil activo, rol emprendedora, tienda asignada y UID de la dueña. No acepta un identificador de otra tienda desde la dirección del navegador. La vista no ofrece administración de plataforma. Una cuenta desactivada no puede ingresar; al actualizar información o volver a enfocar la pestaña también se comprueba su acceso.

## Relación con el checklist

| Ítem | Implementación |
| --- | --- |
| W01–W02 | La cuenta administradora utiliza el acceso común y llega directamente a su panel. |
| W25 | Ingreso web de emprendedora con las credenciales creadas por el administrador. |
| W26 | Cierre de sesión y retiro de la sesión local. |
| W09 | Rechazo de cuenta desactivada en el acceso web; incluye comprobación de una sesión ya abierta. |
| W39 | Mensajes en español de Chile, incluidos errores de credenciales, cuenta y conexión. |
| W40 | Pantallas separadas de la capa de datos; entrepreneurHome() hace las consultas y respeta RLS. |

Editar los datos de la tienda desde la web corresponde a una entrega posterior. Esta pantalla permite leerlos y explica cómo cambiarlos en Mi tienda de Android. Tampoco añade registro de compradores, Google ni recuperación de contraseña: son los siguientes bloques.

## Diseño y accesibilidad

Se aplica good-taste-design conservando el diseño del bloque 1 y lo descrito en docs/entrega-5/cambios-prototipo.md: fondo claro, verde, botones con texto y navegación sencilla. Se reutilizan el encabezado, pie, logo de tienda, superficies y escala tipográfica existentes.

Paleta actual de la web: fondo claro, texto navy #103D50, verde de acción #17694E y superficies suaves verdes/crema. Se mantiene Segoe UI con alternativa Arial/sans-serif. Los controles principales tienen al menos 48 px, foco visible y etiquetas persistentes. Mostrar contraseña es una acción voluntaria y se vuelve a ocultar al terminar un intento de ingreso. En celular el formulario aparece antes del bloque de ayuda para la primera visita. Ver docs/entrega-4/redisenio-web.md para las referencias y recursos.

No se pide un rol al abrir la web pública ni al ingresar. Ingresar lleva al espacio correspondiente a los permisos reales de la cuenta; esconder un botón no reemplaza las políticas del backend.

## Recorrido de demostración

1. Abrir https://conectasur-dev.web.app y elegir Ingresar.
2. Ingresar con una cuenta ficticia de emprendedora creada en el panel administrativo.
3. Mostrar el nombre, logo o inicial, descripción, tipo, sector y contacto de esa tienda. Recargar y comprobar que no vuelve a pedir la contraseña.
4. Abrir Ver mi ficha pública y regresar con Ingresar. Actualizar información permite volver a consultar los cambios guardados desde Android.
5. Cerrar sesión; recargar y comprobar que se pide el acceso de nuevo.
6. Usar el mismo formulario con una cuenta administradora y mostrar que abre su panel. Recargar, salir y comprobar que el acceso vuelve a pedirse.
7. Desactivar la cuenta ficticia de emprendedora desde el panel e intentar ingresar con ella: el acceso debe rechazarse. Reactivar la cuenta al finalizar la demostración.

## Evidencia y límites

security/entrepreneur-access-check.mjs crea una cuenta y tienda ficticias propias mediante el administrador. Comprueba la API real y el recorrido en Chromium; sus resultados y capturas quedan en security/reports/entrepreneur-access/. El correo mostrado en las capturas se sustituye por cuenta-ficticia@ejemplo.cl para no guardar identificadores de fixtures efímeros.

La verificación actual del acceso único se registra en security/reports/entrepreneur-access/verification.json. Incluye la apertura automática del panel con una cuenta administradora y que una emprendedora no obtiene ese panel escribiendo la ruta anterior. La suite de la ficha pública incorpora también la galería y las categorías tras el rediseño.

Para repetir: Vite iniciado en el puerto 5174, CONECTASUR_PRIVATE cargado solo en memoria, Playwright/Chromium disponible y node security/entrepreneur-access-check.mjs. PLAYWRIGHT_MODULE permite indicar su instalación; ENTREPRENEUR_ACCESS_URL permite cambiar la URL de prueba. Los fixtures se eliminan al terminar.

La revisión móvil es emulada, no un ensayo con un teléfono físico o emprendedoras. Se usa sessionStorage: conserva el acceso al recargar esa pestaña, sin prometer una sesión persistente al cerrar el navegador. Los tokens se gestionan con el cliente de Supabase, no se guardan contraseñas en el código ni en informes. No se modifica el esquema ni las políticas RLS de la instancia.
