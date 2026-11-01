// Capa de datos web. Instalar npm ci y configurar una sola vez con configureSupabase(config).
import { createClient } from '@supabase/supabase-js';

const unwrap = ({data,error}) => { if(error)throw new Error(error.message);return data; };
const shop = (r) => r && ({ id:r.id, ownerUid:r.owner_uid, name:r.name, description:r.description,
  logoUrl:r.logo_url, entrepreneurType:r.entrepreneur_type, sector:r.sector, contact:r.contact,
  showPrices:r.show_prices, historyEnabled:r.history_enabled, active:r.active });
const product = (r) => ({id:r.id,shopId:r.shop_id,name:r.name,description:r.description,category:r.category,
  productType:r.product_type,attributes:r.attributes,priceClp:r.price_clp,onRequest:r.on_request,photo:r.photo,
  variants:r.variants,updatedAt:r.updated_at});
const shopFields = {name:'name',description:'description',logoUrl:'logo_url',entrepreneurType:'entrepreneur_type',
  sector:'sector',contact:'contact',showPrices:'show_prices',historyEnabled:'history_enabled'};
const listTables = {categories:'categories',productTypes:'product_types',entrepreneurTypes:'entrepreneur_types'};

export function createDataLayer(config,{storage}={}) {
  const url=new URL(config.url);
  if(url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Supabase requiere HTTPS');
  if(!config.anonKey)throw new Error('Falta la clave anon de Supabase');
  // JWT/refresh en sessionStorage del navegador; no IndexedDB ni localStorage.
  const sessionStorage = storage ?? (typeof window==='undefined' ? undefined : window.sessionStorage);
  const sdk=createClient(config.url,config.anonKey,{
    auth:{persistSession:!!sessionStorage,storage:sessionStorage,autoRefreshToken:true,detectSessionInUrl:false},
    global:{fetch:(input,init)=>{
      const headers=new Headers(init?.headers);
      if(typeof window==='undefined')headers.set('User-Agent','ConectaSur-web-tests');
      return fetch(input,{...init,headers});
    }},
  });
  async function profile(){
    const user=unwrap(await sdk.auth.getUser())?.user;
    if(!user)throw new Error('Inicia sesion para continuar');
    const p=unwrap(await sdk.from('profiles').select('*').eq('id',user.id).single());
    if(!p?.active||!['admin','emprendedora','comprador'].includes(p.role))throw new Error('Cuenta desactivada o sin permisos');
    return {uid:user.id,email:user.email,role:p.role,shopId:p.shop_id,displayName:p.display_name,active:p.active};
  }
  async function requireAdmin(){if((await profile()).role!=='admin')throw new Error('Esta accion requiere una cuenta administradora activa');}
  const layer={
    // El SDK solo contiene credenciales de cliente. RLS/RPC siguen siendo la autoridad.
    client:sdk,
    async login(email,password){
      unwrap(await sdk.auth.signInWithPassword({email:email.trim(),password}));
      try{return await profile()}catch(error){await sdk.auth.signOut({scope:'local'});throw error}
    },
    async currentSession(){const session=unwrap(await sdk.auth.getSession())?.session;if(!session)return null;
      try{return await profile()}catch(error){await sdk.auth.signOut({scope:'local'});throw error}},
    async logout(){unwrap(await sdk.auth.signOut({scope:'local'}));},
    onSession(callback){const {data}=sdk.auth.onAuthStateChange((_event,session)=>callback(session?.user??null));return ()=>data.subscription.unsubscribe();},
    async createEmprendedora({email,password,displayName,shopName}){
      await requireAdmin();
      const secondary=createDataLayer(config);
      try{
        const result=unwrap(await secondary.client.auth.signUp({email:email.trim(),password,options:{data:{display_name:displayName}}}));
        if(!result.user?.id)throw new Error('No se pudo crear la cuenta');
        const shopId=unwrap(await sdk.rpc('provision_entrepreneur',{p_uid:result.user.id,p_name:displayName,p_shop_name:shopName}));
        return {uid:result.user.id,shopId};
      }finally{await secondary.client.auth.signOut({scope:'local'});await secondary.dispose();}
    },
    async setEmprendedoraActive(uid,shopId,active){await requireAdmin();unwrap(await sdk.rpc('set_entrepreneur_active',{p_uid:uid,p_shop_id:shopId,p_active:active}));},
    async listShops(){await requireAdmin();return unwrap(await sdk.from('shops').select('*').order('name')).map(shop);},
    async getShop(id){return shop(unwrap(await sdk.from('public_shops').select('*').eq('id',id).maybeSingle()));},
    async updateShop(id,changes){
      const mapped={};for(const [key,value] of Object.entries(changes)){
        if(!shopFields[key])throw new Error('Campo de tienda no permitido: '+key);mapped[shopFields[key]]=value;
      }
      const rows=unwrap(await sdk.from('shops').update(mapped).eq('id',id).select('id'));
      if(!rows.length)throw new Error('No tienes permiso para editar esta tienda');
    },
    async saveAssociation(id,data){await requireAdmin();
      const allowed=['name','description','sector','contact','active'];
      const values={id,active:true};for(const key of allowed)if(key in data)values[key]=data[key];
      if('logoUrl' in data)values.logo_url=data.logoUrl;
      unwrap(await sdk.from('associations').upsert(values));
    },
    async setAssociationActive(id,active){await requireAdmin();unwrap(await sdk.from('associations').update({active}).eq('id',id));},
    async listAssociations(){return unwrap(await sdk.from('associations').select('*').order('name'));},
    async addShopToAssociation(shopId,associationId){await requireAdmin();unwrap(await sdk.from('shop_associations').upsert({shop_id:shopId,association_id:associationId}));},
    async removeShopFromAssociation(shopId,associationId){await requireAdmin();unwrap(await sdk.from('shop_associations').delete().eq('shop_id',shopId).eq('association_id',associationId));},
    async saveListItem(collectionName,id,name){await requireAdmin();const table=listTables[collectionName];if(!table)throw new Error('Lista no permitida');unwrap(await sdk.from(table).upsert({id,name}));},
    async listItems(collectionName){const table=listTables[collectionName];if(!table)throw new Error('Lista no permitida');return unwrap(await sdk.from(table).select('*').order('name'));},
    async listPublicProducts(shopId=null){let q=sdk.from('public_products').select('*').order('name');if(shopId)q=q.eq('shop_id',shopId);return unwrap(await q).map(product);},
    watchPublicProducts(callback,shopId=null,onError=()=>{}){
      let stopped=false,timer;async function tick(){try{const rows=await layer.listPublicProducts(shopId);if(!stopped)callback(rows)}catch(error){if(!stopped)onError(error)}finally{if(!stopped)timer=setTimeout(tick,15000)}}
      tick();return ()=>{stopped=true;clearTimeout(timer)};
    },
    async uploadLogo(shopId,file){
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2097152)throw new Error('Usa una imagen JPEG, PNG o WebP de hasta 2 MiB');
      const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=shopId+'/logo/'+crypto.randomUUID()+'.'+ext;
      unwrap(await sdk.storage.from('shop-images').upload(path,file,{contentType:file.type,upsert:false}));
      const publicUrl=sdk.storage.from('shop-images').getPublicUrl(path).data.publicUrl;
      await layer.updateShop(shopId,{logoUrl:publicUrl});return publicUrl;
    },
    async registerSale(shopId,productId,variantId,quantity,place,requestId=crypto.randomUUID()){
      return unwrap(await sdk.rpc('register_sale',{p_shop_id:shopId,p_product_id:productId,p_variant_id:variantId,p_quantity:quantity,p_place:place,p_request_id:requestId}));
    },
    async salesHistory(shopId){return unwrap(await sdk.from('sales').select('*').eq('shop_id',shopId).order('date_millis',{ascending:false}));},
    async listAdminActions(){await requireAdmin();return unwrap(await sdk.from('admin_actions').select('*').order('created_at',{ascending:false}).limit(200));},
    async dispose(){sdk.auth.stopAutoRefresh();await sdk.removeAllChannels();},
  };
  return layer;
}

