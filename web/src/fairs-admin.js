import { icon } from './visuals.js';
import { renderInteractiveMap, searchAddressPuertoMontt, PUERTO_MONTT_CENTER } from './fair-map.js';

function esc(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FAIR_STATUS_LABELS = {
  draft: 'Borrador',
  published: 'Publicada',
  cancelled: 'Cancelada'
};

export async function showAdminFairsAndAccess(container, db, showMessage) {
  let mapHandle = null;
  let editingFair = null;
  let fairs = [];
  let anonMode = 'allow';

  function cleanupMap() {
    mapHandle?.destroy();
    mapHandle = null;
  }

  async function loadAll() {
    cleanupMap();
    container.innerHTML = '<p role="status">Cargando configuración y ferias…</p>';
    try {
      const [mode, list] = await Promise.all([
        db.getAnonymousNavigation(),
        db.listAdminFairs()
      ]);
      anonMode = mode;
      fairs = list;
      renderList();
    } catch (error) {
      container.innerHTML = `<div class="form-card"><p class="error">${esc(error.message || 'No pudimos cargar las ferias.')}</p></div>`;
    }
  }

  function renderList() {
    cleanupMap();
    const dateFmt = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
    container.innerHTML = `
      <div class="admin-fairs-stack">
        <section class="form-card admin-anon-card" aria-labelledby="anon-nav-title">
          <div class="section-heading">
            <div>
              <h2 id="anon-nav-title">Navegación anónima en la app Android</h2>
              <p>Define cómo entran los compradores cuando abren la aplicación móvil sin sesión iniciada.</p>
            </div>
          </div>
          <form id="anon-mode-form">
            <div class="anon-mode-cards">
              <label class="anon-mode-option">
                <input type="radio" name="anon_mode" value="allow" ${anonMode === 'allow' ? 'checked' : ''}>
                <span><strong>Permitir libremente</strong><small>Entra directo a explorar tiendas, productos y ferias sin pedir cuenta.</small></span>
              </label>
              <label class="anon-mode-option">
                <input type="radio" name="anon_mode" value="invite" ${anonMode === 'invite' ? 'checked' : ''}>
                <span><strong>Invitar con opción de omitir</strong><small>Sugiere entrar con Google, pero deja continuar como visitante.</small></span>
              </label>
              <label class="anon-mode-option">
                <input type="radio" name="anon_mode" value="require" ${anonMode === 'require' ? 'checked' : ''}>
                <span><strong>Obligar ingreso con Google</strong><small>Exige iniciar sesión con Google antes de ver el catálogo comprador.</small></span>
              </label>
            </div>
            <button type="submit" class="public-primary">${icon('check')} Guardar navegación anónima</button>
          </form>
        </section>

        <section class="form-card" aria-labelledby="fairs-admin-title">
          <div class="section-heading">
            <div>
              <h2 id="fairs-admin-title">Ferias y eventos en Puerto Montt</h2>
              <p>Crea, edita y ubica las ferias en el mapa para que aparezcan en la vitrina y la app.</p>
            </div>
            <button type="button" id="btn-new-fair">${icon('plus')} Crear feria</button>
          </div>
          ${fairs.length ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Feria</th>
                    <th>Fecha y horario</th>
                    <th>Lugar</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${fairs.map(f => `
                    <tr>
                      <td><strong>${esc(f.name)}</strong><small>${esc(f.organizer || 'Sin organizador indicado')}</small></td>
                      <td>${esc(dateFmt.format(new Date(f.starts_at)))}<small>Hasta ${esc(dateFmt.format(new Date(f.ends_at)))}</small></td>
                      <td>${esc(f.place_name)}</td>
                      <td><span class="status ${f.status === 'published' ? 'active' : 'inactive'}"><span class="status-dot" aria-hidden="true"></span>${esc(FAIR_STATUS_LABELS[f.status] || f.status)}</span></td>
                      <td class="actions">
                        <button type="button" data-edit-fair="${esc(f.id)}">Editar</button>
                        <button type="button" data-delete-fair="${esc(f.id)}">Eliminar</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p>Aún no hay ferias registradas. Crea la primera con su ubicación en el mapa.</p>'}
        </section>
      </div>`;

    container.querySelector('#anon-mode-form').addEventListener('submit', async e => {
      e.preventDefault();
      const selected = container.querySelector('input[name="anon_mode"]:checked')?.value || 'allow';
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        anonMode = await db.setAnonymousNavigation(selected);
        showMessage('Configuración de navegación anónima guardada.');
      } catch (err) {
        showMessage(err.message || 'No pudimos guardar la configuración.', true);
      } finally {
        btn.disabled = false;
      }
    });

    container.querySelector('#btn-new-fair').addEventListener('click', () => {
      editingFair = null;
      renderForm();
    });

    container.querySelectorAll('[data-edit-fair]').forEach(btn => {
      btn.addEventListener('click', () => {
        editingFair = fairs.find(item => item.id === btn.dataset.editFair) || null;
        renderForm();
      });
    });

    container.querySelectorAll('[data-delete-fair]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const fair = fairs.find(item => item.id === btn.dataset.deleteFair);
        if (!fair || !confirm(`¿Eliminar la feria "${fair.name}"?`)) return;
        try {
          await db.deleteFair(fair.id);
          showMessage('Feria eliminada.');
          await loadAll();
        } catch (err) {
          showMessage(err.message || 'No pudimos eliminar la feria.', true);
        }
      });
    });
  }

  function renderForm() {
    cleanupMap();
    const f = editingFair;
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 86400000);
    defaultStart.setHours(10, 0, 0, 0);
    const defaultEnd = new Date(defaultStart.getTime() + 8 * 3600000);

    const lat = f ? Number(f.latitude) : PUERTO_MONTT_CENTER[0];
    const lng = f ? Number(f.longitude) : PUERTO_MONTT_CENTER[1];

    container.innerHTML = `
      <div class="form-card">
        <button type="button" id="btn-back-fairs">${icon('back')} Volver a ferias</button>
        <h2>${f ? 'Editar feria' : 'Crear nueva feria'}</h2>
        <form id="fair-form">
          <label for="fair-name">Nombre de la feria</label>
          <input id="fair-name" required maxlength="120" value="${esc(f?.name || '')}" placeholder="Ej: Feria Costumbrista de Alerce">

          <label for="fair-desc">Descripción</label>
          <textarea id="fair-desc" rows="3" maxlength="2000" placeholder="Qué encontrarán los visitantes…">${esc(f?.description || '')}</textarea>

          <label for="fair-image">Imagen (URL HTTPS opcional)</label>
          <input id="fair-image" type="url" maxlength="2048" value="${esc(f?.image_url || '')}" placeholder="https://…">

          <label for="fair-organizer">Organizador</label>
          <input id="fair-organizer" maxlength="240" value="${esc(f?.organizer || '')}" placeholder="Ej: Asociación de Emprendedoras de Alerce">

          <div class="fair-dates-grid">
            <div>
              <label for="fair-start">Fecha y hora de inicio</label>
              <input id="fair-start" type="datetime-local" required value="${esc(toLocalDateTimeInput(f?.starts_at || defaultStart.toISOString()))}">
            </div>
            <div>
              <label for="fair-end">Fecha y hora de término</label>
              <input id="fair-end" type="datetime-local" required value="${esc(toLocalDateTimeInput(f?.ends_at || defaultEnd.toISOString()))}">
            </div>
          </div>

          <label for="fair-status">Estado de publicación</label>
          <select id="fair-status">
            <option value="published" ${(f?.status || 'published') === 'published' ? 'selected' : ''}>Publicada (visible al público)</option>
            <option value="draft" ${f?.status === 'draft' ? 'selected' : ''}>Borrador</option>
            <option value="cancelled" ${f?.status === 'cancelled' ? 'selected' : ''}>Cancelada</option>
          </select>

          <label for="fair-place">Nombre del lugar o dirección</label>
          <div class="fair-address-row">
            <input id="fair-place" required maxlength="240" value="${esc(f?.place_name || '')}" placeholder="Ej: Plaza de Armas, Puerto Montt">
            <button type="button" id="btn-search-addr">Buscar en mapa</button>
          </div>
          <div id="fair-addr-results" class="fair-addr-results"></div>

          <p class="hint">Haz clic en el mapa o arrastra el marcador para ajustar la ubicación exacta.</p>
          <div id="fair-admin-map" class="fair-map"></div>

          <div class="fair-coords-grid">
            <div>
              <label for="fair-lat">Latitud</label>
              <input id="fair-lat" type="number" step="any" required value="${lat}">
            </div>
            <div>
              <label for="fair-lng">Longitud</label>
              <input id="fair-lng" type="number" step="any" required value="${lng}">
            </div>
          </div>

          <button type="submit">${icon('check')} ${f ? 'Guardar cambios' : 'Guardar feria'}</button>
        </form>
      </div>`;

    const latInput = container.querySelector('#fair-lat');
    const lngInput = container.querySelector('#fair-lng');
    const placeInput = container.querySelector('#fair-place');
    const addrResults = container.querySelector('#fair-addr-results');

    mapHandle = renderInteractiveMap(container.querySelector('#fair-admin-map'), {
      lat,
      lng,
      zoom: 14,
      interactivePick: true,
      onPick(pickedLat, pickedLng) {
        latInput.value = pickedLat;
        lngInput.value = pickedLng;
      }
    });

    container.querySelector('#btn-back-fairs').addEventListener('click', () => renderList());

    container.querySelector('#btn-search-addr').addEventListener('click', async () => {
      const q = placeInput.value.trim();
      if (!q) { showMessage('Escribe una dirección o sector para buscar.', true); return; }
      addrResults.innerHTML = '<p class="hint">Buscando dirección…</p>';
      try {
        const matches = await searchAddressPuertoMontt(q);
        if (!matches.length) {
          addrResults.innerHTML = '<p class="hint">No encontramos coincidencias exactas. Puedes marcar el punto haciendo clic en el mapa.</p>';
          return;
        }
        addrResults.innerHTML = matches.map((m, idx) => `<button type="button" class="fair-addr-choice" data-idx="${idx}">${esc(m.label)}</button>`).join('');
        addrResults.querySelectorAll('[data-idx]').forEach(btn => {
          btn.addEventListener('click', () => {
            const match = matches[Number(btn.dataset.idx)];
            latInput.value = match.lat;
            lngInput.value = match.lng;
            mapHandle.setPoint(match.lat, match.lng, placeInput.value || match.label);
            addrResults.innerHTML = '';
          });
        });
      } catch (err) {
        addrResults.innerHTML = `<p class="hint error">${esc(err.message)}</p>`;
      }
    });

    container.querySelector('#fair-form').addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        await db.saveFair({
          id: f?.id || null,
          name: container.querySelector('#fair-name').value,
          description: container.querySelector('#fair-desc').value,
          imageUrl: container.querySelector('#fair-image').value,
          organizer: container.querySelector('#fair-organizer').value,
          startsAt: container.querySelector('#fair-start').value,
          endsAt: container.querySelector('#fair-end').value,
          status: container.querySelector('#fair-status').value,
          placeName: placeInput.value,
          latitude: Number(latInput.value),
          longitude: Number(lngInput.value)
        });
        showMessage(f ? 'Feria actualizada.' : 'Feria creada.');
        await loadAll();
      } catch (err) {
        showMessage(err.message || 'No pudimos guardar la feria.', true);
      } finally {
        if (submitBtn.isConnected) submitBtn.disabled = false;
      }
    });
  }

  await loadAll();
  return {
    dispose: cleanupMap,
    requestLeave: () => true
  };
}

