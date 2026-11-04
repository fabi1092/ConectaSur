import { publicShell, shopLogo, wireShopImages, escapeHtml as escape } from './public-shops.js';
import { showShopEditor } from './shop-editor.js';
import { showOwnerCatalog } from './owner-catalog.js';
import { showOwnerSales } from './owner-sales.js';
import { setAccountNavigation } from './account-navigation.js';
import { dashboardMetrics, dashboardPanels, loadDashboard } from './owner-dashboard.js';
import { icon, communityPhoto } from './visuals.js';
import { showBuyerRegistration, showBuyerHome } from './buyer-access.js';

function messageFor(error) {
  if (error.code === 'google_not_configured') return 'El acceso con Google todavía no está disponible. Puedes ingresar con correo o intentarlo más tarde.';
  if (error.code === 'google_not_available') return 'No pudimos conectar con Google. Revisa tu conexión y vuelve a intentarlo.';
  if (error.code === 'google_cancelled') return 'Cancelaste el acceso con Google. Puedes intentarlo nuevamente o ingresar con tu correo.';
  if (error.code === 'google_storage_unavailable') return 'Permite el almacenamiento del sitio en tu navegador para continuar con Google.';
  if (error.code === 'google_callback_failed' || error.code === 'google_invalid_redirect') return 'No pudimos comprobar el regreso de Google. Vuelve a pulsar Continuar con Google.';
  if (error.code === 'session_exists') return 'Ya hay una sesión iniciada en este navegador.';
  if (error.code === 'account_inactive') return 'Tu cuenta está desactivada o no tiene acceso. Consulta al administrador de ConectaSur.';
  if (error.code === 'shop_not_assigned') return 'Tu cuenta aún no tiene una tienda disponible. Pide al administrador que revise la asignación.';
  if (error.code === 'entrepreneur_required') return 'Esta cuenta no tiene acceso a una tienda ni a la administración. Puedes seguir conociendo las tiendas sin ingresar.';
  if (['invalid_credentials', 'invalid_grant', 'user_not_found'].includes(error.code) || error.status === 400) return 'El correo o la contraseña no coinciden. Revísalos y vuelve a intentarlo.';
  return 'No pudimos comprobar el acceso. Revisa tu conexión y vuelve a intentarlo.';
}

