// Edición web de tienda/logo con cuenta y datos ficticios propios. No imprime credenciales.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SHOP_EDITOR_URL || 'http://127.0.0.1:5174/';
const output = new URL('./reports/shop-editor/', import.meta.url);
mkdirSync(output, { recursive: true });
const config = settings(), clientConfig = { url: config.url, anonKey: config.anonKey };
const admin = createDataLayer(clientConfig), owner = createDataLayer(clientConfig), visitor = createDataLayer(clientConfig), buyer = createDataLayer(clientConfig);
const email = `editor_${randomUUID()}@demo.conectasur.cl`, password = randomBytes(24).toString('base64url');
const original = { name: 'Taller de Alerce (prueba)', description: 'Ficha ficticia original.', entrepreneurType: 'Artesanías', sector: 'Alerce', contact: 'contacto@ejemplo.cl', showPrices: true };
const edited = { name: 'Taller del Sur (prueba)', description: 'Creaciones y encargos para nuestra comunidad.\nHechos con dedicación.', entrepreneurType: 'Servicios', sector: 'Alerce (sector de prueba)', contact: 'taller@ejemplo.cl', showPrices: false };
const checks = [], errors = [], uploadedPaths = new Set();
let fixture, browser;
try {
  await admin.login(config.accounts.admin.email, config.accounts.admin.password);
  fixture = await admin.createEmprendedora({ email, password, displayName: 'Prueba de edición web', shopName: original.name });
  await owner.login(email, password);
  await owner.updateShop(fixture.shopId, original);
  await buyer.login(config.accounts.buyer.email, config.accounts.buyer.password);
  await assert.rejects(buyer.saveEntrepreneurShop(fixture.shopId, original), error => error.code === 'entrepreneur_required');
  await assert.rejects(admin.saveEntrepreneurShop(fixture.shopId, original), error => error.code === 'entrepreneur_required');
  await assert.rejects(owner.saveEntrepreneurShop('otra_tienda', original), error => error.code === 'shop_changed');
  await assert.rejects(owner.saveEntrepreneurShop(fixture.shopId, { ...original, name: '   ' }), error => error.code === 'invalid_shop');
  await assert.rejects(owner.saveEntrepreneurShop(fixture.shopId, { ...original, ownerUid: config.accounts.buyer.uid }), error => error.code === 'invalid_shop');
  const forbidden = await buyer.client.from('shops').update({ name: 'Cambio no autorizado' }).eq('id', fixture.shopId).select('id');
  assert.ok(forbidden.error || forbidden.data.length === 0);
  assert.equal((await visitor.getShop(fixture.shopId)).name, original.name);
  checks.push('Solo la dueña puede guardar la tienda asignada; comprador, rol administrador e ID ajeno se rechazan');
  checks.push('Campos de propiedad y nombres vacíos se rechazan sin modificar la tienda');
  const { error: productError } = await owner.client.from('products').insert({ id: fixture.shopId + '_product', shop_id: fixture.shopId, name: 'Producto de prueba', price_clp: 8000, show_price: true, stock_mode: 'UNITS', quantity: 1, photo: '' });
  if (productError) throw productError;

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'es-CL' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url()), marker = '/storage/v1/object/shop-images/';
    if (request.method() === 'POST' && url.pathname.startsWith(marker)) uploadedPaths.add(decodeURIComponent(url.pathname.slice(marker.length)));
  });
  await page.goto(new URL('#ingresar', base).href);
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  const home = () => page.getByRole('heading', { name: 'Esta es tu tienda.', exact: true }).waitFor();
  const openEditor = async () => {
    await page.getByRole('button', { name: 'Editar tienda', exact: true }).click();
    await page.getByRole('heading', { name: 'Dale tu sello a tu tienda.', exact: true }).waitFor();
  };
  const save = async () => { await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click(); await home(); await page.locator('.owner-save-success').waitFor(); };
  const fill = async values => {
    for (const [key, value] of Object.entries(values)) {
      const field = page.locator(`#shop-editor-form [name="${key}"]`);
      if (typeof value === 'boolean') await field.setChecked(value); else await field.fill(value);
    }
  };
  const makeLogo = async mark => Buffer.from(await page.evaluate(mark => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#103d50'; ctx.fillRect(0, 0, 2400, 1800);
    ctx.fillStyle = '#32b897'; ctx.font = 'bold 900px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mark, 1200, 900);
    return canvas.toDataURL('image/png').split(',')[1];
  }, mark), 'base64');
  const chooseLogo = async (buffer, name = 'logo-prueba.png', mimeType = 'image/png') => page.locator('#edit-shop-logo').setInputFiles({ name, mimeType, buffer });

  await home(); await openEditor();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), original.name);
  const firstLogo = await makeLogo('A');
  await chooseLogo(firstLogo);
  await page.getByRole('img', { name: 'Vista previa del nuevo logo', exact: true }).waitFor();
  await fill({ name: 'Cambio que se cancelará' });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'Cambio que se cancelará');
  assert.equal(uploadedPaths.size, 0);
  assert.equal((await owner.getShop(fixture.shopId)).logoUrl, null);
  checks.push('Elegir logo solo prepara una vista previa; cambiar foco conserva el formulario y no publica datos');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'Cambio que se cancelará');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await home();
  assert.equal((await visitor.getShop(fixture.shopId)).name, original.name);
  assert.equal(uploadedPaths.size, 0);
  checks.push('Cancelar pide confirmación y descarta datos e imagen sin subir archivos');

  await openEditor();
  await chooseLogo(Buffer.from('<svg></svg>'), 'no-permitido.svg', 'image/svg+xml');
  await page.getByRole('alert').filter({ hasText: 'Elige una imagen JPG' }).waitFor();
  await chooseLogo(Buffer.from('Esto no es una imagen'), 'incorrecto.jpg', 'image/jpeg');
  await page.getByRole('alert').filter({ hasText: 'No pudimos abrir esa imagen' }).waitFor();
  assert.equal(uploadedPaths.size, 0);
  checks.push('Formato no admitido e imagen inválida se rechazan antes de subirla');
  await fill(edited); await chooseLogo(firstLogo);
  await page.getByRole('img', { name: 'Vista previa del nuevo logo', exact: true }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('editor-escritorio.png', output)), fullPage: true });
  await save();
  let stored = await visitor.getShop(fixture.shopId);
  for (const [key, value] of Object.entries(edited)) assert.equal(stored[key], value);
  assert.ok(stored.logoUrl?.startsWith(config.url + '/storage/v1/object/public/shop-images/' + fixture.shopId + '/logo/'));
  const firstStoredUrl = stored.logoUrl;
  assert.equal(uploadedPaths.size, 1);
  assert.equal((await visitor.listPublicProducts(fixture.shopId))[0].priceClp, null);
  checks.push('Guardar publica todos los datos y el logo en la tienda propia, y respeta ocultar precios');
  await page.reload(); await home();
  assert.equal(await page.locator('.owner-shop-heading h2').textContent(), edited.name);
  checks.push('Los datos y el logo persisten al recargar la cuenta');

  const publicContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CL' });
  const publicPage = await publicContext.newPage();
  await publicPage.goto(new URL('#tienda/' + fixture.shopId, base).href);
  await publicPage.locator('#shop-title').waitFor();
  assert.equal(await publicPage.locator('#shop-title').textContent(), edited.name);
  assert.equal(await publicPage.locator('.public-about .public-description').textContent(), edited.description);
  assert.equal(await publicPage.locator('.public-contact dd').first().textContent(), edited.contact);
  const publicLogo = publicPage.getByRole('img', { name: 'Logo de ' + edited.name, exact: true });
  await publicLogo.evaluate(img => img.decode());
  assert.equal(await publicLogo.getAttribute('src'), firstStoredUrl);
  const dimensions = await publicLogo.evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
  assert.ok(Math.max(dimensions.width, dimensions.height) <= 1024);
  const imageResponse = await fetch(firstStoredUrl, { headers: { 'User-Agent': 'ConectaSur-web-editor-test' } });
  assert.ok(imageResponse.ok); assert.ok(imageResponse.headers.get('content-type').includes('image/jpeg'));
  assert.ok((await imageResponse.arrayBuffer()).byteLength <= 2097152);
  checks.push('La ficha pública sin sesión refleja lo guardado, con imagen JPEG reducida a 1024 px y hasta 2 MiB');

  await openEditor();
  await fill({ name: 'Nombre sin guardar' });
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'ConectaSur, inicio', exact: true }).first().click();
  await page.waitForURL(url => url.hash === '#ingresar');
  await page.getByRole('heading', { name: 'Dale tu sello a tu tienda.', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '#ingresar');
  assert.equal(await page.getByLabel('Nombre de la tienda', { exact: true }).inputValue(), 'Nombre sin guardar');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('link', { name: 'ConectaSur, inicio', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Nuestras tiendas', exact: true }).waitFor();
  checks.push('Navegar fuera pide confirmación; rechazarla mantiene la ruta y lo escrito');
  await page.getByRole('link', { name: 'Ingresar', exact: true }).click(); await home(); await openEditor();
  await fill({ description: 'Texto que conservamos durante una falla de conexión.' });
  await page.route('**/rest/v1/shops?*', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 503, json: { message: 'Prueba sin conexión' } }) : route.continue());
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Conservamos lo que escribiste' }).waitFor();
  assert.equal(await page.getByLabel('Descripción', { exact: true }).inputValue(), 'Texto que conservamos durante una falla de conexión.');
  await page.unroute('**/rest/v1/shops?*');
  await save();
  assert.equal((await owner.entrepreneurHome()).shop.description, 'Texto que conservamos durante una falla de conexión.');
  checks.push('Un error de guardado conserva el formulario y permite reintentar con éxito');

  await openEditor();
  await chooseLogo(await makeLogo('B'));
  await page.getByRole('img', { name: 'Vista previa del nuevo logo', exact: true }).waitFor();
  await save(); stored = await visitor.getShop(fixture.shopId);
  assert.notEqual(stored.logoUrl, firstStoredUrl);
  assert.equal(uploadedPaths.size, 2);
  checks.push('Reemplazar logo guarda una nueva imagen sin afectar los demás datos');
  const replacementUrl = stored.logoUrl;
  await openEditor();
  await page.getByRole('button', { name: 'Quitar logo', exact: true }).click();
  assert.equal((await visitor.getShop(fixture.shopId)).logoUrl, replacementUrl);
  await page.getByLabel('Mostrar los precios de mis productos', { exact: true }).check();
  await save();
  assert.equal((await visitor.getShop(fixture.shopId)).logoUrl, null);
  assert.equal((await visitor.listPublicProducts(fixture.shopId))[0].priceClp, 8000);
  await publicPage.reload(); await publicPage.locator('#shop-title').waitFor();
  assert.equal(await publicPage.locator('.public-shop-banner .shop-logo img').count(), 0);
  checks.push('Quitar logo se aplica solo al guardar; volver a mostrar precios restaura el precio público');

  await page.setViewportSize({ width: 390, height: 844 }); await openEditor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: fileURLToPath(new URL('editor-celular.png', output)), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('Formulario sin desbordamiento en 390 px y 320 px con texto al 200 %');
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click(); await home();
  assert.deepEqual(errors, []);
  checks.push('Sin errores JavaScript en todo el recorrido');
  writeFileSync(new URL('verification.json', output), JSON.stringify({ checkedAt: new Date().toISOString(), url: base, passed: checks.length, checks,
    fixture: 'Cuenta, tienda, producto e imágenes propios temporales; se eliminan al finalizar',
    limits: ['Navegador móvil emulado; no prueba física con emprendedoras', 'Se verifica el mismo registro y API que usa Android, sin operar el dispositivo Android en esta prueba', 'La protección conserva el formulario abierto; no se promete recuperar un borrador al cerrar el navegador']
  }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser?.close();
  try {
    if (fixture) {
      if (uploadedPaths.size) { const { error } = await owner.client.storage.from('shop-images').remove([...uploadedPaths]); if (error) throw error; }
      await query(`begin;delete from public.shop_associations where shop_id=${literal(fixture.shopId)};
        update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};
        delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);
    }
  } finally { for (const client of [admin, owner, visitor, buyer]) { await client.logout().catch(() => {}); await client.dispose(); } }
}
