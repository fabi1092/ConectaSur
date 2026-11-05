// Copiar a supabase-config.js (ignorado por Git). Configuración pública de cliente.
// Nunca incluir contraseñas, credenciales de Studio ni service_role.
export default {
  url: 'https://TU-INSTANCIA', anonKey: 'CLAVE_ANON_DEL_GRUPO',
  // Opcional: Firebase Authentication para compradores con Google.
  // Copiar los valores de la app web en Firebase; no el secreto OAuth.
  firebase: {
    apiKey: 'API_KEY_WEB', authDomain: 'TU-PROYECTO.firebaseapp.com',
    projectId: 'TU-PROYECTO', appId: 'APP_ID_WEB'
  }
};
