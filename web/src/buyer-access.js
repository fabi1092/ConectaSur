import { publicShell, escapeHtml as escape } from './public-shops.js';
import { icon } from './visuals.js';

function registrationMessage(error) {
  if (error.code === 'google_not_configured' || error.code === 'google_not_available') return 'El inicio de sesión con Google está listo en la web; falta habilitar Google OAuth en el servidor Supabase.';
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
    <div class="owner-intro"><p class="public-eyebrow">Descubre lo que nace cerca</p><h1 id="buyer-register-title" tabindex="-1">Crea tu cuenta.</h1><p>Un espacio para conocer los productos y emprendimientos de nuestra comunidad.</p></div>
    <div class="owner-login-card"><h2>Cuenta de comprador</h2><p>Completa estos datos o continúa con tu cuenta de Google.</p>
      <button id="buyer-google-login" type="button" class="owner-secondary" style="width:100%;margin-bottom:0.85rem;">Continuar con Google</button>
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
    googleButton.disabled = true;
    googleButton.setAttribute('aria-busy', 'true');
    status.className = 'owner-status';
    status.setAttribute('role', 'status');
    status.textContent = 'Conectando con Google…';
    try {
      await db.loginWithGoogle();
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
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    match();
    if (busy || !form.reportValidity()) return;
    const name = form.querySelector('#buyer-name');
    if (!name.value.trim()) { name.setCustomValidity('Escribe tu nombre.'); name.reportValidity(); name.addEventListener('input', () => name.setCustomValidity(''), { once: true }); return; }
    busy = true;
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
    }
  });
  const dispose = () => { stopped = true; password.value = repeat.value = ''; };
  dispose.requestLeave = () => !busy;
  return dispose;
}

export function showBuyerHome(app, user, logout, notice = '') {
  document.title = 'Mi cuenta | ConectaSur';
  app.innerHTML = publicShell(`<section class="owner-home buyer-home" aria-labelledby="buyer-home-title">
    <div class="owner-topbar"><a class="public-back" href="#tiendas">← Conocer las tiendas</a><button id="buyer-logout" class="owner-secondary">Cerrar sesión</button></div>
    <div class="owner-welcome"><div><p class="public-eyebrow">Mi cuenta en ConectaSur</p><h1 id="buyer-home-title" tabindex="-1">Hola, ${escape(user.displayName || 'te damos la bienvenida')}.</h1><p>Descubre productos y conoce a quienes los crean.</p></div><span class="owner-session-state">Sesión iniciada</span></div>
    ${notice ? `<p class="owner-save-success" role="status">${escape(notice)}</p>` : ''}
    <div class="buyer-discover"><div><p class="public-eyebrow">Hecho cerca de ti</p><h2>Encuentra productos cerca de ti.</h2><p>Explora las creaciones de Puerto Montt y Alerce. En cada ficha puedes conocer el producto y contactar a su emprendedora.</p><div class="owner-actions"><a class="public-primary" href="#productos">${icon('shop')}Explorar productos</a><a class="owner-secondary" href="#tiendas">Conocer las tiendas</a></div></div><div class="buyer-discover-mark" aria-hidden="true">${icon('heart')}</div></div>
    <section class="owner-account buyer-account"><h2>Tu cuenta de comprador</h2><p>Ingresaste con</p><p class="owner-account-email">${escape(user.email)}</p><p>Puedes volver aquí desde «Mi cuenta» mientras recorres las tiendas. Si compartes este equipo, cierra tu sesión al terminar.</p></section>
  </section>`, { showAccountLink: false, accountLocation: 'Estás en tu cuenta' });
  app.querySelector('h1').focus({ preventScroll: true });
  window.scrollTo(0, 0);
  app.querySelector('#buyer-logout').addEventListener('click', logout);
}
