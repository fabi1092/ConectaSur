import { createClient } from '@supabase/supabase-js';
import { fetchWithReadRetry } from './read-retry.js';

const invalid = () => Object.assign(new Error('Enlace de recuperación no válido'), { code: 'invalid_recovery_link' });
const unwrap = ({ data, error }) => { if (error) throw Object.assign(new Error(error.message), { code: error.code, status: error.status }); return data; };

export function recoveryCredentials(value, apiUrl, webOrigin) {
  let link;
  try { link = new URL(String(value).trim()); } catch { throw invalid(); }
  // Algunos correos institucionales envuelven el enlace; no se navega al destino.
  if (link.hostname.endsWith('.safelinks.protection.outlook.com')) {
    try { link = new URL(link.searchParams.get('url')); } catch { throw invalid(); }
  }
  const query = link.searchParams, fragment = new URLSearchParams(link.hash.slice(1));
  // El servidor de SurCode aún usa este alias antiguo en su configuración de correo.
  // Solo se extrae el desafío: toda verificación se hace contra config.url, nunca contra el enlace.
  const legacyOrigin = 'https://surcode.supabase.codepulse.cl';
  if ([new URL(apiUrl).origin, legacyOrigin].includes(link.origin) && link.pathname === '/auth/v1/verify' && query.get('type') === 'recovery') {
    const hash = query.get('token_hash') || query.get('token');
    if (!hash || !/^[A-Za-z0-9_-]{20,1024}$/.test(hash)) throw invalid();
    return { token_hash: hash, type: 'recovery' };
  }
  // Compatibilidad con el enlace directo cuando se autorice la web en el servidor.
  if ([webOrigin, legacyOrigin].includes(link.origin) && fragment.get('type') === 'recovery' && fragment.get('access_token') && fragment.get('refresh_token')) {
    return { access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') };
  }
  throw invalid();
}

export function takeRecoveryLocation() {
  const url = new URL(window.location.href), hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.get('recuperar') !== '1' && hash.get('type') !== 'recovery') return null;
  const original = url.href;
  // No dejar tokens en el historial, enlaces de navegación ni lecturas de pantalla.
  history.replaceState(null, '', url.pathname + '#recuperar');
  return original;
}

export function createPasswordRecovery(config, onChanged = async () => {}) {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: 'conectasur-recovery-' + crypto.randomUUID() },
    global: { fetch: (input, init) => fetchWithReadRetry(input, init) }
  });
  let user = null, stopped = false;
  async function verifiedUser() {
    const auth = unwrap(await client.auth.getUser())?.user;
    if (!auth) throw invalid();
    const profile = unwrap(await client.from('profiles').select('active,role').eq('id', auth.id).single());
    if (!profile?.active || !['admin', 'emprendedora', 'comprador'].includes(profile.role)) {
      throw Object.assign(new Error('Cuenta desactivada'), { code: 'account_inactive' });
    }
    return { uid: auth.id, email: auth.email };
  }
  return {
    async request(email, webOrigin) {
      if (stopped) throw invalid();
      unwrap(await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: new URL('/?recuperar=1', webOrigin).href }));
    },
    async verify(link, webOrigin) {
      user = null;
      if (stopped) throw invalid();
      const credentials = recoveryCredentials(link, config.url, webOrigin);
      const result = 'token_hash' in credentials ? await client.auth.verifyOtp(credentials) : await client.auth.setSession(credentials);
      unwrap(result);
      user = await verifiedUser();
      if (stopped) { user = null; throw invalid(); }
      return user;
    },
    async change(password) {
      if (stopped || !user) throw invalid();
      if (typeof password !== 'string' || password.length < 8) throw Object.assign(new Error('Contraseña muy corta'), { code: 'weak_password' });
      const current = await verifiedUser();
      if (current.uid !== user.uid || stopped) throw invalid();
      unwrap(await client.auth.updateUser({ password }));
      const uid = user.uid;
      user = null;
      // El cambio confirmado no se presenta como fallido si falla la revocación posterior.
      const signout = await client.auth.signOut({ scope: 'global' }).catch(() => ({ error: true }));
      await onChanged(uid).catch(() => {});
      return { changed: true, sessionsRevoked: !signout.error };
    },
    async dispose() {
      stopped = true; user = null;
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      await client.auth.dispose();
    }
  };
}
