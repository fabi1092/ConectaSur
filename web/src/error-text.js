// Convierte errores técnicos (red, Supabase, Postgres) en mensajes en español de Chile.
// Si el mensaje ya viene en español desde la aplicación o desde una función de la base de datos, se conserva.

const NETWORK=/failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|fetch failed|timeout|timed out/i;
const TECHNICAL=/\b(the|failed|invalid|violates|constraint|null|not found|permission|denied|unexpected|request|token|network|fetch|undefined|exception|syntax|column|relation|policy|row|jwt|unauthorized|forbidden|bad gateway|service unavailable)\b/i;

export function errorText(error,fallback='No pudimos completar la acción. Revisa tu conexión y vuelve a intentarlo.'){
  const message=String(error?.message||'');
  const code=String(error?.code||'');
  const status=Number(error?.status||0);
  if(NETWORK.test(message) || (typeof navigator!=='undefined' && navigator.onLine===false))return 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.';
  if(status===429 || /rate limit|too many/i.test(message))return 'Se hicieron demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.';
  if(status===401 || /jwt|token.*expired|session.*(expired|missing)|not authenticated/i.test(message))return 'Tu sesión venció. Vuelve a ingresar para continuar.';
  if(code==='42501' || status===403 || /permission denied|row-level security|not authorized|forbidden/i.test(message))return 'Tu cuenta no tiene permisos para realizar esta acción.';
  if(code==='23505' || /duplicate key|already exists/i.test(message))return 'Ya existe un registro con esos datos.';
  if(code==='23503' || /foreign key/i.test(message))return 'No se puede completar porque otros datos dependen de este registro.';
  if(status>=500)return 'El servidor tuvo un problema. Inténtalo nuevamente en unos minutos.';
  if(!message || TECHNICAL.test(message))return fallback;
  return message;
}
