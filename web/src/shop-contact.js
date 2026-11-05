import { whatsappNumber, createMessageSender } from '../contact-model.js';

export function contactMarkup(shop) {
  const mode = shop.contactMode || 'form';
  const number = whatsappNumber(shop.whatsappNumber || '');
  return `${mode !== 'form' && number ? `<a class="public-primary" href="https://wa.me/${number}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp ↗</a>` : ''}
    ${mode !== 'whatsapp' ? `<form id="shop-contact-form" class="shop-contact-form">
      <h3>Enviar un mensaje</h3><p>La dueña de esta tienda recibirá tu nombre, contacto y mensaje para responderte. No se publican en el catálogo.</p>
      <label for="message-name">Tu nombre</label><input id="message-name" name="name" maxlength="100" required autocomplete="name">
      <label for="message-contact">Tu correo o teléfono para responderte</label><input id="message-contact" name="contact" minlength="3" maxlength="240" required>
      <label for="message-body">Tu mensaje</label><textarea id="message-body" name="body" rows="4" maxlength="2000" required></textarea>
      <button class="public-primary" type="submit">Enviar mensaje</button><p role="status" id="message-status" tabindex="-1"></p>
    </form>` : ''}`;
}
export function wireContact(root, db, shop, isCurrent) {
  const form = root.querySelector('#shop-contact-form');
  if (!form) return;
  const send = createMessageSender((shopId, requestId, values) => db.sendShopMessage(shopId, requestId, values));
  let busy = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(['name','contact','body'].map(key => [key, form.elements.namedItem(key).value]));
    const status = form.querySelector('#message-status');
    busy = true;
    form.querySelectorAll('input,textarea,button').forEach(element => { element.disabled = true; });
    status.textContent = 'Enviando mensaje…';
    let success = false;
    try {
      success = await send(shop.id, values);
      if (!isCurrent()) return;
      status.textContent = 'Mensaje enviado. La tienda te responderá al contacto que indicaste.';
      form.querySelector('button').textContent = 'Mensaje enviado';
    } catch {
      if (isCurrent()) status.textContent = 'No pudimos confirmar el envío. Conservamos tus datos; espera unos minutos y reintenta el mismo mensaje.';
    } finally {
      busy = false;
      if (isCurrent()) { form.querySelectorAll('input,textarea,button').forEach(element => { element.disabled = success; }); status.focus(); }
    }
  });
}
