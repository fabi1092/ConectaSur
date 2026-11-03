import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithReadRetry } from '../../web/read-retry.js';

test('una consulta recupera una respuesta 502 temporal y conserva opciones de la petición', async () => {
  let calls = 0; const delays = [], init = {method:'GET',headers:{Authorization:'sesión-ficticia'}};
  const response = await fetchWithReadRetry('https://ejemplo.cl/datos',init,async (url, options) => {
    assert.equal(url,'https://ejemplo.cl/datos');assert.equal(options,init);
    return new Response(++calls === 1 ? 'temporal' : 'correcto',{status:calls === 1 ? 502 : 200});
  },async delay => delays.push(delay));
  assert.equal(await response.text(),'correcto');assert.equal(calls,2);assert.deepEqual(delays,[400]);
});
test('el máximo es tres intentos de lectura y no se reintentan rechazos de permisos', async () => {
  let calls = 0;
  const response = await fetchWithReadRetry('https://ejemplo.cl',{},async () => {calls++;return new Response('no disponible',{status:503});},async()=>{});
  assert.equal(calls,3);assert.equal(response.status,503);assert.equal(await response.text(),'no disponible');
  calls = 0;
  await fetchWithReadRetry('https://ejemplo.cl',{},async () => {calls++;return new Response('denegado',{status:403});},async()=>{});
  assert.equal(calls,1);
});
test('ninguna escritura ni sesión cancelada se repite automáticamente', async () => {
  for(const method of ['POST','PATCH','PUT','DELETE']){
    let calls = 0;const response = await fetchWithReadRetry('https://ejemplo.cl',{method},async()=>{calls++;return new Response('temporal',{status:502});},async()=>{});
    assert.equal(calls,1);assert.equal(response.status,502);
  }
  const controller = new AbortController();let calls = 0;
  await assert.rejects(fetchWithReadRetry('https://ejemplo.cl',{signal:controller.signal},async()=>{calls++;return new Response('temporal',{status:504});},async()=>controller.abort()),error=>error.name==='AbortError');
  assert.equal(calls,1);
});
