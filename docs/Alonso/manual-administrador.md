# Manual breve del administrador — ConectaSur

**SurCode / ConectaSur · Versión de entrega final · Noviembre 2026**

Guía paso a paso para operar el panel administrativo web de ConectaSur, pensada para que cualquier persona autorizada pueda administrar ferias, emprendedoras, asociaciones y cuentas sin asistencia previa.

---

## 1. Ingresar al panel administrativo

1. Abre [https://conectasur-dev.web.app](https://conectasur-dev.web.app) en el navegador.
2. Haz clic en **Ingresar** (o entra directo a `https://conectasur-dev.web.app/#ingresar`).
3. Escribe tu **correo electrónico** y tu **contraseña** de administrador.
4. Pulsa **Iniciar sesión**.
5. Si el ingreso es correcto, se abrirá el **Panel administrativo** con el menú lateral de **Gestión** y **Catálogo base**.

---

## 2. Secciones del menú lateral

- **Gestión:**
  - **Inicio:** resumen general de la plataforma.
  - **Emprendedoras:** crear tiendas nuevas, revisar sus credenciales iniciales, editar nombre o activar/desactivar cuentas.
  - **Asociaciones:** crear y editar agrupaciones, subir su logo y vincular tiendas integrantes.
  - **Ferias y Acceso:** configurar la navegación anónima en Android y crear, publicar, cancelar y administrar ferias y participantes.
  - **Administradores:** crear, renombrar y activar/desactivar otras cuentas administradoras.
  - **Bitácora:** registro histórico consultable (`quién`, `qué` y `cuándo`) de acciones administrativas.
- **Catálogo base:**
  - **Tipos de emprendimiento**, **Categorías** y **Tipos de productos**: vocabulario base compartido entre web y móvil.
- **Pie del menú:** enlaces **Ver tiendas públicas** y **Cerrar sesión**.

---

## 3. Cómo publicar o cancelar una feria (recorrido W10)

En el menú izquierdo, haz clic en **Ferias y Acceso** y baja hasta la tabla **Ferias y eventos en Puerto Montt**.

### Opción A: Publicar una feria que ya existe en Borrador
1. Busca la fila de la feria que aparece con estado **Borrador**.
2. En su columna **Acciones**, haz clic en el botón **Publicar**.
3. En el cuadro de confirmación del navegador, pulsa **Aceptar**.
4. Verifica que en la tabla el estado cambia a **Publicada** y que arriba aparece el aviso **Feria publicada**. Desde ese momento la feria es visible para cualquier visitante en **Ferias** (`#ferias`) y en la app Android.

### Opción B: Crear y publicar una feria nueva
1. Haz clic en el botón **Crear feria**.
2. Completa los campos del formulario:
   - **Nombre de la feria:** título visible al público.
   - **Descripción:** breve resumen de qué encontrarán los visitantes.
   - **Imagen de la feria (opcional):** puedes subir un archivo (`JPG`, `PNG` o `WebP`) o pegar un enlace HTTPS.
   - **Organizador:** nombre de la agrupación o institución organizadora.
   - **Fecha y hora de inicio** y **Fecha y hora de término.**
   - **Estado de publicación:** selecciona **Publicada (visible al público)** si debe verse de inmediato, o **Borrador** si solo la estás preparando.
   - **Nombre del lugar o dirección:** escribe el recinto (por ejemplo, `Plaza de Armas, Puerto Montt`) y pulsa **Buscar en mapa**, o haz clic directamente en el mapa para ajustar el marcador y sus coordenadas.
3. Pulsa **Guardar feria**.

### Opción C: Cancelar una feria publicada
1. En la tabla **Ferias y eventos en Puerto Montt**, ubica la fila de la feria cuyo estado sea **Publicada**.
2. En la columna **Acciones**, haz clic en **Cancelar feria**.
3. En el cuadro de confirmación, pulsa **Aceptar**.
4. Verifica que el estado cambia a **Cancelada** y que el mensaje superior indica que se avisó a las tiendas invitadas o confirmadas. La feria deja de ofrecerse como actividad vigente y no permite nuevas invitaciones ni avisos.

> Si quieres verificar de inmediato el resultado público, haz clic en **Ver tiendas públicas** en el menú izquierdo y entra a la pestaña **Ferias**.

---

## 4. Invitar participantes, enviar avisos y tomar asistencia

1. En **Ferias y Acceso**, haz clic en **Participantes** en la fila de la feria publicada.
2. **Invitar o agregar:**
   - En **Quién**, elige **Emprendedora (tienda)** o **Asociación**.
   - En **Selecciona**, elige la tienda o agrupación y pulsa **Invitar** (envía aviso para que responda desde la app) o **Agregar directamente**.
3. **Enviar avisos a emprendedoras:**
   - Opcionalmente escribe un mensaje en el campo de texto y pulsa **Enviar recordatorio a pendientes** o **Enviar aviso a confirmadas**.
4. **Checklist y asistencia:**
   - Usa los filtros por texto, estado, tipo o asociación en **Checklist de participantes**.
   - En la columna **Asistencia** de cada fila confirmada/agregada, selecciona **Asistió** o **No asistió**. La tabla guarda automáticamente la selección y se refresca cada 20 segundos cuando una emprendedora responde desde Android.

---

## 5. Otras tareas frecuentes de administración

- **Navegación anónima en Android:** en la tarjeta superior de **Ferias y Acceso**, elige `Permitir libremente`, `Invitar con opción de omitir` o `Obligar ingreso con Google` y pulsa **Guardar navegación anónima**.
- **Gestionar otros administradores:** entra a **Administradores** para crear cuentas administradoras nuevas, editar su nombre o activar/desactivar su acceso (la sesión actual no se cierra al crear otra cuenta y el sistema impide desactivarse a sí mismo).
- **Revisar la bitácora:** entra a **Bitácora** para auditar qué cuenta administradora ejecutó cambios sobre cuentas, asociaciones o ferias, junto con la fecha y el detalle del objeto afectado.
- **Cerrar sesión:** pulsa **Cerrar sesión** al pie del menú lateral cuando termines de operar el panel.

---

## 6. Comprobación rápida de validación independiente (`W10`)

Para verificar que una persona ajena al grupo puede operar sin instrucciones orales siguiendo solo la Sección 1 y la Sección 3 de este manual:

1. Entrega únicamente la URL pública (`https://conectasur-dev.web.app`), este documento y las credenciales de administrador de prueba.
2. Comprueba que logra iniciar sesión en `#ingresar` y entrar a **Ferias y Acceso** sin pedir indicaciones verbales.
3. Comprueba que logra completar al menos una publicación (**Publicar** o **Crear feria** -> **Publicada**) y una cancelación (**Cancelar feria**) confirmando el cambio de estado en la tabla.
4. Verifica en la pestaña pública **Ferias** (`#ferias`) y en **Bitácora** que el cambio quedó reflejado y registrado.
