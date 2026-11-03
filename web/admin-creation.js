// La sesión de alta vive solo en memoria y nunca reemplaza la del administrador.
export function adminCreation(secondary, promote, requireAdmin) {
  const requestId=crypto.randomUUID();
  let payload=null, uid=null, uncertain=false, registered=false, stopped=false;
  const unwrap=({data,error})=>{if(error)throw error;return data;};
  return {
    get pending(){return registered || uncertain;},
    async create(input){
      if(stopped)throw new Error('La creación ya se cerró');
      await requireAdmin();
      const name=String(input.displayName??'').trim(),email=String(input.email??'').trim(),password=input.password;
      if(!name || name.length>120 || !email || typeof password!=='string' || password.length<8)throw new Error('Revisa el nombre, correo y contraseña (mínimo 8 caracteres).');
      if(payload && (name!==payload.displayName || email!==payload.email || password!==payload.password))throw new Error('Reintenta con los mismos datos de la creación pendiente.');
      payload={displayName:name,email,password};
      if(!uid){
        if(uncertain){
          // Si se perdió la respuesta de Auth, solo recuperamos NUESTRA alta.
          const recovered=await secondary.client.auth.signInWithPassword({email,password});
          if(recovered.error?.code==='invalid_credentials'){
            // El primer intento pudo cortarse antes de llegar al servidor.
            const result=unwrap(await secondary.client.auth.signUp({email,password,options:{data:{display_name:name,admin_creation_request:requestId}}}));
            if(!result.session)throw Object.assign(new Error('El servidor requiere confirmar el correo antes de continuar.'),{code:'confirmation_required'});
          }else unwrap(recovered);
        }else if(!registered){
          try{
            const result=unwrap(await secondary.client.auth.signUp({email,password,options:{data:{display_name:name,admin_creation_request:requestId}}}));
            if(!result.session)throw Object.assign(new Error('El servidor requiere confirmar el correo antes de continuar.'),{code:'confirmation_required'});
            registered=true;
          }catch(error){
            uncertain=!error.status || error.status===0 || error.status>=500;
            if(error.code==='confirmation_required')uncertain=true;
            if(!uncertain)payload=null;
            throw error;
          }
        }
        const user=unwrap(await secondary.client.auth.getUser())?.user;
        if(!user || user.user_metadata?.admin_creation_request!==requestId)throw Object.assign(new Error('Ese correo no corresponde a esta cuenta nueva. No se modificó la cuenta existente.'),{code:'existing_account'});
        uid=user.id;registered=true;uncertain=false;
      }
      await promote({p_uid:uid,p_name:name,p_request_id:requestId});
      return {uid,email,displayName:name};
    },
    async dispose(){
      stopped=true;payload=null;
      try{await secondary.client.auth.signOut({scope:'local'});}finally{await secondary.dispose();}
    }
  };
}
