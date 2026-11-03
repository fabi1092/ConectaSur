import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createDataLayer} from '../web/supabase-data.js';
import {settings,query,literal} from '../supabase/tools/admin.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.ENTREPRENEUR_TYPES_URL || 'http://127.0.0.1:5174/';
const c=settings(),config={url:c.url,anonKey:c.anonKey};
const admin=createDataLayer(config),owner=createDataLayer(config),buyer=createDataLayer(config),visitor=createDataLayer(config);
const suffix=randomUUID().slice(0,8),apiId='type_'+randomUUID(),intruderId='type_'+randomUUID();
const apiName='Diseño local de prueba '+suffix,name='Artesanía en fibras (prueba '+suffix+')',renamed='Tejidos y fibras (prueba '+suffix+')';
const typeIds=new Set([apiId,intruderId]),email='types_owner_'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
const checks=[],errors=[],output=new URL('./reports/entrepreneur-types/',import.meta.url);mkdirSync(output,{recursive:true});
let fixture,browser,page;
try{
  await admin.login(c.accounts.admin.email,c.accounts.admin.password);
  fixture=await admin.createEmprendedora({email,password,displayName:'Emprendedora tipos (prueba)',shopName:'Tienda de tipos (prueba)'});
  await owner.login(email,password);await buyer.login(c.accounts.buyer.email,c.accounts.buyer.password);
  await admin.saveEntrepreneurType({id:apiId,name:apiName});
  assert.ok((await visitor.listItems('entrepreneurTypes')).some(t=>t.id===apiId && t.name===apiName));
  for(const client of [owner,buyer]){
    await assert.rejects(client.saveEntrepreneurType({id:apiId,name:'Cambio no permitido',expectedName:apiName}),/administradora/);
    const response=await client.client.from('entrepreneur_types').update({name:'Cambio no permitido'}).eq('id',apiId).select();assert.ok(response.error || response.data.length===0);
  }
  const forbidden=await visitor.client.from('entrepreneur_types').insert({id:intruderId,name:'Intruso'});assert.ok(forbidden.error);
  assert.equal((await admin.listItems('entrepreneurTypes')).find(t=>t.id===apiId).name,apiName);
  checks.push('Lectura pública del catálogo y escritura exclusiva del administrador, también con RLS directo');
  await assert.rejects(admin.saveEntrepreneurType({id:apiId,name:'   ',expectedName:apiName}),e=>e.code==='invalid_entrepreneur_type');
  await assert.rejects(admin.saveEntrepreneurType({id:apiId,name:'x'.repeat(121),expectedName:apiName}),e=>e.code==='invalid_entrepreneur_type');
  await assert.rejects(admin.saveEntrepreneurType({id:intruderId,name:apiName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}),e=>e.code==='duplicate_entrepreneur_type');
  checks.push('Nombres vacíos, largos o repetidos sin distinguir mayúsculas/tildes se rechazan');
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-CL'});
  page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    if(request.method()==='POST' && new URL(request.url()).pathname==='/rest/v1/entrepreneur_types'){
      const data=request.postDataJSON();if(data?.name?.includes(suffix) && data.id)typeIds.add(data.id);
    }
  });
  await page.goto(new URL('#ingresar',base).href);
  async function login(accountEmail,secret){await page.getByLabel('Correo electrónico',{exact:true}).fill(accountEmail);await page.getByLabel('Contraseña',{exact:true}).fill(secret);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();}
  await login(c.accounts.admin.email,c.accounts.admin.password);await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();
  const nav=()=>page.locator('[data-section="tipos-emprendimiento"]');
  const list=async()=>{await page.locator('#entrepreneur-type-search:enabled').waitFor();};
  const row=label=>page.locator('.admin-type-list li').filter({has:page.locator('strong').filter({hasText:label})});
  async function search(text){await page.getByLabel('Buscar tipo de emprendimiento',{exact:true}).fill(text);}
  async function edit(label){await search(label);await row(label).getByRole('button',{name:'Editar '+label,exact:true}).click();await page.locator('#entrepreneur-type-form').waitFor();}
  const field=()=>page.getByLabel('Nombre del tipo de emprendimiento',{exact:true});
  const save=()=>page.getByRole('button',{name:'Guardar tipo',exact:true}).click();
  await nav().click();await list();
  await search(apiName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());assert.equal(await page.locator('.admin-type-list li').count(),1);
  await search('nombre-que-no-existe-'+suffix);await page.getByText('No encontramos tipos con ese nombre. Prueba otra búsqueda.',{exact:true}).waitFor();await search('');
  checks.push('Sección propia con búsqueda que ignora tildes/mayúsculas y estado sin resultados');
  await page.getByRole('button',{name:'Agregar tipo',exact:true}).click();await field().fill('   ');await save();assert.match(await field().evaluate(x=>x.validationMessage),/Escribe/);
  await field().fill(apiName.toLowerCase());await save();await page.getByRole('alert').filter({hasText:'Ya existe un tipo'}).waitFor();
  await field().fill(name);assert.equal(await page.locator('#item-id').count(),0);
  await page.screenshot({path:fileURLToPath(new URL('agregar-escritorio.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  let committed=false;
  await page.route('**/rest/v1/entrepreneur_types*',async route=>{if(route.request().method()==='POST' && !committed){committed=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await save();await page.getByRole('alert').filter({hasText:'Conservamos el nombre escrito'}).waitFor();assert.equal(await field().inputValue(),name);
  const created=(await admin.listItems('entrepreneurTypes')).find(t=>t.name===name);assert.ok(created);typeIds.add(created.id);
  await page.unroute('**/rest/v1/entrepreneur_types*');await save();await list();assert.equal((await admin.listItems('entrepreneurTypes')).filter(t=>t.name===name).length,1);
  checks.push('Agregar genera el identificador automáticamente; reintentar una respuesta perdida conserva una sola fila');
  await page.reload();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();await nav().click();await list();await search(name);assert.equal(await row(name).count(),1);
  checks.push('El nuevo tipo se conserva después de recargar el panel');
  await page.locator('[data-section="asociaciones"]').click();await page.getByRole('button',{name:'+ Nueva asociación',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Borrador sin guardar');
  page.once('dialog',d=>d.dismiss());await nav().click();assert.equal(await page.locator('#asociacion-form').count(),1);
  page.once('dialog',d=>d.accept());await nav().click();await list();
  checks.push('Cambiar a Tipos de emprendimiento respeta los cambios pendientes del editor de asociaciones');
  await owner.updateShop(fixture.shopId,{entrepreneurType:name});
  await edit(name);await field().fill(renamed);
  page.once('dialog',d=>d.dismiss());await page.locator('[data-section="categorias"]').click();assert.equal(await field().inputValue(),renamed);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await list();
  assert.equal((await admin.listItems('entrepreneurTypes')).find(t=>t.id===created.id).name,name);
  checks.push('Editar y cancelar pide confirmación y no modifica el registro');
  await edit(name);await field().fill(renamed);let updated=false;
  await page.route('**/rest/v1/entrepreneur_types*',async route=>{if(route.request().method()==='PATCH' && !updated){updated=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await save();await page.getByRole('alert').filter({hasText:'Conservamos el nombre escrito'}).waitFor();await page.unroute('**/rest/v1/entrepreneur_types*');await save();await list();
  assert.equal((await admin.listItems('entrepreneurTypes')).find(t=>t.id===created.id).name,renamed);
  assert.equal((await visitor.getShop(fixture.shopId)).entrepreneurType,name);
  checks.push('Renombrar conserva el ID y acepta reintentos; no reclasifica las tiendas ya guardadas');
  await edit(renamed);const concurrent='Nombre guardado en otra sesión '+suffix;
  await admin.saveEntrepreneurType({id:created.id,name:concurrent,expectedName:renamed});
  await field().fill('Cambio desde formulario antiguo '+suffix);await save();await page.getByRole('alert').filter({hasText:'El tipo cambió'}).waitFor();
  assert.equal((await admin.listItems('entrepreneurTypes')).find(t=>t.id===created.id).name,concurrent);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await list();
  await edit(concurrent);await field().fill(renamed);await save();await list();
  checks.push('Un formulario desactualizado no sobrescribe el nombre guardado por otra sesión');
  await page.route('**/rest/v1/entrepreneur_types*',route=>route.request().method()==='GET'?route.fulfill({status:503,json:{message:'Fallo simulado'}}):route.continue());
  await nav().click();await page.getByRole('alert').filter({hasText:'No pudimos cargar los tipos'}).waitFor();await page.unroute('**/rest/v1/entrepreneur_types*');await page.getByRole('button',{name:'Intentar nuevamente',exact:true}).click();await list();
  checks.push('Fallo de lectura muestra un reintento y recupera la lista desde Supabase');
  await search(renamed);await page.screenshot({path:fileURLToPath(new URL('listado-escritorio.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('listado-celular.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  await edit(renamed);await page.setViewportSize({width:320,height:740});await page.locator('#access-size').selectOption('largest');await page.getByRole('button',{name:'Más contraste',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('editar-accesible.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();await list();checks.push('Listado y edición sin desbordes en celular, incluidos 320 px con letra grande y alto contraste');
  await page.getByRole('button',{name:'Más contraste',exact:true}).click();await page.locator('#access-size').selectOption('normal');await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-section="emprendedoras"]').click();const shopRow=page.locator('#tabla-tiendas tbody tr').filter({hasText:'Tienda de tipos (prueba)'});await shopRow.getByRole('button',{name:'Editar',exact:true}).click();
  await page.waitForFunction(label=>[...document.querySelectorAll('#admin-shop-type-options option')].some(o=>o.value===label),renamed);
  checks.push('La edición de tienda del administrador sugiere los tipos vigentes');
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();
  await login(email,password);await page.getByRole('heading',{name:'Esta es tu tienda.',exact:true}).waitFor();await page.getByRole('button',{name:'Editar tienda',exact:true}).click();
  await page.waitForFunction(label=>[...document.querySelectorAll('#shop-type-options option')].some(o=>o.value===label),renamed);
  assert.equal(await page.getByLabel('Tipo de emprendimiento',{exact:true}).inputValue(),name);
  await page.getByLabel('Tipo de emprendimiento',{exact:true}).fill(renamed);await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await page.getByRole('heading',{name:'Esta es tu tienda.',exact:true}).waitFor();
  assert.equal((await visitor.getShop(fixture.shopId)).entrepreneurType,renamed);
  checks.push('La emprendedora puede elegir el tipo renombrado desde la web y guardarlo en su ficha compartida');
  assert.deepEqual(errors,[]);checks.push('Sin errores JavaScript durante la gestión y la edición de tienda');
  writeFileSync(new URL('verification.json',output),JSON.stringify({checkedAt:new Date().toISOString(),url:base,passed:checks.length,checks,
    limits:['Chromium con celular emulado; sin prueba física con usuarias','Lecturas, RLS y guardados reales; fallos de lectura/pérdida de respuesta simulados','Cambiar el nombre del catálogo no modifica las cadenas ya guardadas en tiendas; no se añade migración de clasificación','Los tipos con nombres repetidos se detectan antes de guardar; no se añade una restricción única de nombres concurrentes en la base','Se comprueban selectores web; Android mantiene su campo de texto y el mismo dato del backend']},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,checks}));
}catch(error){let text=error.stack || error.message;if(page && !page.isClosed())text+='\nEstado de la pantalla: '+JSON.stringify(await page.locator('[data-type-status]').allTextContents());for(const secret of [password,c.studioPassword,...Object.values(c.accounts).map(a=>a.password)])if(secret)text=text.replaceAll(secret,'[oculto]');console.error(text);process.exitCode=1;}
finally{
  await browser?.close();
  for(const id of typeIds)await query('delete from public.entrepreneur_types where id='+literal(id));
  if(fixture)await query(`begin;delete from public.shop_associations where shop_id=${literal(fixture.shopId)};update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);
  for(const client of [admin,owner,buyer,visitor]){await client.logout().catch(()=>{});await client.dispose();}
}
