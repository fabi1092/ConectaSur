// Ventas e historial reales con fixtures propios; nunca descuenta productos de las tiendas del equipo.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createDataLayer} from '../web/supabase-data.js';
import {settings,query,literal} from '../supabase/tools/admin.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.SALES_URL || 'http://127.0.0.1:5174/',output=new URL('./reports/owner-sales/',import.meta.url);mkdirSync(output,{recursive:true});
const config=settings(),clientConfig={url:config.url,anonKey:config.anonKey};
const admin=createDataLayer(clientConfig),owner=createDataLayer(clientConfig),buyer=createDataLayer(clientConfig),visitor=createDataLayer(clientConfig),other=createDataLayer(clientConfig);
const email=`sales_${randomUUID()}@demo.conectasur.cl`,password=randomBytes(24).toString('base64url');
const checks=[],errors=[],rpcIDs=[];let fixture,browser,page,acceptConfirm=true;
const command=(productId,quantity=1,variantId=null,place='Prueba de API')=>({requestId:randomUUID(),productId,quantity,variantId,place});
try{
  await admin.login(config.accounts.admin.email,config.accounts.admin.password);
  fixture=await admin.createEmprendedora({email,password,displayName:'Prueba de ventas web',shopName:'Taller de ventas (prueba)'});await owner.login(email,password);await buyer.login(config.accounts.buyer.email,config.accounts.buyer.password);await other.login(config.accounts.ana.email,config.accounts.ana.password);
  const photo=(await visitor.listPublicProducts()).find(product=>product.photo)?.photo || '';
  const add=overrides=>owner.saveOwnerProduct(fixture.shopId,{id:randomUUID(),shopId:fixture.shopId,name:'Flores de prueba',description:'Producto ficticio de verificación.',category:'Artesanías',productType:'artesania',attributes:{},priceClp:8000,showPrice:true,stockMode:'UNITS',soldOut:'HIDE',quantity:3,visible:false,photo,variants:[],...overrides},{isNew:true});
  const units=await add({name:'Flores tejidas (prueba)',visible:true});
  const variants=await add({name:'Gorro con tallas (prueba)',variants:[{id:'s',label:'Talla S',quantity:0,priceClp:9000,photo:null},{id:'m',label:'Talla M',quantity:2,priceClp:9500,photo:null}],quantity:2});
  const unique=await add({name:'Pieza única (prueba)',stockMode:'UNIQUE',quantity:1,visible:true});
  const request=await add({name:'Por encargo (prueba)',stockMode:'ON_REQUEST',quantity:null});
  const unlimited=await add({name:'Sin conteo (prueba)',stockMode:'UNLIMITED',quantity:null});
  const fallback=await add({name:'Agotado con encargos (prueba)',stockMode:'UNITS',quantity:0,soldOut:'ORDER'});
  for(const layer of [admin,buyer,visitor]){await assert.rejects(layer.ownerSalesHistory(fixture.shopId));await assert.rejects(layer.recordOwnerSale(fixture.shopId,command(units.id)));}
  await assert.rejects(other.ownerSalesHistory(fixture.shopId),error=>error.code==='shop_changed');await assert.rejects(owner.ownerSalesHistory('otra_tienda'),error=>error.code==='shop_changed');
  checks.push('Solo la dueña activa puede registrar ventas y consultar el historial de su tienda');

  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-CL',timezoneId:'UTC'});
  await context.addInitScript(()=>{
    class Utterance{constructor(text){this.text=text;}}
    class Voice extends EventTarget{getVoices(){return[{lang:'es-CL',localService:true}];}speak(item){window.__saleSpoken.push(item.text);}cancel(){}pause(){}resume(){}}
    window.__saleSpoken=[];Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true});Object.defineProperty(window,'speechSynthesis',{value:new Voice(),configurable:true});
  });
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{if(dialog.type()==='confirm' && !acceptConfirm){acceptConfirm=true;await dialog.dismiss();}else await dialog.accept();});
  let loseResponse=true;
  await page.route('**/rest/v1/rpc/register_sale',async route=>{
    rpcIDs.push(route.request().postDataJSON().p_request_id);
    if(loseResponse){const response=await route.fetch();loseResponse=false;if(response.status()===200)await route.abort('failed');else await route.fulfill({response});}else await route.continue();
  });
  await page.goto(new URL('#ingresar',base).href);await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByRole('button',{name:'Mis ventas',exact:true}).click();await page.locator('#sale-product').waitFor();
  await page.getByLabel('Producto vendido',{exact:true}).selectOption(units.id);await page.getByLabel('Cantidad vendida',{exact:true}).fill('2');await page.getByLabel('Lugar de la venta (opcional)',{exact:true}).fill('Feria de Alerce');
  await page.getByRole('button',{name:'Revisar venta',exact:true}).click();await page.locator('#sale-review').waitFor({state:'visible'});assert.match(await page.locator('#sale-review').innerText(),/16\.000 pesos chilenos/);
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products.find(product=>product.id===units.id).quantity,3);
  await page.locator('#sale-review').getByRole('button',{name:'Escuchar',exact:true}).click();await page.waitForFunction(()=>window.__saleSpoken.some(text=>text.includes('8000 pesos chilenos')));
  checks.push('Revisión muestra cantidad, lugar, precio y total CLP sin descontar; lectura recibe pesos chilenos');
  await page.getByRole('button',{name:'Confirmar venta',exact:true}).click();await page.getByRole('button',{name:'Reintentar confirmación',exact:true}).waitFor();
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products.find(product=>product.id===units.id).quantity,1);
  assert.equal((await owner.ownerSalesHistory(fixture.shopId)).sales.length,1);assert.equal(await page.locator('#sale-product').isDisabled(),true);
  const key=await page.evaluate(()=>Object.keys(sessionStorage).find(key=>key.startsWith('conectasur-sale-pending-v1:')));assert.ok(key.includes(fixture.uid));
  await page.reload();await page.getByRole('button',{name:'Mis ventas',exact:true}).click();await page.getByRole('button',{name:'Reintentar confirmación',exact:true}).waitFor();assert.equal(rpcIDs.length,1);
  await page.getByRole('button',{name:'Reintentar confirmación',exact:true}).click();await page.getByRole('button',{name:'Revisar venta',exact:true}).waitFor();await page.locator('.owner-save-success').filter({hasText:'Venta confirmada'}).waitFor();
  assert.equal(rpcIDs.length,2);assert.equal(rpcIDs[0],rpcIDs[1]);assert.equal((await owner.ownerCatalog(fixture.shopId)).products.find(product=>product.id===units.id).quantity,1);assert.equal((await owner.ownerSalesHistory(fixture.shopId)).sales.length,1);
  assert.equal(await page.evaluate(key=>sessionStorage.getItem(key),key),null);await page.unroute('**/rest/v1/rpc/register_sale');
  checks.push('Respuesta perdida después de registrar: recarga conserva la solicitud por cuenta/tienda; reintentar usa el mismo ID y no duplica venta ni descuento');
  const receipt=await owner.ownerSaleReceipt(fixture.shopId,rpcIDs[0]);assert.equal(receipt.quantity,2);assert.equal(receipt.price_clp,8000);assert.equal(receipt.place,'Feria de Alerce');
  await assert.rejects(buyer.ownerSaleReceipt(fixture.shopId,rpcIDs[0]));

  await page.locator('#sale-product').selectOption(variants.id);await page.locator('#sale-variant').selectOption('m');await page.locator('#sale-quantity').fill('1');await page.locator('#sale-place').fill('Tienda de prueba');
  await page.getByRole('button',{name:'Revisar venta',exact:true}).click();await page.locator('#sale-review').waitFor({state:'visible'});assert.match(await page.locator('#sale-review').innerText(),/9\.500 pesos chilenos/);
  await page.getByRole('button',{name:'Volver a corregir',exact:true}).click();await page.locator('#sale-review').waitFor({state:'detached'});assert.equal((await owner.ownerSalesHistory(fixture.shopId)).sales.length,1);
  await page.getByRole('button',{name:'Revisar venta',exact:true}).click();await page.getByRole('button',{name:'Confirmar venta',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#sale-product') && !document.querySelector('#sale-product').disabled && document.querySelector('#sale-form button')?.textContent==='Revisar venta' && !document.querySelector('#sale-form button').disabled);
  let changed=(await owner.ownerCatalog(fixture.shopId)).products.find(product=>product.id===variants.id);assert.equal(changed.quantity,1);assert.equal(changed.variants.find(option=>option.id==='m').quantity,1);assert.equal(changed.variants.find(option=>option.id==='s').quantity,0);
  checks.push('Tallas/colores usan su precio propio y solo descuentan la opción elegida; volver a corregir no registra');
  await page.locator('#sale-product').selectOption(variants.id);await page.locator('#sale-variant').selectOption('s');await page.getByRole('button',{name:'Revisar venta',exact:true}).click();await page.locator('#sales-status').filter({hasText:'Quedan 0 unidades'}).waitFor();assert.equal(await page.locator('#sale-review').count(),0);
  for(const quantity of [0,-1,1.5,'1,5'])await assert.rejects(owner.recordOwnerSale(fixture.shopId,{...command(units.id),quantity}),error=>error.code==='invalid_sale');
  checks.push('Opción agotada, cero, negativos y fracciones se rechazan antes de registrar');
  const race=await Promise.allSettled([owner.recordOwnerSale(fixture.shopId,command(units.id)),owner.recordOwnerSale(fixture.shopId,command(units.id))]);assert.equal(race.filter(result=>result.status==='fulfilled').length,1);assert.equal(race.filter(result=>result.status==='rejected').length,1);
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products.find(product=>product.id===units.id).quantity,0);assert.equal((await visitor.listPublicProducts(fixture.shopId)).some(product=>product.id===units.id),false);
  checks.push('Dos ventas simultáneas para la última unidad: solo una se registra; no hay cantidad negativa y la vitrina se actualiza');
  await owner.recordOwnerSale(fixture.shopId,command(unique.id));assert.equal((await visitor.listPublicProducts(fixture.shopId)).some(product=>product.id===unique.id),false);await assert.rejects(owner.recordOwnerSale(fixture.shopId,command(unique.id)));
  for(const product of [request,unlimited,fallback]){const sale=command(product.id,2);await owner.recordOwnerSale(fixture.shopId,sale);await owner.recordOwnerSale(fixture.shopId,sale);assert.equal((await owner.ownerCatalog(fixture.shopId)).products.find(value=>value.id===product.id).quantity,product.quantity);}
  checks.push('Pieza única se vende una vez; por encargo, sin conteo y agotado que recibe encargos mantienen sus cantidades; repetir ID no duplica');
  for(const layer of [visitor,buyer,admin,other]){const result=await layer.client.from('sales').select('id').eq('shop_id',fixture.shopId);assert.ok(result.error || !result.data.length);}
  await admin.setEmprendedoraActive(fixture.uid,fixture.shopId,false);await assert.rejects(owner.recordOwnerSale(fixture.shopId,command(unlimited.id)));await admin.setEmprendedoraActive(fixture.uid,fixture.shopId,true);
  checks.push('Visitante, comprador, administrador y otra dueña no leen ventas ajenas; cuenta desactivada no registra');
  const beforeRows=(await owner.ownerSalesHistory(fixture.shopId)).sales.length;
  const stamp=Date.parse('2026-10-31T15:00:00Z');
  await query(`insert into public.sales(id,shop_id,product_id,product_name,quantity,price_clp,place,date_millis) select gen_random_uuid(),${literal(fixture.shopId)},'producto_retirado','Producto retirado (prueba)',1,5,'Feria histórica',${stamp} from generate_series(1,1005);`);
  const full=(await owner.ownerSalesHistory(fixture.shopId)).sales;assert.equal(full.length,beforeRows+1005);assert.equal(new Set(full.map(row=>row.id)).size,full.length);
  checks.push('Historial supera 1000 registros sin perder ni duplicar filas, incluidas fechas idénticas y productos retirados');
  await page.getByRole('button',{name:'Historial de ventas',exact:true}).click();await page.locator('#sales-from').waitFor();await page.locator('#sales-history-count').filter({hasText:`de ${beforeRows+1005}`}).waitFor();
  await page.locator('#sales-from').fill('2026-10-31');await page.locator('#sales-to').fill('2026-10-31');await page.locator('#sales-product-filter').fill('retirado');await page.locator('#sales-place-filter').fill('historica');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  assert.match(await page.locator('#sales-history-count').innerText(),/de 1005/);assert.match(await page.locator('#sales-summary').innerText(),/5\.025 pesos chilenos/);assert.equal(await page.locator('.sale-record').count(),20);
  await page.locator('.sale-record').first().getByRole('button',{name:'Escuchar',exact:true}).click();await page.waitForFunction(()=>window.__saleSpoken.some(text=>text.includes('Producto retirado')));assert.equal(await page.locator('.sale-record [data-stop-reading]:visible').count(),1);await page.locator('.sale-record [data-stop-reading]:visible').click();
  await page.getByRole('button',{name:'Página siguiente',exact:true}).click();assert.match(await page.locator('#sales-history-count').innerText(),/Mostrando 21 a 40/);
  checks.push('Filtros inclusivos de Chile, nombre sin acentos y lugar calculan totales completos; interfaz pagina de 20 en 20 y lee solo el registro elegido');
  await page.locator('#sales-from').fill('2026-11-02');await page.locator('#sales-to').fill('2026-10-31');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();assert.match(await page.locator('#sales-status').innerText(),/fecha inicial/);assert.equal(await page.locator('.sale-record').count(),0);
  await page.getByRole('button',{name:'Quitar filtros',exact:true}).click();
  checks.push('Rangos de fecha invertidos no muestran resultados o totales anteriores como si fueran válidos');
  await page.getByText('Preferencias de mi historial',{exact:true}).click();await page.locator('#sales-history-enabled').uncheck();acceptConfirm=false;await page.getByRole('button',{name:'Guardar preferencia del historial',exact:true}).click();assert.equal((await owner.entrepreneurHome()).shop.historyEnabled,true);
  await page.getByRole('button',{name:'Guardar preferencia del historial',exact:true}).click();await page.locator('#sales-status').filter({hasText:'Guardamos la preferencia'}).waitFor();assert.equal((await owner.entrepreneurHome()).shop.historyEnabled,false);
  const noHistory=command(variants.id,1,'m');await owner.recordOwnerSale(fixture.shopId,noHistory);await owner.recordOwnerSale(fixture.shopId,noHistory);assert.equal((await owner.ownerSalesHistory(fixture.shopId)).sales.length,full.length);assert.equal((await owner.ownerCatalog(fixture.shopId)).products.find(value=>value.id===variants.id).quantity,0);
  await owner.setOwnerHistoryEnabled(fixture.shopId,true);await assert.rejects(admin.setOwnerHistoryEnabled(fixture.shopId,false));
  checks.push('Desactivar historial pide confirmar, conserva ventas anteriores y descuenta una sola vez sin guardar detalle nuevo');
  await page.route('**/rest/v1/sales*',route=>route.abort('failed'));await page.getByRole('button',{name:'Actualizar historial',exact:true}).click();await page.getByRole('heading',{name:'No pudimos cargar el historial.',exact:true}).waitFor();await page.unroute('**/rest/v1/sales*');await page.getByRole('button',{name:'Intentar nuevamente',exact:true}).click();await page.locator('#sales-from').waitFor();
  checks.push('Error de consulta muestra reintento en lugar de un historial vacío inventado');
  await page.screenshot({path:fileURLToPath(new URL('historial-escritorio.png',output))});
  await page.setViewportSize({width:320,height:740});await page.locator('#access-size').selectOption('largest');await page.locator('#access-contrast').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('historial-celular.png',output))});
  await page.getByRole('button',{name:'Registrar una venta',exact:true}).click();await page.locator('#sale-product').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:fileURLToPath(new URL('venta-celular.png',output)),fullPage:true});
  checks.push('Registro e historial sin desborde a 320 px con texto muy grande y contraste');
  assert.deepEqual(errors,[]);checks.push('Sin errores JavaScript en el recorrido');
  writeFileSync(new URL('verification.json',output),JSON.stringify({checkedAt:new Date().toISOString(),url:base,passed:checks.length,checks,limits:['Solo datos ficticios propios; se eliminan al finalizar junto con las solicitudes idempotentes','Voz simulada para comprobar integración y texto CLP; móvil emulado, sin prueba física con emprendedoras','La solicitud pendiente se conserva por cuenta y tienda en sessionStorage de esta pestaña; no se promete recuperación al cerrar la pestaña','El RPC usa el precio vigente al registrar; el resumen previo es una referencia y el historial conserva el precio registrado']},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,checks}));
}catch(error){if(page && !page.isClosed())console.error(JSON.stringify({completed:checks.length,status:await page.locator('#sales-status').textContent({timeout:1000}).catch(()=>null),headings:await page.locator('h1,h2').allTextContents()}));throw error;}
finally{
  await browser?.close();try{if(fixture)await query(`begin;delete from public.sales where shop_id=${literal(fixture.shopId)};delete from app_private.sale_requests where owner_uid=${literal(fixture.uid)};delete from public.shop_associations where shop_id=${literal(fixture.shopId)};update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);}finally{for(const layer of [admin,owner,buyer,visitor,other]){await layer.logout().catch(()=>{});await layer.dispose();}}
}
