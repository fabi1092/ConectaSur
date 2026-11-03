import {escapeHtml as escape} from './content.js';
import {icon} from './visuals.js';

const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL');
const message=error=>({
  CS002:'No puedes desactivar tu propia cuenta. Pídele a otro administrador que lo haga.',
  CS003:'Debe quedar al menos un administrador activo.',
  CS004:'La cuenta cambió en otra sesión. Vuelve a la lista para revisar los datos actuales.',
  CS005:'La cuenta no corresponde a esta creación o ya tiene otro perfil.',
  CS006:'No se pudo validar la solicitud de creación.',
  user_already_exists:'Ese correo ya tiene una cuenta. Usa otro correo para crear un administrador.',
  email_exists:'Ese correo ya tiene una cuenta. Usa otro correo para crear un administrador.',
  confirmation_required:'El servidor solicita confirmar el correo. La cuenta todavía no tiene permisos de administrador.',
  existing_account:'Ese correo pertenece a otra cuenta. No se modificaron sus permisos.',
  '42501':'Tu cuenta ya no tiene permisos para realizar esta acción.',
  account_inactive:'Tu cuenta está desactivada.'
}[error.code] || 'No pudimos confirmar el guardado. Revisa tu conexión y vuelve a intentarlo. Conservamos los datos escritos.');

