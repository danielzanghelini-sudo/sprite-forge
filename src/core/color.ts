import type { RGB } from './types';

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Converte sRGB para OKLab (distância perceptual melhor que RGB puro). */
export function rgbToOklab([r, g, b]: RGB): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Índice da cor mais próxima, com cache por cor (sprites têm poucas cores distintas). */
export class PaletteMatcher {
  readonly rgb: RGB[];
  private lab: [number, number, number][];
  private cache = new Map<number, number>();

  constructor(hexColors: string[]) {
    if (hexColors.length === 0) throw new Error('Paleta vazia');
    this.rgb = hexColors.map(hexToRgb);
    this.lab = this.rgb.map(rgbToOklab);
  }

  nearest(r: number, g: number, b: number): number {
    const key = (r << 16) | (g << 8) | b;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const [L, A, B] = rgbToOklab([r, g, b]);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.lab.length; i++) {
      const [l2, a2, b2] = this.lab[i];
      const d = (L - l2) ** 2 + (A - a2) ** 2 + (B - b2) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.cache.set(key, best);
    return best;
  }
}

/** Luminância relativa simples, usada para escolher a cor de contorno. */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Reduz um canal para 5 bits (SNES, 15-bit) e expande de volta para 8 bits. */
export function snap5bit(c: number): number {
  const v = Math.round((c / 255) * 31);
  return (v << 3) | (v >> 2);
}
