import { before,after,describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { createDataLayer } from '../../web/supabase-data.js';
import { settings,query,literal } from '../tools/admin.mjs';
let admin,buyer,ana;const created=[];let shopId,uid;
before(()=>{
  const c=settings();const config={url:c.url,anonKey:c.anonKey};
  admin=createDataLayer(config);buyer=createDataLayer(config);ana=createDataLayer(config);
});
after(async()=>{
  if(shopId){await query(`begin;delete from public.shop_associations where shop_id=${literal(shopId)};
    update public.profiles set role='comprador',shop_id=null where id=${literal(uid)};
    delete from public.shops where id=${literal(shopId)};delete from auth.users where id=${literal(uid)};commit;`);}
  for(const layer of [admin,buyer,ana]){await layer.logout().catch(()=>{});await layer.dispose();}
});
describe('Capa web Supabase real',()=>{
  it('consulta catalogo y campos CLP sin descargar stock',async()=>{
    const products=await buyer.listPublicProducts();assert.ok(products.length>=5);
    assert.equal(products.find(p=>p.id==='flores').priceClp,8000);
    assert.equal(products.find(p=>p.id==='pedido').priceClp,null);
    assert.equal('quantity' in products[0],false);
  });
  it('inicia sesion con comprador y rechaza operaciones administrativas',async()=>{
    const a=settings().accounts.buyer;const session=await buyer.login(a.email,a.password);assert.equal(session.role,'comprador');
    await assert.rejects(buyer.saveAssociation('web_intruso',{name:'Intruso'}),/administradora/);
  });
  it('inicia sesion con emprendedora y actualiza su tienda',async()=>{
    const a=settings().accounts.ana;const session=await ana.login(a.email,a.password);assert.equal(session.shopId,'shop_demo_ana');
    const shop=await ana.getShop(session.shopId);assert.equal(shop.name,'Tejidos de Alerce');
    await ana.updateShop(session.shopId,{description:shop.description});
    await assert.rejects(ana.updateShop(session.shopId,{ownerUid:'intruso'}),/no permitido/);
  });
  it('el administrador crea perfil y tienda conservando su sesion',async()=>{
    const a=settings().accounts.admin;const session=await admin.login(a.email,a.password);
    const result=await admin.createEmprendedora({email:'web_'+randomUUID()+'@demo.conectasur.cl',password:randomBytes(24).toString('base64url'),displayName:'Prueba web',shopName:'Tienda prueba web'});
    shopId=result.shopId;uid=result.uid;created.push(result.uid);
    assert.equal((await admin.currentSession()).uid,session.uid);
    assert.equal((await admin.listShops()).find(s=>s.id===shopId).ownerUid,uid);
    assert.ok((await admin.listAdminActions()).some(a=>a.target_id===shopId));
  });
  it('desactivar una emprendedora retira su tienda de la proyeccion publica',async()=>{
    await admin.setEmprendedoraActive(uid,shopId,false);assert.equal(await buyer.getShop(shopId),null);
    await admin.setEmprendedoraActive(uid,shopId,true);assert.ok(await buyer.getShop(shopId));
  });
  it('el administrador mantiene listas con nombres anteriores y bloquea colecciones arbitrarias',async()=>{
    assert.ok((await admin.listItems('productTypes')).length>0);
    await assert.rejects(admin.saveListItem('profiles','x','x'),/Lista no permitida/);
  });
  it('logout elimina la sesion y bloquea la administracion',async()=>{
    await admin.logout();assert.equal(await admin.currentSession(),null);
    await assert.rejects(admin.listShops());
  });
});
