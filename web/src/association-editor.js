import { escapeHtml as escape } from './content.js';
import { shopLogo, wireShopImages } from './public-shops.js';
import { prepareImage } from './prepare-image.js';
import { icon } from './visuals.js';

export function showAssociationEditor(container, db, association, { onCancel, onSaved }) {
  const id = association?.id || crypto.randomUUID();
  const initial = { name:association?.name || '', description:association?.description || '', sector:association?.sector || '', contact:association?.contact || '' };
  let stopped=false, saving=false, preparing=false, saved=false, file=null, previewUrl=null, uploadedUrl=null;
  let logoUrl=association?.logo_url || null;
  container.innerHTML=`<section class="association-editor" data-voice-guide="Aquí puedes crear o editar una asociación y su logo. Elige una imagen para revisarla. El logo se publica cuando pulsas Guardar asociación. Quitar logo prepara su retiro al guardar. Cancelar vuelve sin guardar los cambios.">
    <div class="editor-heading"><div><p class="public-eyebrow">Administración · Asociaciones</p><h2 tabindex="-1">${association ? 'Editar asociación' : 'Crear asociación'}</h2><p>Completa sus datos y revisa el logo antes de guardar.</p></div><button id="assoc-back" type="button" class="owner-secondary">Volver a asociaciones</button></div>
    <form id="asociacion-form"><fieldset id="assoc-fields"><legend class="visually-hidden">Datos y logo de la asociación</legend><div class="shop-editor-layout">
      <div class="editor-card"><label for="assoc-nombre">Nombre</label><input id="assoc-nombre" required maxlength="120" value="${escape(initial.name)}">
      <label for="assoc-descripcion">Descripción</label><textarea id="assoc-descripcion" rows="4" maxlength="1000">${escape(initial.description)}</textarea>
      <label for="assoc-sector">Sector</label><input id="assoc-sector" maxlength="240" value="${escape(initial.sector)}">
      <label for="assoc-contacto">Contacto</label><input id="assoc-contacto" maxlength="240" value="${escape(initial.contact)}"></div>
      <aside class="editor-card editor-logo-card"><h3>Logo de la asociación</h3><p>Una imagen para reconocerla.</p><div id="assoc-preview" class="editor-logo-preview">${shopLogo({name:initial.name || 'Asociación',logoUrl},true)}</div>
      <label class="owner-secondary editor-file-label" for="assoc-logo">${icon('shop')}Elegir logo</label><input class="editor-file-input" id="assoc-logo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="assoc-logo-status assoc-logo-help">
      <button id="assoc-remove-logo" type="button" class="editor-remove">Quitar logo</button><p id="assoc-logo-status" role="status" class="editor-hint">${logoUrl ? 'Este es el logo actual.' : 'Aún no has agregado un logo.'}</p>
      <p id="assoc-logo-help" class="editor-hint">JPG, PNG o WebP. Ajustaremos la imagen antes de subirla. Se publicará al guardar.</p><div class="editor-photo-tip">${icon('check')}<p>Usa una imagen nítida, con buena luz y el logo completo dentro del encuadre.</p></div></aside>
    </div></fieldset><div class="editor-save-bar"><p id="assoc-status" role="status" class="editor-status"></p><div class="owner-actions"><button class="public-primary" id="assoc-save" type="submit">Guardar asociación ${icon('check')}</button><button id="assoc-cancel" type="button" class="owner-secondary">Cancelar</button></div></div></form></section>`;
  const root=container.querySelector('.association-editor'), form=root.querySelector('form'), preview=root.querySelector('#assoc-preview');
  const alive=()=>!stopped && root.isConnected;
  const values=()=>Object.fromEntries(Object.keys(initial).map(key=>[key,root.querySelector({name:'#assoc-nombre',description:'#assoc-descripcion',sector:'#assoc-sector',contact:'#assoc-contacto'}[key]).value]));
  const dirty=()=>!saved && (preparing || file!==null || logoUrl!==(association?.logo_url || null) || JSON.stringify(values())!==JSON.stringify(initial));
  const release=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}};
  const tell=(text,error=false)=>{
    const node=root.querySelector('#assoc-status');node.textContent=text;node.className='editor-status'+(error?' owner-error':'');node.setAttribute('role',error?'alert':'status');
  };
  function controls(){
    root.querySelector('#assoc-fields').disabled=saving;
    root.querySelector('#assoc-save').disabled=saving || preparing;
    root.querySelector('#assoc-save').setAttribute('aria-busy',String(saving));
    root.querySelector('#assoc-logo').disabled=saving || preparing;
    root.querySelector('#assoc-remove-logo').disabled=saving || preparing || (!file && !logoUrl);
    root.querySelectorAll('#assoc-back,#assoc-cancel').forEach(button=>{button.disabled=saving;});
  }
  root.querySelector('h2').focus({preventScroll:true});wireShopImages(root);controls();
  root.querySelector('#assoc-nombre').addEventListener('input',event=>event.target.setCustomValidity(''));
  root.querySelectorAll('#assoc-back,#assoc-cancel').forEach(button=>button.addEventListener('click',onCancel));
  root.querySelector('#assoc-logo').addEventListener('change',async event=>{
    const selected=event.target.files[0];if(!selected)return;
    preparing=true;controls();root.querySelector('#assoc-logo-status').textContent='Preparando la imagen…';
    try{
      const prepared=await prepareImage(selected);if(!alive())return;
      release();file=prepared;uploadedUrl=null;previewUrl=URL.createObjectURL(prepared);
      const image=new Image();image.src=previewUrl;image.alt='Vista previa del nuevo logo de la asociación';preview.replaceChildren(image);
      root.querySelector('#assoc-logo-status').textContent='Logo listo. Se publicará al guardar.';tell('Revisa el logo y los datos antes de guardar.');
    }catch(error){if(alive()){root.querySelector('#assoc-logo-status').textContent='Se conserva la imagen anterior.';tell(error.message,true);}}
    finally{preparing=false;if(alive()){event.target.value='';controls();}}
  });
  root.querySelector('#assoc-remove-logo').addEventListener('click',()=>{
    release();file=null;uploadedUrl=null;logoUrl=null;
    preview.innerHTML=shopLogo({name:values().name || 'Asociación',logoUrl:null},true);
    root.querySelector('#assoc-logo-status').textContent='El logo se quitará al guardar.';tell('Revisa los cambios y pulsa Guardar asociación para confirmarlos.');controls();
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(saving || preparing)return;
    const data=values();data.name=data.name.trim();
    if(!data.name){const field=root.querySelector('#assoc-nombre');field.setCustomValidity('Escribe el nombre de la asociación.');field.reportValidity();return;}
    saving=true;controls();tell('Guardando la asociación…');
    try{
      // Conservar la URL subida en memoria permite reintentar un guardado sin subir otra copia.
      if(file && !uploadedUrl)uploadedUrl=await db.uploadAssociationLogo(id,file);
      const result=await db.saveAssociation(id,{...data,active:association?.active ?? true,logoUrl:file ? uploadedUrl : logoUrl});
      if(!alive())return;saved=true;release();onSaved(result);
    }catch(error){if(alive())tell(['invalid_association','invalid_association_logo'].includes(error.code) ? error.message : 'No pudimos confirmar el guardado. Revisa tu conexión y vuelve a intentarlo. Tus datos y el logo siguen preparados.',true);}
    finally{saving=false;if(alive())controls();}
  });
  return {
    requestLeave(){if(!alive())return true;if(saving){tell('Espera a que termine el guardado.');return false;}return !dirty() || window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?');},
    dispose(){stopped=true;release();file=null;uploadedUrl=null;}
  };
}
