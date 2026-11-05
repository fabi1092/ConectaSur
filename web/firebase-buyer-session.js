const problem = code => Object.assign(new Error('No pudimos completar el acceso con Google'), {code});
const invalid = error => ['auth/user-disabled','auth/user-not-found','auth/user-token-expired','auth/invalid-user-token'].includes(error?.code);
export function firebaseBuyerProfile(user, claims, projectId) {
  if (!user?.uid || claims?.sub !== user.uid || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
      claims.firebase?.sign_in_provider !== 'google.com' || claims.email_verified !== true) throw problem('google_callback_failed');
  // Esta identidad solo consulta la vitrina. Nunca se transforma en dueña/admin por correo o metadatos.
  return {uid:'firebase:'+user.uid, email:typeof claims.email==='string'?claims.email:null, displayName:user.displayName||'Comprador',
    role:'comprador',shopId:null,active:true,authProvider:'firebase_google'};
}
export function createFirebaseBuyerSession({driver,projectId}) {
  let generation=0,checking=0,pending=false;
  const listeners=new Set();
  const emit=user=>{for(const callback of listeners)callback(user);};
  const profile=async user=>firebaseBuyerProfile(user,await driver.claims(user),projectId);
  const unsubscribe=driver.onChange(async user=>{
    const stamp=++checking;
    if(pending)return;
    if(!user){emit(null);return;}
    try{const session=await profile(user);if(stamp===checking&&!pending&&driver.user()?.uid===user.uid)emit(session);}
    catch(error){if(invalid(error)||error.code==='google_callback_failed'){await driver.signOut();if(stamp===checking)emit(null);}}
  });
  return {
    async currentSession(){
      await driver.ready();const user=driver.user();if(!user)return null;
      const stamp=generation;
      try{
        await driver.reload(user);const session=await profile(user);
        return stamp===generation&&driver.user()?.uid===user.uid?session:null;
      }
      catch(error){if(invalid(error)||error.code==='google_callback_failed')await driver.signOut();throw error;}
    },
    async start(){
      await driver.ready();if(pending||driver.user())throw problem('session_exists');
      const stamp=++generation;pending=true;
      try{
        const user=await driver.start();
        if(stamp!==generation){if(driver.user()?.uid===user?.uid)await driver.signOut();throw problem('google_cancelled');}
        const session=await profile(user);
        if(stamp!==generation){await driver.signOut();throw problem('google_cancelled');}
        pending=false;emit(session);return session;
      }catch(error){
        if(stamp===generation)pending=false;
        if(error.code==='google_callback_failed')await driver.signOut();
        if(['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code))throw problem('google_cancelled');
        if(['auth/web-storage-unsupported'].includes(error.code))throw problem('google_storage_unavailable');
        if(['auth/operation-not-allowed','auth/unauthorized-domain','auth/invalid-api-key'].includes(error.code))throw problem('google_not_configured');
        if(error.code?.startsWith('auth/'))throw problem('google_not_available');
        throw error;
      }
    },
    async logout(){generation++;checking++;pending=false;await driver.signOut();emit(null);},
    onSession(callback){listeners.add(callback);return()=>listeners.delete(callback);},
    dispose(){unsubscribe();listeners.clear();}
  };
}
