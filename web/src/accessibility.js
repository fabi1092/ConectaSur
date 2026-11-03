import { icon } from './visuals.js';
import { chileanSpeech } from './content.js';
import './accessibility.css';

const storageKey = 'conectasur-accessibility-v1';
const defaults = { size: 'normal', contrast: false, slow: true };
const guides = [
  ['#owner-login-form', 'Ingresa con tu correo y contraseña. Puedes activar Mostrar contraseña para revisar lo escrito. Después pulsa Iniciar sesión.'],
  ['#shop-editor-form', 'Aquí puedes cambiar los datos y el logo de tu tienda. Elige una imagen para revisarla. Los cambios se publican cuando pulsas Guardar cambios. Cancelar te permite volver sin guardar.'],
  ['.owner-home', 'Esta es tu tienda. En Mis productos puedes agregar fotos, precios y unidades disponibles. Mis ventas permite registrar ventas y consultar tu historial privado. Editar tienda permite cambiar tus datos y logo. Cierra tu sesión al terminar si compartes este equipo.'],
  ['#owner-product-list', 'Estos son tus productos. Agregar producto te guía para crear uno nuevo. Editar producto permite cambiar sus datos y unidades. Eliminar pide confirmación. Puedes buscar por nombre o elegir una categoría.'],
  ['.admin-site', 'Este es el panel administrativo. Elige una sección para gestionar emprendedoras, asociaciones, categorías o tipos de producto. Usa Cerrar sesión al terminar.']
];

