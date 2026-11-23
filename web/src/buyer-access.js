import { publicShell, escapeHtml as escape } from './public-shops.js';
import { icon, communityPhoto } from './visuals.js';
import { enableWebNotifications, disableWebNotifications } from './buyer-engagement.js';

function registrationMessage(error) {
  if (error.code === 'google_not_configured') return 'El acceso con Google todavía no está disponible. Puedes crear tu cuenta con correo o intentarlo más tarde.';
  if (error.code === 'google_not_available') return 'No pudimos conectar con Google. Revisa tu conexión y vuelve a intentarlo.';
  if (error.code === 'google_cancelled') return 'Cancelaste el acceso con Google. Puedes intentarlo nuevamente o ingresar con tu correo.';
  if (error.code === 'google_storage_unavailable') return 'Permite el almacenamiento del sitio en tu navegador para continuar con Google.';
  if (error.code === 'google_callback_failed' || error.code === 'google_invalid_redirect') return 'No pudimos comprobar el regreso de Google. Vuelve a pulsar Continuar con Google.';
  if (error.code === 'session_exists') return 'Ya hay una sesión abierta. Vuelve a Mi cuenta para continuar.';
  if (error.code === 'weak_password') return 'Elige una contraseña más segura, con al menos 8 caracteres. Puedes combinar varias palabras.';
  if (error.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(error.code)) return 'Se hicieron varios intentos seguidos. Espera unos minutos antes de volver a intentarlo.';
  if (error.code === 'invalid_registration' || error.code === 'email_address_invalid') return 'Revisa tu nombre, correo y contraseña antes de continuar.';
  if (error.status >= 400 && error.status < 500) return 'No pudimos crear la cuenta con esos datos. Revisa lo escrito. Si ya tienes una cuenta, vuelve a Iniciar sesión.';
  return 'No pudimos confirmar el registro. Revisa tu conexión. Si la cuenta se alcanzó a crear, puedes volver a Iniciar sesión con los mismos datos.';
}

