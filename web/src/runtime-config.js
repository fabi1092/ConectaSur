const localConfigs = import.meta.glob('../supabase-config.js', { eager: true });
const local = Object.values(localConfigs)[0]?.default ?? {};
const env = import.meta.env ?? {};

function clean(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

const localFirebase = local.firebase ?? {};
const firebase = {
  apiKey: clean(env.VITE_FIREBASE_API_KEY) ?? clean(localFirebase.apiKey),
  authDomain: clean(env.VITE_FIREBASE_AUTH_DOMAIN) ?? clean(localFirebase.authDomain),
  projectId: clean(env.VITE_FIREBASE_PROJECT_ID) ?? clean(localFirebase.projectId),
  appId: clean(env.VITE_FIREBASE_APP_ID) ?? clean(localFirebase.appId)
};
const hasFirebase = firebase.apiKey && firebase.projectId && firebase.appId;

export const config = {
  url: clean(env.VITE_SUPABASE_URL) ?? clean(local.url),
  anonKey: clean(env.VITE_SUPABASE_ANON_KEY) ?? clean(local.anonKey),
  ...(hasFirebase ? { firebase } : {})
};

export default config;