export function initAccessibility(app) {
  let settings = { ...defaults };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) settings = { size: ['normal','large','largest'].includes(saved.size) ? saved.size : 'normal', contrast: saved.contrast === true, slow: saved.slow !== false };
  } catch { /* Las ayudas siguen disponibles si el navegador bloquea el almacenamiento. */ }
  const events = new AbortController();
  let readVersion = 0, readingScope = null, reading = false, paused = false, utterance = null;
  let dictation = null, dictationVersion = 0;
  const synthesis = window.speechSynthesis;
  const tools = document.createElement('aside');
  tools.id = 'accessibility-tools'; tools.className = 'accessibility-tools';
  tools.setAttribute('aria-label','Ayudas para usar ConectaSur');
  tools.innerHTML = `<div class="accessibility-inner"><span class="accessibility-title">${icon('help')}A tu manera</span><button type="button" id="access-read">${icon('volume')}Escuchar esta pantalla</button><div class="accessibility-size"><label for="access-size">Letras y botones</label><select id="access-size"><option value="normal">Tamaño normal</option><option value="large">Grande</option><option value="largest">Muy grande</option></select></div><button type="button" id="access-contrast" aria-pressed="false">${icon('contrast')}Más contraste</button><details class="accessibility-options"><summary>Más ayudas</summary><div><label class="accessibility-check"><input id="access-slow" type="checkbox">Leer más despacio</label><p>Escuchar lee las instrucciones. Hablar para escribir permite dictar el nombre y la descripción del producto.</p><p>El micrófono se activa al pulsar Hablar. El dictado depende de tu navegador y puede necesitar Internet. También puedes usar el micrófono del teclado.</p><button type="button" id="access-reset">Restablecer tamaño y contraste</button></div></details><div class="accessibility-playback" hidden><button type="button" id="access-pause">Pausar lectura</button><button type="button" id="access-stop">Detener lectura</button></div><p id="access-status" role="status" aria-live="polite"></p></div>`;
  app.before(tools);
  const status = tools.querySelector('#access-status');
  function tell(message, error = false, scope = readingScope) {
    const local=(scope?.isConnected && scope.querySelector('[data-reading-status]')) || document.querySelector('dialog[open] [data-reading-status]') || app.querySelector('[data-voice-guide]:not(dialog) [data-reading-status]');
    status.textContent=local ? '' : message;
    const target=local || status;target.textContent=message;target.setAttribute('role',error ? 'alert' : 'status');
  }
  function apply() {
    document.documentElement.dataset.textSize = settings.size;
    document.documentElement.dataset.contrast = settings.contrast ? 'high' : 'normal';
    tools.querySelector('#access-size').value = settings.size;
    tools.querySelector('#access-contrast').setAttribute('aria-pressed',String(settings.contrast));
    tools.querySelector('#access-slow').checked = settings.slow;
  }
  function persist() { apply(); try { localStorage.setItem(storageKey,JSON.stringify(settings)); } catch { tell('Aplicamos tu elección. Este navegador no permitió recordarla para la próxima visita.'); } }
  function playback() {
    tools.querySelector('.accessibility-playback').hidden = !reading;
    tools.querySelector('#access-pause').textContent = paused ? 'Continuar lectura' : 'Pausar lectura';
    tools.querySelector('#access-read').setAttribute('aria-pressed',String(reading));
    document.querySelectorAll('[data-stop-reading]').forEach(button=>{button.hidden=!reading || !readingScope?.contains(button);});
    document.querySelectorAll('[data-pause-reading]').forEach(button=>{button.hidden=!reading || !readingScope?.contains(button);button.textContent=paused ? 'Continuar lectura' : 'Pausar lectura';});
  }
  function stopReading(announce = false) {
    const previousScope=readingScope;
    readVersion++; reading = false; paused = false; readingScope = null; utterance = null;
    synthesis?.cancel(); playback(); if(announce) tell('Lectura detenida.',false,previousScope);
  }
  async function voices() {
    const current = synthesis.getVoices();
    if(current.length) return current;
    return new Promise(resolve => {
      let timer;
      const done = () => { clearTimeout(timer); synthesis.removeEventListener?.('voiceschanged',done); resolve(synthesis.getVoices()); };
      synthesis.addEventListener?.('voiceschanged',done,{once:true});
      timer = setTimeout(done,1500);
    });
  }
  async function speak(text, scope) {
    stopReading(); const version = readVersion;
    if(!synthesis || !window.SpeechSynthesisUtterance) { tell('Este navegador no tiene lectura en voz alta. Puedes usar el lector de pantalla de tu teléfono.',true); return; }
    readingScope=scope;
    const available = (await voices()).filter(voice=>voice.lang?.toLowerCase().startsWith('es'));
    if(version !== readVersion || (scope && !scope.isConnected)) return;
    const voice = available.sort((a,b)=>(a.localService ? 0 : 2)+(a.lang.toLowerCase()==='es-cl' ? 0 : 1)-((b.localService ? 0 : 2)+(b.lang.toLowerCase()==='es-cl' ? 0 : 1)))[0];
    if(!voice) { readingScope=null;tell('No encontramos una voz en español disponible. Revisa las voces de lectura de tu dispositivo o usa su lector de pantalla.',true); return; }
    const clean = chileanSpeech(text).replace(/\s+/g,' ').trim().slice(0,6000);
    if(!clean) { tell('Todavía no hay instrucciones para leer.'); return; }
    // Fragmentos breves evitan lecturas demasiado largas en algunos navegadores móviles.
    const chunks = clean.match(/.{1,220}(?:\s|$)|\S{1,220}/g) || [clean];
    readingScope = scope; reading = true; playback(); tell('Leyendo en español. Puedes pausar o detener la lectura.');
    let index = 0;
    const play = () => {
      if(version !== readVersion || !reading) return;
      utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = settings.slow ? .8 : 1;
      utterance.onend = () => { if(version !== readVersion) return; if(++index < chunks.length) play(); else { const previousScope=readingScope;reading=false;paused=false;readingScope=null;playback();tell('Terminó la lectura.',false,previousScope); } };
      utterance.onerror = () => { if(version !== readVersion) return; stopReading();tell('No pudimos reproducir la lectura. Revisa el volumen y la voz en español de tu dispositivo.',true); };
      try { synthesis.speak(utterance); } catch { stopReading(); tell('No pudimos iniciar la lectura. Intenta nuevamente.',true); }
    };
    play();
  }
  function readingText(scope) {
    if(scope?.dataset.voiceGuide) return scope.dataset.voiceGuide;
    if(scope?.matches('dialog')) return scope.innerText;
    const guided = app.querySelector('[data-voice-guide]:not(dialog)');
    if(guided) return guided.dataset.voiceGuide;
    const guide = guides.find(([selector])=>app.querySelector(selector));
    if(guide) return guide[1];
    return (app.querySelector('main') || app).innerText.slice(0,6000);
  }
  function readCurrent() {
    const scope = document.querySelector('dialog[open]') || app.querySelector('[data-voice-guide]:not(dialog)') || app.querySelector('main') || app;
    speak(readingText(scope),scope);
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'dictation-dialog'; dialog.className = 'assistance-dialog';
  dialog.setAttribute('aria-labelledby','dictation-title');
  dialog.innerHTML = `<h2 id="dictation-title">Hablar para escribir</h2><p id="dictation-instruction"></p><p id="dictation-status" role="status" aria-live="polite"></p><label for="dictation-preview">Texto reconocido: puedes corregirlo aquí</label><textarea id="dictation-preview" rows="4" disabled></textarea><p id="dictation-replacement"></p><p data-reading-status role="status"></p><div class="assistance-actions"><button type="button" id="dictation-listen">${icon('volume')}Escuchar el texto</button><button type="button" data-pause-reading hidden>Pausar lectura</button><button type="button" data-stop-reading hidden>Detener lectura</button><button type="button" id="dictation-stop">Detener micrófono</button><button type="button" id="dictation-retry">Volver a hablar</button><button type="button" id="dictation-cancel">Cancelar dictado</button><button type="button" id="dictation-use" class="public-primary">Usar este texto</button></div>`;
  document.body.append(dialog);
  const preview = dialog.querySelector('#dictation-preview'), dictStatus = dialog.querySelector('#dictation-status');
  function dictState(message, listening = false) {
    const tooLong=dictation?.field.maxLength > 0 && preview.value.length > dictation.field.maxLength;
    dictStatus.textContent = tooLong ? `El texto es demasiado largo. Acórtalo a ${dictation.field.maxLength} caracteres antes de usarlo.` : message;
    dialog.querySelector('#dictation-stop').hidden = !listening;
    dialog.querySelector('#dictation-retry').disabled = listening;
    dialog.querySelector('#dictation-use').disabled = listening || !preview.value.trim() || (dictation?.field.maxLength > 0 && preview.value.length > dictation.field.maxLength);
    dialog.querySelector('#dictation-listen').disabled = listening || !preview.value.trim();
    preview.disabled = listening;
  }
  function endRecognizer(abort = true) {
    if(!dictation) return;
    clearTimeout(dictation.timer); const recognizer = dictation.recognizer; dictation.recognizer = null;
    if(recognizer) { try { abort ? recognizer.abort() : recognizer.stop(); } catch { /* Ya terminó. */ } }
  }
  function closeDictation() {
    dictationVersion++; const source = dictation?.source;
    endRecognizer(); dictation = null; stopReading(); preview.value='';dialog.querySelector('[data-reading-status]').textContent='';
    if(dialog.open) dialog.close();
    if(source?.isConnected) source.focus({preventScroll:true});
  }
  function record() {
    endRecognizer(); stopReading();
    const version = ++dictationVersion;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!Recognition) { dictState('Este navegador no permite dictado. Puedes usar el micrófono del teclado o escribir en el formulario.'); return; }
    let recognizer;
    try { recognizer = new Recognition(); } catch { dictState('No pudimos iniciar el dictado en este navegador. Puedes usar el micrófono del teclado.');return; }
    dictation.recognizer = recognizer; dictation.failure=''; preview.value='';
    recognizer.lang='es-CL'; recognizer.continuous=false; recognizer.interimResults=false; recognizer.maxAlternatives=1;
    const current = () => !!dictation && version === dictationVersion && dictation.field.isConnected;
    recognizer.onstart = () => { if(current()) dictState('Te escuchamos. Di el texto con calma.',true); };
    recognizer.onresult = event => {
      if(!current()) return;
      preview.value = Array.from(event.results).filter(result=>result.isFinal !== false).map(result=>result[0]?.transcript || '').join(' ').trim();
      const tooLong = dictation.field.maxLength > 0 && preview.value.length > dictation.field.maxLength;
      dictState(tooLong ? `El texto es demasiado largo. Acórtalo a ${dictation.field.maxLength} caracteres antes de usarlo.` : 'Revisa o escucha el texto. Se agregará al formulario cuando pulses Usar este texto.');
    };
    recognizer.onerror = event => {
      if(!current()) return;
      const messages = { 'not-allowed':'No se permitió el micrófono. Puedes revisar el permiso del navegador o usar el teclado.', 'service-not-allowed':'El dictado no está disponible en este navegador. Puedes usar el micrófono del teclado.', 'audio-capture':'No encontramos un micrófono disponible. Revisa tu dispositivo.', network:'La conexión del dictado falló. Tus datos del formulario se conservan.', 'no-speech':'No escuchamos palabras. Puedes volver a hablar.', 'language-not-supported':'El servicio no permite dictado en español en este dispositivo.' };
      dictation.failure=messages[event.error] || 'El dictado se interrumpió. Puedes volver a hablar o cancelar.';
      dictState(dictation.failure);
    };
    recognizer.onend = () => { if(current()) { clearTimeout(dictation.timer);dictation.recognizer=null;dictState(dictation.failure || (preview.value.trim() ? 'Puedes corregir, escuchar y usar el texto reconocido.' : 'No se agregó texto al formulario. Puedes volver a hablar.')); } };
    dictState('Abriendo el micrófono…',true);
    try { recognizer.start(); dictation.timer=setTimeout(()=>{if(current()){endRecognizer(false);dictState('Terminó el tiempo de dictado. Puedes revisar el resultado o volver a hablar.');}},30000); }
    catch { dictation.recognizer=null;dictState('No pudimos abrir el micrófono. Revisa el permiso o usa el teclado.'); }
  }
  function dictate(field,source) {
    if(!field?.matches('[data-dictation-field]') || field.disabled || field.readOnly || field.type === 'password') return;
    if(dictation) closeDictation();
    const label = field.labels?.[0]?.textContent?.trim() || 'este campo';
    dictation = {field,source,recognizer:null,timer:null};
    dialog.querySelector('#dictation-instruction').textContent = `Vamos a escribir ${label.toLocaleLowerCase('es')}. Habla después de que se abra el micrófono.`;
    dialog.querySelector('#dictation-replacement').textContent = field.value ? 'Al usarlo, este texto reemplazará lo escrito en el campo. Puedes cancelar para conservar el anterior.' : 'Podrás revisar el resultado antes de usarlo. El producto se guarda después, desde el formulario.';
    preview.value=''; dialog.showModal();dialog.querySelector('h2').setAttribute('tabindex','-1');dialog.querySelector('h2').focus({preventScroll:true});dialog.scrollTop=0;record();
  }
  preview.addEventListener('input',()=>dictState('Revisa el texto antes de usarlo.'));
  dialog.querySelector('#dictation-cancel').addEventListener('click',closeDictation);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDictation();});
  dialog.querySelector('#dictation-retry').addEventListener('click',record);
  dialog.querySelector('#dictation-stop').addEventListener('click',()=>{endRecognizer(false);dictState('Micrófono detenido. Puedes revisar el resultado o volver a hablar.');});
  dialog.querySelector('#dictation-listen').addEventListener('click',()=>speak(preview.value,dialog));
  dialog.querySelector('#dictation-use').addEventListener('click',()=>{
    const field=dictation?.field, text=preview.value.trim();
    if(!field?.isConnected || field.disabled || !text || (field.maxLength > 0 && text.length > field.maxLength)) return;
    field.value=text; field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true}));
    closeDictation(); field.focus(); tell('Agregamos el texto al formulario. Revísalo antes de guardar.');
  });
  tools.querySelector('#access-size').addEventListener('change',event=>{settings.size=event.target.value;persist();});
  tools.querySelector('#access-contrast').addEventListener('click',()=>{settings.contrast=!settings.contrast;persist();});
  tools.querySelector('#access-slow').addEventListener('change',event=>{settings.slow=event.target.checked;persist();});
  tools.querySelector('#access-reset').addEventListener('click',()=>{settings={...settings,size:defaults.size,contrast:defaults.contrast};persist();tell('Volvimos al tamaño y contraste normales.');});
  tools.querySelector('#access-read').addEventListener('click',readCurrent);
  tools.querySelector('#access-stop').addEventListener('click',()=>stopReading(true));
  function pauseReading() {
    if(!reading) return;
    if(paused) synthesis.resume(); else synthesis.pause(); paused=!paused;playback();tell(paused ? 'Lectura pausada.' : 'Continuamos la lectura.');
  }
  tools.querySelector('#access-pause').addEventListener('click',pauseReading);
  document.addEventListener('click',event=>{
    const button=event.target.closest('button'); if(!button || button.disabled) return;
    if(button.hasAttribute('data-listen')) {
      const scope=button.closest('dialog') || button.closest('[data-voice-guide]') || app.querySelector('main') || app;
      speak(readingText(scope),scope);
    }
    if(button.hasAttribute('data-stop-reading')) stopReading(true);
    if(button.hasAttribute('data-pause-reading')) pauseReading();
    if(button.dataset.dictateFor) dictate(document.getElementById(button.dataset.dictateFor),button);
  },{signal:events.signal});
  document.addEventListener('close',event=>{if(readingScope && event.target.contains(readingScope))stopReading();},{capture:true,signal:events.signal});
  const observer=new MutationObserver(()=>{
    const modal=document.querySelector('dialog[open]');
    if(readingScope && (!readingScope.isConnected || (modal && !modal.contains(readingScope)))) stopReading();
    if(dictation && !dictation.field.isConnected) closeDictation();
  });
  observer.observe(app,{childList:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopReading();if(dictation)closeDictation();}},{signal:events.signal});
  apply();playback();
  return { stop(){stopReading();if(dictation)closeDictation();},dispose(){events.abort();observer.disconnect();stopReading();if(dictation)closeDictation();dialog.remove();tools.remove();} };
}
