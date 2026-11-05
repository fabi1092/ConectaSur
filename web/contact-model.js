export const CONTACT_MODES = { whatsapp: 'WhatsApp', form: 'Formulario', both: 'WhatsApp y formulario' };
export function whatsappNumber(value) {
  if (typeof value !== 'string' || !/^[+0-9 ()-]+$/.test(value)) return null;
  let digits = value.replace(/[^0-9]/g, '');
  if (/^9[0-9]{8}$/.test(digits)) digits = '56' + digits;
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null;
}
export function contactSettings(mode, number) {
  if (!Object.hasOwn(CONTACT_MODES, mode) || typeof number !== 'string' || number.length > 24) throw new Error('Revisa cómo pueden contactarte.');
  const normalized = mode === 'form' ? '' : whatsappNumber(number);
  if (normalized === null) throw new Error('Escribe un WhatsApp válido con código de país, por ejemplo +56 9 1234 5678.');
  return { contact_mode: mode, whatsapp_number: normalized };
}
export function messageValues({ name, contact, body }) {
  const values = [name, contact, body];
  const limits = [[1,100],[3,240],[1,2000]];
  if (values.some((value,i) => typeof value !== 'string' || value.trim().length < limits[i][0] || value.trim().length > limits[i][1])) throw new Error('Completa tu nombre, un correo o teléfono y tu mensaje.');
  return { name: name.trim(), contact: contact.trim(), body: body.trim() };
}
export function createMessageSender(send, id = () => crypto.randomUUID()) {
  let key, requestId, busy = false, sent = false;
  return async (shopId, input) => {
    if (busy || sent) return false;
    const values = messageValues(input);
    const nextKey = JSON.stringify([shopId, values]);
    if (key !== nextKey) { key = nextKey; requestId = id(); }
    busy = true;
    try { await send(shopId, requestId, values); sent = true; return true; }
    finally { busy = false; }
  };
}
