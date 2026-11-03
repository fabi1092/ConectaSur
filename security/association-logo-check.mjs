import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDataLayer } from '../web/supabase-data.js';
import { settings,query,literal } from '../supabase/tools/admin.mjs';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.ASSOCIATION_LOGO_URL || 'http://127.0.0.1:5174/';
const c=settings(),config={url:c.url,anonKey:c.anonKey};
const admin=createDataLayer(config),owner=createDataLayer(config),buyer=createDataLayer(config),visitor=createDataLayer(config);
const apiId='assoc_logo_'+randomUUID(),name='Manos Unidas (prueba '+randomUUID().slice(0,6)+')';
const email='assoc_owner_'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
const associations=new Set([apiId]),paths=new Set(),checks=[],errors=[];
const output=new URL('./reports/association-logo/',import.meta.url);mkdirSync(output,{recursive:true});
let browser,fixture;
const imagePath=url=>decodeURIComponent(new URL(url).pathname.split('/object/public/association-images/')[1]);
async function publicBytes(url){const r=await fetch(url);assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());}
try{
  await admin.login(c.accounts.admin.email,c.accounts.admin.password);
  fixture=await admin.createEmprendedora({email,password,displayName:'Prueba permisos de logo',shopName:'Tienda prueba logo'});
  await owner.login(email,password);await buyer.login(c.accounts.buyer.email,c.accounts.buyer.password);
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-CL'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  let uploads=0;
  page.on('request',request=>{
    const u=new URL(request.url()),prefix='/storage/v1/object/association-images/';
    if(request.method()==='POST' && u.pathname.startsWith(prefix)){uploads++;paths.add(decodeURIComponent(u.pathname.slice(prefix.length)));}
  });
  const png=Buffer.from(await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1200;
    const x=canvas.getContext('2d');x.fillStyle='#eef5eb';x.fillRect(0,0,1800,1200);x.fillStyle='#17694e';x.beginPath();x.arc(900,520,320,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.font='bold 260px sans-serif';x.fillText('MU',680,610);x.fillStyle='#103d50';x.font='bold 100px sans-serif';x.fillText('Manos Unidas',540,1030);return canvas.toDataURL('image/png').split(',')[1];
  }),'base64');
  const image=new File([png],'logo.png',{type:'image/png'});
  await admin.saveAssociation(apiId,{name:'Asociación API propia',description:'Prueba temporal',sector:'Alerce',contact:'contacto@ejemplo.cl',logoUrl:null});
  const apiUrl=await admin.uploadAssociationLogo(apiId,image);const apiPath=imagePath(apiUrl);paths.add(apiPath);
  await admin.saveAssociation(apiId,{name:'Asociación API propia',logoUrl:apiUrl});
  assert.deepEqual(await publicBytes(apiUrl),png);
  for(const client of [owner,buyer,visitor]){
    const key=apiId+'/'+randomUUID()+'.png';paths.add(key);
    const upload=await client.client.storage.from('association-images').upload(key,image);assert.ok(upload.error);
    const update=await client.client.storage.from('association-images').update(apiPath,image);assert.ok(update.error);
    const remove=await client.client.storage.from('association-images').remove([apiPath]);assert.ok(remove.error || remove.data.length===0);
    assert.deepEqual(await publicBytes(apiUrl),png);
  }
  await assert.rejects(owner.uploadAssociationLogo(apiId,image),/administradora/);
  await assert.rejects(buyer.saveAssociation(apiId,{name:'Intruso',logoUrl:null}),/administradora/);
  const forbidden=await owner.client.from('associations').update({logo_url:null}).eq('id',apiId).select();assert.ok(forbidden.error || forbidden.data.length===0);
  checks.push('Storage y RLS reales: solo administrador escribe, reemplaza o retira logos; lectura pública funciona');
  await assert.rejects(admin.uploadAssociationLogo('../otra',image),error=>error.code==='invalid_association_logo');
  await assert.rejects(admin.uploadAssociationLogo(apiId,new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'})),error=>error.code==='invalid_association_logo');
  await assert.rejects(admin.uploadAssociationLogo(apiId,new File([new Uint8Array(2097153)],'grande.png',{type:'image/png'})),error=>error.code==='invalid_association_logo');
  const svg=await admin.client.storage.from('association-images').upload(apiId+'/invalid.svg',new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'}));assert.ok(svg.error);
  await assert.rejects(admin.saveAssociation(apiId,{name:'Prueba',logoUrl:'javascript:alert(1)'}),error=>error.code==='invalid_association_logo');
  checks.push('Se rechazan SVG, archivos grandes, rutas inválidas y URL de logo no HTTPS');

  await page.goto(new URL('#ingresar',base).href);
  await page.getByLabel('Correo electrónico',{exact:true}).fill(c.accounts.admin.email);
  await page.getByLabel('Contraseña',{exact:true}).fill(c.accounts.admin.password);
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();
  await page.locator('[data-section="asociaciones"]').click();
  await page.getByRole('button',{name:'+ Nueva asociación',exact:true}).click();
  const fields={name:'#assoc-nombre',description:'#assoc-descripcion',sector:'#assoc-sector',contact:'#assoc-contacto'};
  async function fill(values){for(const [key,value]of Object.entries(values))await page.locator(fields[key]).fill(value);}
  const find=async()=>(await admin.listAssociations()).find(a=>a.name===name);
  const row=()=>page.locator('#lista-asociaciones tbody tr').filter({hasText:name});
  const list=async()=>row().waitFor();
  async function edit(){await row().getByRole('button',{name:'Editar',exact:true}).click();await page.locator('#asociacion-form').waitFor();}
  async function choose(){await page.locator('#assoc-logo').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:png});await page.getByRole('status').filter({hasText:'Logo listo.'}).waitFor();}
  async function save(){await page.getByRole('button',{name:'Guardar asociación',exact:true}).click();await list();}
  await fill({name,description:'Artesanía y trabajo de nuestra comunidad.',sector:'Alerce',contact:'contacto@ejemplo.cl'});
  await choose();assert.equal(uploads,0);assert.equal(await find(),undefined);
  checks.push('Elegir logo prepara vista previa y no sube ni crea la asociación antes de Guardar');
  await page.screenshot({path:fileURLToPath(new URL('crear-escritorio.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  await save();const created=await find();associations.add(created.id);
  assert.ok(created.logo_url);assert.equal(created.description,'Artesanía y trabajo de nuestra comunidad.');assert.equal(created.contact,'contacto@ejemplo.cl');assert.equal(created.sector,'Alerce');
  assert.equal((await publicBytes(created.logo_url))[0],0xff);assert.ok((await publicBytes(created.logo_url)).length<=2097152);
  await row().locator('img').evaluate(img=>img.decode());assert.ok(await row().locator('img').evaluate(img=>img.naturalWidth<=1024));
  checks.push('Crear guarda datos y logo JPEG reducido; el listado lo muestra y el archivo es público');
  await page.reload();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();await page.locator('[data-section="asociaciones"]').click();await list();
  assert.equal(await row().locator('img').getAttribute('src'),created.logo_url);
  checks.push('Logo y asociación se conservan al recargar con sesión');
  await edit();await fill({description:'Descripción actualizada sin cambiar el logo.'});await save();assert.equal((await find()).logo_url,created.logo_url);
  checks.push('Editar otros datos conserva el logo guardado');
  await edit();await choose();
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-section="categorias"]').click();assert.equal(await page.locator('#asociacion-form').count(),1);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await list();assert.equal((await find()).logo_url,created.logo_url);
  checks.push('Salir con cambios pide confirmación; cancelar descarta la imagen preparada sin publicar');
  await edit();await page.locator('#assoc-logo').setInputFiles({name:'malo.txt',mimeType:'text/plain',buffer:Buffer.from('sin imagen')});
  await page.getByRole('alert').filter({hasText:'Elige una imagen'}).waitFor();assert.equal(await page.locator('#assoc-preview img').getAttribute('src'),created.logo_url);
  checks.push('Imagen inválida muestra un error y conserva el logo anterior');
  await choose();
  await page.route('**/storage/v1/object/association-images/**',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Fallo simulado'}}):route.continue());
  await page.getByRole('button',{name:'Guardar asociación',exact:true}).click();await page.getByRole('alert').filter({hasText:'Tus datos y el logo siguen preparados'}).waitFor();assert.equal((await find()).logo_url,created.logo_url);
  await page.unroute('**/storage/v1/object/association-images/**');
  await page.route('**/rest/v1/associations*',route=>route.request().method()==='POST'?route.fulfill({status:503,json:{message:'Fallo simulado'}}):route.continue());
  await page.getByRole('button',{name:'Guardar asociación',exact:true}).click();await page.getByRole('alert').filter({hasText:'Tus datos y el logo siguen preparados'}).waitFor();const count=uploads;
  assert.equal((await find()).logo_url,created.logo_url);
  await page.unroute('**/rest/v1/associations*');await save();assert.equal(uploads,count);const replaced=await find();assert.notEqual(replaced.logo_url,created.logo_url);
  checks.push('Fallos de subida o guardado conservan el formulario; reintentar reutiliza la imagen ya subida');
  await edit();await choose();let committed=false;
  await page.route('**/rest/v1/associations*',async route=>{
    if(route.request().method()==='POST' && !committed){committed=true;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await page.getByRole('button',{name:'Guardar asociación',exact:true}).click();await page.getByRole('alert').filter({hasText:'Tus datos y el logo siguen preparados'}).waitFor();
  const lostCount=uploads,confirmed=await find();assert.notEqual(confirmed.logo_url,replaced.logo_url);
  await page.unroute('**/rest/v1/associations*');await save();assert.equal(uploads,lostCount);assert.equal((await find()).logo_url,confirmed.logo_url);await publicBytes(confirmed.logo_url);
  checks.push('Si se pierde la respuesta tras guardar, reintentar no duplica subida ni borra el logo confirmado');
  await edit();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('editar-celular.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  await page.setViewportSize({width:320,height:740});await page.locator('#access-size').selectOption('largest');await page.getByRole('button',{name:'Más contraste',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('editar-accesible.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  checks.push('Editor usable sin desbordes a 390 px y a 320 px con letra grande y alto contraste');
  await page.getByRole('button',{name:'Quitar logo',exact:true}).click();assert.equal((await find()).logo_url,confirmed.logo_url);await save();assert.equal((await find()).logo_url,null);assert.equal(await row().locator('img').count(),0);
  await page.reload();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();await page.locator('[data-section="asociaciones"]').click();await list();assert.equal(await row().locator('img').count(),0);
  checks.push('Quitar logo se confirma al guardar y permanece retirado después de recargar');
  assert.deepEqual(errors,[]);checks.push('Sin errores JavaScript durante creación, edición, cancelación y reintentos');
  writeFileSync(new URL('verification.json',output),JSON.stringify({checkedAt:new Date().toISOString(),url:base,passed:checks.length,checks,
    limits:['Chromium con celular emulado; sin teléfono físico ni prueba con usuarias','503 y pérdida de respuesta simulados; permisos, Storage y guardados contra Supabase real','Retirar/reemplazar actualiza la referencia; archivos anteriores no se borran automáticamente para evitar borrar una imagen confirmada tras una respuesta perdida','Solo asociaciones, tienda, cuenta y archivos ficticios propios; limpieza al finalizar']},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,checks}));
}catch(error){let text=error.stack || error.message;for(const secret of [password,c.studioPassword,...Object.values(c.accounts).map(a=>a.password)])if(secret)text=text.replaceAll(secret,'[oculto]');console.error(text);process.exitCode=1;}
finally{
  await browser?.close();
  if(paths.size)await admin.client.storage.from('association-images').remove([...paths]);
  for(const id of associations)await query('delete from public.associations where id='+literal(id));
  // Si el primer guardado se confirmó antes de un fallo, su nombre único sigue acotando el fixture.
  await query('delete from public.associations where name='+literal(name));
  if(fixture)await query(`begin;delete from public.shop_associations where shop_id=${literal(fixture.shopId)};update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);
  for(const client of [admin,owner,buyer,visitor]){await client.logout().catch(()=>{});await client.dispose();}
}
