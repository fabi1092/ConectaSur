import './style.css';
import config from '../supabase-config.js';
import { createDataLayer } from '../supabase-data.js';
import { showPublicShops, showPublicShop, shopLogo, wireShopImages } from './public-shops.js';
import { showAccountAccess } from './entrepreneur-access.js';
import { icon, brand } from './visuals.js';
import { initAccessibility } from './accessibility.js';
import { setAccountNavigation, knownAccountId } from './account-navigation.js';
import { takeRecoveryLocation } from '../password-recovery.js';
import { showPasswordRecovery } from './password-recovery.js';
import { showAssociationEditor } from './association-editor.js';
import { showEntrepreneurTypes } from './entrepreneur-types.js';
import { showAdminAccounts } from './admin-accounts.js';

let adminEditor=null;
function releaseAdminEditor(){adminEditor?.dispose();adminEditor=null;}
function leaveAdminEditor(){if(adminEditor && !adminEditor.requestLeave())return false;releaseAdminEditor();return true;}

let incomingRecovery = takeRecoveryLocation();
const app = document.querySelector('#app');
const accessibility = initAccessibility(app);
const db = createDataLayer(config);
let sessionNavigationVersion=0;
// El callback de Auth permanece síncrono: no consulta al SDK bajo el bloqueo de Auth.
db.onSession(user=>{
  sessionNavigationVersion++;
  if(!user){setAccountNavigation(null);releaseAdminEditor();}
  else if(knownAccountId()!==user.id)setAccountNavigation({uid:user.id});
});
const initialNavigationVersion=sessionNavigationVersion;
db.currentSession().then(user=>{
  if(knownAccountId()===user?.uid || sessionNavigationVersion===initialNavigationVersion)setAccountNavigation(user);
}).catch(()=>{ /* Auth retira la sesión inválida; la portada sigue siendo pública. */ });