export function showAdminAccounts(container,db,currentUid){
  let stopped=false,busy=false,mode='list',root=null,serial=0,items=[],initial='',operation=null,secret='';
  const events=new AbortController();
  const alive=()=>!stopped && root?.isConnected;
  function tell(text,error=false){
    if(!alive())return;
    const el=root.querySelector('[data-admin-status]');el.textContent=text;el.className='owner-status'+(error?' owner-error':'');el.setAttribute('role',error?'alert':'status');
    if(error){el.tabIndex=-1;el.focus();}
  }
  function dirty(){return alive() && (mode==='credentials' || operation?.pending || (mode==='edit' && root.querySelector('#admin-name').value!==initial) || (mode==='create' && [...root.querySelectorAll('input:not([type=checkbox])')].some(input=>input.value)));}
  function requestLeave(){
    if(!alive())return true;
    if(busy){tell('Espera a que termine el guardado.');return false;}
    const text=mode==='credentials'?'¿Ya guardaste los datos de acceso? La contraseña no se podrá volver a consultar.':operation?.pending?'La creación está pendiente. Si sales, la cuenta puede quedar sin permisos de administrador. ¿Quieres salir?':'Hay datos sin guardar. ¿Quieres salir y descartarlos?';
    return !dirty() || window.confirm(text);
  }
  function closeOperation(){const old=operation;operation=null;secret='';if(old)void old.dispose().catch(()=>{});}
  function shell(title,description,body,guide){
    container.innerHTML=`<section class="admin-accounts" data-voice-guide="${escape(guide)}"><div class="section-heading"><div><p class="public-eyebrow">Administración · Accesos</p><h2 tabindex="-1">${title}</h2><p>${description}</p></div>${mode==='list'?`<button type="button" id="create-admin">${icon('people')}Crear administrador</button>`:''}</div><p data-admin-status class="owner-status" role="status"></p>${body}</section>`;
    root=container.querySelector('.admin-accounts');root.querySelector('h2').focus({preventScroll:true});
  }
  function rows(){
    const term=normalize(root.querySelector('#admin-search').value.trim()),state=root.querySelector('#admin-state').value;
    const filtered=items.filter(item=>normalize(item.displayName+' '+item.email).includes(term) && (state==='all' || item.active===(state==='active')));
    root.querySelector('#admin-count').textContent=`Mostrando ${filtered.length} de ${items.length} administradores.`;
    root.querySelector('#admin-list').innerHTML=filtered.length?`<ul class="admin-account-list">${filtered.map(item=>`<li><div class="admin-account-identity"><span class="admin-account-icon">${icon('user')}</span><div><strong>${escape(item.displayName)}</strong><span>${escape(item.email)}</span>${item.uid===currentUid?'<small>Tu cuenta</small>':''}</div></div><span class="status ${item.active?'active':'inactive'}">${item.active?'Activa':'Inactiva'}</span><div class="owner-actions"><button type="button" data-edit-admin="${escape(item.uid)}" aria-label="Editar ${escape(item.displayName)}">${icon('tag')}Editar</button><button type="button" data-toggle-admin="${escape(item.uid)}" ${item.uid===currentUid?'disabled aria-describedby="admin-self-help"':''}>${item.active?'Desactivar':'Activar'}</button></div></li>`).join('')}</ul>`:'<p class="owner-empty">No encontramos administradores con esos filtros.</p>';
    root.querySelectorAll('[data-edit-admin]').forEach(button=>button.addEventListener('click',()=>edit(items.find(item=>item.uid===button.dataset.editAdmin))));
    root.querySelectorAll('[data-toggle-admin]').forEach(button=>button.addEventListener('click',()=>toggle(items.find(item=>item.uid===button.dataset.toggleAdmin))));
  }
  async function list(notice=''){
    if(stopped)return;closeOperation();mode='list';initial='';const ticket=++serial;
    shell('Administradores','Gestiona quién puede administrar la plataforma.',`<div class="admin-account-filters"><div><label for="admin-search">Buscar por nombre o correo</label><input id="admin-search" type="search" placeholder="Escribe un nombre o correo" disabled></div><div><label for="admin-state">Estado de la cuenta</label><select id="admin-state" disabled><option value="all">Todas las cuentas</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></div></div><p id="admin-count" role="status">Cargando cuentas…</p><div id="admin-list"></div><p class="editor-hint" id="admin-self-help">Para proteger el acceso a la plataforma, otro administrador debe desactivar tu cuenta. Desactivar conserva la cuenta y bloquea sus acciones administrativas.</p>`,'Aquí se gestionan las cuentas administradoras. Puedes buscar por nombre o correo, filtrar su estado, crear una cuenta, editar su nombre y activar o desactivar otras cuentas. Tu propia cuenta no se puede desactivar desde aquí.');
    tell(notice);root.querySelector('#create-admin').addEventListener('click',create);
    try{
      const result=await db.listAdministrators();if(!alive() || ticket!==serial)return;
      items=result;root.querySelectorAll('input,select').forEach(el=>el.disabled=false);rows();
      root.querySelector('#admin-search').addEventListener('input',rows);root.querySelector('#admin-state').addEventListener('change',rows);
    }catch{
      if(!alive() || ticket!==serial)return;
      root.querySelector('#admin-count').textContent='';tell('No pudimos cargar las cuentas. Revisa tu conexión y vuelve a intentarlo.',true);
      const retry=document.createElement('button');retry.type='button';retry.textContent='Intentar nuevamente';retry.addEventListener('click',()=>list());root.querySelector('#admin-list').append(retry);
    }
  }
  function lock(value){busy=value;if(alive()){root.querySelectorAll('button,input,select').forEach(el=>{el.disabled=value;});if(!value)root.querySelector(`[data-toggle-admin="${currentUid}"]`)?.setAttribute('disabled','');}}
  async function toggle(item){
    if(busy || !item || item.uid===currentUid)return;
    const action=item.active?'desactivar':'activar';
    if(!window.confirm(`¿Quieres ${action} la cuenta de ${item.displayName}?${item.active?' Perderá el acceso a la administración.':''}`))return;
    lock(true);tell('Actualizando el acceso…');
    try{await db.updateAdministrator({...item,active:!item.active,expectedName:item.displayName,expectedActive:item.active});if(alive())await list(`Cuenta ${item.active?'desactivada':'activada'}.`);}
    catch(error){tell(message(error),true);}
    finally{lock(false);if(alive() && mode==='list'){root.querySelector(`[data-toggle-admin="${currentUid}"]`)?.setAttribute('disabled','');}}
  }
  function cancel(){if(requestLeave())list();}
  function edit(item){
    if(stopped || !item)return;++serial;mode='edit';initial=item.displayName;
    shell('Editar administrador','Actualiza el nombre con el que se identifica esta persona.',`<div class="form-card"><form id="admin-account-form"><label for="admin-name">Nombre del administrador</label><input id="admin-name" required maxlength="120" value="${escape(item.displayName)}"><p class="editor-hint">Correo de acceso: <strong>${escape(item.email)}</strong></p><p>Estado: ${item.active?'Activa':'Inactiva'}. El correo y la contraseña se mantienen.</p><div class="owner-actions"><button type="submit">${icon('check')}Guardar nombre</button><button type="button" id="cancel-admin">Cancelar</button></div></form></div>`,'Escribe el nombre del administrador y pulsa Guardar nombre. Esta pantalla no cambia el correo, la contraseña ni el estado. Cancelar vuelve a la lista.');
    const form=root.querySelector('form'),field=root.querySelector('#admin-name');root.querySelector('#cancel-admin').addEventListener('click',cancel);field.addEventListener('input',()=>field.setCustomValidity(''));
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;if(!field.value.trim()){field.setCustomValidity('Escribe el nombre del administrador.');field.reportValidity();return;}
      lock(true);tell('Guardando nombre…');
      try{await db.updateAdministrator({...item,displayName:field.value,expectedName:item.displayName,expectedActive:item.active});if(alive()){initial=field.value;await list('Nombre del administrador guardado.');}}
      catch(error){tell(message(error),true);}finally{lock(false);}
    });
  }
  function create(){
    if(stopped)return;closeOperation();++serial;mode='create';operation=db.administratorCreation();
    shell('Crear administrador','Agrega una persona de confianza para gestionar ConectaSur.',`<div class="form-card"><form id="admin-account-form"><label for="admin-name">Nombre del administrador</label><input id="admin-name" required maxlength="120" autocomplete="name"><label for="admin-email">Correo electrónico</label><input id="admin-email" type="email" required autocomplete="off" maxlength="254"><label for="admin-password">Contraseña de acceso</label><input id="admin-password" type="password" required minlength="8" autocomplete="new-password" aria-describedby="admin-password-help"><p id="admin-password-help" class="editor-hint">Usa al menos 8 caracteres. Entrega estos datos solo a la persona que usará la cuenta.</p><label class="editor-check"><input id="show-admin-password" type="checkbox">Mostrar contraseña</label><p class="editor-hint">La cuenta podrá gestionar emprendedoras, asociaciones, catálogos y otros administradores.</p><div class="owner-actions"><button type="submit" id="save-admin">${icon('check')}Crear cuenta</button><button type="button" id="cancel-admin">Cancelar</button></div></form></div>`,'Completa el nombre, el correo y una contraseña de al menos ocho caracteres. Puedes mostrar la contraseña para revisarla. Pulsa Crear cuenta una sola vez y espera la confirmación. Tu sesión seguirá abierta.');
    const form=root.querySelector('form'),field=root.querySelector('#admin-name'),email=root.querySelector('#admin-email'),password=root.querySelector('#admin-password');
    field.addEventListener('input',()=>field.setCustomValidity(''));root.querySelector('#show-admin-password').addEventListener('change',event=>{password.type=event.target.checked?'text':'password';});root.querySelector('#cancel-admin').addEventListener('click',cancel);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;if(!field.value.trim()){field.setCustomValidity('Escribe el nombre del administrador.');field.reportValidity();return;}
      const input={displayName:field.value,email:email.value,password:password.value};lock(true);tell('Creando cuenta. Mantén esta pantalla abierta…');
      try{const result=await operation.create(input);if(alive()){secret=input.password;credentials(result);}}
      catch(error){tell(message(error)+(operation?.pending?' Reintenta aquí con los mismos datos para terminar la creación.':''),true);}
      finally{
        lock(false);
        if(alive() && mode==='create' && operation?.pending){[field,email,password].forEach(el=>el.readOnly=true);root.querySelector('#save-admin').textContent='Reintentar creación';}
      }
    });
  }
  function credentials(result){
    mode='credentials';++serial;
    shell('Cuenta administradora creada','Tu sesión continúa abierta. Entrega estos datos a la persona que usará la cuenta.',`<div class="form-card admin-credentials"><span class="status active">Cuenta activa</span><h3>${escape(result.displayName)}</h3><p>${escape(result.email)}</p><label for="created-admin-password">Contraseña de la cuenta nueva</label><input id="created-admin-password" type="password" readonly autocomplete="off"><label class="editor-check"><input id="show-created-password" type="checkbox">Mostrar contraseña</label><p class="editor-hint">Guárdala ahora: al volver a la lista no podrás consultar esta contraseña.</p><div class="owner-actions"><button type="button" id="copy-admin-credentials">Copiar datos de acceso</button><button type="button" id="finish-admin">Volver a administradores</button></div></div>`,'La cuenta administradora fue creada. Tu sesión continúa abierta. Guarda y entrega los datos de acceso a la persona correspondiente. Puedes mostrar la contraseña o copiar los datos. Al volver a la lista, la contraseña dejará de mostrarse.');
    const field=root.querySelector('#created-admin-password');field.value=secret;
    root.querySelector('#show-created-password').addEventListener('change',event=>{field.type=event.target.checked?'text':'password';});
    root.querySelector('#copy-admin-credentials').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(`ConectaSur\nCorreo: ${result.email}\nContraseña: ${secret}`);tell('Datos copiados. Compártelos de forma privada con la persona que usará la cuenta.');}
      catch{tell('No pudimos copiar. Puedes seleccionar el correo y mostrar la contraseña para guardarlos.',true);}
    });
    root.querySelector('#finish-admin').addEventListener('click',()=>{if(requestLeave())list('Cuenta administradora creada.');});
  }
  window.addEventListener('beforeunload',event=>{if(dirty() || busy){event.preventDefault();event.returnValue='';}},{signal:events.signal});
  list();
  return {requestLeave,dispose(){stopped=true;++serial;events.abort();closeOperation();if(root)root.querySelectorAll('#admin-password,#created-admin-password').forEach(input=>input.value='');}};
}
