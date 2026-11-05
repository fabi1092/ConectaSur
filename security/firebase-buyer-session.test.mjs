import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseBuyerSession,firebaseBuyerProfile} from '../web/firebase-buyer-session.js';
const user={uid:'google-user',email:'comprador@example.com',displayName:'Comprador'};
const claims={sub:user.uid,aud:'conectasur-dev',iss:'https://securetoken.google.com/conectasur-dev',email:user.email,email_verified:true,firebase:{sign_in_provider:'google.com'}};
function fixture(){
 let active=null,callback=()=>{},closed=0,reloadError=null,token={...claims};
 const driver={ready:async()=>{},user:()=>active,start:async()=>{active=user;return user;},claims:async()=>token,
  reload:async()=>{if(reloadError)throw reloadError;},signOut:async()=>{active=null;closed++;callback(null);},onChange:fn=>{callback=fn;return()=>{};}};
 const session=createFirebaseBuyerSession({driver,projectId:'conectasur-dev'});
 return {driver,session,setUser:v=>active=v,setClaims:v=>token=v,setError:v=>reloadError=v,closed:()=>closed};
}
test('Google siempre es comprador sin tienda, aunque el token contenga nombres y campos privilegiados',()=>{
 const result=firebaseBuyerProfile({...user,displayName:'Administrador'},{...claims,role:'admin',shopId:'ajena'},'conectasur-dev');
 assert.equal(result.role,'comprador');assert.equal(result.shopId,null);assert.equal(result.uid,'firebase:'+user.uid);
});
test('proyecto, emisor, sujeto, proveedor y correo verificado deben coincidir',()=>{
 for(const patch of [{aud:'otro'},{iss:'https://intruso'},{sub:'otro'},{firebase:{sign_in_provider:'password'}},{email_verified:false}]){
  assert.throws(()=>firebaseBuyerProfile(user,{...claims,...patch},'conectasur-dev'),{code:'google_callback_failed'});
 }
});
test('sin sesión no se inventa comprador',async()=>{const f=fixture();assert.equal(await f.session.currentSession(),null);f.session.dispose();});
test('el resultado autenticado abre comprador y otro ingreso no sustituye la sesión',async()=>{
 const f=fixture();assert.equal((await f.session.start()).role,'comprador');await assert.rejects(f.session.start(),{code:'session_exists'});f.session.dispose();
});
test('cancelar el selector no crea sesión',async()=>{
 const f=fixture();f.driver.start=async()=>{throw Object.assign(new Error('cancelado'),{code:'auth/popup-closed-by-user'});};
 await assert.rejects(f.session.start(),{code:'google_cancelled'});assert.equal(await f.session.currentSession(),null);f.session.dispose();
});
test('cerrar sesión mientras Google termina impide recuperar el acceso tardío',async()=>{
 const f=fixture();let complete;f.driver.start=()=>new Promise(resolve=>complete=()=>{f.setUser(user);resolve(user);});
 const login=f.session.start();await new Promise(resolve=>setImmediate(resolve));await f.session.logout();complete();
 await assert.rejects(login,{code:'google_cancelled'});assert.equal(await f.session.currentSession(),null);f.session.dispose();
});
test('la sesión comprobada vuelve a consultarse y el cierre la elimina',async()=>{
 const f=fixture();await f.session.start();assert.equal((await f.session.currentSession()).email,user.email);await f.session.logout();assert.equal(await f.session.currentSession(),null);f.session.dispose();
});
test('una interrupción de red no borra la cuenta persistente',async()=>{
 const f=fixture();f.setUser(user);f.setError(Object.assign(new Error('sin conexión'),{code:'auth/network-request-failed'}));
 await assert.rejects(f.session.currentSession(),{code:'auth/network-request-failed'});assert.equal(f.closed(),0);
 f.setError(null);assert.equal((await f.session.currentSession()).role,'comprador');f.session.dispose();
});
test('una cuenta revocada se retira, sin conservar una sesión ficticia',async()=>{
 const f=fixture();f.setUser(user);f.setError(Object.assign(new Error('desactivada'),{code:'auth/user-disabled'}));
 await assert.rejects(f.session.currentSession());assert.equal(f.closed(),1);assert.equal(await f.session.currentSession(),null);f.session.dispose();
});
test('una identidad de Firebase que no corresponde a Google se cierra',async()=>{
 const f=fixture();f.setUser(user);f.setClaims({...claims,firebase:{sign_in_provider:'password'}});
 await assert.rejects(f.session.currentSession(),{code:'google_callback_failed'});assert.equal(await f.session.currentSession(),null);f.session.dispose();
});
test('dos clics durante el mismo selector no abren dos accesos',async()=>{
 const f=fixture();let complete;f.driver.start=()=>new Promise(resolve=>complete=()=>{f.setUser(user);resolve(user);});
 const login=f.session.start();await new Promise(resolve=>setImmediate(resolve));await assert.rejects(f.session.start(),{code:'session_exists'});complete();assert.equal((await login).role,'comprador');f.session.dispose();
});

test('una comprobación iniciada antes de salir no restaura la sesión al terminar',async()=>{
 const f=fixture();f.setUser(user);let complete;
 f.driver.reload=()=>new Promise(resolve=>complete=resolve);
 const check=f.session.currentSession();await new Promise(resolve=>setImmediate(resolve));
 await f.session.logout();complete();assert.equal(await check,null);f.session.dispose();
});

test('la capa híbrida consulta la vitrina como anon y rechaza tienda, ventas y administración',async()=>{
 const {createDataLayer}=await import('../web/supabase-data.js');
 const original=globalThis.fetch,requests=[],f=fixture(),values=new Map();let db;
 try{
  globalThis.fetch=async(input,init={})=>{
   const url=new URL(String(input));requests.push(url.pathname);
   assert.ok(['/rest/v1/public_products','/rest/v1/public_shops'].includes(url.pathname));
   assert.equal(new Headers(init.headers).get('authorization'),'Bearer public-anon-test');
   return new Response('[]',{status:200,headers:{'content-type':'application/json'}});
  };
  db=createDataLayer({url:'https://api.example',anonKey:'public-anon-test'}, {firebaseBuyer:f.session,storageKey:'hybrid-test',
   storage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}});
  assert.equal((await db.loginWithGoogle()).role,'comprador');
  assert.equal((await db.currentSession()).uid,'firebase:'+user.uid);
  assert.deepEqual(await db.listPublicShops(),[]);
  await assert.rejects(db.entrepreneurHome(),{code:'entrepreneur_required'});
  await assert.rejects(db.ownerCatalog('ajena'),{code:'entrepreneur_required'});
  await assert.rejects(db.listAdministrators(),/administradora/);
  await assert.rejects(db.login('otra@example.com','no-enviar'),{code:'session_exists'});
  await assert.rejects(db.registerBuyer({displayName:'Otra',email:'otra@example.com',password:'no-enviar'}),{code:'session_exists'});
  assert.equal((await db.client.auth.getSession()).data.session,null);
  assert.ok(![...values.values()].some(value=>String(value).includes('firebase:')));
  await db.logout();assert.equal(await db.currentSession(),null);
  assert.deepEqual(requests,['/rest/v1/public_shops']);
 }finally{await db?.dispose();await db?.client.auth.dispose();f.session.dispose();globalThis.fetch=original;}
});
