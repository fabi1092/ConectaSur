// W27: correos aceptados y recuperación real con enlace pegado; fixtures propios.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.RECOVERY_URL || 'http://127.0.0.1:5174/';
const c = settings(), config = { url: c.url, anonKey: c.anonKey };
const admin = createDataLayer(config), fixtures = [], clients = [], secrets = [];
const output = new URL('./reports/password-recovery/', import.meta.url);
mkdirSync(output, { recursive: true });
let browser;
const checks = [], errors = [];
const password = randomBytes(24).toString('base64url'), nextPassword = randomBytes(24).toString('base64url');
secrets.push(password, nextPassword);
const account = (name, type = 'buyer') => ({ name, type, email: `recover_${randomUUID()}@example.com`, password });
const owner = account('Emprendedora recuperación', 'owner'), buyer = account('Compradora recuperación'), peer = account('Otra compradora'), direct = account('Enlace directo');
async function login(page, a, secret = password) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill(a.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}
async function linkFor(a) {
  const [row] = await query('select recovery_token from auth.users where email=' + literal(a.email));
  assert.ok(row?.recovery_token, 'El servidor no creó el desafío de recuperación');
  secrets.push(row.recovery_token);
  const link = new URL('/auth/v1/verify', c.url);
  link.searchParams.set('token', row.recovery_token); link.searchParams.set('type', 'recovery');
  link.searchParams.set('redirect_to', 'https://conectasur-dev.web.app/?recuperar=1');
  return link.href;
}
try {
  await admin.login(c.accounts.admin.email, c.accounts.admin.password);
  owner.fixture = await admin.createEmprendedora({ email: owner.email, password, displayName: owner.name, shopName: 'Tienda recuperación (prueba)' });
  fixtures.push(owner);
  for (const a of [buyer, peer, direct]) {
    const api = createDataLayer(config); clients.push(api);
    a.fixture = (await api.registerBuyer({ email: a.email, password, displayName: a.name })).user;
    fixtures.push(a);
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-CL' });
  await context.addInitScript(() => {
    window.recoverySpoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'es-CL', localService: true }], cancel() {}, pause() {}, resume() {},
      speak(u) { window.recoverySpoken.push(u.text); u.onend?.(); }
    } });
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('#ingresar', base).href);
  await page.getByRole('link', { name: 'Olvidé mi contraseña', exact: true }).click();
  await page.getByRole('heading', { name: 'Recupera tu acceso.', exact: true }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('correo-escritorio.png', output)), fullPage: true });
  checks.push('Olvidé mi contraseña abre la recuperación desde el ingreso común');
  await page.route('**/auth/v1/recover?*', route => route.fulfill({ status: 503, json: { message: 'Fallo temporal simulado' } }));
  await page.getByLabel('Correo electrónico', { exact: true }).fill(owner.email);
  await page.getByRole('button', { name: 'Enviar enlace al correo', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Revisa tu conexión' }).waitFor();
  assert.equal(await page.locator('#recovery-email').inputValue(), owner.email);
  assert.equal(await page.locator('#recovery-link-form').count(), 0);
  await page.unroute('**/auth/v1/recover?*');
  checks.push('Error de envío conserva el correo y no afirma que se envió el mensaje');

  for (const a of [owner, buyer]) {
    if (a === buyer) {
      await page.goto(new URL('#ingresar', base).href);
      await login(page, peer);
      await page.getByRole('heading', { name: `Hola, ${peer.name}.`, exact: true }).waitFor();
      await page.goto(new URL('#recuperar', base).href);
    }
    await page.getByLabel('Correo electrónico', { exact: true }).fill(a.email);
    await page.getByRole('button', { name: 'Enviar enlace al correo', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Si el correo corresponde' }).waitFor();
    const link = await linkFor(a);
    checks.push(`Servidor acepta el correo y genera el desafío de ${a.type === 'owner' ? 'emprendedora' : 'comprador'}; mensaje sin revelar existencia de cuenta`);
    if (a === owner) {
      await page.getByLabel('Enlace del correo', { exact: true }).fill('https://intruso.example/auth/v1/verify?type=recovery&token=' + 'a'.repeat(64));
      await page.getByRole('button', { name: 'Comprobar enlace', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'El enlace no es válido' }).waitFor();
      assert.equal(await page.locator('#recovery-password-form').count(), 0);
      const bad = new URL(link); bad.searchParams.set('token', 'b'.repeat(64));
      await page.getByLabel('Enlace del correo', { exact: true }).fill(bad.href);
      await page.getByRole('button', { name: 'Comprobar enlace', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'El enlace no es válido' }).waitFor();
      checks.push('Enlace ajeno e inválido son rechazados antes de permitir una nueva contraseña');
    }
    const legacyLink = new URL(link); legacyLink.hostname = 'surcode.supabase.codepulse.cl';
    const pasted = a === buyer ? 'https://nam02.safelinks.protection.outlook.com/?url=' + encodeURIComponent(legacyLink.href) : link;
    await page.getByLabel('Enlace del correo', { exact: true }).fill(pasted);
    await page.getByRole('button', { name: 'Comprobar enlace', exact: true }).click();
    await page.getByRole('heading', { name: 'Elige tu nueva contraseña', exact: true }).waitFor();
    assert.equal(await page.locator('.recovery-account').textContent(), a.email);
    assert.equal(await page.locator('#recovery-link').count(), 0);
    const again = admin.passwordRecovery();
    await assert.rejects(again.verify(link, new URL(base).origin)); await again.dispose();
    checks.push('El enlace se valida con Auth real y se consume una sola vez' + (a === buyer ? ', incluso con el alias antiguo envuelto por Outlook' : ''));
    await page.getByLabel('Nueva contraseña', { exact: true }).fill(nextPassword);
    await page.getByLabel('Repite la nueva contraseña', { exact: true }).fill('otra-clave-distinta');
    await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click();
    assert.match(await page.locator('#recovery-repeat').evaluate(x => x.validationMessage), /iguales/);
    await page.getByLabel('Repite la nueva contraseña', { exact: true }).fill(nextPassword);
    await page.getByLabel('Mostrar contraseñas', { exact: true }).check();
    assert.equal(await page.locator('#recovery-password').getAttribute('type'), 'text');
    await page.getByRole('button', { name: 'Escuchar esta pantalla', exact: true }).click();
    const spoken = await page.evaluate(() => window.recoverySpoken.join(' '));
    assert.ok(!spoken.includes(nextPassword) && !spoken.includes(new URL(link).searchParams.get('token')));
    await page.getByLabel('Mostrar contraseñas', { exact: true }).uncheck();
    checks.push('Repetición, mostrar/ocultar y lectura guiada no revelan contraseña ni enlace');
    await page.locator('.recovery-account').evaluate(x => { x.textContent = 'cuenta-ficticia@ejemplo.cl'; });
    if (a === buyer) await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: fileURLToPath(new URL(a === buyer ? 'nueva-celular.png' : 'nueva-escritorio.png', output)), fullPage: true });
    if (a === buyer) {
      await page.setViewportSize({ width: 320, height: 740 });
      await page.locator('#access-size').selectOption('largest');
      await page.getByRole('button', { name: 'Más contraste', exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: fileURLToPath(new URL('nueva-accesible.png', output)), fullPage: true });
      await page.locator('#access-size').selectOption('normal');
      await page.getByRole('button', { name: 'Más contraste', exact: true }).click();
      checks.push('Formulario sin desborde a 320 px con letras grandes y alto contraste');
    }
    if (a === owner) {
      await page.route('**/auth/v1/user', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { message: 'Fallo temporal simulado' } }) : route.continue());
      await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Revisa tu conexión' }).waitFor();
      assert.equal(await page.locator('#recovery-password').inputValue(), nextPassword);
      await page.unroute('**/auth/v1/user');
      checks.push('Error de cambio conserva el formulario y permite reintentar sin afirmar éxito');
    }
    await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click();
    await page.getByRole('heading', { name: 'Tu contraseña está actualizada', exact: true }).waitFor();
    const check = createDataLayer(config); clients.push(check);
    await assert.rejects(check.login(a.email, password));
    assert.equal((await check.login(a.email, nextPassword)).role, a.type === 'owner' ? 'emprendedora' : 'comprador');
    checks.push(`Nueva contraseña ingresa como ${a.type}; la anterior se rechaza y se conserva el rol`);
    const saved = await page.evaluate(() => [...Object.values(localStorage), ...Object.values(sessionStorage)]);
    assert.ok(!saved.some(v => v.includes(nextPassword) || v.includes(new URL(link).searchParams.get('token'))));
    if (a === buyer) {
      const own = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.endsWith('-auth-token'))?.[1] || 'null')?.user.id);
      assert.equal(own, peer.fixture.uid);
      checks.push('Recuperación aislada no reemplaza ni cierra la cuenta distinta que estaba abierta');
    }
    await page.getByRole('button', { name: 'Ingresar con la nueva contraseña', exact: true }).click();
    await login(page, a, nextPassword);
    await page.getByRole('heading', { name: a === owner ? 'Esta es tu tienda.' : `Hola, ${a.name}.`, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  }

  // Compatibilidad con retorno directo: el servidor real aún redirige al dominio antiguo.
  // Se adapta únicamente el destino del navegador para probar captura/limpieza del fragmento.
  const request = admin.passwordRecovery(); await request.request(direct.email, 'https://conectasur-dev.web.app'); await request.dispose();
  const link = await linkFor(direct);
  const response = await fetch(link, { redirect: 'manual', headers: { apikey: c.anonKey, 'User-Agent': 'ConectaSur-recovery-check' } });
  const landing = new URL(response.headers.get('location'));
  const callback = new URL(base); callback.searchParams.set('recuperar', '1'); callback.hash = landing.hash;
  for (const value of new URLSearchParams(landing.hash.slice(1)).values()) if (value.length > 20) secrets.push(value);
  await page.goto(callback.href);
  await page.getByRole('heading', { name: 'Elige tu nueva contraseña', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#recuperar'); assert.equal(new URL(page.url()).search, '');
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.includes('recovery-'))), false);
  checks.push('Retorno directo preparado limpia tokens de la URL y usa sesión aislada (destino de prueba adaptado)');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('#ingresar', base).href);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  await page.goto(new URL('#recuperar', base).href);
  await page.getByRole('button', { name: 'Ya tengo el enlace', exact: true }).click();
  await page.locator('.recovery-copy-help').getByText('Ver instrucciones para mi equipo').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL('enlace-celular.png', output)), fullPage: true });
  checks.push('Instrucciones para copiar y pegar el enlace disponibles en celular y computador');
  assert.deepEqual(errors, []); checks.push('Sin errores JavaScript durante la recuperación');
  writeFileSync(new URL('verification.json', output), JSON.stringify({ checkedAt: new Date().toISOString(), url: base, passed: checks.length, checks,
    emailRouting: { directRedirectReady: landing.origin === 'https://conectasur-dev.web.app', observedOrigin: landing.origin, workingAlternative: 'Copiar el enlace del botón del correo y pegarlo en ConectaSur' },
    limits: ['Aceptación de envío y desafío verificados en servidor; no se comprobó entrega en un buzón real', 'Token obtenido mediante SQL solo para cuentas ficticias propias, simulando copiar el enlace recibido; nunca disponible para clientes de producción', '503 y voz simulados; demás verificaciones y cambios de contraseña contra Supabase real', 'Celular emulado, sin teléfono físico; la contraseña nueva también sirve para el mismo Auth utilizado por Android'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, checks, directRedirectReady: landing.origin === 'https://conectasur-dev.web.app' }));
} catch (error) {
  let safe = error.stack || error.message;
  for (const secret of secrets) safe = safe.replaceAll(secret, '[oculto]');
  console.error(safe); process.exitCode = 1;
} finally {
  await browser?.close();
  for (const a of fixtures) {
    if (a.type === 'owner') await query(`begin; delete from public.shop_associations where shop_id=${literal(a.fixture.shopId)};
      update public.profiles set role='comprador',shop_id=null where id=${literal(a.fixture.uid)};
      delete from public.shops where id=${literal(a.fixture.shopId)}; delete from auth.users where id=${literal(a.fixture.uid)}; commit;`);
    else await query('delete from auth.users where email=' + literal(a.email));
  }
  for (const api of [admin, ...clients]) { await api.logout().catch(() => {}); await api.dispose(); }
}
