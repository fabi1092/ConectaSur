# Ventas e historial desde la web

Ingresar con una cuenta de emprendedora y abrir Mi tienda → Mis ventas. El espacio contiene Registrar una venta e Historial de ventas. Reutiliza el catálogo, los permisos y el RPC de Android; no necesita otra base de datos ni modifica las migraciones existentes.

## Registro

1. Elegir el producto y, si corresponde, su talla, color u otra opción.
2. Indicar una cantidad entera positiva y el lugar de venta, que es opcional.
3. Revisar el resumen: el catálogo se vuelve a consultar antes de mostrar el precio, las unidades y la modalidad.
4. Escuchar o corregir el resumen y pulsar Confirmar venta. Hasta esa confirmación no se escribe ni se descuenta nada.

register_sale valida la propiedad de la tienda y actualiza las unidades dentro de una transacción. En productos con opciones descuenta solo la elegida. Las piezas únicas no se venden dos veces. Por encargo y sin conteo no llevan descuento; también se respeta el producto agotado que recibe encargos. Las ventas simultáneas no pueden dejar cantidades negativas.

El precio del resumen es una referencia actualizada al revisarlo. El RPC utiliza el precio vigente cuando registra la operación, incluido el precio propio de una opción. El historial conserva ese precio por unidad. No se afirma que el precio quede reservado mientras el diálogo está abierto. Los totales web usan BigInt para evitar redondeos en la multiplicación o suma de enteros grandes.

## Confirmación y reintentos

Antes de enviar se conserva el identificador y los datos de la solicitud en sessionStorage, separados por usuario y tienda. Si se pierde la respuesta, el formulario queda bloqueado para esa solicitud y permite Reintentar confirmación. La recarga de la misma pestaña recupera ese identificador; el RPC reconoce la repetición y no vuelve a descontar ni a insertar una venta.

No se generan reintentos automáticos de escritura. Un rechazo definitivo de cantidad o producto permite corregir; una respuesta incierta conserva la solicitud. Las consultas posteriores que fallen no convierten una venta confirmada en una venta nueva. La interfaz avisa antes de salir con datos sin registrar o una confirmación pendiente.

La recuperación depende de mantener la misma pestaña y su almacenamiento de sesión. No se promete recuperar una solicitud al cerrar la pestaña o perder sus datos. Si el navegador no permite conservar la solicitud, no se envía la venta. Las solicitudes no contienen contraseñas ni grabaciones.

## Historial y privacidad

Las ventas se consultan por la tienda de la dueña activa y las políticas RLS mantienen los registros fuera del alcance de visitantes, compradores, otras emprendedoras y del rol administrador de la aplicación. La protección no depende de ocultar botones.

Los filtros incluyen fecha inicial/final, producto y lugar o feria. Los días y horarios se interpretan en America/Santiago, incluso si el navegador está configurado en otro huso horario. La fecha final se incluye completa. La búsqueda admite diferencias de mayúsculas y tildes.

La consulta usa páginas por fecha e identificador para superar el límite de 1000 filas. La interfaz muestra 20 registros por página; los totales incluyen todos los resultados filtrados que se cargaron, no solo los 20 visibles. Actualizar historial permite consultar nuevas ventas. Un error de conexión muestra un estado de reintento, no un supuesto historial vacío.

El nombre del producto se conserva en cada venta aunque se elimine del catálogo. El backend existente guarda el identificador de la opción, no una copia histórica de su etiqueta. Si todavía existe, se muestra su nombre actual con esa aclaración; si fue retirada, se indica que corresponde a un catálogo anterior.

Guardar el detalle de las nuevas ventas respeta shops.history_enabled, compartido con Android. Desactivarlo requiere confirmación y no borra registros anteriores. Mientras está desactivado se siguen actualizando unidades, pero no se crean detalles de venta recuperables. Los totales se describen como ventas guardadas, porque no incluyen esos periodos sin detalle.

Las ayudas de tamaño, contraste y lectura siguen disponibles. Cada registro puede escucharse individualmente y muestra los importes en pesos chilenos. Se requiere validar comprensión, micrófono y lectura en teléfonos reales con las emprendedoras; las pruebas automatizadas de voz verifican su integración mediante un servicio simulado.

## Verificación

security/owner-sales-check.mjs crea una tienda y productos ficticios propios. Comprueba respuesta perdida después de registrar, recarga y reintento con el mismo ID, opciones y precios, falta de unidades, ventas simultáneas, modalidades, permisos, historial desactivado, más de 1000 filas con fechas idénticas, filtros, totales, productos retirados y formato móvil ampliado. Elimina sus ventas, productos, solicitudes idempotentes, tienda y cuenta al terminar. No descuenta productos de las tiendas del equipo.

SALES_URL selecciona la dirección a comprobar. CONECTASUR_PRIVATE se carga solo en memoria y PLAYWRIGHT_MODULE señala la instalación de Playwright. Las capturas y resultados quedan en security/reports/owner-sales/. supabase/test/sales-model.test.js comprueba cantidades, cálculos enteros y fechas sin requerir credenciales.

Resultados del hito: 15 comprobaciones del recorrido de ventas, 18 de regresión de accesibilidad y 5 pruebas de cantidades, cálculos y fechas aprobadas. La regresión de accesibilidad se ejecutó en el servidor local; su reporte conserva esa dirección para distinguirla de la verificación pública de ventas.

La verificación de ventas también aprobó sus 15 comprobaciones en https://conectasur-dev.web.app/ el 2 de noviembre de 2026 (hora de Chile). El reporte registra el instante en UTC. La publicación final respondió HTTP 200 y sirvió los mismos recursos de JavaScript y CSS que la compilación local.
