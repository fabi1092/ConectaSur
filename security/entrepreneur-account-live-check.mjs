// Guardado REAL de W06/W07. Nunca sustituye la función ausente por una simulación.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createDataLayer} from '../web/supabase-data.js';
import {createEntrepreneurAccountData} from '../web/entrepreneur-account-data.js';
import {settings,query,literal} from '../supabase/tools/admin.mjs';

const base=process.env.ACCOUNT_EDITOR_URL||'http://127.0.0.1:5174/';
const output=new URL('./reports/entrepreneur-account-live/',import.meta.url);mkdirSync(output,{recursive:true});
async function main(){
  const ready=await query("select to_regprocedure('public.update_entrepreneur_account(uuid,text,text,text)') is not null as ready");
  if(!ready[0]?.ready){
    const report={checkedAt:new Date().toISOString(),status:'blocked',passed:0,backendReady:false,reason:'Falta update_entrepreneur_account(uuid,text,text,text). El compañero debe aplicar el contrato.',fixturesCreated:false};
    writeFileSync(new URL('verification.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));process.exitCode=2;return;
  }
  const c=settings(),config={url:c.url,anonKey:c.anonKey};
  const admin=createDataLayer(config),owner=createDataLayer(config),buyer=createDataLayer(config),visitor=createDataLayer(config),otherAdmin=createDataLayer(config),data=createEntrepreneurAccountData(admin);
  const salt=randomUUID(),initial='Cuenta real de prueba '+salt.slice(0,8),renamed='Nombre guardado '+salt.slice(0,8),email='account_live_'+salt+'@example.com',adminEmail='account_admin_'+salt+'@example.com',password=randomBytes(24).toString('base64url'),adminPassword=randomBytes(24).toString('base64url');
  const checks=[];let fixture,adminFixture,creator,browser,page,report,fixturesCleaned=false;
  try{
    const actor=await admin.login(c.accounts.admin.email,c.accounts.admin.password);
    fixture=await admin.createEmprendedora({email,password,displayName:initial,shopName:'Tienda real de prueba '+salt.slice(0,8)});
    await owner.login(email,password);await buyer.login(c.accounts.buyer.email,c.accounts.buyer.password);
    creator=admin.administratorCreation();adminFixture=await creator.create({email:adminEmail,password:adminPassword,displayName:'Administrador temporal de prueba'});
    await otherAdmin.login(adminEmail,adminPassword);await admin.updateAdministrator({...adminFixture,active:false,expectedName:adminFixture.displayName,expectedActive:true});
    const rpc=(client,args)=>client.client.rpc('update_entrepreneur_account',args);
    const command={p_uid:fixture.uid,p_shop_id:fixture.shopId,p_name:renamed,p_expected_name:initial};
    for(const client of [visitor,buyer,owner,otherAdmin])assert.ok((await rpc(client,command)).error,'Un perfil no autorizado aceptó el cambio');
    assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,initial);
    checks.push('Visitante, comprador, emprendedora y administrador inactivo no cambian el nombre mediante RPC directo');
    for(const name of ['   ','a'.repeat(121)])assert.ok((await rpc(admin,{...command,p_name:name})).error,'El servidor aceptó un nombre inválido');
    assert.ok((await rpc(admin,{...command,p_shop_id:'otra_tienda_'+salt})).error);
    assert.ok((await rpc(admin,{...command,p_uid:adminFixture.uid})).error);
    assert.ok((await admin.client.from('profiles').update({display_name:'Salto directo'}).eq('id',fixture.uid)).error);
    checks.push('Validación de nombre, cuenta/tienda coincidentes y prohibición de escritura directa verificadas en servidor');
    await data.rename({uid:fixture.uid,shopId:fixture.shopId,displayName:renamed,expectedName:initial});
    await data.rename({uid:fixture.uid,shopId:fixture.shopId,displayName:renamed,expectedName:initial});
    const profile=(await owner.client.from('profiles').select('id,role,shop_id,active,display_name').eq('id',fixture.uid).single());assert.ifError(profile.error);
    assert.deepEqual(profile.data,{id:fixture.uid,role:'emprendedora',shop_id:fixture.shopId,active:true,display_name:renamed});
    checks.push('Guardado real e idéntico reintento conservan identidad, rol, estado y tienda');
    const concurrent='Nombre de otra sesión '+salt.slice(0,8);
    await data.rename({uid:fixture.uid,shopId:fixture.shopId,displayName:concurrent,expectedName:renamed});
    await assert.rejects(data.rename({uid:fixture.uid,shopId:fixture.shopId,displayName:'Formulario antiguo',expectedName:renamed}),{code:'entrepreneur_account_changed'});
    assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,concurrent);
    checks.push('Una edición desactualizada no sobrescribe el nombre guardado por otra sesión');
    await admin.setEmprendedoraActive(fixture.uid,fixture.shopId,false);
    const inactive=await data.rename({uid:fixture.uid,shopId:fixture.shopId,displayName:renamed,expectedName:concurrent});assert.equal(inactive.active,false);
    await admin.setEmprendedoraActive(fixture.uid,fixture.shopId,true);
    const audit=await admin.client.from('admin_actions').select('actor_uid,action').eq('target_id',fixture.uid);assert.ifError(audit.error);assert.ok(audit.data.some(row=>row.actor_uid===actor.uid&&row.action==='UPDATE'));
    checks.push('Editar una cuenta inactiva conserva su estado y el cambio genera auditoría');
    const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
    browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(25000);
    await page.goto(base+'#ingresar');await page.getByLabel('Correo electrónico',{exact:true}).fill(c.accounts.admin.email);await page.getByLabel('Contraseña',{exact:true}).fill(c.accounts.admin.password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();
    async function list(){await page.locator('[data-section="emprendedoras"]').click();await page.locator('#tiendas-search:enabled').waitFor();await page.locator('#tiendas-search').fill(salt.slice(0,8));}
    await list();const row=()=>page.locator('#tabla-tiendas tbody tr').filter({hasText:'Tienda real de prueba '+salt.slice(0,8)});await row().getByRole('button',{name:'Editar cuenta',exact:true}).click();
    const uiName='Nombre desde el panel '+salt.slice(0,8);await page.getByLabel('Nombre de la emprendedora',{exact:true}).fill(uiName);await page.getByRole('button',{name:'Guardar nombre',exact:true}).click();await page.locator('#tiendas-search:enabled').waitFor();
    await page.reload();await page.getByRole('heading',{name:'Panel administrativo',exact:true}).waitFor();await list();await row().getByText('Emprendedora: '+uiName,{exact:true}).waitFor();
    assert.equal((await data.get({uid:fixture.uid,shopId:fixture.shopId})).displayName,uiName);
    await page.screenshot({path:fileURLToPath(new URL('guardado-real.png',output)),fullPage:true,mask:[page.locator('.page-header p')]});
    checks.push('W06/W07: guardar desde la pantalla y recargar conserva el nombre en Supabase real, sin interceptar respuestas');
    const login=await owner.login(email,password);assert.equal(login.displayName,uiName);assert.equal(login.role,'emprendedora');assert.equal((await admin.listShops()).find(row=>row.id===fixture.shopId).name,'Tienda real de prueba '+salt.slice(0,8));
    checks.push('Las credenciales de la emprendedora siguen funcionando y el nombre de su tienda se conserva');
    report={checkedAt:new Date().toISOString(),status:'passed',passed:checks.length,backendReady:true,url:base,checks,limits:['Chromium; sin prueba física con usuarias','Fixtures propios eliminados al finalizar; sin cambiar cuentas reales del grupo','Esta prueba no valida Google ni publica Hosting']};
  }catch(error){let text=error.stack||error.message;for(const value of [password,adminPassword,c.studioPassword,...Object.values(c.accounts).map(a=>a.password)])if(value)text=text.replaceAll(value,'[oculto]');console.error(text);process.exitCode=1;report={checkedAt:new Date().toISOString(),status:'failed',passed:checks.length,backendReady:true,url:base,checks};}
  finally{
    try{
    await browser?.close();await creator?.dispose().catch(()=>{});
    // Recuperar por correos únicos propios también limpia un alta cuya respuesta se perdió.
    const leftovers=await query('select p.id,p.shop_id from public.profiles p join auth.users u on u.id=p.id where u.email in ('+[email,adminEmail].map(literal).join(',')+')');
    for(const row of leftovers){
      if(row.shop_id)await query(`begin;delete from public.shop_associations where shop_id=${literal(row.shop_id)};update public.profiles set role='comprador',shop_id=null where id=${literal(row.id)};delete from public.shops where id=${literal(row.shop_id)};delete from auth.users where id=${literal(row.id)};commit;`);
      else await query('delete from auth.users where id='+literal(row.id));
    }
    const remaining=await query('select count(*)::int as n from auth.users where email in ('+[email,adminEmail].map(literal).join(',')+')');
    assert.equal(remaining[0].n,0);fixturesCleaned=true;
    }catch{process.exitCode=1;report={...report,status:'failed',cleanupError:'No se confirmó la limpieza de fixtures'};}
    for(const client of [admin,owner,buyer,visitor,otherAdmin]){await client.logout().catch(()=>{});await client.dispose().catch(()=>{});}
    report.fixturesCleaned=fixturesCleaned;
    writeFileSync(new URL('verification.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  }
}
await main();
