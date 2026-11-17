import type { PixelImage } from '../core/types';

const MAX_SOURCE = 768; // a grade máxima é 64; mais que isso só custa tempo

/** Lê um arquivo de imagem e devolve RGBA, reduzindo imagens muito grandes. */
export async function fileToPixelImage(file: Blob): Promise<PixelImage> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SOURCE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data };
}

export function pixelImageToCanvas(img: PixelImage, scale = 1): HTMLCanvasElement {
  const base = document.createElement('canvas');
  base.width = img.width;
  base.height = img.height;
  base.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  if (scale === 1) return base;
  const big = document.createElement('canvas');
  big.width = img.width * scale;
  big.height = img.height * scale;
  const ctx = big.getContext('2d')!;
  ctx.imageSmoothingEnabled = false; // ampliação por vizinho mais próximo
  ctx.drawImage(base, 0, 0, big.width, big.height);
  return big;
}

export function downloadPng(img: PixelImage, filename: string, scale = 1) {
  pixelImageToCanvas(img, scale).toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
