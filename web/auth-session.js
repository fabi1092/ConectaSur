// Solo los tokens de Auth persisten entre visitas; los formularios no guardan contraseñas.
export function browserAuthStorage(storageKey) {
  if (typeof window === 'undefined') return undefined;
  try {
    const persistent = window.localStorage;
    const marker = storageKey + ':persistent-v1';
    // Migrar una vez la sesión anterior. El marcador evita revivir tokens de otra
    // pestaña antigua después de que la persona haya cerrado sesión explícitamente.
    if (!persistent.getItem(marker)) {
      const previous = window.sessionStorage.getItem(storageKey);
      if (!persistent.getItem(storageKey) && previous) persistent.setItem(storageKey, previous);
      persistent.setItem(marker, 'true');
    }
    window.sessionStorage.removeItem(storageKey);
    return persistent;
  } catch {
    // Auth sigue disponible en memoria si el navegador impide el almacenamiento.
    return undefined;
  }
}

export function invalidSession(error) {
  return [401, 403].includes(error.status) || [
    'account_inactive', 'bad_jwt', 'session_not_found', 'session_expired',
    'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found',
    'user_banned', 'PGRST116'
  ].includes(error.code);
}
