
import './style.css';
import config from '../supabase-config.js';
import { createDataLayer } from '../supabase-data.js';
import { showPublicShops, showPublicShop } from './public-shops.js';
import { showEntrepreneurAccess } from './entrepreneur-access.js';

const app = document.querySelector('#app');
const db = createDataLayer(config);

app.addEventListener('click', event => {
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    document.querySelector('#public-content')?.focus();
  }
});

let usuarioActual = null;
let tiendas = [];
let seccionActual = 'inicio';

function escapar(valor = '') {
  return String(valor).replace(/[&<>"']/g, caracter => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[caracter]);
}

function mostrarMensaje(texto, error = false) {
  const mensaje = document.querySelector('#mensaje-global');
  if (!mensaje) return;

  mensaje.textContent = texto;
  mensaje.className = error ? 'mensaje error' : 'mensaje';
}

function mostrarLogin() {
  app.innerHTML = `
    <main class="login-container">
      <section class="login-card">
        <h1>ConectaSur</h1>
        <p>Panel de administración</p>
        <a class="public-return" href="#inicio">← Volver a las tiendas</a>

        <form id="login-form">
          <label for="email">Correo electrónico</label>
          <input id="email" type="email" required
            autocomplete="username"
            placeholder="Correo de administrador">

          <label for="password">Contraseña</label>
          <input id="password" type="password" required
            autocomplete="current-password"
            placeholder="Tu contraseña">

          <button type="submit">Iniciar sesión</button>
          <p id="mensaje"></p>
        </form>
      </section>
    </main>`;

  document.querySelector('#login-form')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const mensaje = document.querySelector('#mensaje');
      const boton = e.currentTarget.querySelector(
        'button[type="submit"]'
      );

      boton.disabled = true;
      mensaje.textContent = 'Comprobando acceso...';

      try {
        const usuario = await db.login(
          document.querySelector('#email').value,
          document.querySelector('#password').value
        );

        if (!mensaje.isConnected) return;

        if (usuario.role !== 'admin') {
          await db.logout();
          mensaje.textContent =
            'Esta cuenta no tiene permisos de administrador.';
          return;
        }

        usuarioActual = usuario;
        await mostrarPanel();
      } catch (error) {
        mensaje.textContent = error.message;
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
}

async function mostrarPanel() {
  app.innerHTML = `
    <div class="dashboard">
      <aside class="sidebar">
        <h2>ConectaSur</h2>
        <p>Administración</p>

        <nav>
          <button data-section="inicio">Inicio</button>
          <button data-section="emprendedoras">Emprendedoras</button>
          <button data-section="asociaciones">Asociaciones</button>
          <button data-section="categorias">Categorías</button>
          <button data-section="tipos">Tipos de productos</button>
        </nav>

        <button id="logout">Cerrar sesión</button>
        <a class="sidebar-public-link" href="#inicio">Ver tiendas públicas</a>
      </aside>

      <main class="content">
        <header class="page-header">
          <div>
            <h1>Panel administrativo</h1>
            <p>Bienvenido, ${escapar(usuarioActual.email)}</p>
          </div>
        </header>

        <p id="mensaje-global" class="mensaje" role="status"></p>
        <section id="section-content"></section>
      </main>
    </div>`;

  document.querySelectorAll('[data-section]').forEach(boton => {
    boton.addEventListener('click', () => {
      abrirSeccion(boton.dataset.section);
    });
  });

  document.querySelector('#logout').addEventListener(
    'click',
    async () => {
      await db.logout();
      usuarioActual = null;
      mostrarLogin();
    }
  );

  await abrirSeccion('inicio');
}

async function abrirSeccion(seccion) {
  seccionActual = seccion;

  const contenido = document.querySelector('#section-content');

  if (seccion === 'inicio') {
    contenido.innerHTML = `
      <div class="welcome-card">
        <h2>Bienvenido al panel</h2>
        <p>
          Desde aquí podrás administrar las tiendas
          y los datos de ConectaSur.
        </p>
      </div>`;
    return;
  }

  if (seccion === 'emprendedoras') {
    await cargarEmprendedoras();
    return;
  }

  if (seccion === 'asociaciones') {
    await cargarAsociaciones();
    return;
  }

  if (seccion === 'categorias' || seccion === 'tipos') {
    await cargarLista(seccion);
  }
}

// ------------------------------------------
// EMPRENDEDORAS
// ------------------------------------------

async function cargarEmprendedoras() {
  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Emprendedoras</h2>
        <p>Administra las cuentas y tiendas registradas.</p>
      </div>

      <button id="nueva-emprendedora">
        + Crear emprendedora
      </button>
    </div>

    <div id="tabla-tiendas">Cargando tiendas...</div>`;

  document.querySelector('#nueva-emprendedora')
    .addEventListener('click', mostrarFormularioEmprendedora);

  try {
    tiendas = await db.listShops();

    if (seccionActual !== 'emprendedoras') return;

    const tabla = document.querySelector('#tabla-tiendas');

    if (!tiendas.length) {
      tabla.innerHTML =
        '<p>No hay tiendas registradas todavía.</p>';
      return;
    }

    tabla.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tienda</th>
              <th>Sector</th>
              <th>Contacto</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${tiendas.map(tienda => `
              <tr>
                <td>
                  <strong>${escapar(tienda.name)}</strong>
                  <small>
                    ${escapar(tienda.entrepreneurType || 'Sin tipo')}
                  </small>
                </td>

                <td>${escapar(tienda.sector || '—')}</td>
                <td>${escapar(tienda.contact || '—')}</td>

                <td>
                  <span class="status ${
                    tienda.active ? 'active' : 'inactive'
                  }">
                    ${tienda.active ? 'Activa' : 'Inactiva'}
                  </span>
                </td>

                <td class="actions">
                  <button data-edit="${escapar(tienda.id)}">
                    Editar
                  </button>

                  <button data-toggle="${escapar(tienda.id)}">
                    ${tienda.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    tabla.querySelectorAll('[data-edit]').forEach(boton => {
      boton.addEventListener('click', () => {
        const tienda = tiendas.find(
          t => t.id === boton.dataset.edit
        );

        if (tienda) mostrarFormularioEdicion(tienda);
      });
    });

    tabla.querySelectorAll('[data-toggle]').forEach(boton => {
      boton.addEventListener('click', async () => {
        const tienda = tiendas.find(
          t => t.id === boton.dataset.toggle
        );

        if (!tienda) return;

        const accion = tienda.active ? 'desactivar' : 'activar';

        if (!confirm(
          `¿Seguro que quieres ${accion} la tienda "${tienda.name}"?`
        )) return;

        try {
          await db.setEmprendedoraActive(
            tienda.ownerUid,
            tienda.id,
            !tienda.active
          );

          mostrarMensaje(
            `Tienda ${tienda.active ? 'desactivada' : 'activada'}.`
          );

          await cargarEmprendedoras();
        } catch (error) {
          mostrarMensaje(error.message, true);
        }
      });
    });
  } catch (error) {
    const tabla = document.querySelector('#tabla-tiendas');

    if (tabla) {
      tabla.innerHTML =
        `<p class="error">No se pudieron cargar las tiendas: ${
          escapar(error.message)
        }</p>`;
    }
  }
}

function mostrarFormularioEmprendedora() {
  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="form-card">
      <button id="volver-tiendas" class="secondary">
        ← Volver
      </button>

      <h2>Crear emprendedora</h2>
      <p>Se creará una cuenta y su tienda asociada.</p>

      <form id="crear-form">
        <label for="nombre">Nombre de la emprendedora</label>
        <input id="nombre" required maxlength="120">

        <label for="tienda">Nombre de la tienda</label>
        <input id="tienda" required maxlength="120">

        <label for="correo">Correo electrónico</label>
        <input id="correo" type="email" required autocomplete="off">

        <label for="clave">Contraseña inicial</label>
        <input id="clave" type="password" required minlength="8"
          autocomplete="new-password">

        <p class="hint">
          La contraseña se utilizará para crear la cuenta de acceso.
        </p>

        <button type="submit">Crear cuenta y tienda</button>
        <p id="form-mensaje" role="status"></p>
      </form>
    </div>`;

  document.querySelector('#volver-tiendas')
    .addEventListener('click', cargarEmprendedoras);

  document.querySelector('#crear-form')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const form = e.currentTarget;
      const boton = form.querySelector('button[type="submit"]');
      const mensaje = document.querySelector('#form-mensaje');

      boton.disabled = true;
      mensaje.textContent = 'Creando cuenta y tienda...';

      try {
        await db.createEmprendedora({
          displayName: document.querySelector('#nombre').value.trim(),
          shopName: document.querySelector('#tienda').value.trim(),
          email: document.querySelector('#correo').value.trim(),
          password: document.querySelector('#clave').value
        });

        mostrarMensaje('Cuenta y tienda creadas correctamente.');
        await cargarEmprendedoras();
      } catch (error) {
        mensaje.textContent = error.message;
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
}

function mostrarFormularioEdicion(tienda) {
  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="form-card">
      <button id="volver-tiendas" class="secondary">
        ← Volver
      </button>

      <h2>Editar tienda</h2>

      <form id="editar-form">
        <label for="nombre-tienda">Nombre</label>
        <input id="nombre-tienda" required maxlength="120"
          value="${escapar(tienda.name)}">

        <label for="descripcion">Descripción</label>
        <textarea id="descripcion" rows="3">${
          escapar(tienda.description || '')
        }</textarea>

        <label for="sector">Sector</label>
        <input id="sector" maxlength="120"
          value="${escapar(tienda.sector || '')}">

        <label for="contacto">Contacto</label>
        <input id="contacto" maxlength="160"
          value="${escapar(tienda.contact || '')}">

        <label for="tipo">Tipo de emprendimiento</label>
        <input id="tipo" maxlength="100"
          value="${escapar(tienda.entrepreneurType || '')}">

        <label class="check-label">
          <input id="precios" type="checkbox"
            ${tienda.showPrices ? 'checked' : ''}>
          Mostrar precios públicamente
        </label>

        <label class="check-label">
          <input id="historial" type="checkbox"
            ${tienda.historyEnabled ? 'checked' : ''}>
          Habilitar historial de ventas
        </label>

        <button type="submit">Guardar cambios</button>
        <p id="form-mensaje" role="status"></p>
      </form>
    </div>`;

  document.querySelector('#volver-tiendas')
    .addEventListener('click', cargarEmprendedoras);

  document.querySelector('#editar-form')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const boton = e.currentTarget.querySelector(
        'button[type="submit"]'
      );

      const mensaje = document.querySelector('#form-mensaje');

      boton.disabled = true;
      mensaje.textContent = 'Guardando cambios...';

      try {
        await db.updateShop(tienda.id, {
          name: document.querySelector('#nombre-tienda').value.trim(),
          description: document.querySelector('#descripcion').value.trim(),
          sector: document.querySelector('#sector').value.trim(),
          contact: document.querySelector('#contacto').value.trim(),
          entrepreneurType: document.querySelector('#tipo').value.trim(),
          showPrices: document.querySelector('#precios').checked,
          historyEnabled: document.querySelector('#historial').checked
        });

        mostrarMensaje('Tienda actualizada.');
        await cargarEmprendedoras();
      } catch (error) {
        mensaje.textContent = error.message;
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
}

// ------------------------------------------
// ASOCIACIONES
// ------------------------------------------

async function cargarAsociaciones() {
  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Asociaciones</h2>
        <p>Administra las asociaciones del grupo.</p>
      </div>

      <button id="nueva-asociacion">
        + Nueva asociación
      </button>
    </div>

    <div id="lista-asociaciones">Cargando asociaciones...</div>`;

  document.querySelector('#nueva-asociacion')
    .addEventListener('click', () => {
      mostrarFormularioAsociacion();
    });

  try {
    const asociaciones = await db.listAssociations();

    if (seccionActual !== 'asociaciones') return;

    const lista = document.querySelector('#lista-asociaciones');

    if (!asociaciones.length) {
      lista.innerHTML = '<p>No hay asociaciones registradas.</p>';
      return;
    }

    lista.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Sector</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${asociaciones.map(a => `
              <tr>
                <td>${escapar(a.name)}</td>
                <td>${escapar(a.sector || '—')}</td>
                <td>${a.active ? 'Activa' : 'Inactiva'}</td>

                <td class="actions">
                  <button data-members="${escapar(a.id)}">
                    Integrantes
                  </button>

                  <button data-edit-assoc="${escapar(a.id)}">
                    Editar
                  </button>

                  <button data-toggle-assoc="${escapar(a.id)}">
                    ${a.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    lista.querySelectorAll('[data-members]').forEach(boton => {
      boton.addEventListener('click', () => {
        const asociacion = asociaciones.find(
          item => item.id === boton.dataset.members
        );

        if (asociacion) {
          mostrarIntegrantesAsociacion(asociacion);
        }
      });
    });

    lista.querySelectorAll('[data-edit-assoc]').forEach(boton => {
      boton.addEventListener('click', () => {
        const asociacion = asociaciones.find(
          item => item.id === boton.dataset.editAssoc
        );

        if (asociacion) {
          mostrarFormularioAsociacion(asociacion);
        }
      });
    });

    lista.querySelectorAll('[data-toggle-assoc]').forEach(boton => {
      boton.addEventListener('click', async () => {
        const asociacion = asociaciones.find(
          item => item.id === boton.dataset.toggleAssoc
        );

        if (
          !asociacion ||
          !confirm(`¿Cambiar el estado de "${asociacion.name}"?`)
        ) return;

        try {
          await db.setAssociationActive(
            asociacion.id,
            !asociacion.active
          );

          await cargarAsociaciones();
          mostrarMensaje('Estado de la asociación actualizado.');
        } catch (error) {
          mostrarMensaje(error.message, true);
        }
      });
    });
  } catch (error) {
    const lista = document.querySelector('#lista-asociaciones');

    if (lista) {
      lista.innerHTML =
        `<p class="error">No se pudieron cargar las asociaciones: ${
          escapar(error.message)
        }</p>`;
    }
  }
}

// NUEVA PANTALLA: GESTIÓN DE INTEGRANTES

async function mostrarIntegrantesAsociacion(asociacion) {
  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="form-card">
      <button id="volver-asociaciones" class="secondary">
        ← Volver a asociaciones
      </button>

      <h2>Integrantes de ${escapar(asociacion.name)}</h2>
      <p>Agrega o quita emprendedoras de esta asociación.</p>

      <div id="integrantes-contenido">
        Cargando integrantes...
      </div>
    </div>`;

  document.querySelector('#volver-asociaciones')
    .addEventListener('click', cargarAsociaciones);

  const panel = document.querySelector('#integrantes-contenido');

  try {
    const [relaciones, todasLasTiendas] = await Promise.all([
      db.listAssociationShops(asociacion.id),
      db.listShops()
    ]);

    const idsIntegrantes = relaciones.map(r => r.shop_id);

    const integrantes = todasLasTiendas.filter(
      tienda => idsIntegrantes.includes(tienda.id)
    );

    const disponibles = todasLasTiendas.filter(
      tienda =>
        tienda.active &&
        !idsIntegrantes.includes(tienda.id)
    );

    panel.innerHTML = `
      <section class="members-section">
        <h3>Emprendedoras disponibles</h3>

        ${
          disponibles.length
            ? `
              <form id="agregar-integrante-form">
                <label for="tienda-disponible">
                  Selecciona una emprendedora
                </label>

                <select id="tienda-disponible" required>
                  <option value="">Seleccionar tienda...</option>

                  ${disponibles.map(tienda => `
                    <option value="${escapar(tienda.id)}">
                      ${escapar(tienda.name)}
                    </option>
                  `).join('')}
                </select>

                <button type="submit">
                  Agregar a la asociación
                </button>

                <p id="agregar-mensaje" role="status"></p>
              </form>
            `
            : '<p>No hay emprendedoras disponibles para agregar.</p>'
        }
      </section>

      <section class="members-section">
        <h3>Integrantes actuales (${integrantes.length})</h3>

        ${
          integrantes.length
            ? `
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tienda</th>
                      <th>Sector</th>
                      <th>Estado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>

                  <tbody>
                    ${integrantes.map(tienda => `
                      <tr>
                        <td>${escapar(tienda.name)}</td>
                        <td>${escapar(tienda.sector || '—')}</td>
                        <td>${tienda.active ? 'Activa' : 'Inactiva'}</td>

                        <td>
                          <button
                            data-remove-member="${escapar(tienda.id)}">
                            Quitar
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `
            : '<p>Esta asociación todavía no tiene integrantes.</p>'
        }
      </section>
    `;

    const formulario = document.querySelector(
      '#agregar-integrante-form'
    );

    if (formulario) {
      formulario.addEventListener('submit', async e => {
        e.preventDefault();

        const boton = formulario.querySelector(
          'button[type="submit"]'
        );

        const mensaje = document.querySelector('#agregar-mensaje');
        const shopId = document.querySelector(
          '#tienda-disponible'
        ).value;

        if (!shopId) return;

        boton.disabled = true;
        mensaje.textContent = 'Agregando emprendedora...';

        try {
          await db.addShopToAssociation(
            shopId,
            asociacion.id
          );

          mostrarMensaje(
            'Emprendedora agregada correctamente a la asociación.'
          );

          await mostrarIntegrantesAsociacion(asociacion);
        } catch (error) {
          mensaje.textContent = error.message;
          boton.disabled = false;
        }
      });
    }

    panel.querySelectorAll('[data-remove-member]')
      .forEach(boton => {
        boton.addEventListener('click', async () => {
          const shopId = boton.dataset.removeMember;

          const tienda = integrantes.find(
            t => t.id === shopId
          );

          if (!tienda) return;

          if (!confirm(
            `¿Quitar "${tienda.name}" de "${asociacion.name}"?`
          )) return;

          boton.disabled = true;

          try {
            await db.removeShopFromAssociation(
              shopId,
              asociacion.id
            );

            mostrarMensaje(
              'Emprendedora quitada de la asociación.'
            );

            await mostrarIntegrantesAsociacion(asociacion);
          } catch (error) {
            mostrarMensaje(error.message, true);
            boton.disabled = false;
          }
        });
      });
  } catch (error) {
    panel.innerHTML =
      `<p class="error">No se pudieron cargar los integrantes: ${
        escapar(error.message)
      }</p>`;
  }
}

function mostrarFormularioAsociacion(asociacion = null) {
  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="form-card">
      <button id="volver-asociaciones" class="secondary">
        ← Volver
      </button>

      <h2>
        ${asociacion ? 'Editar asociación' : 'Crear asociación'}
      </h2>

      <form id="asociacion-form">
        <label for="assoc-nombre">Nombre</label>
        <input id="assoc-nombre" required maxlength="120"
          value="${escapar(asociacion?.name || '')}">

        <label for="assoc-descripcion">Descripción</label>
        <textarea id="assoc-descripcion" rows="3">${
          escapar(asociacion?.description || '')
        }</textarea>

        <label for="assoc-sector">Sector</label>
        <input id="assoc-sector"
          value="${escapar(asociacion?.sector || '')}">

        <label for="assoc-contacto">Contacto</label>
        <input id="assoc-contacto"
          value="${escapar(asociacion?.contact || '')}">

        <button type="submit">Guardar asociación</button>
        <p id="form-mensaje" role="status"></p>
      </form>
    </div>`;

  document.querySelector('#volver-asociaciones')
    .addEventListener('click', cargarAsociaciones);

  document.querySelector('#asociacion-form')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const mensaje = document.querySelector('#form-mensaje');

      const boton = e.currentTarget.querySelector(
        'button[type="submit"]'
      );

      boton.disabled = true;

      try {
        await db.saveAssociation(
          asociacion?.id || crypto.randomUUID(),
          {
            name: document.querySelector('#assoc-nombre').value.trim(),
            description: document.querySelector(
              '#assoc-descripcion'
            ).value.trim(),
            sector: document.querySelector('#assoc-sector').value.trim(),
            contact: document.querySelector(
              '#assoc-contacto'
            ).value.trim(),
            active: asociacion?.active ?? true
          }
        );

        mostrarMensaje('Asociación guardada.');
        await cargarAsociaciones();
      } catch (error) {
        mensaje.textContent = error.message;
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
}

// ------------------------------------------
// CATEGORÍAS Y TIPOS DE PRODUCTOS
// ------------------------------------------

async function cargarLista(seccion) {
  const esCategoria = seccion === 'categorias';
  const coleccion = esCategoria ? 'categories' : 'productTypes';
  const titulo = esCategoria ? 'Categorías' : 'Tipos de productos';

  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>${titulo}</h2>
        <p>Gestiona los valores disponibles en el catálogo.</p>
      </div>

      <button id="nuevo-item">+ Agregar</button>
    </div>

    <div id="lista-items">Cargando...</div>`;

  document.querySelector('#nuevo-item')
    .addEventListener('click', () => {
      mostrarFormularioLista(seccion);
    });

  try {
    const items = await db.listItems(coleccion);

    if (seccionActual !== seccion) return;

    const lista = document.querySelector('#lista-items');

    if (!items.length) {
      lista.innerHTML = '<p>No hay elementos registrados.</p>';
      return;
    }

    lista.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Identificador</th>
            </tr>
          </thead>

          <tbody>
            ${items.map(item => `
              <tr>
                <td>${escapar(item.name)}</td>
                <td>${escapar(item.id)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (error) {
    const lista = document.querySelector('#lista-items');

    if (lista) {
      lista.innerHTML =
        `<p class="error">No se pudo cargar la lista: ${
          escapar(error.message)
        }</p>`;
    }
  }
}

function mostrarFormularioLista(seccion) {
  const esCategoria = seccion === 'categorias';
  const coleccion = esCategoria ? 'categories' : 'productTypes';
  const titulo = esCategoria ? 'categoría' : 'tipo de producto';

  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="form-card">
      <button id="volver-lista" class="secondary">
        ← Volver
      </button>

      <h2>Agregar ${titulo}</h2>

      <form id="item-form">
        <label for="item-nombre">Nombre visible</label>
        <input id="item-nombre" required maxlength="100">

        <label for="item-id">Identificador único</label>
        <input id="item-id" required maxlength="80"
          pattern="[a-zA-Z0-9_-]+">

        <p class="hint">
          Usa letras sin espacios, números, guiones o guiones bajos.
        </p>

        <button type="submit">Guardar</button>
        <p id="form-mensaje" role="status"></p>
      </form>
    </div>`;

  document.querySelector('#volver-lista')
    .addEventListener('click', () => abrirSeccion(seccion));

  document.querySelector('#item-form')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const mensaje = document.querySelector('#form-mensaje');

      const boton = e.currentTarget.querySelector(
        'button[type="submit"]'
      );

      boton.disabled = true;

      try {
        await db.saveListItem(
          coleccion,
          document.querySelector('#item-id').value.trim(),
          document.querySelector('#item-nombre').value.trim()
        );

        mostrarMensaje(
          `${titulo[0].toUpperCase() + titulo.slice(1)} guardado.`
        );

        await cargarLista(seccion);
      } catch (error) {
        mensaje.textContent = error.message;
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
}

// ------------------------------------------
// INICIO
// ------------------------------------------

let navigationVersion = 0;
let stopOwnerScreen = () => {};

async function iniciar() {
  stopOwnerScreen();
  stopOwnerScreen = () => {};
  const version = ++navigationVersion;
  const isCurrent = () => version === navigationVersion;
  const route = window.location.hash;

  if (route === '#mi-tienda') {
    usuarioActual = null;
    seccionActual = 'mi-tienda';
    stopOwnerScreen = showEntrepreneurAccess(app, db, isCurrent);
    return;
  }

  if (route !== '#administracion') {
    usuarioActual = null;
    seccionActual = 'publica';
    if (route.startsWith('#tienda/')) {
      let id;
      try { id = decodeURIComponent(route.slice('#tienda/'.length)); }
      catch { id = ''; }
      await showPublicShop(app, db, id, isCurrent);
    } else {
      await showPublicShops(app, db, isCurrent);
    }
    return;
  }

  document.title = 'ConectaSur | Administración';
  app.innerHTML = '<main class="login-container"><p class="login-loading" role="status">Comprobando acceso…</p></main>';
  try {
    const usuario = await db.currentSession();
    if (!isCurrent()) return;

    if (usuario?.role === 'admin') {
      usuarioActual = usuario;
      await mostrarPanel();
    } else {
      mostrarLogin();
    }
  } catch {
    if (isCurrent()) mostrarLogin();
  }
}

window.addEventListener('hashchange', iniciar);
iniciar();