export function showBuyerRegistration(app, db, { isCurrent, onSignedIn, onLogin }) {
  let stopped = false, busy = false;
  const alive = () => !stopped && isCurrent();
  document.title = 'Crear cuenta | ConectaSur';
  app.innerHTML = publicShell(`<section class="owner-access" aria-labelledby="buyer-register-title">
    <div class="owner-intro"><p class="public-eyebrow">Descubre lo que nace cerca</p><h1 id="buyer-register-title" tabindex="-1">Crea tu cuenta.</h1><p>Un espacio para conocer los productos y emprendimientos de nuestra comunidad.</p>${communityPhoto()}</div>
    <div class="owner-login-card"><h2>Cuenta de comprador</h2><p>Completa estos datos o continúa con tu cuenta de Google.</p>
      <button id="buyer-google-login" type="button" class="google-button owner-secondary google-access"><span class="google-symbol" aria-hidden="true">G</span>Continuar con Google</button>
      <p class="auth-divider">O regístrate con tu correo</p>
      <form id="buyer-register-form">
        <label for="buyer-name">Tu nombre</label><input id="buyer-name" autocomplete="name" maxlength="120" required>
        <label for="buyer-email">Correo electrónico</label><input id="buyer-email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="tu.correo@ejemplo.cl">
        <label for="buyer-password">Crea una contraseña</label><input id="buyer-password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="buyer-password-help"><p id="buyer-password-help" class="owner-hint">Usa al menos 8 caracteres. Puedes combinar varias palabras que recuerdes.</p>
        <label for="buyer-repeat">Repite tu contraseña</label><input id="buyer-repeat" type="password" autocomplete="new-password" minlength="8" required>
        <label class="owner-show-password"><input id="buyer-reveal" type="checkbox">Mostrar contraseñas</label>
        <p id="buyer-register-status" class="owner-status" role="status"></p>
        <button type="submit" class="public-primary">Crear mi cuenta ${icon('user')}</button>
      </form><a class="owner-auth-link" href="#ingresar">Ya tengo cuenta · Iniciar sesión</a>
    </div>
    <aside class="owner-help"><h2>A tu ritmo</h2><p>Puedes aumentar las letras o escuchar las instrucciones en «A tu manera».</p><p>También puedes conocer los productos sin registrarte.</p><a class="public-text-link" href="#productos">Explorar sin una cuenta →</a><p>¿Tienes un emprendimiento? Pide tu cuenta al administrador de ConectaSur.</p></aside>
  </section>`);
  app.querySelector('h1').focus({ preventScroll: true });
  const form = app.querySelector('#buyer-register-form');
  const password = form.querySelector('#buyer-password');
  const repeat = form.querySelector('#buyer-repeat');
  const reveal = form.querySelector('#buyer-reveal');
  const status = form.querySelector('#buyer-register-status');
  const button = form.querySelector('button[type="submit"]');
  const googleButton = app.querySelector('#buyer-google-login');
  function match() { repeat.setCustomValidity(repeat.value && repeat.value !== password.value ? 'Las contraseñas deben ser iguales.' : ''); }
  password.addEventListener('input', match);
  repeat.addEventListener('input', match);
  reveal.addEventListener('change', () => { password.type = repeat.type = reveal.checked ? 'text' : 'password'; });
  googleButton?.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.disabled = true;
    googleButton.disabled = true;
    googleButton.setAttribute('aria-busy', 'true');
    status.className = 'owner-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Conectando con Google…';
    try {
      const user=await db.loginWithGoogle();
      if(user && typeof user==='object' && alive()){password.value='';repeat.value='';onSignedIn(user);}
    } catch (error) {
      if (!alive() || !googleButton.isConnected) return;
      status.className = 'owner-status owner-error';
      status.setAttribute('role', 'alert');
      status.textContent = registrationMessage(error);
      status.tabIndex = -1;
      status.focus();
    } finally {
      busy = false;
      if (googleButton.isConnected) { googleButton.disabled = false; googleButton.removeAttribute('aria-busy'); }
      if (button.isConnected) button.disabled = false;
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    match();
    if (busy || !form.reportValidity()) return;
    const name = form.querySelector('#buyer-name');
    if (!name.value.trim()) { name.setCustomValidity('Escribe tu nombre.'); name.reportValidity(); name.addEventListener('input', () => name.setCustomValidity(''), { once: true }); return; }
    busy = true;
    googleButton.disabled = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.className = 'owner-status'; status.setAttribute('role', 'status'); status.textContent = 'Creando tu cuenta…';
    try {
      const result = await db.registerBuyer({ displayName: name.value, email: form.querySelector('#buyer-email').value, password: password.value });
      if (!alive()) return;
      password.value = repeat.value = ''; password.type = repeat.type = 'password'; reveal.checked = false;
      if (result.user) await onSignedIn(result.user);
      else onLogin('Revisa tu correo. Si recibes un enlace de confirmación, ábrelo antes de iniciar sesión. Si ya tenías una cuenta, ingresa con tu contraseña.');
    } catch (error) {
      if (!alive()) return;
      status.className = 'owner-status owner-error'; status.setAttribute('role', 'alert'); status.textContent = registrationMessage(error);
      status.tabIndex = -1; status.focus();
    } finally {
      busy = false;
      if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
      if (googleButton.isConnected) googleButton.disabled = false;
    }
  });
  const dispose = () => { stopped = true; password.value = repeat.value = ''; };
  dispose.requestLeave = () => !busy;
  return dispose;
}

