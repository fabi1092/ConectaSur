// Pruebas contra la instancia exclusiva SurCode. Datos aislados y cuentas ficticias eliminadas al terminar.
// API de cliente con anon + JWT de cada perfil; Studio solo prepara/limpia fixtures.
import { before,after,describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { api,query,settings,literal } from '../tools/admin.mjs';

const run='sec_'+randomUUID().replaceAll('-','').slice(0,12);
let admin,ana,bea,buyer,off; const users=[];const shops=[];
const administrativeFixtures={associations:[],entrepreneur_types:[],categories:[],product_types:[]};
const ok=(r)=>{assert.ok(r.ok,JSON.stringify({status:r.status,error:r.data?.message??r.data?.error}));return r.data;};
const denied=(r)=>assert.equal(r.ok,false,'La operacion indebida fue aceptada');
async function signin(account){return ok(await api('/auth/v1/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}})).access_token;}
async function account(name){
  const response=ok(await api('/auth/v1/signup',{method:'POST',body:{email:run+'_'+name+'@demo.conectasur.cl',password:randomBytes(24).toString('base64url'),data:{display_name:'Prueba '+name}}}));
  assert.ok(response.access_token,'Autoconfirmacion requerida en la instancia de clase');
  const value={uid:response.user.id,token:response.access_token}; users.push(value.uid);return value;
}
const rpc=(name,body,token)=>api('/rest/v1/rpc/'+name,{method:'POST',body,token});
const product=(id,shop,extra={})=>({id,shop_id:shop,name:'Prueba',description:'Producto ficticio',category:'Artesanías',price_clp:8000,show_price:true,stock_mode:'UNITS',quantity:3,visible:true,photo:'flores',variants:[],...extra});
const save=(value,token)=>api('/rest/v1/products',{method:'POST',body:value,token,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});
const read=async(table,filter,token)=>{
  // Solo lecturas ante fallos transitorios del gateway; nunca repetir escrituras.
  for(let attempt=0;attempt<3;attempt++){
    const result=await api('/rest/v1/'+table+'?select=*&'+filter,{token});
    if(![502,503,504].includes(result.status)||attempt===2)return result;
    await new Promise(resolve=>setTimeout(resolve,200*(attempt+1)));
  }
};
const sale=(owner,id,quantity=1,variant=null,request=randomUUID())=>rpc('register_sale',{p_shop_id:owner.shop,p_product_id:id,p_variant_id:variant,p_quantity:quantity,p_place:'Prueba automatizada',p_request_id:request},owner.token);

before(async()=>{
  assert.equal(settings().url,'https://supabase-surcode.codepulse.cl','No ejecutar contra otro grupo');
  admin=await signin(settings().accounts.admin);
  ana=await account('ana');bea=await account('bea');buyer=await account('buyer');off=await account('off');
  for(const [i,owner] of [ana,bea,off].entries()){
    owner.shop=ok(await rpc('provision_entrepreneur',{p_uid:owner.uid,p_name:'Prueba '+i,p_shop_name:'Tienda de pruebas '+i},admin));shops.push(owner.shop);
  }
  ok(await rpc('set_entrepreneur_active',{p_uid:off.uid,p_shop_id:off.shop,p_active:false},admin));
});
after(async()=>{
  // IDs únicos registrados antes de cada escritura: limpiar incluso una respuesta perdida.
  for(const [table,ids] of Object.entries(administrativeFixtures))if(ids.length)
    await query(`delete from public.${table} where id in (${ids.map(literal).join(',')})`);
  if(!users.length)return;
  const uidList=users.map(literal).join(',');const shopList=shops.length?shops.map(literal).join(','):"''";
  await query(`begin;
    delete from public.sales where shop_id in (${shopList});
    delete from public.products where shop_id in (${shopList});
    delete from app_private.sale_requests where owner_uid in (${uidList});
    update public.profiles set role='comprador',shop_id=null where id in (${uidList});
    delete from public.shops where id in (${shopList});
    delete from auth.users where id in (${uidList});
    commit;`);
});

describe('Perfiles y permisos RLS',()=>{
  it('visitante puede consultar catalogo, tiendas y listas publicas',async()=>{
    for(const table of ['public_products','public_shops','categories','associations','product_types','entrepreneur_types']) assert.ok(ok(await read(table,'',undefined)).length>0);
  });
  it('visitante NO lee perfiles, stock ni ventas',async()=>{
    for(const table of ['profiles','products','sales']) denied(await read(table,'',undefined));
  });
  it('la cuenta nueva solo recibe perfil comprador; no controla rol con sus metadatos',async()=>{
    const rows=ok(await read('profiles','id=eq.'+buyer.uid,buyer.token));assert.equal(rows[0].role,'comprador');
    const change=await api('/rest/v1/profiles?id=eq.'+buyer.uid,{method:'PATCH',body:{role:'admin'},token:buyer.token});
    // PostgREST puede devolver exito con cero filas por RLS: se verifica el estado final.
    if(change.ok)assert.equal(ok(await read('profiles','id=eq.'+buyer.uid,buyer.token))[0].role,'comprador');
  });
  it('comprador NO crea tiendas ni usa aprovisionamiento administrativo',async()=>{
    denied(await api('/rest/v1/shops',{method:'POST',body:{id:run,owner_uid:buyer.uid,name:'Ajena'},token:buyer.token}));
    denied(await rpc('provision_entrepreneur',{p_uid:buyer.uid,p_name:'Intruso',p_shop_name:'Ajena'},buyer.token));
  });
  it('emprendedora NO modifica owner_uid ni active de su tienda',async()=>{
    for(const body of [{owner_uid:bea.uid},{active:false}])denied(await api('/rest/v1/shops?id=eq.'+ana.shop,{method:'PATCH',body,token:ana.token}));
  });
  it('emprendedora NO puede editar una tienda ajena',async()=>{
    await api('/rest/v1/shops?id=eq.'+bea.shop,{method:'PATCH',body:{name:'Ataque'},token:ana.token});
    const rows=ok(await read('shops','id=eq.'+bea.shop,bea.token));assert.notEqual(rows[0].name,'Ataque');
  });
  it('admin puede gestionar asociaciones y la accion queda registrada',async()=>{
    const id=run+'_assoc';ok(await api('/rest/v1/associations',{method:'POST',body:{id,name:'Prueba'},token:admin}));
    const rows=ok(await read('admin_actions','target_id=eq.'+id,admin));assert.equal(rows[0].action,'INSERT');assert.ok(rows[0].actor_uid);
    ok(await api('/rest/v1/associations?id=eq.'+id,{method:'DELETE',token:admin}));
  });
  it('comprador NO consulta ni falsifica el registro del administrador',async()=>{
    assert.deepEqual(ok(await read('admin_actions','',buyer.token)),[]);
    denied(await api('/rest/v1/admin_actions',{method:'POST',body:{action:'FAKE',target_table:'shops'},token:buyer.token}));
  });
  it('solo admin crea y desactiva asociaciones; otras cuentas no las editan ni borran',async()=>{
    const id=run+'_auth_assoc';administrativeFixtures.associations.push(id);
    ok(await api('/rest/v1/associations',{method:'POST',body:{id,name:'Asociación de prueba'},token:admin}));
    for(const [i,token] of [ana.token,buyer.token,off.token,undefined].entries()){
      const other=id+'_'+i;administrativeFixtures.associations.push(other);
      const create=await api('/rest/v1/associations',{method:'POST',body:{id:other,name:'No autorizado'},token});assert.ok([401,403].includes(create.status));
      await api('/rest/v1/associations?id=eq.'+id,{method:'PATCH',body:{active:false,name:'Cambio indebido'},token});
      await api('/rest/v1/associations?id=eq.'+id,{method:'DELETE',token});
      const rows=ok(await read('associations','id=eq.'+id,admin));assert.equal(rows.length,1);assert.equal(rows[0].active,true);assert.equal(rows[0].name,'Asociación de prueba');
    }
    ok(await api('/rest/v1/associations?id=eq.'+id,{method:'PATCH',body:{active:false},token:admin}));
    assert.equal(ok(await read('associations','id=eq.'+id,admin))[0].active,false);
  });
  it('solo admin mantiene tipos de emprendimiento, tipos de producto y categorías',async()=>{
    for(const table of ['entrepreneur_types','product_types','categories']){
      const id=run+'_catalog';administrativeFixtures[table].push(id);
      ok(await api('/rest/v1/'+table,{method:'POST',body:{id,name:'Catálogo de prueba'},token:admin}));
      for(const [i,token] of [ana.token,buyer.token,off.token,undefined].entries()){
        const other=id+'_'+i;administrativeFixtures[table].push(other);
        const create=await api('/rest/v1/'+table,{method:'POST',body:{id:other,name:'No autorizado'},token});assert.ok([401,403].includes(create.status));
        await api('/rest/v1/'+table+'?id=eq.'+id,{method:'PATCH',body:{name:'Cambio indebido'},token});
        await api('/rest/v1/'+table+'?id=eq.'+id,{method:'DELETE',token});
        const rows=ok(await read(table,'id=eq.'+id,admin));assert.equal(rows.length,1);assert.equal(rows[0].name,'Catálogo de prueba');
      }
      ok(await api('/rest/v1/'+table+'?id=eq.'+id,{method:'PATCH',body:{name:'Catálogo corregido'},token:admin}));
      assert.equal(ok(await read(table,'id=eq.'+id,admin))[0].name,'Catálogo corregido');
    }
  });
});

describe('Productos, variantes y privacidad',()=>{
  it('dueña crea y lee su producto; otras cuentas no leen su stock',async()=>{
    const id=run+'_own';ok(await save(product(id,ana.shop),ana.token));
    assert.equal(ok(await read('products','id=eq.'+id,ana.token))[0].quantity,3);
    for(const token of [bea.token,buyer.token,admin])assert.deepEqual(ok(await read('products','id=eq.'+id,token)),[]);
    const pub=ok(await read('public_products','id=eq.'+id));assert.equal(pub.length,1);assert.equal('quantity' in pub[0],false);
  });
  const invalid={
    'stock negativo':{quantity:-1},'stock decimal':{quantity:1.5},'stock textual':{quantity:'tres'},
    'stock nulo por unidades':{quantity:null},'precio negativo':{price_clp:-1},'nombre vacio':{name:''},
    'descripcion excesiva':{description:'a'.repeat(1001)},'modalidad invalida':{stock_mode:'OTRA'},
    'pieza unica con varias unidades':{stock_mode:'UNIQUE',quantity:2},'tienda ajena':{shop_id:'shop_demo_bea'},
    'opciones incompletas':{variants:[{id:'S',quantity:1}]},'opcion negativa':{variants:[{id:'S',label:'S',quantity:-1}]},
    'IDs de opcion repetidos':{variants:[{id:'S',label:'S',quantity:1},{id:'S',label:'S',quantity:2}]},
    'atributos con tipo incorrecto':{attributes:[]},'campo inesperado':{unknown:'valor'},
  };
  for(const [name,changes] of Object.entries(invalid))it('rechaza '+name,async()=>denied(await save(product(run+'_invalid',ana.shop,changes),ana.token)));
  it('no se puede cambiar la tienda ni el identificador de un producto existente',async()=>{
    const id=run+'_immutable';ok(await save(product(id,ana.shop),ana.token));
    for(const body of [{shop_id:bea.shop},{id:run+'_changed'}])denied(await api('/rest/v1/products?id=eq.'+id,{method:'PATCH',body,token:ana.token}));
  });
  it('calcula stock de opciones en el servidor y elimina stock de la vista publica',async()=>{
    const id=run+'_variants';ok(await save(product(id,ana.shop,{quantity:999,variants:[{id:'S',label:'S',quantity:1},{id:'M',label:'M',quantity:2}]}),ana.token));
    assert.equal(ok(await read('products','id=eq.'+id,ana.token))[0].quantity,3);
    for(const variant of ok(await read('public_products','id=eq.'+id))[0].variants)assert.equal('quantity' in variant,false);
  });
  it('acepta mas de diez variantes sin el limite anterior de Firestore',async()=>{
    ok(await save(product(run+'_many',ana.shop,{variants:Array.from({length:20},(_,i)=>({id:String(i),label:String(i),quantity:1}))}),ana.token));
  });
  it('precio oculto por producto nunca sale en la vista publica',async()=>{
    const id=run+'_price';ok(await save(product(id,ana.shop,{show_price:false,variants:[{id:'S',label:'S',quantity:1,priceClp:15000}]}),ana.token));
    const pub=ok(await read('public_products','id=eq.'+id))[0];assert.equal(pub.price_clp,null);assert.equal(pub.variants[0].priceClp,null);
  });
  it('ocultar precios de tienda retira tambien precios ya publicados',async()=>{
    const id=run+'_shopprice';ok(await save(product(id,ana.shop),ana.token));
    try{
      ok(await api('/rest/v1/shops?id=eq.'+ana.shop,{method:'PATCH',body:{show_prices:false},token:ana.token}));
      assert.equal(ok(await read('public_products','id=eq.'+id))[0].price_clp,null);
    }finally{ok(await api('/rest/v1/shops?id=eq.'+ana.shop,{method:'PATCH',body:{show_prices:true},token:ana.token}));}
  });
  it('invisibles y agotados salen del catalogo; pedidos sin stock siguen visibles',async()=>{
    for(const [suffix,extra,count] of [['hidden',{visible:false},0],['empty',{quantity:0},0],['order',{stock_mode:'ON_REQUEST',quantity:null},1]]){
      const id=run+'_'+suffix;ok(await save(product(id,ana.shop,extra),ana.token));assert.equal(ok(await read('public_products','id=eq.'+id)).length,count);
    }
  });
  it('una cuenta desactivada NO escribe productos ni vende',async()=>{
    denied(await save(product(run+'_off',off.shop),off.token));denied(await sale(off,run+'_off'));
  });
});

describe('Ventas atomicas y privadas',()=>{
  it('rechaza cantidades cero, negativas y fraccionarias',async()=>{
    const id=run+'_quant';ok(await save(product(id,ana.shop),ana.token));for(const n of [0,-1,1.5])denied(await sale(ana,id,n));
  });
  it('descuenta stock, registra venta y oculta la pieza unica en una operacion',async()=>{
    const id=run+'_unique';ok(await save(product(id,ana.shop,{stock_mode:'UNIQUE',quantity:1}),ana.token));
    const result=ok(await sale(ana,id));assert.ok(result);
    assert.equal(ok(await read('products','id=eq.'+id,ana.token))[0].quantity,0);
    assert.equal(ok(await read('public_products','id=eq.'+id)).length,0);
    assert.equal(ok(await read('sales','id=eq.'+result,ana.token))[0].quantity,1);
    for(const token of [admin,bea.token,buyer.token])assert.deepEqual(ok(await read('sales','id=eq.'+result,token)),[]);
  });
  it('dos ventas simultaneas de la ultima unidad permiten solo una',async()=>{
    const id=run+'_race';ok(await save(product(id,ana.shop,{quantity:1}),ana.token));
    const results=await Promise.all([sale(ana,id),sale(ana,id)]);assert.equal(results.filter(r=>r.ok).length,1);
    assert.equal(ok(await read('products','id=eq.'+id,ana.token))[0].quantity,0);
  });
  it('repetir la misma solicitud NO descuenta dos veces',async()=>{
    const id=run+'_retry',request=randomUUID();ok(await save(product(id,ana.shop),ana.token));
    ok(await sale(ana,id,1,null,request));ok(await sale(ana,id,1,null,request));
    assert.equal(ok(await read('products','id=eq.'+id,ana.token))[0].quantity,2);
    denied(await sale(ana,id,2,null,request));
  });
  it('vende solo la variante elegida y toma su propio precio',async()=>{
    const id=run+'_vsale';ok(await save(product(id,ana.shop,{variants:[{id:'S',label:'S',quantity:1},{id:'M',label:'M',quantity:2,priceClp:10000}]}),ana.token));
    const result=ok(await sale(ana,id,1,'M'));const value=ok(await read('products','id=eq.'+id,ana.token))[0];
    assert.equal(value.variants[0].quantity,1);assert.equal(value.variants[1].quantity,1);assert.equal(value.quantity,2);
    assert.equal(ok(await read('sales','id=eq.'+result,ana.token))[0].price_clp,10000);
    denied(await sale(ana,id,1,'noexiste'));
  });
  it('pedidos no se agotan y el historial opcional se respeta',async()=>{
    const id=run+'_nohist';ok(await save(product(id,ana.shop,{stock_mode:'ON_REQUEST',quantity:null}),ana.token));
    try{
      ok(await api('/rest/v1/shops?id=eq.'+ana.shop,{method:'PATCH',body:{history_enabled:false},token:ana.token}));
      const result=ok(await sale(ana,id,20));assert.deepEqual(ok(await read('sales','id=eq.'+result,ana.token)),[]);
      assert.equal(ok(await read('products','id=eq.'+id,ana.token))[0].quantity,null);
    }finally{ok(await api('/rest/v1/shops?id=eq.'+ana.shop,{method:'PATCH',body:{history_enabled:true},token:ana.token}));}
  });
  it('NO permite insertar ni falsificar ventas directamente desde ningun cliente',async()=>{
    for(const token of [ana.token,bea.token,buyer.token,admin])denied(await api('/rest/v1/sales',{method:'POST',token,body:{id:randomUUID(),shop_id:ana.shop,product_id:'x',product_name:'x',quantity:1,price_clp:1}}));
  });
});

describe('Storage real: fotos y logos',()=>{
  // PNG de un pixel. Archivo real, no texto rotulado como imagen.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2S8AAAAASUVORK5CYII=','base64');
  async function upload(path,token,data=png,type='image/png'){
    const c=settings();const r=await fetch(c.url+'/storage/v1/object/shop-images/'+path,{method:'POST',headers:{'User-Agent':'ConectaSur-migration-review',apikey:c.anonKey,Authorization:'Bearer '+(token??c.anonKey),'Content-Type':type,'x-upsert':'true'},body:data});
    return {ok:r.ok,status:r.status,data:await r.json()};
  }
  it('dueña sube y descarga una imagen de su carpeta; otras cuentas no la sobrescriben',async()=>{
    const path=ana.shop+'/'+run+'.png';
    try{
      ok(await upload(path,ana.token));
      const c=settings();const image=await fetch(c.url+'/storage/v1/object/public/shop-images/'+path,{headers:{'User-Agent':'ConectaSur-migration-review'}});
      assert.equal(image.status,200);assert.equal((await image.arrayBuffer()).byteLength,png.length);
      for(const token of [bea.token,buyer.token,undefined])denied(await upload(path,token));
    }finally{await api('/storage/v1/object/shop-images',{method:'DELETE',body:{prefixes:[path]},token:ana.token});}
  });
  it('bloquea carpeta ajena, cuenta desactivada, MIME no imagen y exceso de 2 MiB',async()=>{
    denied(await upload(bea.shop+'/'+run+'.png',ana.token));denied(await upload(off.shop+'/'+run+'.png',off.token));
    denied(await upload(ana.shop+'/'+run+'.txt',ana.token,Buffer.from('texto'),'text/plain'));
    denied(await upload(ana.shop+'/'+run+'_big.png',ana.token,Buffer.alloc(2097153)));
  });
});
