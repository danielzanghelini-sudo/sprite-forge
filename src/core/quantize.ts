import { PaletteMatcher, rgbToHex, snap5bit } from './color';
import type { PixelImage, RGB } from './types';
import { cloneImage } from './types';

/** Extrai até `count` cores representativas (median cut), ignorando pixels transparentes. */
export function extractPalette(
  img: PixelImage,
  count: number,
  opts: { snap15bit?: boolean; alphaThreshold?: number } = {},
): string[] {
  const alphaMin = opts.alphaThreshold ?? 128;
  const pixels: RGB[] = [];
  const step = Math.max(1, Math.floor((img.width * img.height) / 60000)); // amostragem p/ imagens grandes
  for (let i = 0; i < img.width * img.height; i += step) {
    const o = i * 4;
    if (img.data[o + 3] >= alphaMin) pixels.push([img.data[o], img.data[o + 1], img.data[o + 2]]);
  }
  if (pixels.length === 0) return ['#000000'];

  let boxes: RGB[][] = [pixels];
  while (boxes.length < count) {
    // divide a caixa com maior amplitude de canal
    let bestIdx = -1;
    let bestRange = 0;
    let bestCh = 0;
    boxes.forEach((box, idx) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let mn = 255;
        let mx = 0;
        for (const p of box) {
          if (p[ch] < mn) mn = p[ch];
          if (p[ch] > mx) mx = p[ch];
        }
        const range = (mx - mn) * Math.sqrt(box.length);
        if (range > bestRange) {
          bestRange = range;
          bestIdx = idx;
          bestCh = ch;
        }
      }
    });
    if (bestIdx < 0) break;
    const box = boxes[bestIdx].sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = Math.floor(box.length / 2);
    boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
  }

  const colors = boxes
    .filter((b) => b.length > 0)
    .map((box) => {
      const sum = [0, 0, 0];
      for (const p of box) {
        sum[0] += p[0];
        sum[1] += p[1];
        sum[2] += p[2];
      }
      let c: RGB = [sum[0] / box.length, sum[1] / box.length, sum[2] / box.length];
      if (opts.snap15bit) c = [snap5bit(c[0]), snap5bit(c[1]), snap5bit(c[2])];
      return rgbToHex(c);
    });
  return Array.from(new Set(colors));
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

/**
 * Mapeia cada pixel opaco para a cor mais próxima da paleta e torna o alfa binário (0 ou 255).
 * `dither` > 0 aplica Bayer 4x4 com essa intensidade (0..1).
 */
export function mapToPalette(
  img: PixelImage,
  palette: string[],
  opts: { dither?: number; alphaThreshold?: number } = {},
): PixelImage {
  const out = cloneImage(img);
  const matcher = new PaletteMatcher(palette);
  const alphaMin = opts.alphaThreshold ?? 128;
  const amp = (opts.dither ?? 0) * 48;
  const d = out.data;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const o = (y * img.width + x) * 4;
      if (d[o + 3] < alphaMin) {
        d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
        continue;
      }
      const t = amp ? BAYER4[(y % 4) * 4 + (x % 4)] * amp : 0;
      const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v + t)));
      const [r, g, b] = matcher.rgb[matcher.nearest(clamp(d[o]), clamp(d[o + 1]), clamp(d[o + 2]))];
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
    }
  }
  return out;
}
