// Cuenta, catálogo e imágenes temporales propios. No imprime credenciales ni modifica tiendas reales.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.CATALOG_URL || 'http://127.0.0.1:5174/';
const output = new URL('./reports/owner-catalog/', import.meta.url); mkdirSync(output,{recursive:true});
const config = settings(), clientConfig = {url:config.url,anonKey:config.anonKey};
const admin = createDataLayer(clientConfig), owner = createDataLayer(clientConfig), visitor = createDataLayer(clientConfig), buyer = createDataLayer(clientConfig);
const email = `catalog_${randomUUID()}@demo.conectasur.cl`, password = randomBytes(24).toString('base64url');
const checks = [], errors = [], uploadedPaths = new Set(); let fixture, browser, page;
try {
  await admin.login(config.accounts.admin.email,config.accounts.admin.password);
  fixture = await admin.createEmprendedora({email,password,displayName:'Prueba de catálogo web',shopName:'Taller del Sur (prueba)'});
  await owner.login(email,password); await buyer.login(config.accounts.buyer.email,config.accounts.buyer.password);
  await assert.rejects(buyer.ownerCatalog(fixture.shopId),error => error.code === 'entrepreneur_required');
  await assert.rejects(admin.ownerCatalog(fixture.shopId),error => error.code === 'entrepreneur_required');
  await assert.rejects(owner.ownerCatalog('otra_tienda'),error => error.code === 'shop_changed');
  checks.push('Comprador, administrador de aplicación y tienda ajena no pueden abrir el catálogo privado');

  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1100},locale:'es-CL'});
  page = await context.newPage();page.on('pageerror',error => errors.push(error.message));
  page.on('request',request => {const url = new URL(request.url()),marker = '/storage/v1/object/shop-images/';if(request.method() === 'POST' && url.pathname.startsWith(marker))uploadedPaths.add(decodeURIComponent(url.pathname.slice(marker.length)));});
  await page.goto(new URL('#ingresar',base).href);
  await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('button',{name:'Mis productos',exact:true}).click();
  const list = async () => {await page.getByRole('button',{name:'Agregar producto',exact:true}).waitFor();};
  const next = () => page.getByRole('button',{name:'Continuar',exact:true}).click();
  const edit = async () => {await page.getByRole('button',{name:'Editar producto',exact:true}).first().click();};
  const submit = async () => {await page.getByRole('button',{name:'Revisar producto',exact:true}).click();if(await page.locator('#product-review[open]').count())await page.locator('#product-review [data-action=confirm-save]').click();};
  const save = async () => {await submit();await list();await page.locator('#catalog-status').filter({hasText:'Guardamos tu producto'}).waitFor();};
  await list();assert.equal(await page.locator('.owner-product-card').count(),0);
  checks.push('Catálogo vacío explica cómo comenzar y ofrece Agregar producto');
  await page.getByRole('button',{name:'Agregar producto',exact:true}).click();
  const buffer = Buffer.from(await page.evaluate(() => {const canvas = document.createElement('canvas');canvas.width = 2400;canvas.height = 1800;const ctx = canvas.getContext('2d');ctx.fillStyle = '#103d50';ctx.fillRect(0,0,2400,1800);ctx.fillStyle = '#32b897';ctx.font = 'bold 600px Arial';ctx.fillText('SUR',500,1000);return canvas.toDataURL('image/png').split(',')[1];}),'base64');
  await page.locator('#product-photo').setInputFiles({name:'foto.png',mimeType:'image/png',buffer});
  await page.locator('#catalog-status').filter({hasText:'Foto lista'}).waitFor();assert.equal(uploadedPaths.size,0);
  await next();
  await page.getByLabel('Nombre del producto',{exact:true}).fill('Flores de fibras vegetales');
  await page.getByLabel('Descripción',{exact:true}).fill('Artesanía hecha a mano. No es una planta viva.');
  await page.getByLabel('Precio en pesos chilenos',{exact:true}).fill('8.000');
  await page.getByLabel('Categoría',{exact:true}).fill('Artesanías');
  await page.getByLabel('Tipo de producto',{exact:true}).selectOption('artesania');
  await page.getByLabel('material',{exact:true}).fill('Fibras vegetales');
  await next();await next();await submit();
  await page.locator('#catalog-status').filter({hasText:'sin puntos ni comas'}).waitFor();
  assert.equal(uploadedPaths.size,0);await page.getByLabel('Precio en pesos chilenos',{exact:true}).fill('8000');
  await next();await next();await page.getByLabel('Unidades disponibles',{exact:true}).fill('3');
  // Primera escritura falla: el formulario y la foto ya subida deben poder reutilizarse.
  const productRoute = '**/rest/v1/products*';let failInsert = true;
  await page.route(productRoute,async route => {if(failInsert && route.request().method() === 'POST'){failInsert=false;await route.abort('failed');}else await route.continue();});
  await submit();
  await page.locator('#catalog-status').filter({hasText:'Tus cambios siguen'}).waitFor();
  const uploadsBeforeRetry = uploadedPaths.size;assert.equal(uploadsBeforeRetry,1);
  await page.unroute(productRoute);await save();assert.equal(uploadedPaths.size,uploadsBeforeRetry);
  let stored = (await owner.ownerCatalog(fixture.shopId)).products[0];
  assert.equal(stored.priceClp,8000);assert.equal(stored.quantity,3);assert.equal(stored.attributes.material,'Fibras vegetales');assert.equal(stored.category,'Artesanías');
  assert.equal((await visitor.listPublicProducts(fixture.shopId))[0].id,stored.id);
  const photoResponse = await fetch(stored.photo);assert.equal(photoResponse.headers.get('content-type'),'image/jpeg');
  const dimensions = await page.evaluate(async url => {const img = new Image();img.src=url;await img.decode();return [img.naturalWidth,img.naturalHeight];},stored.photo);
  assert.ok(Math.max(...dimensions)<=1024);
  checks.push('Foto preparada antes de publicar: JPEG de hasta 1024 px, sin subir al elegirla');
  checks.push('Precio 8000 CLP, categoría Artesanías y campos específicos se guardan y aparecen en la proyección pública');
  checks.push('Fallo de escritura conserva formulario y foto; reintentar no duplica el producto ni la subida confirmada');
  assert.equal((await owner.saveOwnerProduct(fixture.shopId,stored,{isNew:true})).id,stored.id);
  await assert.rejects(owner.saveOwnerProduct(fixture.shopId,{...stored,name:'Colisión de identificador'},{isNew:true}));
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products[0].name,stored.name);
  checks.push('Reintento idéntico reconoce el registro guardado; una colisión de identificador no sobrescribe otro contenido');

  await edit();await next();await page.getByLabel('Descripción',{exact:true}).fill('Cambio que quiero conservar');
  page.once('dialog',dialog => dialog.dismiss());await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.getByLabel('Descripción',{exact:true}).inputValue(),'Cambio que quiero conservar');
  page.once('dialog',dialog => dialog.dismiss());await page.getByRole('link',{name:'Ingresar',exact:true}).evaluate(link=>link.href='#inicio');
  await page.getByRole('link',{name:'Ingresar',exact:true}).click();await page.waitForURL('**/#ingresar');
  assert.equal(await page.getByLabel('Descripción',{exact:true}).inputValue(),'Cambio que quiero conservar');
  checks.push('Cancelar y navegación interna piden confirmar antes de descartar cambios');
  // Simula stock cambiado desde Android mientras la edición antigua sigue abierta.
  const update = await owner.client.from('products').update({quantity:2}).eq('id',stored.id);if(update.error)throw update.error;
  await assert.rejects(owner.deleteOwnerProduct(fixture.shopId,stored.id,stored.updatedAt),error=>error.code==='product_changed');
  await next();await next();await submit();
  await page.getByRole('button',{name:'Cargar versión actual',exact:true}).waitFor();
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products[0].quantity,2);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cargar versión actual',exact:true}).click();
  await page.getByRole('heading',{name:'Edita tu producto.',exact:true}).waitFor();
  await page.locator('#product-reload').waitFor({state:'hidden'});
  await next();await next();
  await page.getByRole('button',{name:'Agregar variante',exact:true}).click();
  await page.getByLabel('Nombre de la variante',{exact:true}).fill('Natural');
  await page.getByLabel('Unidades de esta variante',{exact:true}).fill('2');
  await page.getByLabel('Precio propio en pesos chilenos (opcional)',{exact:true}).fill('9000');
  await page.locator('[data-photo]:not([data-photo="main"])').setInputFiles({name:'variante.png',mimeType:'image/png',buffer});
  await page.locator('#catalog-status').filter({hasText:'Foto lista'}).waitFor();
  await next();await save();stored = (await owner.ownerCatalog(fixture.shopId)).products[0];
  assert.equal(stored.variants.length,1);assert.equal(stored.quantity,2);assert.equal(stored.variants[0].priceClp,9000);assert.ok(stored.variants[0].photo?.startsWith('https:'));
  checks.push('Edición antigua no repone el stock cambiado en otro dispositivo y permite cargar la versión actual');
  checks.push('Variantes con cantidad, precio y foto propios; cantidad total calculada por el backend');
  await page.screenshot({path:fileURLToPath(new URL('catalogo-escritorio.png',output)),fullPage:true});

  // Modos y privacidad reales, con el mismo método que invoca el formulario.
  for(const [mode,soldOut,quantity,expected] of [['UNITS','HIDE',0,'hidden'],['UNITS','SHOW',0,'sold'],['UNITS','ORDER',0,'order'],['UNIQUE','ORDER',0,'hidden'],['ON_REQUEST','HIDE',null,'order'],['UNLIMITED','HIDE',null,'available']]){
    stored = await owner.saveOwnerProduct(fixture.shopId,{...stored,stockMode:mode,soldOut,quantity,variants:[]});
    const products = await visitor.listPublicProducts(fixture.shopId);
    if(expected==='hidden')assert.equal(products.length,0);else{assert.equal(products.length,1);assert.equal(products[0].onRequest,expected==='order');assert.equal(products[0].soldOut,expected==='sold');assert.equal('quantity' in products[0],false);}
  }
  checks.push('Unidades agotadas ocultas, visibles o por encargo; pieza única vendida oculta; por encargo y sin conteo funcionan sin exponer stock público');
  await assert.rejects(owner.saveOwnerProduct(fixture.shopId,{...stored,stockMode:'UNIQUE',quantity:1,variants:[{id:'x',label:'x',quantity:1}]}),error=>error.code==='invalid_product');
  await assert.rejects(owner.saveOwnerProduct(fixture.shopId,{...stored,priceClp:-1}),error=>error.code==='invalid_product');
  await assert.rejects(owner.saveOwnerProduct(fixture.shopId,{...stored,shopId:'ajena'}),error=>error.code==='invalid_product');
  await assert.rejects(owner.saveOwnerProduct(fixture.shopId,{...stored,stockMode:'UNITS',quantity:1.5}),error=>error.code==='invalid_product');
  checks.push('Rechaza precios negativos, cantidades fraccionarias, tienda manipulada y variantes en piezas únicas');
  const denied = await buyer.client.from('products').update({quantity:999}).eq('id',stored.id).select('id');assert.ok(denied.error || !denied.data.length);
  for(const client of [visitor,buyer,admin]){const result=await client.client.from('products').select('id').eq('id',stored.id);assert.ok(result.error || !result.data.length);}
  checks.push('RLS niega inventario privado a visitante, comprador y admin; comprador no cambia cantidades');

  await page.getByRole('button',{name:'Actualizar catálogo',exact:true}).click();await list();
  await page.getByRole('checkbox',{name:'Seleccionar Flores de fibras vegetales',exact:true}).check();
  assert.equal(await page.locator('[data-select]').evaluate(input=>input===document.activeElement),true);
  await page.getByText('Actualizar varios productos',{exact:true}).click();
  await page.locator('#bulk-setting').selectOption('visible:false');page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Aplicar a los seleccionados',exact:true}).click();await list();
  await page.locator('#catalog-status').filter({hasText:'Actualizamos los productos seleccionados'}).waitFor();
  assert.equal((await visitor.listPublicProducts(fixture.shopId)).length,0);
  checks.push('Actualización grupal oculta los seleccionados y los retira del catálogo público');
  await page.getByText('Preferencias para productos nuevos',{exact:true}).click();await page.locator('#default-stock').selectOption('ON_REQUEST');await page.locator('#default-visible').uncheck();
  await page.getByRole('button',{name:'Guardar preferencias',exact:true}).click();await page.locator('#catalog-status').filter({hasText:'Guardamos las preferencias'}).waitFor();
  await page.getByRole('button',{name:'Agregar producto',exact:true}).click();await next();
  await page.getByLabel('Nombre del producto',{exact:true}).fill('Borrador sin foto');await page.getByLabel('Precio en pesos chilenos',{exact:true}).fill('1000');
  await next();await next();assert.equal(await page.getByLabel('Modalidad del producto',{exact:true}).inputValue(),'ON_REQUEST');assert.equal(await page.getByRole('checkbox',{name:'Publicar en mi catálogo',exact:true}).isChecked(),false);
  await save();assert.equal((await owner.ownerCatalog(fixture.shopId)).products.length,2);assert.equal((await visitor.listPublicProducts(fixture.shopId)).length,0);
  checks.push('Preferencias persistidas se aplican a productos nuevos; se permite guardar oculto sin foto');
  await page.getByLabel('Buscar en mis productos',{exact:true}).fill('sin foto');assert.equal(await page.locator('.owner-product-card').count(),1);
  await page.getByRole('button',{name:'Eliminar',exact:true}).click({trial:true});page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Eliminar',exact:true}).click();assert.equal((await owner.ownerCatalog(fixture.shopId)).products.length,2);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Eliminar',exact:true}).click();await list();await page.locator('#catalog-status').filter({hasText:'Eliminamos el producto'}).waitFor();assert.equal((await owner.ownerCatalog(fixture.shopId)).products.length,1);
  checks.push('Buscador filtra por nombre; eliminar exige confirmación y solo borra el producto elegido');

  await page.getByLabel('Buscar en mis productos',{exact:true}).fill('');await edit();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('producto-celular.png',output)),fullPage:true});
  for(let index=0;index<4;index++){
    await page.setViewportSize({width:320,height:740});await page.addStyleTag({content:'html {font-size:200% !important}'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`desborde paso ${index}`);
    if(index<3)await next();
  }
  checks.push('Cuatro pasos sin desbordamiento a 320 px con texto al 200 %, más revisión móvil y escritorio');
  assert.deepEqual(errors,[]);checks.push('Sin errores JavaScript en el recorrido');
  writeFileSync(new URL('verification.json',output),JSON.stringify({checkedAt:new Date().toISOString(),url:base,passed:checks.length,checks,fixture:'Datos e imágenes ficticios propios, eliminados al finalizar',limits:['Navegador móvil emulado; pendiente prueba física con emprendedoras','Android usa las mismas filas y API; esta prueba no opera un dispositivo Android','El borrador se conserva mientras el formulario está abierto, no después de cerrar la pestaña']},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,checks}));
} catch(error) {
  if(page && !page.isClosed()) console.error(JSON.stringify({completed:checks.length,lastStatus:await page.locator('#catalog-status').textContent({timeout:2000}).catch(()=>null),headings:await page.locator('h1,h2').allTextContents()}));
  throw error;
} finally {
  await browser?.close();
  try{if(fixture){if(uploadedPaths.size){const result=await owner.client.storage.from('shop-images').remove([...uploadedPaths]);if(result.error)throw result.error;}await query(`begin;delete from public.shop_associations where shop_id=${literal(fixture.shopId)};update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);}}
  finally{for(const client of [admin,owner,visitor,buyer]){await client.logout().catch(()=>{});await client.dispose();}}
}
