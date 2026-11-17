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

/**
 * Prepara o sprite como referência para a IA: ampliado sem suavização para ~512 px,
 * centralizado em fundo branco (o mesmo fundo que pedimos no prompt).
 */
export function spriteToReferenceBlob(img: PixelImage, size = 512): Promise<Blob> {
  const k = Math.max(1, Math.floor((size * 0.8) / Math.max(img.width, img.height)));
  const sprite = pixelImageToCanvas(img, k);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  g.imageSmoothingEnabled = false;
  g.drawImage(sprite, Math.floor((size - sprite.width) / 2), Math.floor((size - sprite.height) / 2));
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar PNG'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function downloadJson(data: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
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
