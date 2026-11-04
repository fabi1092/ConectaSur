const failure = code => Object.assign(new Error('No pudimos completar el acceso con Google'), { code });
const unwrap = ({ data, error }) => {
  if (error) throw failure('google_callback_failed');
  return data;
};

// Se captura y retira el desafío de la barra antes de cargar rutas, enlaces o lectores.
export function takeGoogleCallback(location, history) {
  if (!location) return null;
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (fragment.get('type') === 'recovery') return null;
  const legacyTokens = fragment.has('access_token') || fragment.has('refresh_token');
  if (url.searchParams.get('oauth') !== 'google' && !legacyTokens) return null;
  const callback = {
    code: url.searchParams.get('code'), flowId: url.searchParams.get('sb_flow_id'),
    error: url.searchParams.get('error') || fragment.get('error'), legacyTokens
  };
  for (const key of ['oauth', 'code', 'sb_flow_id', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  url.hash = '#ingresar';
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return callback;
}

export function createGoogleAuth({ sdk, config, storage, fetcher, location, history }) {
  let incoming = takeGoogleCallback(location, history);
  let completing = null;
  return {
    async start(redirectTo) {
      if (!location || !storage) throw failure('google_storage_unavailable');
      if (unwrap(await sdk.auth.getSession())?.session) throw failure('session_exists');
      const redirect = new URL(redirectTo || location.origin + location.pathname);
      if (redirect.origin !== location.origin) throw failure('google_invalid_redirect');
      redirect.search = '?oauth=google';
      redirect.hash = '#ingresar';
      // No inventar una sesión ni navegar a una pantalla de error del proveedor.
      const response = await fetcher(config.url.replace(/\/$/, '') + '/auth/v1/settings', { headers: { apikey: config.anonKey } });
      if (!response.ok) throw failure('google_not_available');
      const settings = await response.json();
      if (settings?.external?.google !== true) throw failure('google_not_configured');
      const result = unwrap(await sdk.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect.href, skipBrowserRedirect: true } }));
      if (!result?.url) throw failure('google_not_available');
      const target = new URL(result.url);
      const expected = new URL(config.url.replace(/\/$/, '') + '/auth/v1/authorize');
      if (target.origin !== expected.origin || target.pathname !== expected.pathname || target.searchParams.get('provider') !== 'google') throw failure('google_not_available');
      // El SDK devuelve flowId aunque su anexado automático al redirect no esté
      // activado. Conservarlo permite consumir el verifier de esta operación.
      if (result.flowId) {
        const callback = new URL(redirect.href);
        callback.searchParams.set('sb_flow_id', result.flowId);
        target.searchParams.set('redirect_to', callback.href);
      }
      location.assign(target.href);
      return target.href;
    },
    async complete() {
      if (completing) return completing;
      if (!incoming) return;
      const callback = incoming;
      completing = (async () => {
        if (callback.error) throw failure(callback.error === 'access_denied' ? 'google_cancelled' : 'google_callback_failed');
        if (callback.legacyTokens || !callback.code) throw failure('google_callback_failed');
        if (unwrap(await sdk.auth.getSession())?.session) throw failure('session_exists');
        // Supabase valida el desafío PKCE con el verifier persistido al iniciar.
        unwrap(await sdk.auth.exchangeCodeForSession(callback.code, callback.flowId ? { flowId: callback.flowId } : undefined));
      })().finally(() => { incoming = null; completing = null; });
      return completing;
    }
  };
}
