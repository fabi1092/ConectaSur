import { icon } from './visuals.js';
import { prepareImage } from './prepare-image.js';
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

const PARTICIPANT_STATUS_LABELS = {
  invited: 'Invitada',
  confirmed: 'Confirmada',
  declined: 'Rechazada',
  added: 'Agregada por el administrador'
};

const ATTENDANCE_LABELS = { attended: 'Asistió', absent: 'No asistió' };

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');

export async function showAdminFairsAndAccess(container, db, showMessage) {
  let mapHandle = null;
  let editingFair = null;
  let fairs = [];
  let anonMode = 'allow';
  let pollTimer = null;
  let viewId = 0;

  function cleanupMap() {
    mapHandle?.destroy();
    mapHandle = null;
    clearInterval(pollTimer);
    pollTimer = null;
    viewId += 1;
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
                        <button type="button" data-participants="${esc(f.id)}">Participantes</button>
                        ${f.status === 'draft' ? `<button type="button" data-publish-fair="${esc(f.id)}">Publicar</button>` : ''}
                        ${f.status === 'published' ? `<button type="button" data-cancel-fair="${esc(f.id)}">Cancelar feria</button>` : ''}
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

    container.querySelectorAll('[data-participants]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fair = fairs.find(item => item.id === btn.dataset.participants);
        if (fair) openParticipants(fair);
      });
    });

    container.querySelectorAll('[data-publish-fair]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fair = fairs.find(item => item.id === btn.dataset.publishFair);
        if (fair && confirm(`¿Publicar la feria "${fair.name}"? Será visible para cualquier visitante, incluso sin iniciar sesión.`)) changeFairStatus(fair, 'published', 'Feria publicada.');
      });
    });

    container.querySelectorAll('[data-cancel-fair]').forEach(btn => {
      btn.addEventListener('click', () => {
        const fair = fairs.find(item => item.id === btn.dataset.cancelFair);
        if (fair && confirm(`¿Cancelar la feria "${fair.name}"? Dejará de ofrecerse como feria activa y se avisará a las tiendas invitadas o confirmadas.`)) changeFairStatus(fair, 'cancelled', 'Feria cancelada. Se avisó a las tiendas invitadas o confirmadas.');
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

  async function changeFairStatus(fair, status, okMessage) {
    try {
      await db.setFairStatus(fair.id, status);
      showMessage(okMessage);
      await loadAll();
    } catch (err) {
      showMessage(err.message || 'No pudimos cambiar el estado de la feria.', true);
    }
  }

  async function openParticipants(fair) {
    cleanupMap();
    const myView = viewId;
    container.innerHTML = '<p role="status">Cargando participantes…</p>';
    let rows;
    let shops;
    let associations;
    try {
      [rows, shops, associations] = await Promise.all([db.fairChecklist(fair.id), db.listShops(), db.listAssociations()]);
    } catch (error) {
      if (myView !== viewId) return;
      container.innerHTML = `<div class="form-card"><button type="button" id="btn-back-fairs">${icon('back')} Volver a ferias</button><p class="error">${esc(error.message || 'No pudimos cargar los participantes.')}</p></div>`;
      container.querySelector('#btn-back-fairs').addEventListener('click', () => renderList());
      return;
    }
    if (myView !== viewId) return;

    const cancelled = fair.status === 'cancelled';
    const dateFmt = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
    const filters = { term: '', status: '', type: '', assoc: '' };
    const wide = 'style="max-width:none"';

    container.innerHTML = `
      <div class="admin-fairs-stack">
        <section class="form-card" ${wide} aria-labelledby="pf-title">
          <button type="button" id="btn-back-fairs">${icon('back')} Volver a ferias</button>
          <div class="section-heading">
            <div>
              <h2 id="pf-title">Participantes de la feria</h2>
              <p><strong>${esc(fair.name)}</strong> · ${esc(dateFmt.format(new Date(fair.starts_at)))} · ${esc(fair.place_name)} · ${esc(FAIR_STATUS_LABELS[fair.status] || fair.status)}</p>
            </div>
          </div>
          ${cancelled ? '<p class="hint error">Esta feria está cancelada: ya no se puede invitar, agregar ni enviar avisos.</p>' : ''}
        </section>

        <section class="form-card" ${wide} aria-labelledby="pf-add-title">
          <h3 id="pf-add-title">Invitar o agregar</h3>
          <p class="hint">Invitar envía un aviso y espera la respuesta. Agregar directamente la deja como «Agregada por el administrador», sin invitación.</p>
          <div class="fair-dates-grid">
            <div>
              <label for="pf-kind">Quién</label>
              <select id="pf-kind" ${cancelled ? 'disabled' : ''}>
                <option value="shop">Emprendedora (tienda)</option>
                <option value="association">Asociación</option>
              </select>
            </div>
            <div>
              <label for="pf-target">Selecciona</label>
              <select id="pf-target" ${cancelled ? 'disabled' : ''}></select>
            </div>
          </div>
          <div class="actions">
            <button type="button" id="pf-invite" ${cancelled ? 'disabled' : ''}>${icon('plus')} Invitar</button>
            <button type="button" id="pf-add" ${cancelled ? 'disabled' : ''}>Agregar directamente</button>
          </div>
        </section>

        <section class="form-card" ${wide} aria-labelledby="pf-notice-title">
          <h3 id="pf-notice-title">Avisos a las emprendedoras</h3>
          <p class="hint">Los avisos llegan a las dueñas de tienda. Las asociaciones no tienen cuenta propia: se les confirma o rechaza desde la lista.</p>
          <label for="pf-message">Mensaje (opcional, máximo 500 caracteres)</label>
          <textarea id="pf-message" rows="2" maxlength="500" placeholder="Si lo dejas vacío se envía un texto estándar." ${cancelled ? 'disabled' : ''}></textarea>
          <div class="actions">
            <button type="button" id="pf-remind" ${cancelled ? 'disabled' : ''}>Enviar recordatorio a pendientes (<span id="pf-pending-count">0</span>)</button>
            <button type="button" id="pf-notify" ${cancelled ? 'disabled' : ''}>Enviar aviso a confirmadas (<span id="pf-confirmed-count">0</span>)</button>
          </div>
        </section>

        <section class="form-card" ${wide} aria-labelledby="pf-list-title">
          <div class="section-heading">
            <div>
              <h3 id="pf-list-title">Checklist de participantes</h3>
              <p id="pf-summary" role="status"></p>
            </div>
            <button type="button" id="pf-refresh">Actualizar</button>
          </div>
          <div class="fair-dates-grid">
            <div>
              <label for="pf-search">Buscar</label>
              <input id="pf-search" type="search" maxlength="120" placeholder="Nombre, tipo o asociación" autocomplete="off">
            </div>
            <div>
              <label for="pf-filter-status">Estado</label>
              <select id="pf-filter-status">
                <option value="">Todos los estados</option>
                ${Object.entries(PARTICIPANT_STATUS_LABELS).map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label for="pf-filter-type">Tipo de emprendimiento</label>
              <select id="pf-filter-type"><option value="">Todos los tipos</option></select>
            </div>
            <div>
              <label for="pf-filter-assoc">Asociación</label>
              <select id="pf-filter-assoc"><option value="">Todas las asociaciones</option></select>
            </div>
          </div>
          <p class="hint" id="pf-updated"></p>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Participante</th><th>Asociaciones</th><th>Estado</th><th>Respuesta</th><th>Asistencia</th><th>Acciones</th></tr>
              </thead>
              <tbody id="pf-body"></tbody>
            </table>
          </div>
        </section>
      </div>`;

    const $ = selector => container.querySelector(selector);
    const kindSelect = $('#pf-kind');
    const targetSelect = $('#pf-target');
    const body = $('#pf-body');

    function matches(row) {
      if (filters.status && row.status !== filters.status) return false;
      if (filters.type && row.entrepreneur_type !== filters.type) return false;
      if (filters.assoc && !(row.association_ids || []).includes(filters.assoc) && row.association_id !== filters.assoc) return false;
      const term = normalize(filters.term.trim());
      if (!term) return true;
      return normalize([row.name, row.entrepreneur_type, ...(row.association_names || []), row.kind === 'shop' ? 'emprendedora tienda' : 'asociacion'].join(' ')).includes(term);
    }

    function setOptions(select, html) {
      if (select.dataset.sig === html) return false;
      select.innerHTML = html;
      select.dataset.sig = html;
      return true;
    }

    function fillSelect(select, placeholder, entries) {
      const current = select.value;
      setOptions(select, `<option value="">${esc(placeholder)}</option>` + entries.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join(''));
      if (entries.some(([value]) => value === current)) select.value = current;
      else if (select === $('#pf-filter-type')) filters.type = '';
      else filters.assoc = '';
    }

    function fillFilterOptions() {
      const types = [...new Set(rows.map(row => row.entrepreneur_type).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
      fillSelect($('#pf-filter-type'), 'Todos los tipos', types.map(type => [type, type]));
      const assoc = new Map();
      rows.forEach(row => {
        (row.association_ids || []).forEach((id, index) => assoc.set(id, (row.association_names || [])[index] || id));
        if (row.kind === 'association') assoc.set(row.association_id, row.name);
      });
      fillSelect($('#pf-filter-assoc'), 'Todas las asociaciones', [...assoc].sort((a, b) => a[1].localeCompare(b[1], 'es')));
    }

    function fillTargets() {
      const kind = kindSelect.value;
      const current = targetSelect.value;
      const list = (kind === 'shop' ? shops : associations).filter(item => item.active !== false)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
      setOptions(targetSelect, '<option value="">Elige una opción</option>' + list.map(item => {
        const existing = rows.find(row => (kind === 'shop' ? row.shop_id : row.association_id) === item.id);
        return `<option value="${esc(item.id)}">${esc(item.name)}${existing ? ` (${esc(PARTICIPANT_STATUS_LABELS[existing.status] || existing.status)})` : ''}</option>`;
      }).join(''));
      if (list.some(item => item.id === current)) targetSelect.value = current;
    }

    function rowHtml(row) {
      const participates = row.status === 'confirmed' || row.status === 'added';
      const id = esc(row.participant_id);
      const actions = [];
      if (row.kind === 'association') {
        if (row.status !== 'confirmed') actions.push(`<button type="button" data-set-status="confirmed" data-id="${id}">Confirmar</button>`);
        if (row.status !== 'declined') actions.push(`<button type="button" data-set-status="declined" data-id="${id}">Rechazar</button>`);
        if (row.status !== 'invited') actions.push(`<button type="button" data-set-status="invited" data-id="${id}">Volver a pendiente</button>`);
      } else if (row.status === 'declined' && !cancelled) {
        actions.push(`<button type="button" data-reinvite="${esc(row.shop_id)}">Reinvitar</button>`);
      }
      actions.push(`<button type="button" data-remove="${id}">Quitar</button>`);
      return `<tr>
        <td><strong>${esc(row.name)}</strong><small>${row.kind === 'shop' ? 'Emprendedora' + (row.entrepreneur_type ? ' · ' + esc(row.entrepreneur_type) : '') : 'Asociación'}</small></td>
        <td>${(row.association_names || []).length ? esc(row.association_names.join(', ')) : '—'}</td>
        <td><span class="status ${participates ? 'active' : 'inactive'}"><span class="status-dot" aria-hidden="true"></span>${esc(PARTICIPANT_STATUS_LABELS[row.status] || row.status)}</span></td>
        <td>${row.responded_at ? esc(dateFmt.format(new Date(row.responded_at))) : 'Sin respuesta'}${row.last_reminded_at ? `<small>Último recordatorio: ${esc(dateFmt.format(new Date(row.last_reminded_at)))}</small>` : ''}</td>
        <td>${participates ? `<select data-attendance="${id}" aria-label="Asistencia de ${esc(row.name)}">
          <option value="">Sin registrar</option>
          <option value="attended" ${row.attendance === 'attended' ? 'selected' : ''}>${ATTENDANCE_LABELS.attended}</option>
          <option value="absent" ${row.attendance === 'absent' ? 'selected' : ''}>${ATTENDANCE_LABELS.absent}</option>
        </select>` : '—'}</td>
        <td class="actions">${actions.join('')}</td>
      </tr>`;
    }

    function renderTable() {
      fillFilterOptions();
      fillTargets();
      const visible = rows.filter(matches);
      const count = status => rows.filter(row => row.status === status).length;
      $('#pf-summary').textContent = `${visible.length} de ${rows.length} · Invitadas: ${count('invited')} · Confirmadas: ${count('confirmed')} · Rechazadas: ${count('declined')} · Agregadas: ${count('added')}`;
      $('#pf-pending-count').textContent = rows.filter(row => row.kind === 'shop' && row.status === 'invited').length;
      $('#pf-confirmed-count').textContent = rows.filter(row => row.kind === 'shop' && (row.status === 'confirmed' || row.status === 'added')).length;
      body.innerHTML = visible.length ? visible.map(rowHtml).join('')
        : `<tr><td colspan="6">${rows.length ? 'Ningún participante coincide con la búsqueda o los filtros.' : 'Aún no hay participantes. Invita o agrega a una emprendedora o asociación.'}</td></tr>`;
      $('#pf-updated').textContent = 'Actualizado a las ' + new Intl.DateTimeFormat('es-CL', { timeStyle: 'short' }).format(new Date()) + '. La lista se refresca sola cada 20 segundos.';
    }

    async function reload() {
      const fresh = await db.fairChecklist(fair.id);
      if (myView !== viewId) return;
      rows = fresh;
      renderTable();
    }

    async function run(button, action, success) {
      if (button) button.disabled = true;
      try {
        const result = await action();
        showMessage(typeof success === 'function' ? success(result) : success);
        await reload();
      } catch (err) {
        showMessage(err.message || 'No pudimos completar la acción.', true);
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
    }

    function selectedTarget() {
      const id = targetSelect.value;
      if (!id) { showMessage('Elige a quién invitar o agregar.', true); return null; }
      return kindSelect.value === 'shop' ? { shopId: id } : { associationId: id };
    }

    $('#btn-back-fairs').addEventListener('click', () => renderList());
    $('#pf-refresh').addEventListener('click', event => run(event.currentTarget, () => null, 'Lista actualizada.'));
    kindSelect.addEventListener('change', fillTargets);
    $('#pf-invite').addEventListener('click', event => {
      const target = selectedTarget();
      if (target) run(event.currentTarget, () => db.inviteFairParticipant(fair.id, target), target.shopId ? 'Invitación enviada.' : 'Asociación invitada. Confirma o rechaza en su nombre desde la lista.');
    });
    $('#pf-add').addEventListener('click', event => {
      const target = selectedTarget();
      if (target) run(event.currentTarget, () => db.addFairParticipant(fair.id, target), 'Participante agregada a la feria.');
    });
    $('#pf-remind').addEventListener('click', event => {
      if (!confirm('¿Enviar un recordatorio a las emprendedoras que aún no responden la invitación?')) return;
      run(event.currentTarget, () => db.sendFairNotice(fair.id, 'pending', $('#pf-message').value),
        count => count ? `Recordatorio enviado a ${count} ${count === 1 ? 'emprendedora' : 'emprendedoras'}.` : 'No hay emprendedoras pendientes de responder.');
    });
    $('#pf-notify').addEventListener('click', event => {
      if (!confirm('¿Enviar este aviso a las emprendedoras que ya confirmaron su participación?')) return;
      run(event.currentTarget, () => db.sendFairNotice(fair.id, 'confirmed', $('#pf-message').value),
        count => count ? `Aviso enviado a ${count} ${count === 1 ? 'emprendedora' : 'emprendedoras'}.` : 'No hay emprendedoras confirmadas para avisar.');
    });
    $('#pf-search').addEventListener('input', event => { filters.term = event.target.value; renderTable(); });
    $('#pf-filter-status').addEventListener('change', event => { filters.status = event.target.value; renderTable(); });
    $('#pf-filter-type').addEventListener('change', event => { filters.type = event.target.value; renderTable(); });
    $('#pf-filter-assoc').addEventListener('change', event => { filters.assoc = event.target.value; renderTable(); });

    body.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.setStatus) {
        const labels = { confirmed: 'Confirmada', declined: 'Rechazada', invited: 'Invitada' };
        run(button, () => db.setFairParticipantStatus(button.dataset.id, button.dataset.setStatus), `Estado actualizado: ${labels[button.dataset.setStatus]}.`);
      } else if (button.dataset.reinvite) {
        run(button, () => db.inviteFairParticipant(fair.id, { shopId: button.dataset.reinvite }), 'Invitación enviada de nuevo.');
      } else if (button.dataset.remove) {
        const row = rows.find(item => item.participant_id === button.dataset.remove);
        if (row && confirm(`¿Quitar a "${row.name}" de la feria?`)) run(button, () => db.removeFairParticipant(button.dataset.remove), 'Participante quitada de la feria.');
      }
    });
    body.addEventListener('change', event => {
      const select = event.target.closest('select[data-attendance]');
      if (!select) return;
      run(null, () => db.setFairAttendance(select.dataset.attendance, select.value || null),
        select.value === 'attended' ? 'Asistencia registrada: asistió.' : select.value === 'absent' ? 'Asistencia registrada: no asistió.' : 'Asistencia borrada.');
    });

    renderTable();
    // La respuesta "Participo" llega desde la app: la lista se refresca sola, sin molestar si se está usando.
    pollTimer = setInterval(async () => {
      if (document.hidden || body.contains(document.activeElement)) return;
      try { await reload(); } catch { /* el siguiente intento lo reintenta */ }
    }, 20000);
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

          <label for="fair-image-file">Imagen de la feria (opcional)</label>
          <div id="fair-image-preview">${f?.image_url ? `<img src="${esc(f.image_url)}" alt="Imagen actual de la feria" style="max-width:240px;max-height:160px;border-radius:8px">` : ''}</div>
          <input id="fair-image-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="fair-image-status">
          <p id="fair-image-status" class="hint" role="status">JPG, PNG o WebP. La reducimos antes de subirla y se guarda al presionar guardar la feria.</p>

          <label for="fair-image">O pega un enlace HTTPS de la imagen (opcional)</label>
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

    let fairImageFile = null;
    const fairImageInput = container.querySelector('#fair-image-file');
    const fairImageStatus = container.querySelector('#fair-image-status');
    const fairImagePreview = container.querySelector('#fair-image-preview');
    fairImageInput.addEventListener('change', async () => {
      const selected = fairImageInput.files[0];
      fairImageFile = null;
      fairImageStatus.classList.remove('error');
      if (!selected) return;
      fairImageStatus.textContent = 'Preparando la imagen…';
      try {
        const prepared = await prepareImage(selected);
        if (!fairImageInput.isConnected) return;
        fairImageFile = prepared;
        fairImagePreview.innerHTML = `<img src="${URL.createObjectURL(prepared)}" alt="Vista previa de la imagen de la feria" style="max-width:240px;max-height:160px;border-radius:8px">`;
        fairImageStatus.textContent = 'Imagen lista. Se subirá al guardar la feria.';
      } catch (err) {
        if (!fairImageInput.isConnected) return;
        fairImageInput.value = '';
        fairImageStatus.textContent = err.message || 'No pudimos preparar la imagen.';
        fairImageStatus.classList.add('error');
      }
    });

    container.querySelector('#fair-form').addEventListener('submit', async e => {
      e.preventDefault();
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      try {
        let imageUrl = container.querySelector('#fair-image').value;
        if (fairImageFile) {
          fairImageStatus.textContent = 'Subiendo la imagen…';
          imageUrl = await db.uploadFairImage(fairImageFile);
        }
        await db.saveFair({
          id: f?.id || null,
          name: container.querySelector('#fair-name').value,
          description: container.querySelector('#fair-desc').value,
          imageUrl,
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