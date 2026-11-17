import { luminance, PaletteMatcher, rgbToOklab } from './color';
import { mapToPalette } from './quantize';
import type { PixelImage } from './types';
import { cloneImage, createImage } from './types';

export type SampleMode = 'average' | 'dominant';

export interface ConvertOptions {
  gridW: number;
  gridH: number;
  palette: string[];
  mode: SampleMode;
  /** Fração mínima de cobertura opaca (0..1) para a célula virar pixel opaco. */
  coverage: number;
  /** Pixels livres na borda da grade. */
  padding: number;
  removeBackground: boolean;
  bgTolerance: number; // 0..100
  autoCrop: boolean;
  outline: boolean;
  dither: number; // 0..1
}

export const DEFAULT_CONVERT: Omit<ConvertOptions, 'palette'> = {
  gridW: 32,
  gridH: 32,
  mode: 'dominant',
  coverage: 0.5,
  padding: 1,
  removeBackground: true,
  bgTolerance: 12,
  autoCrop: true,
  outline: false,
  dither: 0,
};

/** Remove o fundo por preenchimento a partir dos quatro cantos (cores parecidas com a do canto). */
export function removeBackground(src: PixelImage, tolerance: number): PixelImage {
  const img = cloneImage(src);
  const { width: w, height: h, data: d } = img;
  const tol = (tolerance / 100) * 0.35; // distância OKLab
  const visited = new Uint8Array(w * h);
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  for (const start of corners) {
    if (visited[start] || d[start * 4 + 3] === 0) continue;
    const ref = rgbToOklab([d[start * 4], d[start * 4 + 1], d[start * 4 + 2]]);
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      if (visited[i]) continue;
      const o = i * 4;
      if (d[o + 3] !== 0) {
        const c = rgbToOklab([d[o], d[o + 1], d[o + 2]]);
        const dist = Math.hypot(c[0] - ref[0], c[1] - ref[1], c[2] - ref[2]);
        if (dist > tol) continue;
      }
      visited[i] = 1;
      d[o + 3] = 0;
      const x = i % w;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (i >= w) stack.push(i - w);
      if (i < w * (h - 1)) stack.push(i + w);
    }
  }
  return img;
}

/**
 * Cobre uma área (em frações da imagem) com a cor do fundo logo acima dela.
 * Usado para apagar marcas d'água de provedores antes da remoção de fundo.
 */
export function maskRect(src: PixelImage, r: { x: number; y: number; w: number; h: number }): PixelImage {
  const img = cloneImage(src);
  const x0 = Math.floor(r.x * img.width), y0 = Math.floor(r.y * img.height);
  const x1 = Math.min(img.width, Math.ceil((r.x + r.w) * img.width));
  const y1 = Math.min(img.height, Math.ceil((r.y + r.h) * img.height));
  const ref = (Math.max(0, y0 - 1) * img.width + (img.width - 1)) * 4;
  const color = img.data.slice(ref, ref + 4);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set(color, (y * img.width + x) * 4);
  return img;
}

/** Caixa delimitadora dos pixels opacos. */
export function opaqueBounds(img: PixelImage, alphaMin = 1) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3] >= alphaMin) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x: 0, y: 0, w: img.width, h: img.height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Reduz a imagem para a grade exata. Cada célula da grade vira exatamente um pixel,
 * sem interpolação: a cor sai da média (ou da cor dominante) da região de origem.
 */
export function downscaleToGrid(
  src: PixelImage,
  opts: Pick<ConvertOptions, 'gridW' | 'gridH' | 'mode' | 'coverage' | 'padding' | 'autoCrop'> & {
    palette?: string[];
  },
): PixelImage {
  const out = createImage(opts.gridW, opts.gridH);
  const box = opts.autoCrop ? opaqueBounds(src, 128) : { x: 0, y: 0, w: src.width, h: src.height };
  const innerW = Math.max(1, opts.gridW - opts.padding * 2);
  const innerH = Math.max(1, opts.gridH - opts.padding * 2);
  // mantém proporção: escala = quantos pixels de origem por célula
  const scale = Math.max(box.w / innerW, box.h / innerH);
  const usedW = Math.min(innerW, Math.round(box.w / scale));
  const usedH = Math.min(innerH, Math.round(box.h / scale));
  const offX = Math.floor((opts.gridW - usedW) / 2);
  const offY = opts.gridH - opts.padding - usedH; // personagens "pisam" na base
  const matcher = opts.mode === 'dominant' && opts.palette?.length ? new PaletteMatcher(opts.palette) : null;

  for (let gy = 0; gy < usedH; gy++) {
    for (let gx = 0; gx < usedW; gx++) {
      const sx0 = box.x + gx * scale, sx1 = box.x + (gx + 1) * scale;
      const sy0 = box.y + gy * scale, sy1 = box.y + (gy + 1) * scale;
      let total = 0, opaque = 0, r = 0, g = 0, b = 0;
      const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
      for (let y = Math.floor(sy0); y < Math.min(src.height, Math.ceil(sy1)); y++) {
        for (let x = Math.floor(sx0); x < Math.min(src.width, Math.ceil(sx1)); x++) {
          const o = (y * src.width + x) * 4;
          total++;
          const a = src.data[o + 3];
          if (a < 128) continue;
          opaque++;
          const pr = src.data[o], pg = src.data[o + 1], pb = src.data[o + 2];
          r += pr; g += pg; b += pb;
          if (opts.mode === 'dominant') {
            const key = matcher ? matcher.nearest(pr, pg, pb) : ((pr >> 3) << 10) | ((pg >> 3) << 5) | (pb >> 3);
            const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
            bk.n++; bk.r += pr; bk.g += pg; bk.b += pb;
            buckets.set(key, bk);
          }
        }
      }
      if (total === 0 || opaque / total < opts.coverage) continue;
      const o = ((offY + gy) * opts.gridW + offX + gx) * 4;
      if (opts.mode === 'dominant') {
        let best = { n: 0, r: 0, g: 0, b: 0 };
        for (const bk of buckets.values()) if (bk.n > best.n) best = bk;
        out.data[o] = best.r / best.n; out.data[o + 1] = best.g / best.n; out.data[o + 2] = best.b / best.n;
      } else {
        out.data[o] = r / opaque; out.data[o + 1] = g / opaque; out.data[o + 2] = b / opaque;
      }
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Contorno de 1px com a cor mais escura da paleta, nos pixels transparentes vizinhos ao sprite. */
export function addOutline(img: PixelImage, palette: string[]): PixelImage {
  const matcher = new PaletteMatcher(palette);
  const darkest = matcher.rgb.reduce((a, c) => (luminance(c) < luminance(a) ? c : a));
  const out = cloneImage(img);
  const { width: w, height: h } = img;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] === 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (opaque(x, y)) continue;
      if (opaque(x - 1, y) || opaque(x + 1, y) || opaque(x, y - 1) || opaque(x, y + 1)) {
        const o = (y * w + x) * 4;
        out.data[o] = darkest[0]; out.data[o + 1] = darkest[1]; out.data[o + 2] = darkest[2]; out.data[o + 3] = 255;
      }
    }
  return out;
}

/** Pipeline completo: fundo → grade exata → paleta travada → contorno opcional. */
export function convertToSprite(src: PixelImage, opts: ConvertOptions): PixelImage {
  let img = opts.removeBackground ? removeBackground(src, opts.bgTolerance) : src;
  img = downscaleToGrid(img, opts);
  img = mapToPalette(img, opts.palette, { dither: opts.dither });
  if (opts.outline) img = addOutline(img, opts.palette);
  return img;
}
