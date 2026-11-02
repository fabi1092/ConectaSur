// Prueba de integración contra datos ficticios propios. Nunca imprime credenciales.
// Requiere Vite iniciado, CONECTASUR_PRIVATE en memoria y Playwright con Chromium.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.PUBLIC_SHOPS_URL || 'http://127.0.0.1:5174/';
const output = new URL('./reports/public-shops/', import.meta.url);
mkdirSync(output, { recursive: true });
const config = settings();
const clientConfig = { url: config.url, anonKey: config.anonKey };
const admin = createDataLayer(clientConfig);
const owner = createDataLayer(clientConfig);
const visitor = createDataLayer(clientConfig);
const checks = [];
const check = (name, verify) => { verify(); checks.push(name); };
const email = `public_${randomUUID()}@demo.conectasur.cl`;
const password = randomBytes(24).toString('base64url');
const data = {
  name: 'Manos de Alerce (prueba)',
  description: 'Tejidos y artesanías hechos a mano.\nCreamos piezas con cariño para tu hogar.',
  entrepreneurType: 'Artesanías', sector: 'Alerce', contact: 'contacto@ejemplo.cl'
};
let fixture, browser, imagePath;
const browserErrors = [];
try {
  await admin.login(config.accounts.admin.email, config.accounts.admin.password);
  fixture = await admin.createEmprendedora({ email, password, displayName: 'Prueba ficha pública', shopName: data.name });
  await owner.login(email, password);
  await owner.updateShop(fixture.shopId, data);
  browser = await chromium.launch({ headless: true });
  const logoPage = await browser.newPage();
  await logoPage.setContent('<div id="test-logo" style="width:160px;height:160px;display:grid;place-items:center;background:#123b47;color:#3bd0ac;font:bold 100px Arial">M</div>');
  const png = await logoPage.locator('#test-logo').screenshot();
  await logoPage.close();
  data.logoUrl = await owner.uploadLogo(fixture.shopId, new File([png], 'logo-prueba.png', { type: 'image/png' }));
  imagePath = decodeURIComponent(new URL(data.logoUrl).pathname.split('/shop-images/')[1]);
  const publicShop = await visitor.getShop(fixture.shopId);
  check('Los seis campos guardados por la dueña se leen sin sesión', () => {
    for (const [key, value] of Object.entries(data)) assert.equal(publicShop[key], value);
  });
  assert.equal(await visitor.currentSession(), null);
  const rows = await visitor.listPublicShops();
  assert.ok(rows.some(shop => shop.id === fixture.shopId));
  checks.push('La portada consulta la lista pública sin sesión');

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-CL' });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  const requests = [];
  page.on('request', request => { if (request.url().includes('/rest/v1/')) requests.push(request.url()); });
  await page.goto(baseUrl);
  await page.locator('#public-results[aria-busy="false"]').waitFor();
  await page.getByRole('searchbox').fill(data.name);
  await page.getByRole('link', { name: `Ver tienda: ${data.name}`, exact: true }).waitFor();
  assert.equal(await page.locator('.public-shop-card').count(), 1);
  checks.push('Búsqueda pública encuentra la tienda');
  await page.screenshot({ path: new URL('portada.png', output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), fullPage: true });
  await page.getByRole('link', { name: `Ver tienda: ${data.name}`, exact: true }).click();
  await page.getByRole('heading', { name: data.name, exact: true }).waitFor();
  assert.equal(await page.locator('.public-about .public-description').textContent(), data.description);
  assert.equal(await page.locator('.public-contact dd').first().textContent(), data.contact);
  assert.ok((await page.locator('.public-shop-banner').textContent()).includes(data.entrepreneurType));
  assert.ok((await page.locator('.public-shop-banner').textContent()).includes(data.sector));
  const img = page.getByRole('img', { name: `Logo de ${data.name}` });
  await img.evaluate(img => img.decode());
  assert.equal(await img.getAttribute('src'), data.logoUrl);
  assert.equal(await page.getByRole('link', { name: 'Enviar correo' }).getAttribute('href'), 'mailto:contacto%40ejemplo.cl');
  checks.push('La ficha muestra nombre, logo, descripción, tipo, sector y contacto reales');
  check('La navegación pública solo consulta public_shops', () => {
    assert.ok(requests.length >= 2);
    assert.ok(requests.every(url => new URL(url).pathname === '/rest/v1/public_shops'));
  });
  const directUrl = page.url();
  await page.screenshot({ path: new URL('ficha-escritorio.png', output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), fullPage: true });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL', isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  phone.on('pageerror', error => browserErrors.push(error.message));
  await phone.goto(directUrl);
  await phone.getByRole('heading', { name: data.name, exact: true }).waitFor();
  await phone.getByRole('img').evaluate(img => img.decode());
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.screenshot({ path: new URL('ficha-celular.png', output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), fullPage: true });
  await phone.reload();
  await phone.getByRole('heading', { name: data.name, exact: true }).waitFor();
  checks.push('Enlace directo y recarga sin sesión en celular de 390 px');
  await phone.setViewportSize({ width: 320, height: 740 });
  await phone.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('La ficha no desborda a 320 px con texto al 200 %');

  // Un cambio guardado por la dueña aparece al recargar el mismo enlace.
  await owner.updateShop(fixture.shopId, { description: data.description + '\nTrabajos por encargo.' });
  await page.reload();
  await page.getByText('Trabajos por encargo.', { exact: false }).waitFor();
  checks.push('Una edición persistida por la dueña se refleja al recargar la ficha');
  await admin.setEmprendedoraActive(fixture.uid, fixture.shopId, false);
  assert.equal(await visitor.getShop(fixture.shopId), null);
  assert.equal((await visitor.listPublicShops()).some(shop => shop.id === fixture.shopId), false);
  await page.reload();
  await page.getByRole('heading', { name: 'Esta tienda no está disponible' }).waitFor();
  checks.push('Desactivar una cuenta oculta su ficha y su entrada en la portada');
  await admin.setEmprendedoraActive(fixture.uid, fixture.shopId, true);

  await page.goto(new URL('#tienda/no_existe_public_check', baseUrl).href);
  await page.getByRole('heading', { name: 'Esta tienda no está disponible' }).waitFor();
  checks.push('Enlace inexistente ofrece volver a las tiendas');

  // Fallos controlados del transporte, sin alterar los datos del grupo.
  await page.route('**/rest/v1/public_shops?*', route => route.fulfill({ json: [] }));
  await page.goto(baseUrl);
  await page.getByRole('heading', { name: 'Pronto encontrarás tiendas aquí' }).waitFor();
  checks.push('Estado vacío sin datos inventados');
  await page.unroute('**/rest/v1/public_shops?*');
  await page.route('**/rest/v1/public_shops?*', route => route.fulfill({ status: 503, json: { message: 'Prueba sin conexión' } }));
  await page.reload();
  await page.getByRole('heading', { name: 'No pudimos cargar las tiendas' }).waitFor();
  await page.unroute('**/rest/v1/public_shops?*');
  await page.getByRole('button', { name: 'Intentar nuevamente' }).click();
  await page.locator('#public-results[aria-busy="false"]').waitFor();
  checks.push('Error de conexión y reintento recuperan el listado');

  const malicious = [{ id: 'hostil', name: '<img src=x onerror="window.injected=1">', description: '<script>window.injected=1</script>', logo_url: 'javascript:alert(1)', entrepreneur_type: 'Artesanías', sector: 'Alerce', contact: 'javascript:alert(1)' }];
  await page.route('**/rest/v1/public_shops?*', route => route.fulfill({ json: malicious }));
  await page.goto(new URL('#tienda/hostil', baseUrl).href);
  await page.getByRole('heading', { name: malicious[0].name, exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator('a[href^="javascript:"], img[src^="javascript:"]').count(), 0);
  checks.push('Nombres/descripciones se escapan y se rechazan enlaces ejecutables');
  await page.unroute('**/rest/v1/public_shops?*');

  let releasePublic;
  const pendingPublic = new Promise(resolve => { releasePublic = resolve; });
  await page.route('**/rest/v1/public_shops?*', async route => {
    await pendingPublic;
    await route.fulfill({ json: [] });
  });
  await page.goto(baseUrl);
  await page.getByRole('link', { name: 'Administración' }).click();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  releasePublic();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).count(), 1);
  await page.unroute('**/rest/v1/public_shops?*');
  checks.push('Una consulta pública tardía no reemplaza el acceso administrativo');

  await page.goto(new URL('#administracion', baseUrl).href);
  await page.getByLabel('Correo electrónico').fill(config.accounts.admin.email);
  await page.getByLabel('Contraseña').fill(config.accounts.admin.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.getByRole('heading', { name: 'Panel administrativo' }).waitFor();
  for (const section of ['emprendedoras', 'asociaciones', 'categorias', 'tipos']) {
    await page.locator(`[data-section="${section}"]`).click();
    await page.waitForFunction(() => !document.querySelector('#section-content')?.textContent.includes('Cargando'));
    assert.equal(await page.locator('#section-content .error').count(), 0);
  }
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Volver a las tiendas' }).click();
  await page.getByRole('heading', { name: 'Nuestras tiendas' }).waitFor();
  checks.push('Ingreso de administrador, cuatro secciones, logout y regreso a portada conservados');
  assert.deepEqual(browserErrors, []);
  checks.push('Sin errores JavaScript en el recorrido');

  writeFileSync(new URL('verification.json', output), JSON.stringify({
    checkedAt: new Date().toISOString(), url: baseUrl, passed: checks.length, checks,
    fixture: 'Cuenta ficticia temporal y tienda propia; se eliminan al finalizar',
    limits: ['Emulación de navegador móvil; no prueba de usabilidad con personas ni de un teléfono físico', 'Se prueba la misma API de tienda usada por Android; este recorrido no opera la app Android']
  }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser?.close();
  if (fixture) {
    if (imagePath) {
      const { error } = await owner.client.storage.from('shop-images').remove([imagePath]);
      if (error) throw error;
    }
    await query(`begin;
      delete from public.shop_associations where shop_id=${literal(fixture.shopId)};
      update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};
      delete from public.shops where id=${literal(fixture.shopId)};
      delete from auth.users where id=${literal(fixture.uid)};commit;`);
  }
  for (const layer of [admin, owner, visitor]) { await layer.logout().catch(() => {}); await layer.dispose(); }
}
