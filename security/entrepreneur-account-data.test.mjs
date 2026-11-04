import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEntrepreneurAccountData} from '../web/entrepreneur-account-data.js';

function fixture(){
  const state={user:{uid:'admin',role:'admin',active:true},row:{id:'owner',shop_id:'shop',display_name:'Nombre anterior',active:false,role:'emprendedora'},calls:[],mode:'ok'};
  const db={async currentSession(){return state.user;},client:{
    from(table){assert.equal(table,'profiles');const filters={};let columns;
      const data=()=>{const row=state.row;return row && Object.entries(filters).every(([key,value])=>row[key]===value)?Object.fromEntries(columns.split(',').map(key=>[key,row[key]])):null;};
      const query={select(value){columns=value;return query;},eq(key,value){filters[key]=value;return query;},async maybeSingle(){return {data:data(),error:null};},then(resolve,reject){return Promise.resolve({data:data()?[data()]:[],error:null}).then(resolve,reject);}};return query;
    },
    async rpc(name,args){
      assert.equal(name,'update_entrepreneur_account');state.calls.push({...args});
      if(state.mode==='missing')return {data:null,error:{code:'PGRST202',message:'Missing function'}};
      if(state.mode==='stale')return {data:null,error:{code:'CS004',message:'Changed'}};
      if(state.mode==='no-write')return {data:null,error:null};
      state.row.display_name=args.p_name;
      if(state.mode==='lost-response'){state.mode='ok';return {data:null,error:{message:'Connection lost'}};}
      return {data:null,error:null};
    }
  }};
  return {state,data:createEntrepreneurAccountData(db),args:{uid:'owner',shopId:'shop',displayName:'Nombre nuevo',expectedName:'Nombre anterior'}};
}

test('el listado devuelve el nombre de cuenta y conserva el estado, sin consultar correos privados de Auth',async()=>{const {data}=fixture();assert.deepEqual(await data.list(),[{uid:'owner',shopId:'shop',displayName:'Nombre anterior',active:false}]);});
test('una cuenta que cambió de tienda no se edita usando el vínculo anterior',async()=>{const {data}=fixture();await assert.rejects(data.get({uid:'owner',shopId:'otra'}),{code:'entrepreneur_account_changed'});});
test('comprador, emprendedora, administrador inactivo y visitante no invocan el cambio desde la capa de datos',async()=>{const {state,data,args}=fixture();for(const user of [null,{role:'comprador',active:true},{role:'emprendedora',active:true},{role:'admin',active:false}]){state.user=user;await assert.rejects(data.rename(args),{code:'admin_required'});}assert.equal(state.calls.length,0);});
test('el contrato cambia solo el nombre, con lectura posterior de confirmación y estado inactivo conservado',async()=>{const {state,data,args}=fixture();const result=await data.rename({...args,displayName:'  Nombre nuevo  '});assert.equal(result.displayName,'Nombre nuevo');assert.equal(result.active,false);assert.deepEqual(state.calls[0],{p_uid:'owner',p_shop_id:'shop',p_name:'Nombre nuevo',p_expected_name:'Nombre anterior'});assert.equal(state.row.role,'emprendedora');});
test('nombres vacíos o excesivos se rechazan antes de llamar al servidor',async()=>{const {state,data,args}=fixture();for(const name of ['   ','a'.repeat(121)])await assert.rejects(data.rename({...args,displayName:name}),{code:'invalid_entrepreneur_account'});assert.equal(state.calls.length,0);});
test('la función ausente se informa como pendiente de habilitación, sin afirmar éxito',async()=>{const {state,data,args}=fixture();state.mode='missing';await assert.rejects(data.rename(args),{code:'entrepreneur_account_not_ready'});assert.equal(state.row.display_name,'Nombre anterior');});
test('un conflicto de otra sesión conserva el registro y se informa a la pantalla',async()=>{const {state,data,args}=fixture();state.mode='stale';await assert.rejects(data.rename(args),{code:'entrepreneur_account_changed'});assert.equal(state.row.display_name,'Nombre anterior');});
test('una respuesta de éxito sin el nombre guardado no se presenta como cambio confirmado',async()=>{const {state,data,args}=fixture();state.mode='no-write';await assert.rejects(data.rename(args),{code:'entrepreneur_account_unconfirmed'});});
test('al perder la respuesta, el reintento conserva el nombre esperado original del contrato',async()=>{const {state,data,args}=fixture();state.mode='lost-response';await assert.rejects(data.rename(args));assert.equal((await data.rename(args)).displayName,'Nombre nuevo');assert.deepEqual(state.calls[0],state.calls[1]);});
