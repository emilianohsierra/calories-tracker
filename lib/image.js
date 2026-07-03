// Reduce la imagen en el navegador antes de subirla: ahorra tokens y almacenamiento.
export async function downscaleImage(file, maxDim = 1280, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob) return blob;
  } catch {
    // el navegador no pudo decodificar (p. ej. formato raro): se intenta con el original
  }
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  throw new Error('Formato de imagen no soportado. Usa JPG, PNG o WebP.');
}
