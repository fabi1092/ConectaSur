// Contrato de cuentas del panel; separado de Auth/Google, a cargo del compañero.
const unwrap=({data,error})=>{if(error)throw Object.assign(new Error(error.message),{code:error.code,status:error.status});return data;};
const account=row=>({uid:row.id,shopId:row.shop_id,displayName:row.display_name,active:row.active});
const columns='id,shop_id,display_name,active';

export function createEntrepreneurAccountData(db){
  async function requireAdmin(){
    const user=await db.currentSession();
    if(!user || user.role!=='admin' || !user.active)throw Object.assign(new Error('Necesitas una cuenta administradora activa'),{code:'admin_required'});
  }
  async function read(uid,shopId){
    const row=unwrap(await db.client.from('profiles').select(columns).eq('id',uid).eq('shop_id',shopId).eq('role','emprendedora').maybeSingle());
    if(!row)throw Object.assign(new Error('La cuenta o su tienda cambiaron. Vuelve a la lista para revisar sus datos.'),{code:'entrepreneur_account_changed'});
    return account(row);
  }
  return {
    async list(){
      await requireAdmin();
      return unwrap(await db.client.from('profiles').select(columns).eq('role','emprendedora')).map(account);
    },
    async get({uid,shopId}){await requireAdmin();return read(uid,shopId);},
    async rename({uid,shopId,displayName,expectedName}){
      const name=String(displayName??'').trim();
      if(!name || name.length>120 || typeof expectedName!=='string' || !uid || !shopId)throw Object.assign(new Error('Escribe un nombre de hasta 120 caracteres.'),{code:'invalid_entrepreneur_account'});
      await requireAdmin();
      const result=await db.client.rpc('update_entrepreneur_account',{p_uid:uid,p_shop_id:shopId,p_name:name,p_expected_name:expectedName});
      if(result.error?.code==='PGRST202')throw Object.assign(new Error('El cambio de nombre aún no está habilitado. Conservamos los datos escritos.'),{code:'entrepreneur_account_not_ready'});
      if(['CS004','CS005'].includes(result.error?.code))throw Object.assign(new Error('La cuenta cambió en otra sesión. Vuelve a la lista para revisar los datos actuales.'),{code:'entrepreneur_account_changed'});
      unwrap(result);
      const confirmed=await read(uid,shopId);
      if(confirmed.displayName!==name)throw Object.assign(new Error('No pudimos confirmar el nombre guardado. Vuelve a intentarlo.'),{code:'entrepreneur_account_unconfirmed'});
      return confirmed;
    }
  };
}