app.addEventListener('click', event => {
  const accountLink=event.target.closest('[data-account-link]');
  if(accountLink && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && accountLink.hash===location.hash){
    event.preventDefault();iniciar();return;
  }
  if (event.target.closest('.skip-link')) {
    event.preventDefault();
    document.querySelector('#public-content')?.focus();
  }
  const link = event.target.closest('[data-section-link]');
  const section = link && document.querySelector(link.getAttribute('href'));
  if (section) {
    event.preventDefault();
    section.scrollIntoView({ behavior: 'auto' });
    section.querySelector('h2')?.focus({ preventScroll: true });
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

function normalizarTexto(valor = '') {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-CL');
}

function mostrarMensaje(texto, error = false) {
  const mensaje = document.querySelector('#mensaje-global');
  if (!mensaje) return;

  mensaje.textContent = texto;
  mensaje.className = error ? 'mensaje error' : 'mensaje';
}

async function mostrarPanel(logout) {
  app.innerHTML = `
    <div class="dashboard admin-site">
      <aside class="sidebar">
        <a class="public-brand" href="#inicio" aria-label="ConectaSur, inicio">${brand()}</a>
        <p>Administración</p>

        <nav>
          <button data-section="inicio">${icon('grid')} Inicio</button>
          <button data-section="emprendedoras">${icon('shop')} Emprendedoras</button>
          <button data-section="administradores">${icon('user')} Administradores</button>
          <button data-section="asociaciones">${icon('people')} Asociaciones</button>
          <button data-section="tipos-emprendimiento">${icon('shop')} Tipos de emprendimiento</button>
          <button data-section="categorias">${icon('tag')} Categorías</button>
          <button data-section="tipos">${icon('yarn')} Tipos de productos</button>
        </nav>

        <button id="logout">${icon('exit')} Cerrar sesión</button>
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

  document.querySelector('#logout').addEventListener('click', () => { if(leaveAdminEditor())logout(); });

  await abrirSeccion('inicio');
}

async function abrirSeccion(seccion) {
  if(!leaveAdminEditor())return;
  seccionActual = seccion;
  document.querySelectorAll('[data-section]').forEach(button => {
    if (button.dataset.section === seccion) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  const contenido = document.querySelector('#section-content');

  if(seccion==='administradores'){
    adminEditor=showAdminAccounts(contenido,db,usuarioActual.uid);
    return;
  }

  if (seccion === 'inicio') {
    contenido.innerHTML = `
      <div class="admin-welcome"><div><p class="admin-eyebrow">Tu comunidad, conectada</p><h2>Hagamos crecer lo local.</h2><p>Gestiona las tiendas y la información que da vida a ConectaSur.</p></div><div class="admin-welcome-icon">${icon('shop')}</div></div>
      <div class="admin-stats">${[['shops','Tiendas registradas','shop'],['associations','Asociaciones','people'],['categories','Categorías','tag'],['types','Tipos de productos','yarn']].map(([id,label,symbol]) => `<div class="admin-stat">${icon(symbol)}<strong id="stat-${id}">—</strong><span>${label}</span></div>`).join('')}</div>
      <p id="dashboard-summary-status" role="status">Cargando resumen…</p>
      <h3 class="admin-shortcuts-title">¿Qué necesitas hacer hoy?</h3><div class="admin-shortcuts">${[['emprendedoras','Gestionar emprendedoras','Crea cuentas y revisa sus tiendas.','shop'],['asociaciones','Organizar asociaciones','Conecta a las emprendedoras de tu comunidad.','people'],['categorias','Ordenar el catálogo','Mantén claras las categorías de productos.','tag']].map(([section,title,text,symbol]) => `<button data-shortcut="${section}">${icon(symbol)}<span><strong>${title}</strong><small>${text}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
    contenido.querySelectorAll('[data-shortcut]').forEach(button => button.addEventListener('click', () => abrirSeccion(button.dataset.shortcut)));
    const summaries = await Promise.allSettled([db.listShops(), db.listAssociations(), db.listItems('categories'), db.listItems('productTypes')]);
    if (!contenido.isConnected || seccionActual !== 'inicio') return;
    ['shops','associations','categories','types'].forEach((id,index) => { contenido.querySelector('#stat-' + id).textContent = summaries[index].status === 'fulfilled' ? summaries[index].value.length : '—'; });
    contenido.querySelector('#dashboard-summary-status').textContent = summaries.some(item => item.status === 'rejected') ? 'No pudimos cargar todo el resumen. Puedes intentar nuevamente desde Inicio.' : 'Resumen actualizado con los datos de la plataforma.';
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
  if (seccion === 'tipos-emprendimiento') {
    adminEditor=showEntrepreneurTypes(contenido,db);
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

    <div class="admin-account-filters">
      <div>
        <label for="tiendas-search">Buscar por tienda, tipo, sector o contacto</label>
        <input id="tiendas-search" type="search" placeholder="Ejemplo: tejidos o Alerce" disabled>
      </div>
      <div>
        <label for="tiendas-estado">Estado de la tienda</label>
        <select id="tiendas-estado" disabled>
          <option value="all">Todas las tiendas</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>
    </div>
    <p id="tiendas-count" role="status">Cargando tiendas...</p>
    <div id="tabla-tiendas"></div>`;

  document.querySelector('#nueva-emprendedora')
    .addEventListener('click', mostrarFormularioEmprendedora);

  const region = contenido.querySelector('#tabla-tiendas');
  const buscador = contenido.querySelector('#tiendas-search');
  const selectorEstado = contenido.querySelector('#tiendas-estado');
  const contador = contenido.querySelector('#tiendas-count');

  function renderizarTablaTiendas() {
    if (!region.isConnected) return;

    if (!tiendas.length) {
      contador.textContent = 'Mostrando 0 de 0 tiendas.';
      region.innerHTML = '<p>No hay tiendas registradas todavía.</p>';
      return;
    }

    const termino = normalizarTexto(buscador.value.trim());
    const estado = selectorEstado.value;
    const filtradas = tiendas.filter(tienda => {
      const texto = normalizarTexto(
        `${tienda.name || ''} ${tienda.entrepreneurType || ''} ${tienda.sector || ''} ${tienda.contact || ''}`
      );
      const coincideEstado =
        estado === 'all' || tienda.active === (estado === 'active');
      return texto.includes(termino) && coincideEstado;
    });

    contador.textContent = `Mostrando ${filtradas.length} de ${tiendas.length} tiendas.`;

    if (!filtradas.length) {
      region.innerHTML = '<p class="owner-empty">No encontramos tiendas con esos filtros.</p>';
      return;
    }

    region.innerHTML = `
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
            ${filtradas.map(tienda => `
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

    region.querySelectorAll('[data-edit]').forEach(boton => {
      boton.addEventListener('click', () => {
        const tienda = tiendas.find(
          t => t.id === boton.dataset.edit
        );

        if (tienda) mostrarFormularioEdicion(tienda);
      });
    });

    region.querySelectorAll('[data-toggle]').forEach(boton => {
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
  }

  try {
    tiendas = await db.listShops();

    if (seccionActual !== 'emprendedoras' || !region.isConnected) return;

    buscador.disabled = false;
    selectorEstado.disabled = false;
    buscador.addEventListener('input', renderizarTablaTiendas);
    selectorEstado.addEventListener('change', renderizarTablaTiendas);
    renderizarTablaTiendas();
  } catch (error) {
    if (region.isConnected) {
      contador.textContent = '';
      region.innerHTML =
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

        <label class="check-label">
          <input id="mostrar-clave-emprendedora" type="checkbox">
          Mostrar contraseña
        </label>

        <p class="hint">
          La contraseña se utilizará para crear la cuenta de acceso.
        </p>

        <button type="submit">Crear cuenta y tienda</button>
        <p id="form-mensaje" role="status"></p>
      </form>
    </div>`;

  document.querySelector('#volver-tiendas')
    .addEventListener('click', cargarEmprendedoras);

  const campoClave = document.querySelector('#clave');
  document.querySelector('#mostrar-clave-emprendedora')
    .addEventListener('change', e => {
      campoClave.type = e.target.checked ? 'text' : 'password';
    });

  document.querySelector('#crear-form')
    .addEventListener('submit', async e => {
      e.preventDefault();

      const form = e.currentTarget;
      const boton = form.querySelector('button[type="submit"]');
      const mensaje = document.querySelector('#form-mensaje');

      const datos = {
        displayName: document.querySelector('#nombre').value.trim(),
        shopName: document.querySelector('#tienda').value.trim(),
        email: document.querySelector('#correo').value.trim(),
        password: campoClave.value
      };

      boton.disabled = true;
      mensaje.textContent = 'Creando cuenta y tienda...';

      try {
        await db.createEmprendedora(datos);

        mostrarMensaje('Cuenta y tienda creadas correctamente.');
        mostrarCredencialesEmprendedora(datos);
      } catch (error) {
        mensaje.textContent = error.message;
      } finally {
        if (boton.isConnected) boton.disabled = false;
      }
    });
}

function mostrarCredencialesEmprendedora({ displayName, shopName, email, password }) {
  const contenido = document.querySelector('#section-content');
  let secreto = password;

  contenido.innerHTML = `
    <div class="form-card admin-credentials">
      <span class="status active">Cuenta activa</span>
      <h2>Cuenta de emprendedora creada</h2>
      <p>Entrega estos datos a <strong>${escapar(displayName)}</strong> para que ingrese a su tienda <strong>${escapar(shopName)}</strong>.</p>
      <p>Correo de acceso: <strong>${escapar(email)}</strong></p>
      <label for="clave-creada-emprendedora">Contraseña inicial</label>
      <input id="clave-creada-emprendedora" type="password" readonly autocomplete="off">
      <label class="check-label">
        <input id="mostrar-clave-creada" type="checkbox">
        Mostrar contraseña
      </label>
      <p class="hint">Guárdala o cópiala ahora: por seguridad no se volverá a mostrar al salir de esta pantalla.</p>
      <p id="credenciales-mensaje" role="status"></p>
      <div class="owner-actions">
        <button type="button" id="copiar-credenciales-emprendedora">Copiar credenciales</button>
        <button type="button" id="volver-tiendas" class="secondary">Volver a emprendedoras</button>
      </div>
    </div>`;

  const campo = contenido.querySelector('#clave-creada-emprendedora');
  const estado = contenido.querySelector('#credenciales-mensaje');
  campo.value = secreto;

  contenido.querySelector('#mostrar-clave-creada')
    .addEventListener('change', e => {
      campo.type = e.target.checked ? 'text' : 'password';
    });

  contenido.querySelector('#copiar-credenciales-emprendedora')
    .addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(
          `ConectaSur\nTienda: ${shopName}\nCorreo: ${email}\nContraseña: ${secreto}`
        );
        estado.textContent = 'Credenciales copiadas al portapapeles.';
      } catch {
        estado.textContent = 'No se pudo copiar automáticamente. Puedes mostrar la contraseña y seleccionarla.';
      }
    });

  contenido.querySelector('#volver-tiendas')
    .addEventListener('click', () => {
      secreto = '';
      campo.value = '';
      cargarEmprendedoras();
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
        <input id="tipo" maxlength="120"
          value="${escapar(tienda.entrepreneurType || '')}" list="admin-shop-type-options">
        <datalist id="admin-shop-type-options"></datalist>

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

  const typeOptions=contenido.querySelector('#admin-shop-type-options');
  db.listItems('entrepreneurTypes').then(items=>{
    if(typeOptions.isConnected)typeOptions.innerHTML=items.map(item=>`<option value="${escapar(item.name)}"></option>`).join('');
  }).catch(()=>{ /* El texto guardado sigue disponible si falla la lista de sugerencias. */ });

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

    <div class="admin-account-filters">
      <div>
        <label for="asociaciones-search">Buscar por nombre, sector o contacto</label>
        <input id="asociaciones-search" type="search" placeholder="Ejemplo: Manos Unidas o Alerce" disabled>
      </div>
      <div>
        <label for="asociaciones-estado">Estado de la asociación</label>
        <select id="asociaciones-estado" disabled>
          <option value="all">Todas las asociaciones</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>
    </div>
    <p id="asociaciones-count" role="status">Cargando asociaciones...</p>
    <div id="lista-asociaciones"></div>`;

  document.querySelector('#nueva-asociacion')
    .addEventListener('click', () => {
      mostrarFormularioAsociacion();
    });

  const region = contenido.querySelector('#lista-asociaciones');
  const buscador = contenido.querySelector('#asociaciones-search');
  const selectorEstado = contenido.querySelector('#asociaciones-estado');
  const contador = contenido.querySelector('#asociaciones-count');
  let asociaciones = [];

  function renderizarAsociaciones() {
    if (!region.isConnected) return;

    if (!asociaciones.length) {
      contador.textContent = 'Mostrando 0 de 0 asociaciones.';
      region.innerHTML = '<p>No hay asociaciones registradas.</p>';
      return;
    }

    const termino = normalizarTexto(buscador.value.trim());
    const estado = selectorEstado.value;
    const filtradas = asociaciones.filter(a => {
      const texto = normalizarTexto(
        `${a.name || ''} ${a.sector || ''} ${a.contact || ''} ${a.description || ''}`
      );
      const coincideEstado =
        estado === 'all' || Boolean(a.active) === (estado === 'active');
      return texto.includes(termino) && coincideEstado;
    });

    contador.textContent = `Mostrando ${filtradas.length} de ${asociaciones.length} asociaciones.`;

    if (!filtradas.length) {
      region.innerHTML = '<p class="owner-empty">No encontramos asociaciones con esos filtros.</p>';
      return;
    }

    region.innerHTML = `
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
            ${filtradas.map(a => `
              <tr>
                <td><div class="association-name">${shopLogo({name:a.name,logoUrl:a.logo_url})}<span>${escapar(a.name)}</span></div></td>
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

    wireShopImages(region);
    region.querySelectorAll('[data-members]').forEach(boton => {
      boton.addEventListener('click', () => {
        const asociacion = asociaciones.find(
          item => item.id === boton.dataset.members
        );

        if (asociacion) {
          mostrarIntegrantesAsociacion(asociacion);
        }
      });
    });

    region.querySelectorAll('[data-edit-assoc]').forEach(boton => {
      boton.addEventListener('click', () => {
        const asociacion = asociaciones.find(
          item => item.id === boton.dataset.editAssoc
        );

        if (asociacion) {
          mostrarFormularioAsociacion(asociacion);
        }
      });
    });

    region.querySelectorAll('[data-toggle-assoc]').forEach(boton => {
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
  }

  try {
    asociaciones = await db.listAssociations();

    if (seccionActual !== 'asociaciones' || !region.isConnected) return;

    buscador.disabled = false;
    selectorEstado.disabled = false;
    buscador.addEventListener('input', renderizarAsociaciones);
    selectorEstado.addEventListener('change', renderizarAsociaciones);
    renderizarAsociaciones();
  } catch (error) {
    if (region.isConnected) {
      contador.textContent = '';
      region.innerHTML =
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
  if(!leaveAdminEditor())return;
  adminEditor=showAssociationEditor(document.querySelector('#section-content'),db,asociacion,{
    onCancel:()=>{if(leaveAdminEditor())cargarAsociaciones();},
    onSaved:()=>{releaseAdminEditor();cargarAsociaciones();mostrarMensaje('Asociación guardada.');}
  });
}

// ------------------------------------------
// CATEGORÍAS Y TIPOS DE PRODUCTOS
// ------------------------------------------

async function cargarLista(seccion) {
  const esCategoria = seccion === 'categorias';
  const coleccion = esCategoria ? 'categories' : 'productTypes';
  const titulo = esCategoria ? 'Categorías' : 'Tipos de productos';
  const singular = esCategoria ? 'categoría' : 'tipo de producto';

  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>${titulo}</h2>
        <p>Gestiona los valores disponibles en el catálogo.</p>
      </div>

      <button id="nuevo-item">+ Agregar</button>
    </div>

    <div class="admin-type-search">
      <label for="lista-search">Buscar ${singular}</label>
      <input id="lista-search" type="search" placeholder="Buscar por nombre o identificador" disabled>
      <p id="lista-count" role="status">Cargando...</p>
    </div>

    <div id="lista-items"></div>`;

  document.querySelector('#nuevo-item')
    .addEventListener('click', () => {
      mostrarFormularioLista(seccion);
    });

  const lista = contenido.querySelector('#lista-items');
  const buscador = contenido.querySelector('#lista-search');
  const contador = contenido.querySelector('#lista-count');
  let items = [];

  function renderizarItems() {
    if (!lista.isConnected) return;

    if (!items.length) {
      contador.textContent = 'Mostrando 0 de 0 elementos.';
      lista.innerHTML = '<p>No hay elementos registrados.</p>';
      return;
    }

    const termino = normalizarTexto(buscador.value.trim());
    const filtrados = items.filter(item =>
      normalizarTexto(`${item.name || ''} ${item.id || ''}`).includes(termino)
    );

    contador.textContent = `Mostrando ${filtrados.length} de ${items.length} elementos.`;

    if (!filtrados.length) {
      lista.innerHTML = '<p class="owner-empty">No encontramos elementos con esa búsqueda.</p>';
      return;
    }

    lista.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Identificador</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            ${filtrados.map(item => `
              <tr>
                <td>${escapar(item.name)}</td>
                <td>${escapar(item.id)}</td>
                <td class="actions">
                  <button type="button" data-edit-item="${escapar(item.id)}">
                    Editar
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    lista.querySelectorAll('[data-edit-item]').forEach(boton => {
      boton.addEventListener('click', () => {
        const actual = items.find(i => i.id === boton.dataset.editItem);
        if (actual) mostrarFormularioLista(seccion, actual);
      });
    });
  }

  try {
    items = await db.listItems(coleccion);

    if (seccionActual !== seccion || !lista.isConnected) return;

    buscador.disabled = false;
    buscador.addEventListener('input', renderizarItems);
    renderizarItems();
  } catch (error) {
    if (lista.isConnected) {
      contador.textContent = '';
      lista.innerHTML =
        `<p class="error">No se pudo cargar la lista: ${
          escapar(error.message)
        }</p>`;
    }
  }
}

function mostrarFormularioLista(seccion, item = null) {
  const esCategoria = seccion === 'categorias';
  const coleccion = esCategoria ? 'categories' : 'productTypes';
  const titulo = esCategoria ? 'categoría' : 'tipo de producto';
  const editando = Boolean(item);

  const contenido = document.querySelector('#section-content');

  contenido.innerHTML = `
    <div class="form-card">
      <button id="volver-lista" class="secondary">
        ← Volver
      </button>

      <h2>${editando ? 'Editar' : 'Agregar'} ${titulo}</h2>

      <form id="item-form">
        <label for="item-nombre">Nombre visible</label>
        <input id="item-nombre" required maxlength="100" value="${escapar(item ? item.name : '')}">

        <label for="item-id">Identificador único</label>
        <input id="item-id" required maxlength="80"
          pattern="[a-zA-Z0-9_-]+" value="${escapar(item ? item.id : '')}" ${editando ? 'readonly' : ''}>

        <p class="hint">
          ${editando
            ? 'El identificador se mantiene fijo para conservar los productos asociados.'
            : 'Usa letras sin espacios, números, guiones o guiones bajos.'}
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
          `${titulo[0].toUpperCase() + titulo.slice(1)} ${editando ? 'actualizado' : 'guardado'}.`
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
let lastRenderedRoute = window.location.hash;

async function iniciar() {
  if (stopOwnerScreen.canLeave && !stopOwnerScreen.canLeave()) {
    history.replaceState(null, '', window.location.pathname + window.location.search + lastRenderedRoute);
    return;
  }
  stopOwnerScreen();
  accessibility.stop();
  stopOwnerScreen = () => {};
  const version = ++navigationVersion;
  const isCurrent = () => version === navigationVersion;
  const route = window.location.hash;
  lastRenderedRoute = route;

  if (route === '#recuperar') {
    usuarioActual = null;
    seccionActual = 'cuenta';
    const link = incomingRecovery; incomingRecovery = null;
    stopOwnerScreen = showPasswordRecovery(app, db, isCurrent, link);
    return;
  }

  // Los enlaces anteriores siguen abriendo el mismo acceso; el rol viene del backend.
  if (['#ingresar', '#registro', '#mi-cuenta', '#mi-tienda', '#administracion'].includes(route) || route.startsWith('#access_token=')) {
    usuarioActual = null;
    seccionActual = 'cuenta';
    const stopAccount = showAccountAccess(app, db, isCurrent, async (user, logout) => {
      if (!isCurrent()) return;
      usuarioActual = user;
      await mostrarPanel(async () => {
        usuarioActual = null;
        seccionActual = 'cuenta';
        await logout();
      });
    });
    stopOwnerScreen=()=>{releaseAdminEditor();stopAccount();};
    stopOwnerScreen.canLeave=()=>(adminEditor?.requestLeave() ?? true) && stopAccount.canLeave();
    return;
  }

  usuarioActual = null;
  seccionActual = 'publica';
  if (route.startsWith('#tienda/')) {
    let id;
    try { id = decodeURIComponent(route.slice('#tienda/'.length)); }
    catch { id = ''; }
    await showPublicShop(app, db, id, isCurrent);
  } else {
    await showPublicShops(app, db, isCurrent);
    if (isCurrent() && ['#productos', '#tiendas'].includes(route)) {
      const section = document.querySelector(route);
      section?.scrollIntoView({ behavior: 'auto' });
      section?.querySelector('h2')?.focus({ preventScroll: true });
    }
  }
}

window.addEventListener('hashchange', iniciar);
iniciar();
