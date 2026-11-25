import {escapeHtml as escape} from './content.js';

// Visor de la bitácora administrativa (W08).
// Lee public.admin_actions (solo administradores, por RLS) con filtros y paginación en el servidor.
// Los nombres se resuelven con listas ya existentes; si no se encuentran se muestra el identificador.

const ACTIONS={INSERT:'Creó',UPDATE:'Modificó',DELETE:'Eliminó'};
const TABLES={
  profiles:{label:'Cuenta',group:'cuentas'},
  shops:{label:'Tienda',group:'tiendas'},
  associations:{label:'Asociación',group:'asociaciones'},
  shop_associations:{label:'Tienda en asociación',group:'asociaciones'},
  fairs:{label:'Feria',group:'ferias'},
  fair_participants:{label:'Participante de feria',group:'ferias'},
  platform_settings:{label:'Configuración de la plataforma',group:'configuracion'}
};
const PAGE=100;
const GROUPS=[['all','Todo'],['cuentas','Cuentas'],['asociaciones','Asociaciones'],['ferias','Ferias'],['tiendas','Tiendas'],['configuracion','Configuración']];

const normalize=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLocaleLowerCase('es-CL');
const when=value=>{
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Fecha desconocida':date.toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'medium'});
};
const shortId=id=>id?(String(id).length>12?String(id).slice(0,8)+'…':String(id)):'sin identificador';
// Las fechas del filtro se interpretan en la hora local de quien usa el panel.
const startOfDay=value=>value?new Date(value+'T00:00:00').getTime():null;
const endOfDay=value=>value?new Date(value+'T23:59:59.999').getTime():null;

