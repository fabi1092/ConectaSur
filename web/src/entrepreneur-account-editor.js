import {escapeHtml as escape} from './content.js';
import {icon} from './visuals.js';

export function showEntrepreneurAccountEditor(container,data,shop,{onSaved,onCancel}){
  let stopped=false,busy=false,initial=null;
  const events=new AbortController();
  container.innerHTML=`<section class="entrepreneur-account-editor" data-voice-guide="Aquí puedes editar el nombre de la cuenta de una emprendedora. Escribe el nombre de la persona y pulsa Guardar nombre. Su tienda y sus datos de acceso se conservan. Cancelar permite volver a la lista sin guardar."><div class="section-heading"><div><p class="public-eyebrow">Administración · Emprendedoras</p><h2 tabindex="-1">Editar cuenta</h2><p>Actualiza el nombre de la persona que administra este emprendimiento.</p></div></div><div class="form-card"><p class="editor-hint">Tienda: <strong>${escape(shop.name)}</strong></p><p data-account-status class="owner-status" role="status">Cargando cuenta…</p><form id="entrepreneur-account-form" hidden><label for="entrepreneur-account-name">Nombre de la emprendedora</label><input id="entrepreneur-account-name" required maxlength="120" autocomplete="name" aria-describedby="entrepreneur-account-help"><p id="entrepreneur-account-help" class="editor-hint">Este es el nombre de la persona. El nombre de su tienda y sus datos de acceso se conservan.</p><p id="entrepreneur-account-state"></p><div class="owner-actions"><button type="submit" id="save-entrepreneur-account">${icon('check')}Guardar nombre</button><button type="button" id="cancel-entrepreneur-account">Cancelar</button></div></form><button type="button" id="account-load-retry" hidden>Intentar nuevamente</button><button type="button" id="account-load-back">Volver a emprendedoras</button></div></section>`;
  const root=container.querySelector('.entrepreneur-account-editor'),form=root.querySelector('form'),field=root.querySelector('#entrepreneur-account-name'),retry=root.querySelector('#account-load-retry'),back=root.querySelector('#account-load-back');
  const alive=()=>!stopped && root.isConnected;
  const dirty=()=>alive() && initial && field.value!==initial.displayName;
  function tell(text,error=false){if(!alive())return;const status=root.querySelector('[data-account-status]');status.textContent=text;status.className='owner-status'+(error?' owner-error':'');status.setAttribute('role',error?'alert':'status');if(error){status.tabIndex=-1;status.focus();}}
  function requestLeave(){if(!alive())return true;if(busy){tell('Espera a que termine el guardado.');return false;}return !dirty() || window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?');}
  function cancel(){if(requestLeave())onCancel();}
  async function load(){
    retry.hidden=true;retry.disabled=true;tell('Cargando cuenta…');
    try{
      const result=await data.get({uid:shop.ownerUid,shopId:shop.id});if(!alive())return;
      initial=result;field.value=result.displayName;root.querySelector('#entrepreneur-account-state').textContent='Estado de la cuenta: '+(result.active?'Activa.':'Inactiva.');form.hidden=false;back.hidden=true;tell('');field.focus({preventScroll:true});
    }catch(error){if(alive()){tell(error.code==='entrepreneur_account_changed'?error.message:'No pudimos cargar la cuenta. Revisa tu conexión y vuelve a intentarlo.',true);retry.hidden=false;}}
    finally{if(alive())retry.disabled=false;}
  }
  root.querySelector('h2').focus({preventScroll:true});
  retry.addEventListener('click',load);back.addEventListener('click',cancel);root.querySelector('#cancel-entrepreneur-account').addEventListener('click',cancel);field.addEventListener('input',()=>field.setCustomValidity(''));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !initial)return;
    if(!field.value.trim()){field.setCustomValidity('Escribe el nombre de la emprendedora.');field.reportValidity();return;}
    busy=true;form.querySelectorAll('button,input').forEach(el=>el.disabled=true);const save=root.querySelector('#save-entrepreneur-account');save.setAttribute('aria-busy','true');tell('Guardando el nombre de la cuenta…');
    try{
      const result=await data.rename({uid:initial.uid,shopId:initial.shopId,displayName:field.value,expectedName:initial.displayName});
      if(!alive())return;initial=result;field.value=result.displayName;onSaved(result);
    }catch(error){if(alive())tell(['invalid_entrepreneur_account','entrepreneur_account_changed','entrepreneur_account_not_ready','entrepreneur_account_unconfirmed'].includes(error.code)?error.message:'No pudimos confirmar el guardado. Revisa tu conexión y vuelve a intentarlo. Conservamos el nombre escrito.',true);}
    finally{busy=false;if(alive()){form.querySelectorAll('button,input').forEach(el=>el.disabled=false);save.removeAttribute('aria-busy');}}
  });
  window.addEventListener('beforeunload',event=>{if(dirty() || busy){event.preventDefault();event.returnValue='';}},{signal:events.signal});
  load();
  return {requestLeave,dispose(){stopped=true;events.abort();}};
}
