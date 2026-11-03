import { escapeHtml as escape } from './content.js';
import { icon } from './visuals.js';

const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CL');

export function showEntrepreneurTypes(container,db){
  let stopped=false,busy=false,mode='list',root=null,version=0,initial='',current=null,items=[];
  const events=new AbortController();
  const alive=()=>!stopped && root?.isConnected;
  const dirty=()=>alive() && mode==='edit' && root.querySelector('#entrepreneur-type-name').value!==initial;
  function tell(text,error=false){
    const status=root.querySelector('[data-type-status]');status.textContent=text;status.className='owner-status'+(error?' owner-error':'');status.setAttribute('role',error?'alert':'status');
    if(error){status.tabIndex=-1;status.focus();}
  }
  function requestLeave(){
    if(!alive())return true;
    if(busy){tell('Espera a que termine el guardado.');return false;}
    return !dirty() || window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?');
  }
  function rows(){
    const term=normalize(root.querySelector('#entrepreneur-type-search').value.trim());
    const filtered=items.filter(item=>normalize(item.name).includes(term));
    root.querySelector('#entrepreneur-types-list').innerHTML=filtered.length ? `<ul class="admin-type-list">${filtered.map(item=>`<li><strong>${escape(item.name)}</strong><button type="button" data-edit-type="${escape(item.id)}" aria-label="Editar ${escape(item.name)}">${icon('tag')}Editar</button></li>`).join('')}</ul>` : `<p class="owner-empty">${items.length ? 'No encontramos tipos con ese nombre. Prueba otra búsqueda.' : 'Todavía no hay tipos de emprendimiento. Agrega el primero.'}</p>`;
    root.querySelector('#entrepreneur-type-count').textContent=`Mostrando ${filtered.length} de ${items.length} tipos.`;
    root.querySelectorAll('[data-edit-type]').forEach(button=>button.addEventListener('click',()=>edit(items.find(item=>item.id===button.dataset.editType))));
  }
  async function list(notice=''){
    if(stopped)return;
    const serial=++version;mode='list';current=null;initial='';
    container.innerHTML=`<section class="entrepreneur-types" data-voice-guide="Aquí se gestionan los tipos de emprendimiento, como Artesanías, Alimentos o Servicios. Usa Agregar tipo para crear uno. Puedes buscar por nombre y pulsar Editar junto al tipo que quieras cambiar."><div class="section-heading"><div><h2 tabindex="-1">Tipos de emprendimiento</h2><p>Las opciones que aparecen al editar los datos de una tienda.</p></div><button type="button" id="add-entrepreneur-type">${icon('shop')}Agregar tipo</button></div><p data-type-status class="owner-status" role="status">${escape(notice)}</p><div class="admin-type-search"><label for="entrepreneur-type-search">Buscar tipo de emprendimiento</label><input id="entrepreneur-type-search" type="search" placeholder="Ejemplo: artesanías" disabled><p id="entrepreneur-type-count" role="status">Cargando tipos…</p></div><div id="entrepreneur-types-list"></div></section>`;
    root=container.querySelector('.entrepreneur-types');root.querySelector('h2').focus({preventScroll:true});
    root.querySelector('#add-entrepreneur-type').addEventListener('click',()=>edit());
    try{
      const result=await db.listItems('entrepreneurTypes');
      if(!alive() || serial!==version)return;
      items=result;root.querySelector('#entrepreneur-type-search').disabled=false;rows();
      root.querySelector('#entrepreneur-type-search').addEventListener('input',rows);
    }catch{
      if(!alive() || serial!==version)return;
      root.querySelector('#entrepreneur-type-count').textContent='';tell('No pudimos cargar los tipos. Revisa tu conexión y vuelve a intentarlo.',true);
      const button=document.createElement('button');button.textContent='Intentar nuevamente';button.type='button';button.addEventListener('click',()=>list());root.querySelector('#entrepreneur-types-list').append(button);
    }
  }
  function edit(item=null){
    if(stopped)return;
    ++version;mode='edit';current=item ? {...item} : {id:crypto.randomUUID(),name:null};initial=item?.name || '';
    container.innerHTML=`<section class="entrepreneur-types" data-voice-guide="Escribe el nombre del tipo de emprendimiento y pulsa Guardar tipo. Si cambias un nombre, las tiendas ya guardadas conservarán su dato hasta que lo cambien. Cancelar permite volver sin guardar."><div class="editor-heading"><div><p class="public-eyebrow">Administración · Tipos de emprendimiento</p><h2 tabindex="-1">${item ? 'Editar tipo' : 'Agregar tipo'}</h2></div></div><div class="form-card"><form id="entrepreneur-type-form"><label for="entrepreneur-type-name">Nombre del tipo de emprendimiento</label><input id="entrepreneur-type-name" required maxlength="120" value="${escape(initial)}" aria-describedby="entrepreneur-type-help"><p id="entrepreneur-type-help" class="editor-hint">Ejemplos: Artesanías, Alimentos o Servicios.</p>${item ? '<p class="editor-hint">El nuevo nombre aparecerá en las próximas selecciones. Las tiendas ya guardadas conservarán su dato hasta que lo cambien.</p>' : ''}<p data-type-status class="owner-status" role="status"></p><div class="owner-actions"><button type="submit" id="save-entrepreneur-type">${icon('check')}Guardar tipo</button><button type="button" id="cancel-entrepreneur-type">Cancelar</button></div></form></div></section>`;
    root=container.querySelector('.entrepreneur-types');root.querySelector('h2').focus({preventScroll:true});
    const form=root.querySelector('form'),field=root.querySelector('#entrepreneur-type-name');
    field.addEventListener('input',()=>field.setCustomValidity(''));
    root.querySelector('#cancel-entrepreneur-type').addEventListener('click',()=>{if(requestLeave())list();});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      if(!field.value.trim()){field.setCustomValidity('Escribe el nombre del tipo de emprendimiento.');field.reportValidity();return;}
      busy=true;field.disabled=true;root.querySelectorAll('button').forEach(button=>{button.disabled=true;});const button=root.querySelector('#save-entrepreneur-type');button.setAttribute('aria-busy','true');tell('Guardando el tipo…');
      try{
        await db.saveEntrepreneurType({id:current.id,name:field.value,expectedName:current.name});
        if(!alive())return;initial=field.value;await list('Tipo de emprendimiento guardado.');
      }catch(error){
        if(alive() && form.isConnected)tell(['invalid_entrepreneur_type','duplicate_entrepreneur_type','entrepreneur_type_changed'].includes(error.code) ? error.message : 'No pudimos confirmar el guardado. Revisa tu conexión y vuelve a intentarlo. Conservamos el nombre escrito.',true);
      }finally{
        busy=false;if(form.isConnected){field.disabled=false;form.querySelectorAll('button').forEach(button=>{button.disabled=false;});button.removeAttribute('aria-busy');}
      }
    });
  }
  window.addEventListener('beforeunload',event=>{if(dirty() || busy){event.preventDefault();event.returnValue='';}},{signal:events.signal});
  list();
  return {requestLeave,dispose(){stopped=true;++version;events.abort();}};
}
