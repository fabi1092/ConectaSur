import {initializeApp,getApps} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onIdTokenChanged,getIdTokenResult,reload,browserLocalPersistence,setPersistence} from 'firebase/auth';
import {createFirebaseBuyerSession} from './firebase-buyer-session.js';

export function createFirebaseBuyerAuth(config) {
  if(!config?.projectId||!config?.apiKey||!config?.appId)return null;
  const name='conectasur-google-buyer';
  const app=getApps().find(app=>app.name===name)||initializeApp(config,name);
  const auth=getAuth(app),provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  const ready=setPersistence(auth,browserLocalPersistence).then(()=>auth.authStateReady());
  return createFirebaseBuyerSession({projectId:config.projectId,driver:{
    ready:()=>ready,user:()=>auth.currentUser,
    start:async()=>(await signInWithPopup(auth,provider)).user,
    claims:async user=>(await getIdTokenResult(user)).claims,
    reload:user=>reload(user),signOut:()=>signOut(auth),onChange:callback=>onIdTokenChanged(auth,callback)
  }});
}
