// Interfaz y persistencia reales; voz/micrófono simulados para probar sus estados, no su precisión física.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings, query, literal } from '../supabase/tools/admin.mjs';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.ACCESSIBILITY_URL || 'http://127.0.0.1:5174/';
const output=new URL('./reports/accessibility-web/',import.meta.url);mkdirSync(output,{recursive:true});
const config=settings(),clientConfig={url:config.url,anonKey:config.anonKey};
const admin=createDataLayer(clientConfig),owner=createDataLayer(clientConfig),visitor=createDataLayer(clientConfig);
const email=`access_${randomUUID()}@demo.conectasur.cl`,password=randomBytes(24).toString('base64url');
const checks=[],errors=[];let fixture,browser,product;
function mockVoice() {
  const state=window.__accessTest={spoken:[],starts:0,aborts:0,cancels:0,paused:false,instances:[]};
  class Utterance {constructor(text){this.text=text;}}
  class Synthesis extends EventTarget {
    getVoices(){return [{lang:'en-US',name:'English',localService:true},{lang:'es-CL',name:'Español de prueba',localService:true}];}
    speak(value){state.spoken.push({text:value.text,lang:value.lang,rate:value.rate});state.utterance=value;}
    cancel(){state.cancels++;}pause(){state.paused=true;}resume(){state.paused=false;}
  }
  class Recognition {
    constructor(){state.instances.push(this);}
    start(){state.starts++;this.onstart?.();}
    abort(){state.aborts++;this.onend?.();}
    stop(){this.onend?.();}
    emit(text){this.onresult?.({results:[{isFinal:true,0:{transcript:text}}]});this.onend?.();}
    fail(error){this.onerror?.({error});this.onend?.();}
  }
  state.Recognition=Recognition;
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true,writable:true});
  Object.defineProperty(window,'speechSynthesis',{value:new Synthesis(),configurable:true});
  Object.defineProperty(window,'SpeechRecognition',{value:Recognition,configurable:true,writable:true});
  Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true,writable:true});
}
try {
  await admin.login(config.accounts.admin.email,config.accounts.admin.password);
  fixture=await admin.createEmprendedora({email,password,displayName:'Prueba de ayudas web',shopName:'Taller de Alerce (prueba)'});
  await owner.login(email,password);
  const photo=(await visitor.listPublicProducts()).find(value=>value.photo)?.photo || '';
  product=await owner.saveOwnerProduct(fixture.shopId,{id:randomUUID(),shopId:fixture.shopId,name:'Flores de prueba',description:'Hechas a mano.',category:'Artesanías',productType:'artesania',attributes:{material:'Lana'},priceClp:8000,showPrice:true,stockMode:'UNITS',soldOut:'HIDE',quantity:3,visible:false,photo,variants:[]},{isNew:true});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-CL'});await context.addInitScript(mockVoice);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(new URL('#ingresar',base).href);await page.getByLabel('Correo electrónico',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__accessTest.starts),0);
  await page.locator('#access-size').selectOption('largest');await page.getByRole('button',{name:'Más contraste',exact:true}).click();
  assert.equal(await page.locator('html').getAttribute('data-text-size'),'largest');assert.equal(await page.locator('#access-contrast').getAttribute('aria-pressed'),'true');
  assert.ok(await page.locator('#access-read').evaluate(element=>element.getBoundingClientRect().height>=68));
  await page.reload();await page.getByLabel('Correo electrónico',{exact:true}).waitFor();
  assert.equal(await page.locator('#access-size').inputValue(),'largest');assert.equal(await page.locator('#access-contrast').getAttribute('aria-pressed'),'true');
  checks.push('Tamaño y contraste persisten al recargar; controles ampliados alcanzan al menos 68 px');
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Escuchar esta pantalla',exact:true}).click();await page.waitForFunction(()=>window.__accessTest.spoken.length>0);
  assert.equal(await page.evaluate(value=>window.__accessTest.spoken.some(item=>item.text.includes(value)),password),false);
  assert.equal(await page.evaluate(()=>window.__accessTest.spoken[0].lang),'es-CL');assert.equal(await page.evaluate(()=>window.__accessTest.spoken[0].rate),.8);
  await page.getByRole('button',{name:'Pausar lectura',exact:true}).click();assert.equal(await page.evaluate(()=>window.__accessTest.paused),true);
  await page.getByRole('button',{name:'Continuar lectura',exact:true}).click();assert.equal(await page.evaluate(()=>window.__accessTest.paused),false);
  await page.locator('#access-stop').click();assert.equal(await page.locator('.accessibility-playback').isVisible(),false);
  checks.push('Lectura usa español y velocidad pausada; pausa, continúa y detiene; no lee la contraseña del formulario');
  await page.getByLabel('Correo electrónico',{exact:true}).fill(email);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('button',{name:'Mis productos',exact:true}).click();await page.getByRole('button',{name:'Editar producto',exact:true}).click();
  await page.getByRole('button',{name:'Escuchar este paso',exact:true}).click();await page.waitForFunction(()=>window.__accessTest.spoken.some(value=>value.text.includes('Paso 1 de 4')));
  await page.locator('.product-step [data-stop-reading]').click();
  await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Nombre del producto',{exact:true}).fill('Nombre escrito sin perder');
  await page.locator('#access-size').selectOption('large');await page.locator('#access-contrast').click();
  assert.equal(await page.getByLabel('Nombre del producto',{exact:true}).inputValue(),'Nombre escrito sin perder');
  checks.push('Cambiar ayudas conserva lo escrito; las instrucciones de cada paso se pueden escuchar y detener');

  const dialog=page.locator('#dictation-dialog');
  const openDictation=async()=>{await page.getByRole('button',{name:'Hablar para escribir el nombre',exact:true}).click();await dialog.waitFor({state:'visible'});};
  await openDictation();assert.equal(await page.evaluate(()=>window.__accessTest.starts),1);
  await page.evaluate(()=>window.__accessTest.instances.at(-1).emit('Flores de lana'));
  assert.equal(await page.getByLabel('Nombre del producto',{exact:true}).inputValue(),'Nombre escrito sin perder');
  await page.locator('#dictation-preview').fill('Flores grandes de lana');await dialog.getByRole('button',{name:'Escuchar el texto',exact:true}).click();
  await page.waitForFunction(()=>window.__accessTest.spoken.some(value=>value.text==='Flores grandes de lana'));
  await dialog.getByRole('button',{name:'Detener lectura',exact:true}).click();await dialog.getByRole('button',{name:'Usar este texto',exact:true}).click();
  assert.equal(await page.getByLabel('Nombre del producto',{exact:true}).inputValue(),'Flores grandes de lana');
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products[0].name,'Flores de prueba');
  checks.push('Micrófono solo se solicita al pulsar Hablar; resultado editable y escuchable requiere Usar este texto; todavía no guarda en el backend');
  await openDictation();await page.evaluate(()=>window.__accessTest.instances.at(-1).emit('Esto se cancela'));
  await dialog.getByRole('button',{name:'Cancelar dictado',exact:true}).click();await page.evaluate(()=>window.__accessTest.instances.at(-1).emit('Respuesta tardía'));
  assert.equal(await page.getByLabel('Nombre del producto',{exact:true}).inputValue(),'Flores grandes de lana');
  checks.push('Cancelar dictado y respuestas tardías no reemplazan el texto del formulario');
  await openDictation();await page.evaluate(()=>window.__accessTest.instances.at(-1).fail('not-allowed'));
  assert.match(await page.locator('#dictation-status').innerText(),/No se permitió el micrófono/);assert.equal(await dialog.getByRole('button',{name:'Usar este texto',exact:true}).isEnabled(),false);
  await dialog.getByRole('button',{name:'Cancelar dictado',exact:true}).click();
  checks.push('Permiso de micrófono rechazado explica alternativas y conserva los datos');
  await page.evaluate(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});await openDictation();
  assert.match(await page.locator('#dictation-status').innerText(),/no permite dictado/);await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);
  assert.equal(await page.locator('[data-dictate-for="product-name"]').evaluate(element=>element===document.activeElement),true);
  await page.evaluate(()=>window.SpeechRecognition=window.__accessTest.Recognition);
  checks.push('Navegador sin reconocimiento ofrece teclado; Escape cancela y devuelve el foco');
  await openDictation();await page.evaluate(()=>window.__accessTest.instances.at(-1).emit('x'.repeat(121)));
  assert.equal(await dialog.getByRole('button',{name:'Usar este texto',exact:true}).isEnabled(),false);assert.match(await page.locator('#dictation-status').innerText(),/120 caracteres/);
  await page.locator('#dictation-preview').fill('Flores grandes de lana');await dialog.getByRole('button',{name:'Usar este texto',exact:true}).click();
  checks.push('Dictado demasiado largo no se trunca ni se aplica; corregirlo permite continuar');
  await page.getByRole('button',{name:'Hablar para escribir la descripción',exact:true}).click();await page.evaluate(()=>window.__accessTest.instances.at(-1).emit('Artesanía hecha con fibras vegetales.'));
  await dialog.getByRole('button',{name:'Usar este texto',exact:true}).click();
  await page.locator('[data-category-choice="Artesanías"]').click();assert.equal(await page.getByLabel('Categoría',{exact:true}).inputValue(),'Artesanías');
  assert.equal(await page.getByLabel('Tipo de producto',{exact:true}).inputValue(),'artesania');
  checks.push('Descripción admite dictado; categoría visual mantiene Artesanías sin reclasificar por mencionar plantas');
  await page.setViewportSize({width:390,height:844});await page.locator('#access-size').selectOption('largest');await page.locator('#access-contrast').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('datos-celular-grande.png',output)),fullPage:true});
  await page.getByRole('button',{name:'Continuar',exact:true}).click();await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Unidades disponibles',{exact:true}).fill('5');
  await page.getByRole('button',{name:'Escuchar este paso',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#access-read').getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'Revisar producto',exact:true}).click();const review=page.locator('#product-review');await review.waitFor({state:'visible'});
  assert.equal(await page.locator('#access-read').getAttribute('aria-pressed'),'false');
  assert.match(await review.innerText(),/8\.000 pesos chilenos/);assert.equal((await owner.ownerCatalog(fixture.shopId)).products[0].quantity,3);
  await review.getByRole('button',{name:'Escuchar resumen',exact:true}).click();
  await page.waitForFunction(()=>window.__accessTest.spoken.some(value=>value.text.includes('8000 pesos chilenos')));
  const priceSpeech=await page.evaluate(()=>window.__accessTest.spoken.filter(value=>value.text.includes('8000 pesos chilenos')).map(value=>value.text).join(' '));
  assert.equal(/d[oó]lares|\$|\bCLP\b/.test(priceSpeech),false);
  await review.getByRole('button',{name:'Pausar lectura',exact:true}).click();assert.equal(await page.evaluate(()=>window.__accessTest.paused),true);await review.getByRole('button',{name:'Continuar lectura',exact:true}).click();
  await review.getByRole('button',{name:'Detener lectura',exact:true}).click();
  await page.screenshot({path:fileURLToPath(new URL('resumen-celular.png',output))});
  await review.getByRole('button',{name:'Volver a corregir',exact:true}).click();await review.waitFor({state:'detached'});assert.equal(await page.getByLabel('Unidades disponibles',{exact:true}).inputValue(),'5');
  assert.equal((await owner.ownerCatalog(fixture.shopId)).products[0].quantity,3);
  checks.push('Resumen previo requiere confirmar; volver a corregir conserva el borrador sin escribir en Supabase');
  checks.push('El resumen de 8000 se envía a la voz como pesos chilenos, sin símbolo dólar ni sigla CLP');
  await page.getByRole('button',{name:'Revisar producto',exact:true}).click();await page.locator('#product-review [data-action="confirm-save"]').click();
  await page.getByRole('button',{name:'Agregar producto',exact:true}).waitFor();await page.locator('#catalog-status').filter({hasText:'Guardamos tu producto'}).waitFor();
  const stored=(await owner.ownerCatalog(fixture.shopId)).products[0];assert.equal(stored.name,'Flores grandes de lana');assert.equal(stored.quantity,5);assert.equal(stored.priceClp,8000);assert.equal(stored.description,'Artesanía hecha con fibras vegetales.');
  assert.equal((await visitor.listPublicProducts(fixture.shopId)).length,0);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).every(key=>key==='conectasur-accessibility-v1')),true);
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('Flores grandes de lana')),false);
  checks.push('Confirmar guarda nombre, descripción, precio y cantidad reales; producto oculto sigue privado; localStorage solo conserva preferencias');
  await page.setViewportSize({width:320,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.getByRole('button',{name:'Volver a Mi tienda',exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
  await page.getByLabel('Correo electrónico',{exact:true}).fill(config.accounts.admin.email);await page.getByLabel('Contraseña',{exact:true}).fill(config.accounts.admin.password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  checks.push('Tamaño muy grande y contraste sin desborde en catálogo y panel administrativo a 320 px');
  await context.close();

  const noSpanish=await browser.newContext();await noSpanish.addInitScript(mockVoice);await noSpanish.addInitScript(()=>window.speechSynthesis.getVoices=()=>[]);
  const missingVoice=await noSpanish.newPage();await missingVoice.goto(new URL('#ingresar',base).href);await missingVoice.getByLabel('Correo electrónico',{exact:true}).waitFor();await missingVoice.locator('#access-read').click();
  await missingVoice.locator('#access-status').filter({hasText:'No encontramos una voz en español'}).waitFor();assert.equal(await missingVoice.evaluate(()=>window.__accessTest.spoken.length),0);await noSpanish.close();
  checks.push('Sin voz española instalada se informa el límite y no se utiliza una voz inglesa');

  const unavailable=await browser.newContext();await unavailable.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});});
  const noVoice=await unavailable.newPage();noVoice.on('pageerror',error=>errors.push(error.message));await noVoice.goto(new URL('#ingresar',base).href);await noVoice.getByLabel('Correo electrónico',{exact:true}).fill('cuenta@ejemplo.cl');await noVoice.locator('#access-read').click();
  assert.match(await noVoice.locator('#access-status').innerText(),/no tiene lectura en voz alta/);assert.equal(await noVoice.getByLabel('Correo electrónico',{exact:true}).inputValue(),'cuenta@ejemplo.cl');await unavailable.close();
  checks.push('Sin síntesis de voz se explica el límite y el formulario sigue funcionando');
  const blocked=await browser.newContext();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('No permitido','SecurityError');}}));
  const noStorage=await blocked.newPage();noStorage.on('pageerror',error=>errors.push(error.message));await noStorage.goto(new URL('#ingresar',base).href);await noStorage.getByLabel('Correo electrónico',{exact:true}).waitFor();await noStorage.locator('#access-size').selectOption('large');
  assert.equal(await noStorage.locator('html').getAttribute('data-text-size'),'large');assert.match(await noStorage.locator('#access-status').innerText(),/no permitió recordarla/);await blocked.close();
  checks.push('Almacenamiento bloqueado no rompe las ayudas: se aplican y se informa que no se recordarán');
  const publicContext=await browser.newContext({viewport:{width:1440,height:1050}});await publicContext.addInitScript(mockVoice);const publicPage=await publicContext.newPage();await publicPage.goto(base);await publicPage.locator('.catalog-open').first().waitFor();
  await publicPage.locator('.catalog-open').first().click();const publicDialog=publicPage.locator('.product-dialog[open]');await publicDialog.getByRole('button',{name:'Escuchar producto',exact:true}).click();await publicPage.waitForFunction(()=>window.__accessTest.spoken.length>0);await publicDialog.getByRole('button',{name:'Cerrar',exact:true}).click();await publicPage.evaluate(()=>window.__accessTest.spoken=[]);await publicPage.locator('#access-read').click();await publicPage.waitForFunction(()=>window.__accessTest.spoken.some(value=>value.text.includes('hecho cerca de ti')));await publicPage.locator('#access-stop').click();
  checks.push('Ficha pública tiene lectura propia; al cerrarla, Escuchar esta pantalla vuelve al contenido de la portada');
  await publicPage.screenshot({path:fileURLToPath(new URL('portada-ayudas.png',output))});await publicContext.close();
  assert.deepEqual(errors,[]);checks.push('Sin errores JavaScript en los recorridos probados');
  writeFileSync(new URL('verification.json',output),JSON.stringify({checkedAt:new Date().toISOString(),url:base,passed:checks.length,checks,limits:['Síntesis y reconocimiento simulados: se verifica integración, estados y texto CLP, no sonido ni exactitud de micrófono reales','Navegador móvil emulado; pendiente validar voces, permisos, TalkBack y comprensión con emprendedoras en sus teléfonos','Conexión y guardado comprobados contra Supabase real mediante fixtures propios eliminados al terminar']},null,2)+'\n');console.log(JSON.stringify({passed:checks.length,checks}));
} finally {
  await browser?.close();
  try{if(fixture)await query(`begin;delete from public.shop_associations where shop_id=${literal(fixture.shopId)};update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);}
  finally{for(const client of [admin,owner,visitor]){await client.logout().catch(()=>{});await client.dispose();}}
}
