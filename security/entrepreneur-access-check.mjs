// W25–W26 y rechazo de cuenta desactivada: Auth y RLS reales con una cuenta propia temporal.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ENTREPRENEUR_ACCESS_URL || 'http://127.0.0.1:5174/';
const url = new URL('#ingresar', base).href;
const output = new URL('./reports/entrepreneur-access/', import.meta.url);
mkdirSync(output, { recursive: true });
const config = settings();
const backend = { url: config.url, anonKey: config.anonKey };
const admin = createDataLayer(backend);
const owner = createDataLayer(backend);
const buyer = createDataLayer(backend);
const email = `owner_web_${randomUUID()}@demo.conectasur.cl`;
const password = randomBytes(24).toString('base64url');
const data = { name: 'Manos de Alerce (prueba)', description: 'Tejidos y artesanías hechos a mano.\nCreamos piezas para tu hogar.', entrepreneurType: 'Artesanías', sector: 'Alerce', contact: 'contacto@ejemplo.cl' };
const checks = [];
const errors = [];
let fixture, browser;
try {
  await admin.login(config.accounts.admin.email, config.accounts.admin.password);
  fixture = await admin.createEmprendedora({ email, password, displayName: 'Emprendedora de prueba', shopName: data.name });
  await owner.login(email, password);
  await owner.updateShop(fixture.shopId, data);
  assert.equal((await owner.entrepreneurHome()).shop.id, fixture.shopId);
  await buyer.login(config.accounts.buyer.email, config.accounts.buyer.password);
  await assert.rejects(buyer.entrepreneurHome(), error => error.code === 'entrepreneur_required');
  checks.push('Repositorio limita Mi tienda a una emprendedora y su tienda asignada');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-CL' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  async function fillLogin(accountEmail = email, accountPassword = password) {
    await page.getByLabel('Correo electrónico', { exact: true }).fill(accountEmail);
    await page.getByLabel('Contraseña', { exact: true }).fill(accountPassword);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  }
  const expectHome = async () => { await page.getByRole('heading', { name: 'Esta es tu tienda.', exact: true }).waitFor(); };
  const expectLogin = async () => { await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor(); };

  await page.goto(base);
  await page.getByRole('link', { name: 'Ingresar', exact: true }).click();
  await expectLogin();
  checks.push('Un solo acceso Ingresar se abre desde la portada sin preguntar el rol');
  await page.getByLabel('Contraseña', { exact: true }).fill('no-es-una-clave-real');
  await page.getByLabel('Mostrar contraseña', { exact: true }).check();
  assert.equal(await page.locator('#owner-password').getAttribute('type'), 'text');
  await page.getByLabel('Mostrar contraseña', { exact: true }).uncheck();
  assert.equal(await page.locator('#owner-password').getAttribute('type'), 'password');
  checks.push('Mostrar y ocultar contraseña mediante un control con texto');
  await page.screenshot({ path: fileURLToPath(new URL('ingreso-escritorio.png', output)), fullPage: true });

  await fillLogin(email, 'clave-equivocada-de-prueba');
  await page.getByRole('alert').filter({ hasText: 'no coinciden' }).waitFor();
  assert.equal(await page.locator('#owner-password').inputValue(), '');
  assert.equal(await page.locator('.owner-home').count(), 0);
  checks.push('Contraseña incorrecta se rechaza, se limpia y conserva el correo');
  await fillLogin();
  await expectHome();
  assert.equal(await page.locator('.owner-shop-heading h2').textContent(), data.name);
  assert.equal(await page.locator('.owner-details .public-description').first().textContent(), data.description);
  assert.equal(await page.locator('.owner-details .public-description').last().textContent(), data.contact);
  assert.ok((await page.locator('.owner-shop-heading').textContent()).includes(data.entrepreneurType));
  assert.ok((await page.locator('.owner-shop-heading').textContent()).includes(data.sector));
  assert.equal(await page.locator('[data-section]').count(), 0);
  checks.push('Credenciales creadas por el administrador abren solo la tienda propia, sin panel de plataforma');
  await page.locator('.owner-account-email').evaluate(element => { element.textContent = 'cuenta-ficticia@ejemplo.cl'; });
  await page.screenshot({ path: fileURLToPath(new URL('tienda-escritorio.png', output)), fullPage: true });
  await page.reload();
  await expectHome();
  checks.push('Recargar conserva la sesión en la misma pestaña, sin volver a pedir contraseña');
  await owner.updateShop(fixture.shopId, { description: data.description + '\nRecibimos encargos.' });
  await page.getByRole('button', { name: 'Actualizar información', exact: true }).click();
  await expectHome();
  assert.ok((await page.locator('.owner-details').textContent()).includes('Recibimos encargos.'));
  checks.push('Actualizar información lee los cambios persistidos por la dueña');
  await page.getByRole('link', { name: 'Ver mi ficha pública', exact: true }).click();
  await page.locator('#shop-title').waitFor();
  assert.equal(await page.locator('.owner-account-email').count(), 0);
  checks.push('El enlace público abre la ficha propia y no muestra información de la sesión');
  await page.getByRole('link', { name: 'Mi tienda', exact: true }).click();
  await expectHome();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('.owner-account-email').evaluate(element => { element.textContent = 'cuenta-ficticia@ejemplo.cl'; });
  await page.screenshot({ path: fileURLToPath(new URL('tienda-celular.png', output)), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('Vista de tienda sin desbordes a 390 px y a 320 px con texto al 200 %');
  await page.reload();
  await expectHome();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expectLogin();
  await page.getByRole('status').filter({ hasText: 'Cerraste tu sesión' }).waitFor();
  const stored = await page.evaluate(() => Object.keys(localStorage).filter(key => key.endsWith('-auth-token')));
  assert.deepEqual(stored, []);
  await page.reload();
  await expectLogin();
  assert.equal(await page.locator('.owner-home').count(), 0);
  checks.push('Cerrar sesión elimina la sesión local; recargar no restaura la tienda privada');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL('ingreso-celular.png', output)), fullPage: true });
  await page.getByRole('link', { name: 'Ver las tiendas', exact: true }).click();
  await page.goBack();
  await expectLogin();
  checks.push('Volver con el navegador después de salir exige ingresar nuevamente');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await fillLogin(config.accounts.admin.email, config.accounts.admin.password);
  await page.getByRole('heading', { name: 'Panel administrativo', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#dashboard-summary-status')?.textContent.includes('Cargando'));
  assert.ok(await page.locator('#stat-shops').textContent() !== '—');
  await page.screenshot({ path: fileURLToPath(new URL('panel-escritorio.png', output)), fullPage: true });
  assert.equal(await page.locator('.owner-home').count(), 0);
  await page.reload();
  await page.getByRole('heading', { name: 'Panel administrativo', exact: true }).waitFor();
  checks.push('El mismo formulario reconoce al administrador y restaura su panel al recargar');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expectLogin();
  await page.reload();
  await expectLogin();
  checks.push('Cerrar sesión de administrador impide restaurar el panel al recargar');
  await fillLogin();
  await expectHome();
  await page.goto(new URL('#administracion', base).href);
  await expectHome();
  assert.equal(await page.locator('.dashboard').count(), 0);
  checks.push('Escribir la antigua ruta de administración no eleva los permisos de una emprendedora');
  await page.goto(base);
  assert.equal(await page.getByRole('link', { name: 'Administración', exact: true }).count(), 0);
  await page.getByRole('link', { name: 'Mi tienda', exact: true }).click();
  await expectHome();
  checks.push('La cabecera pública tiene un solo acceso y regresa al espacio de la cuenta activa');

  await admin.setEmprendedoraActive(fixture.uid, fixture.shopId, false);
  await page.getByRole('button', { name: 'Actualizar información', exact: true }).click();
  await expectLogin();
  await page.getByRole('alert').filter({ hasText: 'cuenta está desactivada' }).waitFor();
  assert.equal(await page.locator('.owner-home').count(), 0);
  checks.push('Desactivar la cuenta retira la vista privada al volver a comprobarla');
  await fillLogin();
  await page.getByRole('alert').filter({ hasText: 'cuenta está desactivada' }).waitFor();
  assert.equal(await page.locator('.owner-home').count(), 0);
  checks.push('Cuenta desactivada no puede iniciar sesión en la web');
  await admin.setEmprendedoraActive(fixture.uid, fixture.shopId, true);
  await fillLogin();
  await expectHome();
  checks.push('Reactivar la cuenta permite ingresar nuevamente');

  await page.route('**/rest/v1/shops?*', route => route.fulfill({ status: 503, json: { message: 'Prueba de conexión' } }));
  await page.getByRole('button', { name: 'Actualizar información', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Revisa tu conexión' }).waitFor();
  assert.equal(await page.locator('.owner-home').count(), 0);
  await page.unroute('**/rest/v1/shops?*');
  await page.getByRole('button', { name: 'Intentar nuevamente', exact: true }).click();
  await expectHome();
  checks.push('Error de red oculta la vista privada y el reintento recupera la tienda');

  await query(`update public.shops set active=false where id=${literal(fixture.shopId)}`);
  await page.getByRole('button', { name: 'Actualizar información', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'cuenta aún no tiene una tienda' }).waitFor();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expectLogin();
  await query(`update public.shops set active=true where id=${literal(fixture.shopId)}`);
  checks.push('Tienda no disponible muestra una salida clara, sin datos de otras tiendas');

  assert.deepEqual(errors, []);
  checks.push('Sin errores JavaScript durante el recorrido');
  writeFileSync(new URL('verification.json', output), JSON.stringify({
    checkedAt: new Date().toISOString(), url: base, passed: checks.length, checks,
    fixture: 'Cuenta creada por administrador y tienda ficticia propias; se eliminan al finalizar',
    limits: ['Navegador móvil emulado, no teléfono físico ni prueba con emprendedoras', 'Edición web de tienda y recuperación de contraseña fuera de este bloque']
  }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser?.close();
  try {
    if (fixture) await query(`begin;
      delete from public.shop_associations where shop_id=${literal(fixture.shopId)};
      update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};
      delete from public.shops where id=${literal(fixture.shopId)};
      delete from auth.users where id=${literal(fixture.uid)};commit;`);
  } finally {
    for (const client of [admin, owner, buyer]) { await client.logout().catch(() => {}); await client.dispose(); }
  }
}
