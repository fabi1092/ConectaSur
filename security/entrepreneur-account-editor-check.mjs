import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createDataLayer} from '../web/supabase-data.js';
import {createEntrepreneurAccountData} from '../web/entrepreneur-account-data.js';
import {settings,query,literal} from '../supabase/tools/admin.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const c=settings(),db=createDataLayer({url:c.url,anonKey:c.anonKey}),data=createEntrepreneurAccountData(db);
const base=process.env.ACCOUNT_EDITOR_URL||'http://127.0.0.1:5174/',suffix=randomUUID().slice(0,8),initial='Emprendedora de prueba '+suffix,renamed='Nombre actualizado '+suffix,shopName='Tienda de cuenta '+suffix,email='account_'+randomUUID()+'@example.com',password=randomBytes(24).toString('base64url');
const output=new URL('./reports/entrepreneur-account-editor/',import.meta.url);mkdirSync(output,{recursive:true});
let fixture,browser,page,fakeName=initial,mode='ok',rpcCalls=0;
const checks=[],errors=[];
try{
  await db.login(c.accounts.admin.email,c.accounts.admin.password);
  fixture=await db.createEmprendedora({email,password,displayName:initial,shopName});
  assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,initial);
  checks.push('Lectura real del nombre de cuenta de una emprendedora temporal desde profiles');
  browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'#ingresar');await page.getByLabel('Correo electrónico',{exact:true}).fill(c.accounts.admin.email);await page.getByLabel('Contraseña',{exact:true}).fill(c.accounts.admin.password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();
  const nav=()=>page.locator('[data-section="emprendedoras"]'),row=()=>page.locator('#tabla-tiendas tbody tr').filter({hasText:shopName}),field=()=>page.getByLabel('Nombre de la emprendedora',{exact:true});
  const list=async()=>{await page.locator('#tiendas-search:enabled').waitFor();await page.locator('#tiendas-search').fill(suffix);await row().waitFor();};
  const edit=async()=>{await row().getByRole('button',{name:'Editar cuenta',exact:true}).click();await field().waitFor();};
  const save=()=>page.getByRole('button',{name:'Guardar nombre',exact:true}).click();
  await nav().click();await list();await row().getByText('Emprendedora: '+initial,{exact:true}).waitFor();assert.equal(await row().getByRole('button',{name:'Editar tienda',exact:true}).count(),1);
  await page.screenshot({path:fileURLToPath(new URL('listado-escritorio.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  checks.push('El listado distingue nombre de cuenta y tienda, con acciones Editar cuenta y Editar tienda');
  await edit();await field().fill('   ');await save();assert.match(await field().evaluate(el=>el.validationMessage),/Escribe/);await field().fill(renamed);
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-section="asociaciones"]').click();assert.equal(await field().inputValue(),renamed);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await list();assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,initial);
  checks.push('Validación de nombre y confirmación de cambios pendientes al cancelar o cambiar de sección');
  await edit();await field().fill(renamed);await save();await page.getByRole('alert').filter({hasText:'aún no está habilitado'}).waitFor();assert.equal(await field().inputValue(),renamed);assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,initial);
  await page.screenshot({path:fileURLToPath(new URL('funcion-pendiente.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  checks.push('La API real sin función muestra pendiente de habilitación y conserva el nombre sin afirmar un guardado');
  // A partir de aquí se simula el contrato que implementará el compañero. No escribe profiles real.
  await page.route('**/rest/v1/profiles*',async route=>{
    if(route.request().method()!=='GET')return route.continue();
    const response=await route.fetch();if(!response.ok())return route.fulfill({response});
    const rows=await response.json();if(!Array.isArray(rows))return route.fulfill({response});
    await route.fulfill({response,json:rows.map(item=>item.id===fixture.uid?{...item,display_name:fakeName}:item)});
  });
  await page.route('**/rest/v1/rpc/update_entrepreneur_account',async route=>{
    const args=route.request().postDataJSON();rpcCalls++;
    if(args.p_uid!==fixture.uid || args.p_shop_id!==fixture.shopId)return route.fulfill({status:403,json:{code:'CS005',message:'Cuenta no coincidente'}});
    if(mode==='network'){mode='ok';return route.fulfill({status:503,json:{message:'Fallo simulado'}});}
    if(fakeName!==args.p_expected_name && fakeName!==args.p_name)return route.fulfill({status:409,json:{code:'CS004',message:'Conflicto simulado'}});
    if(mode!=='unconfirmed')fakeName=args.p_name.trim();
    if(mode==='lost'){mode='ok';return route.abort('failed');}
    return route.fulfill({status:200,body:'null',contentType:'application/json'});
  });
  mode='network';await save();await page.getByRole('alert').filter({hasText:'Conservamos el nombre escrito'}).waitFor();assert.equal(await field().inputValue(),renamed);
  mode='lost';await save();await page.getByRole('alert').filter({hasText:'Conservamos el nombre escrito'}).waitFor();assert.equal(fakeName,renamed);
  await save();await list();await row().getByText('Emprendedora: '+renamed,{exact:true}).waitFor();
  await page.reload();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();await nav().click();await list();await row().getByText('Emprendedora: '+renamed,{exact:true}).waitFor();
  checks.push('Contrato simulado: fallo de red y pérdida de respuesta permiten reintentar, releer y recargar la pantalla');
  await page.locator('#tiendas-search').fill(renamed.toUpperCase());assert.equal(await row().count(),1);
  await edit();const typed='Cambio desde formulario antiguo '+suffix;await field().fill(typed);fakeName='Cambio de otra sesión '+suffix;await save();await page.getByRole('alert').filter({hasText:'cambió en otra sesión'}).waitFor();assert.equal(await field().inputValue(),typed);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cancelar',exact:true}).click();await list();
  checks.push('Contrato simulado: búsqueda por nombre de persona y rechazo de una edición desactualizada');
  await edit();await field().fill(renamed);mode='unconfirmed';await save();await page.getByRole('alert').filter({hasText:'No pudimos confirmar el nombre guardado'}).waitFor();assert.equal(await field().inputValue(),renamed);mode='ok';await save();await list();
  checks.push('Contrato simulado: no se anuncia éxito hasta que la lectura posterior confirma el nombre');
  await edit();await page.screenshot({path:fileURLToPath(new URL('editar-escritorio.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:320,height:740});await page.locator('#access-size').selectOption('largest');await page.getByRole('button',{name:'Más contraste',exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:fileURLToPath(new URL('editar-accesible.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
  checks.push('Editor usable a 390 y 320 px con letra grande y contraste, sin desbordes de documento');
  assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,initial);assert.deepEqual(errors,[]);
  checks.push('La simulación no cambia el perfil real y el recorrido no genera errores JavaScript');
  writeFileSync(new URL('verification.json',output),JSON.stringify({checkedAt:new Date().toISOString(),url:base,passed:checks.length,checks,rpcCalls,backendReady:false,mode:'Lecturas/Auth reales y escritura simulada del contrato',limits:['La función update_entrepreneur_account no existe en la instancia consultada','W06/W07 pendientes de integración y guardado real; el reingreso tras recarga simulado no demuestra persistencia en Supabase','Pruebas de interfaz en Chromium y celular emulado, sin usuarias ni teléfono físico','No se alteró el backend compartido, Google o Android']},null,2)+'\n');
  console.log(JSON.stringify({passed:checks.length,backendReady:false,checks}));
}catch(error){let text=error.stack||error.message;if(page && !page.isClosed())text+='\nEstado: '+JSON.stringify(await page.locator('[data-account-status]').allTextContents());for(const secret of [password,c.studioPassword,...Object.values(c.accounts).map(a=>a.password)])if(secret)text=text.replaceAll(secret,'[oculto]');console.error(text);process.exitCode=1;}
finally{await browser?.close();if(fixture)await query(`begin;delete from public.shop_associations where shop_id=${literal(fixture.shopId)};update public.profiles set role='comprador',shop_id=null where id=${literal(fixture.uid)};delete from public.shops where id=${literal(fixture.shopId)};delete from auth.users where id=${literal(fixture.uid)};commit;`);await db.logout().catch(()=>{});await db.dispose();}
