import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename, sep } from 'node:path';
import { createRequire } from 'node:module';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SESSION_ACCESS_URL || 'http://127.0.0.1:5174/';
const c = settings(), backend = { url: c.url, anonKey: c.anonKey };
const admin = createDataLayer(backend), buyer = createDataLayer(backend);
const buyerEmail = `session_buyer_${randomUUID()}@demo.conectasur.cl`;
const ownerEmail = `session_owner_${randomUUID()}@demo.conectasur.cl`;
const password = randomBytes(24).toString('base64url');
const directory = mkdtempSync(join(tmpdir(), 'conectasur-session-'));
const key = `sb-${new URL(c.url).hostname.split('.')[0]}-auth-token`;
const checks = [], errors = [];
let fixture, context, page;
async function reopen(route = '#ingresar') {
  await context?.close();
  context = await chromium.launchPersistentContext(directory, { headless: true, viewport: { width: 1280, height: 960 }, locale: 'es-CL' });
  page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL(route, base).href);
}
const expectLogin = () => page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
async function login(email, secret = password) {
  await expectLogin();
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
}
const expectBuyer = () => page.getByRole('heading', { name: 'Hola, Compradora persistente.', exact: true }).waitFor();
const expectOwner = () => page.getByRole('heading', { name: 'Esta es tu tienda.', exact: true }).waitFor();
const expectAdmin = () => page.getByRole('heading', { name: 'Panel administrativo', exact: true }).waitFor();
const hasToken = () => page.evaluate(key => !!localStorage.getItem(key), key);
try {
  await admin.login(c.accounts.admin.email, c.accounts.admin.password);
  fixture = await admin.createEmprendedora({ email: ownerEmail, password, displayName: 'Emprendedora persistente', shopName: 'Tienda persistencia (prueba)' });
  await buyer.registerBuyer({ displayName: 'Compradora persistente', email: buyerEmail, password });
  for (const role of [
    { email: buyerEmail, expect: expectBuyer, label: 'comprador', route: '#mi-cuenta' },
    { email: ownerEmail, expect: expectOwner, label: 'emprendedora', route: '#mi-tienda' },
    { email: c.accounts.admin.email, password: c.accounts.admin.password, expect: expectAdmin, label: 'administrador', route: '#administracion' }
  ]) {
    await reopen(); await login(role.email, role.password ?? password); await role.expect();
    assert.equal(await hasToken(), true);
    assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null);
    const storedValues = await page.evaluate(() => Object.values(localStorage));
    assert.equal(storedValues.some(value => value.includes(password) || value.includes(c.accounts.admin.password)), false);
    await reopen('#inicio');
    await page.locator('.public-owner-link').filter({ hasText: role.label === 'comprador' ? 'Mi cuenta' : role.label === 'emprendedora' ? 'Mi tienda' : 'Mi panel' }).waitFor();
    await page.locator('.public-owner-link').click(); await role.expect();
    checks.push(`Cerrar el proceso de Chromium y abrirlo con el mismo perfil restaura ${role.label} sin contraseña`);
    // Forzar la caducidad local dispara una renovación real con refresh_token.
    await page.evaluate(key => { const auth = JSON.parse(localStorage.getItem(key)); auth.expires_at = 1; localStorage.setItem(key, JSON.stringify(auth)); }, key);
    await reopen(role.route); await role.expect();
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).expires_at > Date.now() / 1000, key), true);
    checks.push(`Renovar el token vencido conserva ${role.label} al volver a abrir`);
    await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expectLogin();
    assert.equal(await hasToken(), false);
    await reopen(role.route); await expectLogin();
    checks.push(`Cerrar sesión de ${role.label} impide restaurar el acceso al reabrir el navegador`);
  }
  await login(buyerEmail); await expectBuyer();
  const other = await context.newPage();
  await other.goto(new URL('#mi-cuenta', base).href);
  await other.getByRole('heading', { name: 'Hola, Compradora persistente.', exact: true }).waitFor();
  await other.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expectLogin();
  assert.equal(await page.locator('.buyer-home').count(), 0);
  await other.close();
  checks.push('Cerrar sesión en otra pestaña también retira la vista privada de la primera');

  const legacy = (await buyer.client.auth.getSession()).data.session;
  await page.evaluate(({ key, legacy }) => {
    localStorage.removeItem(key); localStorage.removeItem(key + ':persistent-v1');
    sessionStorage.setItem(key, JSON.stringify(legacy));
  }, { key, legacy });
  await page.reload(); await expectBuyer();
  assert.equal(await hasToken(), true);
  assert.equal(await page.evaluate(key => sessionStorage.getItem(key), key), null);
  checks.push('Una sesión anterior en sessionStorage migra a persistente sin pedir otra contraseña');

  await page.route('**/rest/v1/profiles?*', route => route.fulfill({ status: 503, json: { message: 'Fallo temporal simulado' } }));
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Revisa tu conexión' }).waitFor();
  assert.equal(await hasToken(), true);
  await page.unroute('**/rest/v1/profiles?*');
  await page.getByRole('button', { name: 'Intentar nuevamente', exact: true }).click(); await expectBuyer();
  checks.push('Fallo temporal de perfil conserva la sesión y el reintento recupera el acceso');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click(); await expectLogin();
  await page.evaluate(({ key, legacy }) => sessionStorage.setItem(key, JSON.stringify(legacy)), { key, legacy });
  await page.reload(); await expectLogin();
  assert.equal(await hasToken(), false);
  checks.push('Una pestaña antigua no resucita la sesión después de cerrar sesión explícitamente');

  await login(ownerEmail); await expectOwner();
  await admin.setEmprendedoraActive(fixture.uid, fixture.shopId, false);
  await reopen('#mi-tienda'); await expectLogin();
  await page.getByRole('alert').filter({ hasText: 'cuenta está desactivada' }).waitFor();
  assert.equal(await hasToken(), false);
  checks.push('Una cuenta desactivada no recupera acceso aunque haya guardado tokens antes');
  assert.deepEqual(errors, []);
  checks.push('Sin errores JavaScript durante el recorrido de persistencia');
  mkdirSync(new URL('./reports/session-persistence/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./reports/session-persistence/web.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), url: base, passed: checks.length, checks,
    limits: ['Chromium real de escritorio; perfil temporal y cierre completo entre visitas', '503 simulado; registro, ingreso, renovación y desactivación contra Supabase real', 'Almacenamiento del navegador permitido; modo privado o borrar datos impide conservar la sesión'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await context?.close();
  try {
    if (fixture) await query(`begin;
      delete from public.shop_associations where shop_id=${literal(fixture.shopId)};
      update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};
      delete from public.shops where id=${literal(fixture.shopId)};
      delete from auth.users where id=${literal(fixture.uid)};commit;`);
    await query(`delete from auth.users where email=${literal(buyerEmail)}`);
  } finally {
    for (const client of [admin, buyer]) { await client.logout().catch(() => {}); await client.dispose(); }
    // Solo el directorio temporal creado por esta ejecución, nunca un perfil del usuario.
    if (resolve(directory).startsWith(resolve(tmpdir()) + sep) && basename(directory).startsWith('conectasur-session-')) rmSync(directory, { recursive: true, force: true });
  }
}
