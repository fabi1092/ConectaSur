import { publicShell } from './public-shops.js';

export function showPrivacyPolicy(app, isCurrent) {
  if (!isCurrent()) return;
  document.title = 'Privacidad y datos personales | ConectaSur';
  const voiceGuide = 'Aviso de privacidad y cuidado de datos personales de ConectaSur. Esta página explica qué datos se muestran en la vitrina pública, qué datos se mantienen privados para la tienda, cómo se usa la ubicación del dispositivo y cómo revocar avisos.';

  app.innerHTML = publicShell(`<section class="privacy-page" aria-labelledby="privacy-title" data-voice-guide="${voiceGuide}">
    <div class="public-shop-banner privacy-hero">
      <p class="public-eyebrow">Transparencia y protección de datos</p>
      <h1 id="privacy-title" tabindex="-1">Aviso de privacidad y datos personales</h1>
      <p>En ConectaSur solo se publican los datos que cada emprendedora autoriza mostrar en su ficha de tienda. Los registros privados y de contacto personal permanecen resguardados en servidor.</p>
    </div>

    <div class="privacy-grid">
      <article class="public-contact privacy-card">
        <h2>Qué datos son públicos en la vitrina</h2>
        <p>Únicamente la información marcada como visible por cada emprendimiento:</p>
        <ul>
          <li>Nombre de la tienda, descripción, tipo de emprendimiento, sector, logo y canales de contacto que la dueña decide publicar.</li>
          <li>Productos publicados como visibles y disponibles, junto con su punto de entrega en mapa si la tienda eligió compartirlo.</li>
          <li>Los precios se muestran solo cuando la emprendedora activa <strong>Mostrar precios</strong>; si lo desactiva, las vistas públicas muestran <em>Consultar precio</em> y no exponen montos ni cantidades exactas de inventario.</li>
        </ul>
      </article>

      <article class="public-contact privacy-card">
        <h2>Qué datos permanecen privados</h2>
        <p>El acceso a estos registros está restringido mediante políticas por perfil (RLS) en Supabase y cifrado local en la app:</p>
        <ul>
          <li>Stock interno de cada variante o producto y ventas registradas en el historial comercial.</li>
          <li>Mensajes enviados mediante el formulario de contacto: solo son visibles para la emprendedora dueña de la tienda.</li>
          <li>Correos electrónicos internos, credenciales y contraseñas: ningún cliente almacena claves privadas ni expone correos en vistas públicas.</li>
        </ul>
      </article>

      <article class="public-contact privacy-card">
        <h2>Ubicación en mapas</h2>
        <p>Cuando autorizas el permiso de ubicación en tu teléfono o navegador, las coordenadas se utilizan solo en memoria durante esa consulta para ordenar ferias por cercanía o sugerir la feria al registrar una venta.</p>
        <p>ConectaSur no almacena ni rastrea el historial de ubicación de compradores ni visitantes en la base de datos.</p>
      </article>

      <article class="public-contact privacy-card">
        <h2>Seguidores, calificaciones y avisos</h2>
        <ul>
          <li>En comentarios y calificaciones públicas solo se muestra un nombre abreviado (o <em>Comprador verificado</em>), nunca tu correo ni identificador de cuenta.</li>
          <li>El registro para notificaciones requiere tu consentimiento explícito; puedes desactivar los avisos o darte de baja en cualquier momento eliminando el token del dispositivo.</li>
          <li>Las cuentas desactivadas pierden acceso inmediato a datos privados sin alterar la exploración anónima pública.</li>
        </ul>
      </article>

      <article class="public-contact privacy-card privacy-card-wide">
        <h2>Control de tus datos</h2>
        <p>Si eres emprendedora, puedes ocultar o mostrar precios, desactivar calificaciones, quitar tu punto de retiro o cambiar tu información de contacto en cualquier momento desde <strong>Editar tienda</strong> en la web o <strong>Mi tienda</strong> en Android.</p>
        <p>Para solicitudes de corrección o desactivación de cuentas, comunícate con la administración de la plataforma ConectaSur.</p>
      </article>
    </div>

    <div class="privacy-actions">
      <a class="public-primary" href="#tiendas">Volver a las tiendas</a>
      <a class="owner-secondary" href="#ingresar">Ir a Ingresar</a>
    </div>
  </section>`);

  app.querySelector('#privacy-title')?.focus({ preventScroll: true });
}