let configured;
export function configureSupabase(config){if(configured)throw new Error('Supabase ya esta configurado');configured=createDataLayer(config);return configured;}
const current=()=>{if(!configured)throw new Error('Llama configureSupabase(config) al iniciar la web');return configured};
// Conserva los nombres usados por las pantallas del equipo.
export const login=(...a)=>current().login(...a),logout=(...a)=>current().logout(...a),onSession=(...a)=>current().onSession(...a);
export const createEmprendedora=(...a)=>current().createEmprendedora(...a),setEmprendedoraActive=(...a)=>current().setEmprendedoraActive(...a);
export const listShops=(...a)=>current().listShops(...a),getShop=(...a)=>current().getShop(...a),updateShop=(...a)=>current().updateShop(...a);
export const saveAssociation=(...a)=>current().saveAssociation(...a),setAssociationActive=(...a)=>current().setAssociationActive(...a),listAssociations=(...a)=>current().listAssociations(...a);
export const addShopToAssociation=(...a)=>current().addShopToAssociation(...a),removeShopFromAssociation=(...a)=>current().removeShopFromAssociation(...a);
export const saveListItem=(...a)=>current().saveListItem(...a),listItems=(...a)=>current().listItems(...a),watchPublicProducts=(...a)=>current().watchPublicProducts(...a);