export function showAdminAudit(container,db){
  let stopped=false,serial=0,root=null,entries=[],total=0,partialNames=false,names={actors:new Map(),targets:new Map()};
  const alive=()=>!stopped && root?.isConnected;

  function tell(text,error=false){
    if(!alive())return;
    const el=root.querySelector('[data-audit-status]');
    el.textContent=text;el.className='owner-status'+(error?' owner-error':'');el.setAttribute('role',error?'alert':'status');
  }

  function actorLabel(uid){
    if(!uid)return 'Sistema o sesión desconocida';
    const admin=names.actors.get(uid);
    return admin?`${admin.displayName||'Sin nombre'} (${admin.email})`:`Administrador ${shortId(uid)}`;
  }
  function targetLabel(entry){
    const info=TABLES[entry.target_table];
    const kind=info?info.label:entry.target_table;
    const key=entry.target_table==='profiles'
      ?(names.actors.get(entry.target_id)?.displayName||names.targets.get('profiles:'+entry.target_id))
      :names.targets.get(entry.target_table+':'+entry.target_id);
    return {kind,name:key||`ID ${shortId(entry.target_id)}`};
  }

  function render(){
    if(!alive())return;
    const term=normalize(root.querySelector('#audit-search').value.trim());
    const filtered=term?entries.filter(entry=>{
      const target=targetLabel(entry);
      return normalize(`${actorLabel(entry.actor_uid)} ${target.kind} ${target.name} ${entry.target_id}`).includes(term);
    }):entries;
    root.querySelector('#audit-count').textContent=term
      ?`Mostrando ${filtered.length} de los ${entries.length} registros cargados (${total} en total con estos filtros).`
      :`Mostrando ${entries.length} de ${total} registros con estos filtros.`;
    root.querySelector('#audit-body').innerHTML=filtered.length?filtered.map(entry=>{
      const target=targetLabel(entry);
      return `<tr><td>${escape(when(entry.created_at))}</td><td>${escape(actorLabel(entry.actor_uid))}</td><td>${escape(ACTIONS[entry.action]||entry.action)}</td><td>${escape(target.kind)}<small>${escape(target.name)}</small></td></tr>`;
    }).join(''):'<tr><td colspan="4">No hay registros con esos filtros.</td></tr>';
    const more=root.querySelector('#audit-more');
    more.hidden=entries.length>=total;
  }

  // Consulta a Supabase con los filtros elegidos; los administradores solo pueden leer esta tabla por RLS.
  async function fetchPage(offset){
    const group=root.querySelector('#audit-group').value;
    const action=root.querySelector('#audit-action').value;
    const actor=root.querySelector('#audit-actor').value;
    const from=startOfDay(root.querySelector('#audit-from').value);
    const to=endOfDay(root.querySelector('#audit-to').value);
    let query=db.client.from('admin_actions').select('*',{count:'exact'});
    if(group!=='all')query=query.in('target_table',Object.keys(TABLES).filter(key=>TABLES[key].group===group));
    if(action!=='all')query=query.eq('action',action);
    if(actor!=='all')query=query.eq('actor_uid',actor);
    if(from!==null)query=query.gte('created_at',new Date(from).toISOString());
    if(to!==null)query=query.lte('created_at',new Date(to).toISOString());
    const {data,error,count}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+PAGE-1);
    if(error)throw error;
    return {rows:data||[],count:count??0};
  }

  async function loadNames(){
    const profilesPromise=typeof db.client?.from==='function'
      ?db.client.from('profiles').select('id,display_name')
      :Promise.resolve({data:[],error:null});
    const [admins,fairs,associations,shops,profiles]=await Promise.allSettled([
      db.listAdministrators(),db.listAdminFairs(),db.listAssociations(),db.listShops(),profilesPromise
    ]);
    names={actors:new Map(),targets:new Map()};
    if(admins.status==='fulfilled')admins.value.forEach(item=>names.actors.set(item.uid,item));
    if(fairs.status==='fulfilled')fairs.value.forEach(item=>names.targets.set('fairs:'+item.id,item.name));
    if(associations.status==='fulfilled')associations.value.forEach(item=>names.targets.set('associations:'+item.id,item.name));
    if(shops.status==='fulfilled')shops.value.forEach(item=>{names.targets.set('shops:'+item.id,item.name);names.targets.set('shop_associations:'+item.id,item.name);});
    if(profiles.status==='fulfilled' && !profiles.value?.error && Array.isArray(profiles.value?.data)){
      profiles.value.data.forEach(item=>{if(item.display_name)names.targets.set('profiles:'+item.id,item.display_name);});
    }
    const select=root.querySelector('#audit-actor');
    const current=select.value;
    const ids=[...names.actors.keys()];
    select.innerHTML='<option value="all">Todos los administradores</option>'+ids.map(uid=>`<option value="${escape(uid)}">${escape(actorLabel(uid))}</option>`).join('');
    if(ids.includes(current))select.value=current;
    const profilesFailed=profiles.status==='rejected' || Boolean(profiles.value?.error);
    return [admins,fairs,associations,shops].some(item=>item.status==='rejected') || profilesFailed;
  }

  // append=false: vuelve a la primera página con los filtros actuales. append=true: agrega la siguiente.
  async function load(append=false){
    const ticket=++serial;
    tell('Cargando registros…');
    root.querySelector('#audit-refresh').disabled=true;root.querySelector('#audit-more').disabled=true;
    try{
      if(!append && !names.actors.size)partialNames=await loadNames();
      if(!alive() || ticket!==serial)return;
      const page=await fetchPage(append?entries.length:0);
      if(!alive() || ticket!==serial)return;
      entries=append?entries.concat(page.rows):page.rows;
      total=page.count;
      render();
      tell(total?(partialNames?'Algunos nombres no se pudieron cargar y se muestran como identificador.':'Registros actualizados.'):'No hay acciones administrativas registradas con estos filtros.');
    }catch{
      if(!alive() || ticket!==serial)return;
      if(!append){entries=[];total=0;root.querySelector('#audit-body').innerHTML='';root.querySelector('#audit-count').textContent='';root.querySelector('#audit-more').hidden=true;}
      tell('No pudimos cargar la bitácora. Revisa tu conexión y que tu cuenta siga activa, y vuelve a intentarlo.',true);
    }finally{
      if(alive() && ticket===serial){root.querySelector('#audit-refresh').disabled=false;root.querySelector('#audit-more').disabled=false;}
    }
  }

  container.innerHTML=`<section class="admin-accounts" data-voice-guide="Aquí se consultan las acciones de los administradores: quién las hizo, qué hizo y cuándo. Puedes filtrar por tipo de registro, acción, administrador y fechas.">
    <div class="section-heading"><div><p class="public-eyebrow">Administración · Seguridad</p><h2 tabindex="-1">Bitácora administrativa</h2><p>Consulta quién hizo cambios en cuentas, asociaciones y ferias, qué hizo y cuándo.</p></div><button type="button" id="audit-refresh">Actualizar</button></div>
    <p data-audit-status class="owner-status" role="status"></p>
    <div class="admin-account-filters">
      <div><label for="audit-group">Tipo de registro</label><select id="audit-group">${GROUPS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div>
      <div><label for="audit-action">Acción</label><select id="audit-action"><option value="all">Todas las acciones</option><option value="INSERT">Creó</option><option value="UPDATE">Modificó</option><option value="DELETE">Eliminó</option></select></div>
      <div><label for="audit-actor">Quién</label><select id="audit-actor"><option value="all">Todos los administradores</option></select></div>
      <div><label for="audit-from">Desde</label><input id="audit-from" type="date"></div>
      <div><label for="audit-to">Hasta</label><input id="audit-to" type="date"></div>
      <div><label for="audit-search">Buscar en lo cargado</label><input id="audit-search" type="search" placeholder="Nombre, correo o identificador"></div>
    </div>
    <p id="audit-count" role="status"></p>
    <div class="table-wrap"><table><thead><tr><th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Qué hizo</th><th scope="col">Sobre qué</th></tr></thead><tbody id="audit-body"></tbody></table></div>
    <p><button type="button" id="audit-more" hidden>Cargar más registros</button></p>
    <p class="editor-hint">La bitácora registra el tipo de acción, quién la hizo y sobre qué registro. No guarda el contenido exacto de cada cambio. Solo quedan anotadas las acciones hechas con una sesión de administrador.</p>
  </section>`;
  root=container.querySelector('.admin-accounts');
  root.querySelector('h2').focus({preventScroll:true});
  root.querySelector('#audit-refresh').addEventListener('click',()=>{names={actors:new Map(),targets:new Map()};load();});
  root.querySelector('#audit-more').addEventListener('click',()=>load(true));
  ['#audit-group','#audit-action','#audit-actor','#audit-from','#audit-to'].forEach(selector=>root.querySelector(selector).addEventListener('change',()=>load()));
  root.querySelector('#audit-search').addEventListener('input',render);
  load();

  return {requestLeave:()=>true,dispose(){stopped=true;++serial;}};
}
