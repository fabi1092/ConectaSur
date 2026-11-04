import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuth, takeGoogleCallback } from '../web/google-auth.js';

function setup(href = 'https://conectasur.example/app/#ingresar', options = {}) {
  const source = new URL(href);
  const calls = { oauth: [], exchange: [], navigated: [], cleaned: [], fetch: [] };
  const location = { href, origin: source.origin, pathname: source.pathname, assign: value => calls.navigated.push(value) };
  const history = { replaceState: (_state, _title, value) => calls.cleaned.push(value) };
  const sdk = { auth: {
    getSession: async () => ({ data: { session: options.session ?? null }, error: null }),
    signInWithOAuth: async value => { calls.oauth.push(value); return { data: { url: options.authorizationUrl ?? 'https://api.example/auth/v1/authorize?provider=google&code_challenge=hashed-proof' }, error: null }; },
    exchangeCodeForSession: async (...values) => { calls.exchange.push(values); if (options.gate) await options.gate;
      return { data: { session: options.exchangeFailure ? null : { user: { id: 'server-user' } } }, error: options.exchangeFailure ? { message: 'Invalid verifier' } : null }; }
  } };
  const config = { url: 'https://api.example', anonKey: 'public-client-key' };
  const fetcher = async (...args) => { calls.fetch.push(args); return { ok: options.settingsOk ?? true, json: async () => ({ external: { google: options.googleEnabled ?? true } }) }; };
  const auth = createGoogleAuth({ sdk, config, fetcher, storage: options.noStorage ? undefined : {}, location, history });
  return { auth, calls, sdk, location, history };
}

test('Google inicia OAuth real y vuelve a #ingresar en el mismo origen', async () => {
  const { auth, calls } = setup();
  await auth.start();
  assert.deepEqual(calls.oauth, [{ provider: 'google', options: { redirectTo: 'https://conectasur.example/app/?oauth=google#ingresar', skipBrowserRedirect: true } }]);
  assert.equal(calls.navigated.length, 1);
  assert.equal(new URL(calls.navigated[0]).searchParams.get('provider'), 'google');
  assert.equal(calls.exchange.length, 0);
});

test('Proveedor deshabilitado muestra error y no crea una sesión ni inicia el proveedor', async () => {
  const { auth, calls } = setup(undefined, { googleEnabled: false });
  await assert.rejects(auth.start(), { code: 'google_not_configured' });
  assert.equal(calls.oauth.length, 0);
  assert.equal(calls.exchange.length, 0);
  assert.equal(calls.navigated.length, 0);
});

test('Un fallo de configuración HTTP no se confunde con acceso habilitado', async () => {
  const { auth, calls } = setup(undefined, { settingsOk: false });
  await assert.rejects(auth.start(), { code: 'google_not_available' });
  assert.equal(calls.oauth.length, 0);
});

test('No reemplaza una sesión existente al iniciar Google', async () => {
  const { auth, calls } = setup(undefined, { session: { user: { id: 'other-user' } } });
  await assert.rejects(auth.start(), { code: 'session_exists' });
  assert.equal(calls.oauth.length, 0);
});

test('Requiere almacenamiento para conservar el verifier entre navegaciones', async () => {
  const { auth, calls } = setup(undefined, { noStorage: true });
  await assert.rejects(auth.start(), { code: 'google_storage_unavailable' });
  assert.equal(calls.oauth.length, 0);
});

test('No admite un retorno ni una URL de autorización de otro origen', async () => {
  const first = setup();
  await assert.rejects(first.auth.start('https://otro.example/callback'), { code: 'google_invalid_redirect' });
  assert.equal(first.calls.oauth.length, 0);
  const second = setup(undefined, { authorizationUrl: 'https://otro.example/auth/v1/authorize?provider=google' });
  await assert.rejects(second.auth.start(), { code: 'google_not_available' });
  assert.equal(second.calls.navigated.length, 0);
});

test('Retira el desafío de la URL y lo intercambia una vez con su flowId', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const { auth, calls } = setup('https://conectasur.example/app/?language=es&oauth=google&code=server-code&sb_flow_id=flow-1#ingresar', { gate });
  assert.deepEqual(calls.cleaned, ['/app/?language=es#ingresar']);
  const first = auth.complete(), second = auth.complete();
  await Promise.resolve();
  assert.equal(calls.exchange.length, 1);
  finish();
  await Promise.all([first, second]);
  assert.deepEqual(calls.exchange, [['server-code', { flowId: 'flow-1' }]]);
  await auth.complete();
  assert.equal(calls.exchange.length, 1);
});

test('Cancelar Google vuelve al acceso y permite volver a intentar', async () => {
  const { auth, calls } = setup('https://conectasur.example/app/?oauth=google&error=access_denied&error_description=cancelled#ingresar');
  assert.deepEqual(calls.cleaned, ['/app/#ingresar']);
  await assert.rejects(auth.complete(), { code: 'google_cancelled' });
  assert.equal(calls.exchange.length, 0);
  await auth.complete();
  await auth.start();
  assert.equal(calls.oauth.length, 1);
});

test('Un código sin verifier válido no produce una sesión simulada', async () => {
  const { auth, calls } = setup('https://conectasur.example/app/?oauth=google&code=invalid-code#ingresar', { exchangeFailure: true });
  await assert.rejects(auth.complete(), { code: 'google_callback_failed' });
  assert.equal(calls.exchange.length, 1);
  assert.equal(calls.navigated.length, 0);
});