export function showBuyerHome(app, user, logout, notice = '', db = null) {
  document.title = 'Mi cuenta | ConectaSur';
  app.innerHTML = publicShell(`<section class="owner-home buyer-home" aria-labelledby="buyer-home-title">
    <div class="owner-topbar"><a class="public-back" href="#tiendas">← Conocer las tiendas</a><button id="buyer-logout" class="owner-secondary">Cerrar sesión</button></div>
    <div class="owner-welcome"><div><p class="public-eyebrow">Mi cuenta en ConectaSur</p><h1 id="buyer-home-title" tabindex="-1">Hola, ${escape(user.displayName || 'te damos la bienvenida')}.</h1><p>Descubre productos y conoce a quienes los crean.</p></div><span class="owner-session-state">Sesión iniciada</span></div>
    ${notice ? `<p class="owner-save-success" role="status">${escape(notice)}</p>` : ''}
    <div class="buyer-discover"><div><p class="public-eyebrow">Hecho cerca de ti</p><h2>Encuentra productos cerca de ti.</h2><p>Explora las creaciones de Puerto Montt y Alerce. En cada ficha puedes conocer el producto y contactar a su emprendedora.</p><div class="owner-actions"><a class="public-primary" href="#productos">${icon('shop')}Explorar productos</a><a class="owner-secondary" href="#tiendas">Conocer las tiendas</a></div></div><div class="buyer-discover-mark" aria-hidden="true">${icon('heart')}</div></div>
    ${db ? `<section class="form-card" style="max-width:none;margin-top:16px;" aria-labelledby="buyer-follows-title">
      <h2 id="buyer-follows-title">Tiendas y asociaciones que sigues</h2>
      <p id="buyer-follows-status" role="status">Cargando seguimientos…</p>
      <div id="buyer-follows-list" style="display:grid;gap:10px;margin-top:8px;"></div>
    </section>
    <section class="form-card" style="max-width:none;margin-top:16px;" aria-labelledby="buyer-notifs-title">
      <h2 id="buyer-notifs-title">Avisos de ferias y notificaciones</h2>
      <p id="buyer-notifs-consent-status" role="status">Comprobando preferencias de avisos…</p>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;">
        <button type="button" id="buyer-notifs-enable" class="public-primary" style="min-height:44px;">Activar avisos en el navegador</button>
        <button type="button" id="buyer-notifs-disable" class="owner-secondary" style="min-height:44px;">Desactivar avisos</button>
        <button type="button" id="buyer-notifs-mark-read" class="owner-secondary" style="min-height:44px;">Marcar como leídos</button>
      </div>
      <div id="buyer-notifs-list" style="display:grid;gap:10px;margin-top:8px;"></div>
    </section>` : ''}
    <section class="owner-account buyer-account"><h2>Tu cuenta de comprador</h2><p>Ingresaste con</p><p class="owner-account-email">${escape(user.email)}</p><p>Puedes volver aquí desde «Mi cuenta» mientras recorres las tiendas. Si compartes este equipo, cierra tu sesión al terminar.</p></section>
  </section>`, { showAccountLink: false, accountLocation: 'Estás en tu cuenta' });
  app.querySelector('h1').focus({ preventScroll: true });
  window.scrollTo(0, 0);
  app.querySelector('#buyer-logout').addEventListener('click', logout);
  if (!db) return;

  const followsStatus = app.querySelector('#buyer-follows-status');
  const followsList = app.querySelector('#buyer-follows-list');
  const consentStatus = app.querySelector('#buyer-notifs-consent-status');
  const notifsList = app.querySelector('#buyer-notifs-list');
  const enableBtn = app.querySelector('#buyer-notifs-enable');
  const disableBtn = app.querySelector('#buyer-notifs-disable');
  const markReadBtn = app.querySelector('#buyer-notifs-mark-read');
  let loadedNotifs = [];

  async function refreshFollows() {
    if (!followsList?.isConnected) return;
    try {
      const items = await db.myFollows();
      if (!followsList.isConnected) return;
      if (!items.length) {
        followsStatus.textContent = 'Aún no sigues ninguna tienda ni asociación.';
        followsList.innerHTML = '';
        return;
      }
      followsStatus.textContent = `Sigues ${items.length} ${items.length === 1 ? 'espacio' : 'espacios'}:`;
      followsList.innerHTML = items.map(item => {
        const href = (item.target_type === 'association' ? '#asociacion/' : '#tienda/') + encodeURIComponent(item.target_id);
        const kindLabel = item.target_type === 'association' ? 'Asociación' : 'Tienda';
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #d3ddd9;border-radius:10px;background:#f9fbfa;flex-wrap:wrap;">
          <div><strong>${escape(item.name || item.target_id)}</strong><br><small>${escape(kindLabel)}</small></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a class="public-text-link" href="${escape(href)}" style="min-height:44px;display:inline-flex;align-items:center;padding:0 8px;">Ver</a>
            <button type="button" class="owner-secondary" style="min-height:44px;" data-unfollow-type="${escape(item.target_type)}" data-unfollow-id="${escape(item.target_id)}" data-unfollow-name="${escape(item.name || item.target_id)}">Dejar de seguir</button>
          </div>
        </div>`;
      }).join('');
    } catch {
      if (followsStatus?.isConnected) followsStatus.textContent = 'No pudimos cargar tus seguimientos.';
    }
  }

  async function refreshNotifs() {
    if (!notifsList?.isConnected) return;
    try {
      const [consented, items] = await Promise.all([
        db.getNotificationConsent().catch(() => false),
        db.myNotifications(20).catch(() => [])
      ]);
      if (!notifsList.isConnected) return;
      loadedNotifs = Array.isArray(items) ? items : [];
      const perm = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
      consentStatus.textContent = consented
        ? (perm === 'granted'
          ? 'Avisos activos con notificación del navegador autorizada.'
          : 'Consentimiento guardado. Tus avisos aparecen aquí cuando una seguida confirma feria.')
        : 'Avisos desactivados. Actívalos con tu permiso para enterarte de nuevas ferias.';
      if (enableBtn) enableBtn.disabled = consented && perm === 'granted';
      if (disableBtn) disableBtn.disabled = !consented;
      if (markReadBtn) markReadBtn.disabled = !loadedNotifs.some(n => !n.read_at);
      if (!loadedNotifs.length) {
        notifsList.innerHTML = '<p>Aún no tienes avisos de tiendas o asociaciones seguidas.</p>';
        return;
      }
      const dateFmt = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
      notifsList.innerHTML = loadedNotifs.map(n => {
        const fairId = n?.data?.fair_id;
        return `<div style="padding:12px;border:1px solid #d3ddd9;border-radius:10px;background:${n.read_at ? '#ffffff' : '#eef6f4'};">
          <strong>${escape(n.title || 'Aviso')}</strong>
          <p style="margin:4px 0;">${escape(n.body || '')}</p>
          <small>${n.created_at ? escape(dateFmt.format(new Date(n.created_at))) : ''}${n.read_at ? ' · Leído' : ' · Nuevo'}</small>
          ${fairId ? `<div style="margin-top:6px;"><a class="public-text-link" href="#feria/${encodeURIComponent(fairId)}">Ver ficha de feria</a></div>` : ''}
        </div>`;
      }).join('');
    } catch {
      if (consentStatus?.isConnected) consentStatus.textContent = 'No pudimos consultar tus avisos.';
    }
  }

  followsList?.addEventListener('click', async event => {
    const btn = event.target.closest('[data-unfollow-id]');
    if (!btn) return;
    btn.disabled = true;
    try {
      await db.unfollowTarget(btn.dataset.unfollowType, btn.dataset.unfollowId);
      followsStatus.textContent = `Dejaste de seguir a ${btn.dataset.unfollowName}.`;
      await refreshFollows();
    } catch {
      followsStatus.textContent = 'No pudimos actualizar el seguimiento.';
      btn.disabled = false;
    }
  });

  enableBtn?.addEventListener('click', async () => {
    enableBtn.disabled = true;
    try {
      await enableWebNotifications(db);
      await refreshNotifs();
    } finally {
      if (enableBtn.isConnected) enableBtn.disabled = false;
    }
  });

  disableBtn?.addEventListener('click', async () => {
    disableBtn.disabled = true;
    try {
      await disableWebNotifications(db);
      await refreshNotifs();
    } finally {
      if (disableBtn.isConnected) disableBtn.disabled = false;
    }
  });

  markReadBtn?.addEventListener('click', async () => {
    const unreadIds = loadedNotifs.filter(n => !n.read_at && n.id).map(n => n.id);
    if (!unreadIds.length) return;
    markReadBtn.disabled = true;
    try {
      await db.markNotificationsRead(unreadIds);
      await refreshNotifs();
    } finally {
      if (markReadBtn.isConnected) markReadBtn.disabled = false;
    }
  });

  refreshFollows();
  refreshNotifs();
}
