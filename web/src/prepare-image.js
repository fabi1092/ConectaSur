export async function prepareImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elige una imagen JPG, PNG o WebP.');
  if (!file.size || file.size > 20 * 1024 * 1024) throw new Error('La imagen debe pesar menos de 20 MB. Elige una foto más pequeña.');
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = source;
    try { await image.decode(); } catch { throw new Error('No pudimos abrir esa imagen. Elige otra foto.'); }
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No pudimos preparar la imagen en este navegador. Intenta con otra foto.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encode = quality => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    let blob = await encode(.86);
    if (blob?.size > 2097152) blob = await encode(.6);
    if (!blob || blob.size > 2097152) throw new Error('No pudimos reducir esa imagen. Elige una más pequeña.');
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(source); }
}
