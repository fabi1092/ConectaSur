import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whatsappNumber, contactSettings, messageValues, createMessageSender } from '../web/contact-model.js';
import { contactMarkup } from '../web/src/shop-contact.js';

test('WhatsApp normaliza celular chileno y rechaza destinos ajenos a números', () => {
  assert.equal(whatsappNumber('9 1234 5678'),'56912345678');
  assert.equal(whatsappNumber('+56 (9) 1234-5678'),'56912345678');
  for(const value of ['javascript:alert(1)','https://evil.example','123','00000000','+56<script>912345678']) assert.equal(whatsappNumber(value),null);
  assert.throws(()=>contactSettings('both','correo@example.cl'));
  assert.deepEqual(contactSettings('form','+56912345678'),{contact_mode:'form',whatsapp_number:''});
});
test('el modo elegido ofrece solo los canales correspondientes', () => {
  const shop={whatsappNumber:'56912345678'};
  assert.match(contactMarkup({...shop,contactMode:'whatsapp'}),/https:\/\/wa.me\/56912345678/);
  assert.doesNotMatch(contactMarkup({...shop,contactMode:'whatsapp'}),/<form/);
  assert.doesNotMatch(contactMarkup({...shop,contactMode:'form'}),/wa.me/);
  assert.match(contactMarkup({...shop,contactMode:'form'}),/<form/);
  assert.match(contactMarkup({...shop,contactMode:'both'}),/<form/);
  assert.match(contactMarkup({...shop,contactMode:'both'}),/wa.me/);
});
test('valida límites sin convertir HTML del remitente en marcado', () => {
  assert.deepEqual(messageValues({name:' Ana ',contact:' a@b.cl ',body:' <script>hola</script> '}),{name:'Ana',contact:'a@b.cl',body:'<script>hola</script>'});
  for(const values of [{name:'',contact:'abc',body:'hola'},{name:'Ana',contact:'',body:'hola'},{name:'Ana',contact:'abc',body:'x'.repeat(2001)}]) assert.throws(()=>messageValues(values));
});
test('reintentar la misma solicitud usa el mismo identificador y editar genera otro', async () => {
  const ids=[],input={name:'Ana',contact:'test@example.cl',body:'Hola'};let next=0;
  const send=createMessageSender(async (_,id)=>{ids.push(id);throw new Error('Red');},()=>String(++next));
  await assert.rejects(send('shop',input));await assert.rejects(send('shop',input));
  await assert.rejects(send('shop',{...input,body:'Otro mensaje'}));
  assert.deepEqual(ids,['1','1','2']);
});
test('doble pulsación y respuesta tardía no duplican el envío', async () => {
  let finish,calls=0;
  const gate=new Promise(resolve=>finish=resolve);
  const send=createMessageSender(async()=>{calls++;await gate;},()=> 'id');
  const input={name:'Ana',contact:'test@example.cl',body:'Hola'};
  const first=send('shop',input);assert.equal(await send('shop',input),false);
  finish();assert.equal(await first,true);assert.equal(await send('shop',input),false);assert.equal(calls,1);
});