test('No acepta tokens OAuth implícitos recibidos sin PKCE y los retira de la URL', async () => {
  const { auth, calls } = setup('https://conectasur.example/app/#access_token=untrusted&refresh_token=untrusted');
  assert.deepEqual(calls.cleaned, ['/app/#ingresar']);
  await assert.rejects(auth.complete(), { code: 'google_callback_failed' });
  assert.equal(calls.exchange.length, 0);
});

test('La recuperación de contraseña conserva su flujo independiente', () => {
  const { location, history, calls } = setup();
  location.href = 'https://conectasur.example/#access_token=recovery&type=recovery';
  assert.equal(takeGoogleCallback(location, history), null);
  assert.equal(calls.cleaned.length, 0);
});

test('Una sesión iniciada en otra pestaña durante Google no se sustituye', async () => {
  const { auth, calls } = setup('https://conectasur.example/app/?oauth=google&code=server-code#ingresar', { session: { user: { id: 'other-tab' } } });
  await assert.rejects(auth.complete(), { code: 'session_exists' });
  assert.equal(calls.exchange.length, 0);
});

test('El SDK real genera desafío S256 y conserva el verifier, sin tokens en el retorno', async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const values = new Map(), navigated = [];
  let layer;
  try {
    globalThis.window = { location: { href: 'https://conectasur.example/#ingresar', origin: 'https://conectasur.example', pathname: '/', assign: value => navigated.push(value) }, history: { replaceState() {} } };
    globalThis.fetch = async input => {
      assert.equal(String(input), 'https://api.example/auth/v1/settings');
      return new Response(JSON.stringify({ external: { google: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { createDataLayer } = await import('../web/supabase-data.js');
    layer = createDataLayer({ url: 'https://api.example', anonKey: 'public-client-key' }, { storageKey: 'google-test', storage: {
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)
    } });
    await layer.loginWithGoogle();
    assert.equal(navigated.length, 1);
    const authorization = new URL(navigated[0]);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 's256');
    assert.ok(authorization.searchParams.get('code_challenge').length > 30);
    assert.ok([...values.keys()].some(key => key.includes('code-verifier')));
    const callback = new URL(authorization.searchParams.get('redirect_to'));
    assert.equal(callback.hash, '#ingresar');
    assert.equal(callback.searchParams.get('oauth'), 'google');
    assert.equal(callback.searchParams.has('access_token'), false);
    assert.equal(callback.searchParams.has('refresh_token'), false);
  } finally {
    await layer?.dispose();
    await layer?.client.auth.dispose();
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});

test('El callback generado por SDK consume el verifier persistido y consulta el perfil del servidor', async () => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  const values = new Map(), requests = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const config = { url: 'https://api.example', anonKey: 'public-client-key' };
  const uid = '11111111-1111-4111-8111-111111111111';
  const token = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: uid, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' })).toString('base64url') + '.test-signature';
  const user = { id: uid, email: 'buyer@example.test', aud: 'authenticated' };
  let layer, redirect;
  const browser = href => {
    const target = new URL(href);
    return { location: { href, origin: target.origin, pathname: target.pathname, assign: value => { redirect = new URL(value); } },
      history: { replaceState: (_state, _title, value) => { globalThis.window.location.href = new URL(value, target.origin).href; } } };
  };
  try {
    globalThis.window = browser('https://conectasur.example/#ingresar');
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      let data;
      if (url.pathname === '/auth/v1/settings') data = { external: { google: true } };
      else if (url.pathname === '/auth/v1/token') {
        assert.equal(url.searchParams.get('grant_type'), 'pkce');
        const request = JSON.parse(init.body);
        assert.equal(request.auth_code, 'server-code');
        assert.ok(request.code_verifier.length >= 43);
        data = { access_token: token, refresh_token: 'refresh-test', expires_in: 3600, token_type: 'bearer', user };
      } else if (url.pathname === '/auth/v1/user') data = user;
      else if (url.pathname === '/rest/v1/profiles') data = { id: uid, role: 'comprador', active: true, shop_id: null, display_name: 'Compradora de prueba' };
      else throw new Error('Solicitud inesperada: ' + url.pathname);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { createDataLayer } = await import('../web/supabase-data.js');
    layer = createDataLayer(config, { storage, storageKey: 'google-callback-test' });
    await layer.loginWithGoogle();
    const callback = new URL(redirect.searchParams.get('redirect_to'));
    callback.searchParams.set('code', 'server-code');
    await layer.dispose(); await layer.client.auth.dispose();
    globalThis.window = browser(callback.href);
    layer = createDataLayer(config, { storage, storageKey: 'google-callback-test' });
    const session = await layer.currentSession();
    assert.equal(session.uid, uid);
    assert.equal(session.role, 'comprador');
    assert.equal(globalThis.window.location.href, 'https://conectasur.example/#ingresar');
    assert.equal(requests.filter(path => path === '/auth/v1/token').length, 1);
    assert.ok(requests.includes('/rest/v1/profiles'));
    assert.equal([...values.keys()].some(key => key.includes('code-verifier')), false);
  } finally {
    await layer?.dispose(); await layer?.client.auth.dispose();
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
