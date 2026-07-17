/**
 * Convert an image URL to a base64 data URL.
 * Uses an off-screen canvas to read the pixel data.
 */
export async function imgSrcToBase64(src: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create canvas 2d context');
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}
