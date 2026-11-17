import { opaqueBounds } from './pixelate';
import type { PixelImage } from './types';
import { cloneImage, createImage } from './types';

/**
 * Quadros procedurais a partir do sprite-base, sem IA.
 * Regra: só reposicionam/reamostram pixels existentes (ou usam uma cor da paleta),
 * então a paleta travada continua valendo.
 */

export type AnimTemplate = 'idle' | 'walk' | 'jump' | 'attack' | 'hurt';

export const TEMPLATE_INFO: Record<AnimTemplate, { label: string; fps: number; loop: boolean; hint: string }> = {
  idle: { label: 'Parado (respiração)', fps: 4, loop: true, hint: 'A parte de cima desce 1 px e volta.' },
  walk: { label: 'Andando (balanço)', fps: 8, loop: true, hint: 'Balanço vertical e pernas espelhadas em quadros alternados.' },
  jump: { label: 'Pulando', fps: 10, loop: false, hint: 'Agacha, estica, sobe, desce e amortece.' },
  attack: { label: 'Atacando (avanço)', fps: 12, loop: false, hint: 'Recua, avança para a direita e volta.' },
  hurt: { label: 'Dano (piscar)', fps: 10, loop: false, hint: 'Pisca com a cor mais clara e recua 1 px.' },
};

/** Move a imagem inteira por (dx, dy); o que sai da borda é perdido. */
export function shift(img: PixelImage, dx: number, dy: number): PixelImage {
  const out = createImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < img.width; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * img.width + x) * 4);
    }
  }
  return out;
}

/** Desloca verticalmente só as linhas acima de `cutY` (parte de cima do corpo). */
export function shiftTop(img: PixelImage, cutY: number, dy: number): PixelImage {
  const out = cloneImage(img);
  const w = img.width;
  // limpa a parte de cima e redesenha deslocada por cima; a parte de baixo fica intacta
  for (let y = 0; y < Math.min(cutY, img.height); y++) out.data.fill(0, y * w * 4, (y + 1) * w * 4);
  for (let y = 0; y < cutY; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= img.height) continue;
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      if (img.data[s + 3] === 0) continue;
      out.data.set(img.data.subarray(s, s + 4), (ty * w + x) * 4);
    }
  }
  return out;
}

/**
 * Reamostra o conteúdo (vizinho mais próximo) com fatores sx/sy, ancorado no centro da base
 * do conteúdo: personagens continuam "pisando" no mesmo lugar ao achatar ou esticar.
 */
export function squash(img: PixelImage, sx: number, sy: number): PixelImage {
  const b = opaqueBounds(img, 1);
  const out = createImage(img.width, img.height);
  const cx = b.x + b.w / 2;
  const by = b.y + b.h; // base
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const srcX = Math.floor(cx + (x + 0.5 - cx) / sx);
      const srcY = Math.floor(by - (by - (y + 0.5)) / sy);
      if (srcX < b.x || srcY < b.y || srcX >= b.x + b.w || srcY >= b.y + b.h) continue;
      const s = (srcY * img.width + srcX) * 4;
      if (img.data[s + 3] === 0) continue;
      out.data.set(img.data.subarray(s, s + 4), (y * img.width + x) * 4);
    }
  return out;
}

/** Espelha horizontalmente só as linhas a partir de `fromY` (troca de pernas). */
export function mirrorBottom(img: PixelImage, fromY: number): PixelImage {
  const b = opaqueBounds(img, 1);
  const out = cloneImage(img);
  for (let y = Math.max(0, fromY); y < img.height; y++)
    for (let x = b.x; x < b.x + b.w; x++) {
      const mx = b.x + b.w - 1 - (x - b.x);
      const s = (y * img.width + mx) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * img.width + x) * 4);
    }
  return out;
}

/** Silhueta: todo pixel opaco vira a cor dada (usado no piscar de dano). */
export function silhouette(img: PixelImage, rgb: [number, number, number]): PixelImage {
  const out = cloneImage(img);
  for (let i = 0; i < out.data.length; i += 4) if (out.data[i + 3] !== 0) out.data.set([rgb[0], rgb[1], rgb[2], 255], i);
  return out;
}

export function makeTemplate(base: PixelImage, t: AnimTemplate, flashRgb: [number, number, number] = [255, 255, 255]): PixelImage[] {
  const b = opaqueBounds(base, 1);
  const cut = b.y + Math.round(b.h * 0.55); // ~cintura
  const legs = b.y + Math.round(b.h * 0.75);
  const lift = Math.max(1, Math.round(b.h / 8));
  switch (t) {
    case 'idle':
      return [base, base, shiftTop(base, cut, 1), shiftTop(base, cut, 1)];
    case 'walk': {
      // contato A, passagem (sobe 1 px), contato B (pernas trocadas), passagem
      const swapped = mirrorBottom(base, legs);
      return [base, shift(base, 0, -1), swapped, shift(swapped, 0, -1)];
    }
    case 'jump':
      return [
        squash(base, 1.15, 0.85),
        shift(squash(base, 0.9, 1.1), 0, -lift),
        shift(base, 0, -lift * 2),
        shift(squash(base, 0.95, 1.05), 0, -lift),
        squash(base, 1.15, 0.85),
        base,
      ];
    case 'attack':
      return [shift(base, -1, 0), base, shift(base, 2, 0), shift(base, 3, 0), shift(base, 1, 0), base];
    case 'hurt':
      return [silhouette(base, flashRgb), shift(base, -1, 0), silhouette(shift(base, -1, 0), flashRgb), base];
  }
}
