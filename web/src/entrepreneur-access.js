import { publicShell, shopLogo, wireShopImages, escapeHtml as escape } from './public-shops.js';

function messageFor(error) {
  if (error.code === 'account_inactive') return 'Tu cuenta está desactivada o no tiene acceso. Consulta al administrador de ConectaSur.';
  if (error.code === 'shop_not_assigned') return 'Tu cuenta aún no tiene una tienda disponible. Pide al administrador que revise la asignación.';
  if (error.code === 'entrepreneur_required') return 'Para entrar a Mi tienda necesitas una cuenta de emprendedora. Las cuentas administradoras ingresan desde Administración.';
  if (['invalid_credentials', 'invalid_grant', 'user_not_found'].includes(error.code) || error.status === 400) return 'El correo o la contraseña no coinciden. Revísalos y vuelve a intentarlo.';
  return 'No pudimos comprobar el acceso. Revisa tu conexión y vuelve a intentarlo.';
}

// Una instancia por ruta: al salir se cancelan los observadores y se ignoran respuestas tardías.
export function showEntrepreneurAccess(app, db, isCurrent = () => true) {
  let stopped = false;
  let mode = 'loading';
  let busy = false;
  let checking = false;
  const events = new AbortController();
  const alive = () => !stopped && isCurrent();
  document.title = 'Mi tienda | ConectaSur';

  function loading(text = 'Comprobando tu sesión…') {
    app.innerHTML = publicShell(`<section class="owner-state"><p class="public-eyebrow">Mi tienda</p><p role="status">${escape(text)}</p></section>`);
  }

  function login(message = '', error = false) {
    if (!alive()) return;
    mode = 'login';
    busy = false;
    app.innerHTML = publicShell(`<section class="owner-access" aria-labelledby="owner-title">
      <div class="owner-intro"><p class="public-eyebrow">Tu emprendimiento, más cerca</p><h1 id="owner-title" tabindex="-1">Entra a tu tienda.</h1>
        <p>Revisa cómo se ve tu emprendimiento y encuentra todos sus datos en un solo lugar.</p>
      </div>
      <div class="owner-login-card"><h2>Ingresar a Mi tienda</h2><p>Escribe los datos de tu cuenta.</p>
        <form id="owner-login-form">
          <label for="owner-email">Correo electrónico</label><input id="owner-email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="tu.correo@ejemplo.cl">
          <label for="owner-password">Contraseña</label><input id="owner-password" type="password" autocomplete="current-password" required aria-describedby="owner-password-help">
          <label class="owner-show-password"><input id="owner-show-password" type="checkbox">Mostrar contraseña</label>
          <p id="owner-password-help" class="owner-hint">Escribe tu contraseña tal como te la entregaron.</p>
          <p id="owner-access-status" class="owner-status${error ? ' owner-error' : ''}" role="${error ? 'alert' : 'status'}">${escape(message)}</p>
          <button class="public-primary" type="submit">Entrar a Mi tienda <span aria-hidden="true">→</span></button>
        </form>
      </div>
      <aside class="owner-help"><h2>¿Es tu primera vez?</h2><p>Usa el correo y la contraseña que te entregó el administrador de ConectaSur.</p><p>Puedes seguir conociendo las tiendas sin ingresar.</p><a class="public-text-link" href="#inicio">Ver las tiendas <span aria-hidden="true">→</span></a></aside>
    </section>`);
    app.querySelector('#owner-title').focus({ preventScroll: true });
    const form = app.querySelector('#owner-login-form');
    const password = form.querySelector('#owner-password');
    const reveal = form.querySelector('#owner-show-password');
    reveal.addEventListener('change', () => { password.type = reveal.checked ? 'text' : 'password'; });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const button = form.querySelector('button');
      const status = form.querySelector('#owner-access-status');
      const email = form.querySelector('#owner-email');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.setAttribute('role', 'status');
      status.className = 'owner-status';
      status.textContent = 'Comprobando tu cuenta…';
      try {
        const user = await db.login(email.value.trim(), password.value);
        if (!alive()) return;
        password.value = '';
        password.type = 'password';
        reveal.checked = false;
        if (user.role !== 'emprendedora') {
          await db.logout();
          throw { code: 'entrepreneur_required' };
        }
        await loadHome();
      } catch (error) {
        if (!alive() || !form.isConnected) return;
        status.textContent = messageFor(error);
        status.className = 'owner-status owner-error';
        status.setAttribute('role', 'alert');
        password.value = '';
        password.type = 'password';
        reveal.checked = false;
        password.focus();
      } finally {
        busy = false;
        if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
      }
    });
  }

  function state(message, retry, label = 'Intentar nuevamente') {
    if (!alive()) return;
    mode = 'state';
    app.innerHTML = publicShell(`<section class="owner-state"><p class="public-eyebrow">Mi tienda</p><h1 tabindex="-1">Revisemos tu acceso</h1><p role="alert">${escape(message)}</p>
      <button class="public-primary" id="owner-retry">${escape(label)}</button><a class="public-text-link" href="#inicio">Volver a las tiendas</a></section>`);
    app.querySelector('h1').focus({ preventScroll: true });
    app.querySelector('#owner-retry').addEventListener('click', retry);
  }

  async function logout() {
    if (busy || !alive()) return;
    busy = true;
    mode = 'loading';
    loading('Cerrando tu sesión…');
    try {
      await db.logout();
      login('Cerraste tu sesión. Puedes volver a ingresar cuando quieras.');
    } catch {
      state('No pudimos cerrar tu sesión. Revisa tu conexión y vuelve a intentarlo.', logout, 'Volver a cerrar sesión');
    } finally { busy = false; }
  }

  function home({ user, shop }) {
    if (!alive()) return;
    mode = 'home';
    app.innerHTML = publicShell(`<section class="owner-home" aria-labelledby="owner-home-title">
      <div class="owner-topbar"><a class="public-back" href="#inicio">← Volver a las tiendas</a><button id="owner-logout" class="owner-secondary">Cerrar sesión</button></div>
      <div class="owner-welcome"><div><p class="public-eyebrow">Mi espacio en ConectaSur</p><h1 id="owner-home-title" tabindex="-1">Esta es tu tienda.</h1><p>Consulta tus datos y revisa cómo te encuentra tu comunidad.</p></div><span class="owner-session-state">Sesión iniciada</span></div>
      <div class="owner-summary">
        <div class="owner-shop-heading">${shopLogo(shop, true)}<div><h2>${escape(shop.name)}</h2><p class="public-category">${escape(shop.entrepreneurType || 'Tipo por informar')}</p><p class="public-sector">${escape(shop.sector || 'Sector por informar')}</p></div></div>
        <div class="owner-details"><section aria-labelledby="owner-about-title"><h3 id="owner-about-title">Acerca de tu tienda</h3><p class="public-description">${escape(shop.description || 'Tu tienda aún no tiene una descripción.')}</p></section><section aria-labelledby="owner-contact-title"><h3 id="owner-contact-title">Datos de contacto</h3><p class="public-description">${escape(shop.contact || 'Tu tienda aún no tiene datos de contacto.')}</p></section></div>
        <div class="owner-actions"><a class="public-primary" href="#tienda/${escape(encodeURIComponent(shop.id))}">Ver mi ficha pública <span aria-hidden="true">↗</span></a><button class="owner-secondary" id="owner-refresh">Actualizar información</button></div>
      </div>
      <div class="owner-bottom"><section class="owner-update-help"><h2>¿Quieres cambiar algún dato?</h2><p>Para cambiar el logo, la descripción o el contacto, abre <strong>Mi tienda</strong> en la aplicación Android. Al guardar, tus cambios también se verán aquí.</p></section><section class="owner-account"><h2>Tu cuenta</h2><p>Ingresaste con</p><p class="owner-account-email">${escape(user.email)}</p><p>Si compartes este equipo, cierra tu sesión al terminar.</p></section></div>
    </section>`);
    wireShopImages(app);
    app.querySelector('#owner-home-title').focus({ preventScroll: true });
    app.querySelector('#owner-logout').addEventListener('click', logout);
    app.querySelector('#owner-refresh').addEventListener('click', () => loadHome());
  }

  async function loadHome() {
    if (!alive() || checking) return;
    checking = true;
    mode = 'loading';
    loading('Buscando tu tienda…');
    try {
      const data = await db.entrepreneurHome();
      home(data);
    } catch (error) {
      if (!alive()) return;
      if (error.code === 'account_inactive') {
        await db.logout().catch(() => {});
        login(messageFor(error), true);
      } else if (error.status === 401 || ['session_not_found', 'session_expired', 'bad_jwt', 'refresh_token_not_found'].includes(error.code)) {
        await db.logout().catch(() => {});
        login('Tu sesión terminó. Vuelve a ingresar para abrir tu tienda.', true);
      } else if (error.code === 'shop_not_assigned') {
        state(messageFor(error), logout, 'Cerrar sesión');
      } else if (error.code === 'entrepreneur_required') {
        state(messageFor(error), logout, 'Cambiar de cuenta');
      } else {
        state(messageFor(error), loadHome);
      }
    } finally { checking = false; }
  }

  async function start() {
    loading();
    try {
      const user = await db.currentSession();
      if (!alive()) return;
      if (!user) login();
      else if (user.role !== 'emprendedora') login(messageFor({ code: 'entrepreneur_required' }), true);
      else await loadHome();
    } catch (error) {
      if (!alive()) return;
      if (error.code === 'account_inactive') login(messageFor(error), true);
      else state(messageFor(error), start);
    }
  }

  const recheck = () => { if (mode === 'home' && document.visibilityState === 'visible') loadHome(); };
  window.addEventListener('focus', recheck, { signal: events.signal });
  document.addEventListener('visibilitychange', recheck, { signal: events.signal });
  start();
  return () => { stopped = true; events.abort(); };
}
