# Lo que Benjamín comprobará antes de presentar

La programación y las pruebas automatizadas no sustituyen este recorrido. Marcar cada casilla solo después de observar el resultado; dejar fecha/equipo y una captura sin contraseñas cuando sea útil. No se indican como realizadas las comprobaciones de esta hoja.

## 1. Instalar y abrir la app

- [ ] Instalar `ConectaSur-actualizada.apk`, entregado en el escritorio. Es el APK de desarrollo, no una versión firmada de producción.
- [ ] A01/W03: distinguir **Ver productos**, acceso de comprador y **Mi tienda**. No debe haber panel administrador móvil.
- [ ] A02/A03: ingresar a Mi tienda con una cuenta demo entregada; una contraseña incorrecta se rechaza.

## 2. Huella y cierre de sesión

- [ ] A04: después de ingresar con contraseña, activar huella voluntariamente.
- [ ] A05: cerrar la app por completo, abrirla y desbloquear Mi tienda con huella sin escribir la contraseña.
- [ ] A07/A08: desactivar huella. Debe cerrar el acceso y volver a pedir correo y contraseña; al reabrir no debe restaurar la sesión anterior.
- [ ] A11: cerrar sesión explícitamente y comprobar que se oculta la tienda privada.

Un emulador sirve para demostrar el bloque obligatorio. Si se hace en un teléfono compatible, anotar también AA3 como adicional. No confundir la comprobación del sensor con una prueba unitaria del modelo.

## 3. Tienda, logo y texto grande

- [ ] A14–A19: editar nombre de tienda, descripción, tipo, sector y contacto; subir un logo y guardar.
- [ ] A20/A21: forzar el cierre de la app, abrirla de nuevo y comprobar tanto los textos como el logo.
- [ ] W33–W38: abrir la ficha de esa tienda en la web y comprobar que muestra los datos guardados desde Android.
- [ ] A26: aumentar el tamaño de texto del sistema; revisar acceso y tienda sin campos o botones cortados.
- [ ] AA4: comprobar que aparece la asociación asignada desde el panel, sin permitir que la emprendedora cambie por sí sola esa asignación.

Usar cuentas de demostración; restaurar los datos que quieran conservar después de las pruebas.

## 4. Desactivar y reactivar una emprendedora

- [ ] En el panel web, desactivar la cuenta demo usada en la prueba (W08).
- [ ] W09/A13: comprobar que esas credenciales ya no permiten ingresar a web ni app.
- [ ] Reactivar la cuenta después si se utilizará para la presentación. No dejar inaccesibles las cuentas que usará el grupo.

## 5. Recuperar una contraseña con correo real — W27

Los correos `@demo.conectasur.cl` son identidades de prueba; no se presupone que tengan un buzón accesible.

- [ ] Crear una cuenta de comprador en la web con un correo real propio al que se pueda entrar. No compartir la contraseña del correo con el grupo.
- [ ] Cerrar la sesión, ir a **Ingresar → Olvidé mi contraseña** y solicitar el enlace.
- [ ] Confirmar que llega al buzón (revisar correo no deseado).
- [ ] Copiar la dirección del botón del mensaje y pegarla en la pantalla de recuperación de ConectaSur. La alternativa evita depender del dominio de redirección del servidor.
- [ ] Definir una contraseña nueva. Verificar que ingresa la nueva y se rechaza la anterior.

No tomar capturas del enlace ni publicarlo: contiene el acceso temporal para recuperar la cuenta.

## 6. Preparar la demostración del backend

- [ ] Abrir Studio de la instancia SurCode con las credenciales privadas entregadas por el profesor, sin mostrarlas en la grabación o proyector.
- [ ] Mostrar tablas/relaciones junto al [modelo](../felipe/modelo-datos.md), índices y políticas, usando las [consultas de solo lectura](../../supabase/demo/consultas-profesor.sql).
- [ ] Mostrar las evidencias de [permisos por perfil](backend-demostracion.md): una emprendedora no modifica otra tienda/carpeta; el comprador no realiza tareas administrativas.
- [ ] Explicar que el backend actual es Supabase y que Firebase Hosting aloja la web. El respaldo Firestore es histórico.
- [ ] B12: explicar el entorno de desarrollo y la falta de una producción independiente verificada. No presentar la misma instancia como dos entornos diferentes.

## 7. Google y cierre del repositorio

Google sigue pendiente de que el administrador del servidor del docente active el proveedor. Su botón y código no prueban un ingreso Google exitoso; dejarlo registrado como bloqueo externo.

- [ ] Abrir la URL pública actualizada y comprobar ingreso de administrador/emprendedora, regreso a la vitrina y cierre de sesión.
- [ ] Revisar el PR del cierre y la etiqueta `entrega-4-cierre`, con los límites del informe. No atribuir revisión humana a una ejecución automática.
- [ ] Si el docente exige literalmente la etiqueta anterior `entrega-4` o los ítems Firebase, aclarar la referencia de cierre y la adaptación tecnológica antes de marcar esos puntos como cumplidos.

Los adicionales sin visor de auditoría (WA3), huella física (AA3) o pruebas con una persona poco habituada (P08a) no se consideran completados por existir esta guía.