// Una instancia por ruta: al salir se cancelan los observadores y se ignoran respuestas tardías.
export function showAccountAccess(app, db, isCurrent = () => true, showAdmin) {
  let stopped = false;
  let mode = 'loading';
  let busy = false;
  let checking = false;
  let editor = null;
  let dashboardVersion = 0;
  let homeIdentity = null;
  let accountUid = null;
  const events = new AbortController();
  const alive = () => !stopped && isCurrent();
  document.title = 'Ingresar | ConectaSur';

  function loading(text = 'Comprobando tu sesión…') {
    app.innerHTML = publicShell(`<section class="owner-state"><p class="public-eyebrow">Tu cuenta en ConectaSur</p><p role="status">${escape(text)}</p></section>`);
  }

  function login(message = '', error = false) {
    if (!alive()) return;
    mode = 'login';
    busy = false;
    document.title = 'Ingresar | ConectaSur';
    app.innerHTML = publicShell(`<section class="owner-access" aria-labelledby="owner-title">
      <div class="owner-intro"><p class="public-eyebrow">Tu espacio en ConectaSur</p><h1 id="owner-title" tabindex="-1">Ingresa a tu cuenta.</h1>
        <p>Usa tu correo y contraseña o continúa con tu cuenta de Google si eres comprador.</p>
        ${communityPhoto()}
      </div>
      <div class="owner-login-card"><h2>Iniciar sesión</h2><p>Escribe los datos de tu cuenta.</p>
        <form id="owner-login-form">
          <label for="owner-email">Correo electrónico</label><input id="owner-email" type="email" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254" required placeholder="tu.correo@ejemplo.cl">
          <label for="owner-password">Contraseña</label><input id="owner-password" type="password" autocomplete="current-password" required aria-describedby="owner-password-help">
          <label class="owner-show-password"><input id="owner-show-password" type="checkbox">Mostrar contraseña</label>
          <p id="owner-password-help" class="owner-hint">Escribe la contraseña de tu cuenta.</p>
          <p id="owner-access-status" class="owner-status${error ? ' owner-error' : ''}" role="${error ? 'alert' : 'status'}">${escape(message)}</p>
          <button class="public-primary" type="submit">Iniciar sesión <span aria-hidden="true">→</span></button>
        </form>
        <p class="auth-divider">O usa tu cuenta de Google</p>
        <button id="google-login" class="google-button owner-secondary google-access" type="button"><span class="google-symbol" aria-hidden="true">G</span>Continuar con Google</button>
        <a class="owner-auth-link" href="#recuperar">Olvidé mi contraseña</a>
      </div>
      <aside class="owner-help"><h2>¿Es tu primera vez?</h2><p>Puedes ingresar como comprador con tu cuenta de Google o crear una cuenta con tu correo.</p><a class="owner-secondary" href="#registro">Crear cuenta de comprador</a><p>Si te entregaron una cuenta de emprendedora o administrador, usa sus datos para ingresar.</p><p>Puedes seguir conociendo las tiendas sin ingresar.</p><a class="public-text-link" href="#inicio">Ver las tiendas <span aria-hidden="true">→</span></a></aside>
    </section>`);
    app.querySelector('#owner-title').focus({ preventScroll: true });
    const form = app.querySelector('#owner-login-form');
    const password = form.querySelector('#owner-password');
    const reveal = form.querySelector('#owner-show-password');
    const googleButton = app.querySelector('#google-login');
    reveal.addEventListener('change', () => { password.type = reveal.checked ? 'text' : 'password'; });
    googleButton?.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const status = form.querySelector('#owner-access-status');
      googleButton.disabled = true;
      form.querySelector('button[type="submit"]').disabled = true;
      googleButton.setAttribute('aria-busy', 'true');
      status.setAttribute('role', 'status');
      status.className = 'owner-status';
      status.textContent = 'Conectando con Google…';
      try {
        await db.loginWithGoogle();
      } catch (error) {
        if (!alive() || !googleButton.isConnected) return;
        status.textContent = messageFor(error);
        status.className = 'owner-status owner-error';
        status.setAttribute('role', 'alert');
      } finally {
        busy = false;
        if (googleButton.isConnected) { googleButton.disabled = false; googleButton.removeAttribute('aria-busy'); }
        if (form.isConnected) form.querySelector('button[type="submit"]').disabled = false;
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      googleButton.disabled = true;
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
        await openAccount(user);
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
        if (googleButton.isConnected) googleButton.disabled = false;
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
      setAccountNavigation(null);
      history.replaceState(null, '', '#ingresar');
      login('Cerraste tu sesión. Puedes volver a ingresar cuando quieras.');
    } catch {
      state('No pudimos cerrar tu sesión. Revisa tu conexión y vuelve a intentarlo.', logout, 'Volver a cerrar sesión');
    } finally { busy = false; }
  }

  function home(data, notice = '') {
    if (!alive()) return;
    const { user, shop } = data;
    const version=++dashboardVersion;
    homeIdentity={uid:user.uid,shopId:shop.id};
    setAccountNavigation(user);
    mode = 'home';
    document.title = 'Mi tienda | ConectaSur';
    app.innerHTML = publicShell(`<section class="owner-home" aria-labelledby="owner-home-title">
      <div class="owner-topbar"><a class="public-back" href="#tiendas">← Volver a las tiendas</a><button id="owner-logout" class="owner-secondary">Cerrar sesión</button></div>
      <div class="owner-welcome"><div><p class="public-eyebrow">Panel de mi tienda</p><h1 id="owner-home-title" tabindex="-1">Esta es tu tienda.</h1><p><strong>${escape(shop.name)}</strong>. Tus productos, ventas y pendientes en un solo lugar.</p></div><span class="owner-session-state">Sesión iniciada</span></div>
      ${notice ? `<p class="owner-save-success" role="status">${escape(notice)}</p>` : ''}
      ${dashboardMetrics()}
      <div class="owner-actions owner-shortcuts"><button class="public-primary" id="owner-products" type="button" aria-label="Mis productos">${icon('yarn')}<span>Mis productos<small>Agrega productos y revisa sus unidades.</small></span></button><button class="owner-secondary" id="owner-sales" type="button" aria-label="Mis ventas">${icon('receipt')}<span>Mis ventas<small>Registra una venta o consulta el historial.</small></span></button><button class="owner-secondary" id="owner-edit" type="button" aria-label="Editar tienda">${icon('shop')}<span>Editar tienda<small>Cambia tus datos y tu logo.</small></span></button></div>
      ${dashboardPanels()}
      <div class="owner-summary">
        <div class="owner-shop-heading">${shopLogo(shop, true)}<div><h2>${escape(shop.name)}</h2><p class="public-category">${escape(shop.entrepreneurType || 'Tipo por informar')}</p><p class="public-sector">${escape(shop.sector || 'Sector por informar')}</p></div></div>
        <div class="owner-details"><section aria-labelledby="owner-about-title"><h3 id="owner-about-title">Acerca de tu tienda</h3><p class="public-description">${escape(shop.description || 'Tu tienda aún no tiene una descripción.')}</p></section><section aria-labelledby="owner-contact-title"><h3 id="owner-contact-title">Datos de contacto</h3><p class="public-description">${escape(shop.contact || 'Tu tienda aún no tiene datos de contacto.')}</p></section></div>
        <div class="owner-actions"><a class="owner-secondary" href="#tienda/${escape(encodeURIComponent(shop.id))}">Ver mi ficha pública <span aria-hidden="true">↗</span></a><button class="owner-secondary" id="owner-refresh">Actualizar información</button></div>
      </div>
      <div class="owner-bottom"><section class="owner-update-help"><h2>Tu tienda, en ambos lugares</h2><p>Los datos y el logo que guardes aquí también se verán en Android y en tu ficha pública. Puedes editar tu tienda desde cualquiera de los dos.</p></section><section class="owner-account"><h2>Tu cuenta</h2><p>Ingresaste con</p><p class="owner-account-email">${escape(user.email)}</p><p>Si compartes este equipo, cierra tu sesión al terminar.</p></section></div>
    </section>`, { showAccountLink: false });
    wireShopImages(app);
    app.querySelector('#owner-home-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
    const root=app.querySelector('.owner-home');
    loadDashboard(root,db,data,()=>alive() && mode==='home' && dashboardVersion===version);
    root.querySelectorAll('[data-dashboard-open]').forEach(button=>button.addEventListener('click',()=>root.querySelector(button.dataset.dashboardOpen==='sales' ? '#owner-sales' : '#owner-products').click()));
    app.querySelector('#owner-logout').addEventListener('click', logout);
    app.querySelector('#owner-refresh').addEventListener('click', () => loadHome());
    app.querySelector('#owner-sales').addEventListener('click',()=>{
      mode='sales';editor=showOwnerSales(app,db,data,{isCurrent:()=>alive() && mode==='sales',onBack:()=>{editor.dispose();editor=null;loadHome();}});
    });
    app.querySelector('#owner-products').addEventListener('click', () => {
      mode = 'products';
      editor = showOwnerCatalog(app, db, data, {
        isCurrent: () => alive() && mode === 'products',
        onBack: () => { editor.dispose(); editor = null; loadHome(); }
      });
    });
    app.querySelector('#owner-edit').addEventListener('click', () => {
      mode = 'edit';
      editor = showShopEditor(app, db, data, {
        isCurrent: () => alive() && mode === 'edit',
        onSaved: updated => { editor.dispose(); editor = null; home(updated, 'Guardamos los cambios de tu tienda. Ya puedes verlos en tu ficha pública.'); },
        onCancel: () => { editor.dispose(); editor = null; loadHome(); }
      });
    });
  }

  async function openAccount(user) {
    if (!alive()) return;
    accountUid = user.uid;
    setAccountNavigation(user);
    if (user.role === 'admin') {
      mode = 'admin';
      busy = false;
      document.title = 'Administración | ConectaSur';
      await showAdmin(user, logout);
    } else if (user.role === 'emprendedora') {
      await loadHome();
    } else if (user.role === 'comprador') {
      mode = 'buyer';
      busy = false;
      showBuyerHome(app, user, logout);
    } else {
      await db.logout();
      login(messageFor({ code: 'entrepreneur_required' }), true);
    }
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
    mode = 'loading';
    loading();
    try {
      const user = await db.currentSession();
      if (!alive()) return;
      if (!user && location.hash === '#registro') {
        mode = 'register';
        editor = showBuyerRegistration(app, db, {
          isCurrent: () => alive() && mode === 'register',
          onSignedIn: async account => {
            editor?.(); editor = null;
            await openAccount(account);
            if (alive() && mode === 'buyer') showBuyerHome(app, account, logout, 'Tu cuenta está creada. Ya puedes explorar nuestra comunidad.');
          },
          onLogin: message => { editor?.(); editor = null; history.replaceState(null, '', '#ingresar'); login(message); }
        });
      } else if (!user) login();
      else await openAccount(user);
    } catch (error) {
      if (!alive()) return;
      if (error.code === 'account_inactive' || error.code?.startsWith('google_') || error.code === 'session_exists') login(messageFor(error), true);
      else state(messageFor(error), start);
    }
  }

  let rechecking=false;
  const recheck = async () => {
    if(!['home','admin','buyer'].includes(mode) || document.visibilityState!=='visible' || checking || rechecking)return;
    rechecking=true;
    try{
      if(mode==='admin' || mode==='buyer'){
        const previous=mode,current=await db.currentSession();
        if(alive() && mode===previous && (!current || current.uid!==accountUid || current.role!==(previous==='admin'?'admin':'comprador')))await start();
        return;
      }
      const current=await db.entrepreneurHome();
      if(alive() && mode==='home' && (current.user.uid!==homeIdentity?.uid || current.shop.id!==homeIdentity?.shopId))await loadHome();
    }catch(error){
      if(alive() && ['admin','buyer'].includes(mode) && (['account_inactive','session_expired','session_not_found','bad_jwt'].includes(error.code) || error.status===401))await start();
      if(alive() && mode==='home' && (['account_inactive','shop_not_assigned','entrepreneur_required','session_expired','session_not_found','bad_jwt'].includes(error.code) || error.status===401))await loadHome();
      // Recuperar el foco no reconstruye la pantalla ni elimina un enlace bajo el clic.
      // Un fallo transitorio conserva la vista; Actualizar información permite reintentar.
    }finally{rechecking=false;}
  };
  window.addEventListener('focus', recheck, { signal: events.signal });
  document.addEventListener('visibilitychange', recheck, { signal: events.signal });
  const privateScreen = () => ['home', 'buyer', 'admin', 'products', 'sales', 'edit'].includes(mode);
  const unsubscribe = db.onSession((user, event) => {
    if (!alive() || !privateScreen()) return;
    if (event !== 'SIGNED_OUT' && user?.id === accountUid) return;
    // Fuera del bloqueo de Auth. Cerrar/cambiar la sesión en otra pestaña retira
    // también esta vista privada, incluidos formularios con cambios pendientes.
    setTimeout(() => {
      if (!alive() || !privateScreen()) return;
      if (typeof editor === 'function') editor(); else editor?.dispose();
      editor = null;
      start();
    }, 0);
  });
  start();
  const dispose = () => { stopped = true; events.abort(); unsubscribe(); if (typeof editor === 'function') editor(); else editor?.dispose(); };
  dispose.canLeave = () => !busy && (editor?.requestLeave() ?? true);
  return dispose;
}
