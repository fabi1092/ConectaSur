import { publicShell, escapeHtml as escape } from './public-shops.js';
import { icon } from './visuals.js';

function messageFor(error, stage) {
  if (error.code === 'account_inactive') return 'Esta cuenta está desactivada. Pide ayuda al administrador de ConectaSur.';
  if (error.status === 429 || /rate_limit/.test(error.code || '')) return 'Se hicieron varios intentos. Espera unos minutos antes de volver a intentarlo.';
  if (stage === 'email') return error.status === 400 ? 'Revisa el correo electrónico e inténtalo otra vez.' : 'No pudimos solicitar el enlace. Revisa tu conexión y vuelve a intentarlo.';
  if (error.code === 'weak_password') return 'Usa una contraseña más segura, con al menos 8 caracteres. Puedes combinar varias palabras.';
  if (error.code === 'same_password') return 'Elige una contraseña diferente de la anterior.';
  if (['invalid_recovery_link', 'otp_expired', 'otp_disabled', 'bad_jwt', 'session_not_found', 'session_expired'].includes(error.code) || [400,401,403].includes(error.status)) return 'El enlace no es válido, ya se usó o venció. Copia el enlace completo del mensaje más reciente o pide otro.';
  return 'No pudimos confirmar la operación. Revisa tu conexión y vuelve a intentarlo.' + (stage === 'password' ? ' Si ya cambiaste la contraseña, prueba ingresar con la nueva.' : '');
}

export function showPasswordRecovery(app, db, isCurrent, initialLink = null) {
  let stopped = false, busy = false, stage = 'email', email = '', sentAt = 0;
  let recovery = db.passwordRecovery();
  const alive = () => !stopped && isCurrent();
  const help = `<aside class="owner-help"><h2>¿Cómo copio el enlace?</h2><p>Abre el mensaje de recuperación en tu correo. Copia el enlace del botón «Restablecer contraseña» o «Reset Password» y vuelve a esta página.</p><details class="recovery-copy-help"><summary>Ver instrucciones para mi equipo</summary><p><strong>En celular:</strong> mantén presionado el botón del correo y elige «Copiar enlace».</p><p><strong>En computador:</strong> haz clic derecho sobre el botón del correo y elige «Copiar dirección del enlace».</p><p>Después mantén presionado el campo «Enlace del correo», o haz clic derecho en él, y elige «Pegar».</p></details><p>Usa solo el mensaje más reciente. No compartas ese enlace: permite recuperar tu cuenta.</p></aside>`;
  function shell(content, title, step, guide) {
    document.title = 'Recuperar contraseña | ConectaSur';
    app.innerHTML = publicShell(`<section class="owner-access recovery-access" aria-labelledby="recovery-title" data-voice-guide="${escape(guide)}"><div class="owner-intro"><p class="public-eyebrow">Volvamos a tu cuenta</p><h1 id="recovery-title" tabindex="-1">${escape(title)}</h1><p>Recupera el acceso usando el correo de tu cuenta.</p><ol class="recovery-steps" aria-label="Pasos para recuperar la contraseña">${['Correo','Enlace','Nueva contraseña'].map((text,index)=>`<li${index===step ? ' aria-current="step"' : ''}>${index+1}. ${text}</li>`).join('')}</ol></div><div class="owner-login-card">${content}</div>${step < 2 ? help : '<aside class="owner-help"><h2>Para volver a ingresar</h2><p>Usa el mismo correo de tu cuenta y la nueva contraseña.</p><p>Si usas ConectaSur en Android, la nueva contraseña también sirve allí.</p></aside>'}</section>`);
    app.querySelector('h1').focus({ preventScroll: true });
  }
  function status(message, error = false) {
    const node = app.querySelector('#recovery-status');
    if (!node) return;
    node.className = 'owner-status' + (error ? ' owner-error' : '');
    node.setAttribute('role', error ? 'alert' : 'status');
    node.textContent = message;
    if (error) { node.tabIndex = -1; node.focus(); }
  }
  async function submit(form, progress, action) {
    if (busy) return;
    busy = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    status(progress);
    try { await action(); }
    catch (error) { if (alive() && form.isConnected) status(messageFor(error, stage), true); }
    finally { busy = false; if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); } }
  }
  function emailForm() {
    if (!alive()) return;
    stage = 'email';
    shell(`<h2>Recibe el enlace</h2><p>Escribe el correo con el que ingresas a ConectaSur.</p><form id="recovery-email-form"><label for="recovery-email">Correo electrónico</label><input id="recovery-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required value="${escape(email)}" placeholder="tu.correo@ejemplo.cl"><p id="recovery-status" class="owner-status" role="status"></p><button type="submit" class="public-primary">Enviar enlace al correo ${icon('arrow')}</button></form><button id="recovery-already" class="owner-secondary recovery-full">Ya tengo el enlace</button><a class="owner-auth-link" href="#ingresar">Volver a Iniciar sesión</a>`, 'Recupera tu acceso.', 0, 'Para recuperar tu contraseña, escribe el correo de tu cuenta y pulsa Enviar enlace al correo. Después abre tu correo, copia el enlace del botón del mensaje y vuelve a esta página. Si ya tienes el enlace, pulsa Ya tengo el enlace. No necesitas escribir la contraseña anterior.');
    app.querySelector('#recovery-already').addEventListener('click', () => { if (!busy) linkForm(); });
    const form = app.querySelector('form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (Date.now() - sentAt < 60000) { status('Espera un minuto antes de pedir otro enlace. Puedes revisar el mensaje que ya recibiste.', true); return; }
      email = form.querySelector('input').value.trim();
      submit(form, 'Solicitando el enlace…', async () => {
        await recovery.request(email, window.location.origin);
        sentAt = Date.now();
        if (alive()) linkForm('Si el correo corresponde a una cuenta, recibirás un mensaje para recuperarla. Revisa también la carpeta de correo no deseado.');
      });
    });
  }
  function linkForm(notice = '') {
    if (!alive()) return;
    stage = 'link';
    shell(`<h2>Pega el enlace del mensaje</h2><p>Copia el enlace del botón del correo de recuperación y pégalo aquí. No necesitas abrir ese botón.</p><form id="recovery-link-form"><label for="recovery-link">Enlace del correo</label><input id="recovery-link" type="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" required maxlength="16000" placeholder="Pega aquí el enlace completo"><p id="recovery-status" class="owner-status" role="status">${escape(notice)}</p><button type="submit" class="public-primary">Comprobar enlace ${icon('check')}</button></form><button id="recovery-other-email" class="owner-secondary recovery-full">Pedir otro enlace</button><a class="owner-auth-link" href="#ingresar">Volver a Iniciar sesión</a>`, 'Revisa tu correo.', 1, 'Abre el mensaje de recuperación. En celular, mantén presionado el botón del mensaje y elige Copiar enlace. En computador, haz clic derecho y elige Copiar dirección del enlace. Vuelve aquí, pega el enlace en Enlace del correo y pulsa Comprobar enlace. El enlace no se lee en voz alta.');
    app.querySelector('#recovery-other-email').addEventListener('click', () => { if (!busy) emailForm(); });
    const form = app.querySelector('form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      submit(form, 'Comprobando tu enlace…', async () => {
        const link = form.querySelector('input');
        const user = await recovery.verify(link.value, window.location.origin);
        link.value = '';
        if (alive()) passwordForm(user);
      });
    });
  }
  function passwordForm(user) {
    if (!alive()) return;
    stage = 'password';
    shell(`<h2>Elige tu nueva contraseña</h2><p>Vas a cambiar la contraseña de</p><p class="recovery-account">${escape(user.email)}</p><form id="recovery-password-form"><label for="recovery-password">Nueva contraseña</label><input id="recovery-password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="recovery-password-help"><p id="recovery-password-help" class="owner-hint">Usa al menos 8 caracteres. Puedes combinar varias palabras que recuerdes.</p><label for="recovery-repeat">Repite la nueva contraseña</label><input id="recovery-repeat" type="password" autocomplete="new-password" minlength="8" required><label class="owner-show-password"><input id="recovery-reveal" type="checkbox">Mostrar contraseñas</label><p id="recovery-status" class="owner-status" role="status"></p><button class="public-primary" type="submit">Guardar nueva contraseña ${icon('check')}</button></form><button id="recovery-restart" class="owner-secondary recovery-full">Usar otro enlace</button>`, 'Elige una nueva contraseña.', 2, 'El enlace se comprobó. Revisa que el correo en pantalla sea el tuyo. Escribe una nueva contraseña de al menos ocho caracteres y repítela. Mostrar contraseñas permite revisarlas. Pulsa Guardar nueva contraseña y después ingresa con ella. Las contraseñas no se leen en voz alta.');
    const form = app.querySelector('form'), password = form.querySelector('#recovery-password'), repeat = form.querySelector('#recovery-repeat');
    function match() { repeat.setCustomValidity(repeat.value && repeat.value !== password.value ? 'Las contraseñas deben ser iguales.' : ''); }
    password.addEventListener('input', match); repeat.addEventListener('input', match);
    form.querySelector('#recovery-reveal').addEventListener('change', event => { password.type = repeat.type = event.target.checked ? 'text' : 'password'; });
    app.querySelector('#recovery-restart').addEventListener('click', () => {
      if (busy) return;
      password.value = repeat.value = '';
      void recovery.dispose(); recovery = db.passwordRecovery(); linkForm();
    });
    form.addEventListener('submit', event => {
      event.preventDefault(); match();
      if (!form.reportValidity()) return;
      submit(form, 'Guardando tu nueva contraseña…', async () => {
        await recovery.change(password.value);
        password.value = repeat.value = '';
        if (!alive()) return;
        stage = 'success';
        shell(`<h2>Tu contraseña está actualizada</h2><p role="status">Ya puedes ingresar con tu nueva contraseña.</p><form id="recovery-finish"><p id="recovery-status" class="owner-status" role="status"></p><button class="public-primary recovery-full" type="submit">Ingresar con la nueva contraseña ${icon('arrow')}</button></form>`, 'Recuperaste tu acceso.', 2, 'Tu contraseña está actualizada. Pulsa Ingresar con la nueva contraseña y escribe tu correo y la nueva contraseña.');
        const finish = app.querySelector('#recovery-finish');
        finish.addEventListener('submit', event => {
          event.preventDefault();
          submit(finish, 'Abriendo el ingreso…', async () => { await db.logout(); if (alive()) location.hash = '#ingresar'; });
        });
      });
    });
  }
  if (initialLink) {
    linkForm();
    const form = app.querySelector('form');
    submit(form, 'Comprobando el enlace del correo…', async () => {
      const user = await recovery.verify(initialLink, window.location.origin);
      initialLink = null;
      if (alive()) passwordForm(user);
    });
  } else emailForm();
  const dispose = () => {
    stopped = true;
    app.querySelectorAll('#recovery-password,#recovery-repeat,#recovery-link').forEach(input => { input.value = ''; });
    void recovery.dispose(); initialLink = null;
  };
  dispose.canLeave = () => !busy && (stage !== 'password' || !app.querySelector('#recovery-password')?.value || window.confirm('¿Salir sin guardar la nueva contraseña? Tendrás que pedir otro enlace.'));
  return dispose;
}
