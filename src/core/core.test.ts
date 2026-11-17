import { describe, expect, it } from 'vitest';
import { verifySprite } from './gridCheck';
import { PRESET_PALETTES } from './palettes';
import { convertToSprite, DEFAULT_CONVERT, removeBackground } from './pixelate';
import { extractPalette, mapToPalette } from './quantize';
import { createImage, type PixelImage } from './types';

function fill(img: PixelImage, x0: number, y0: number, x1: number, y1: number, rgba: number[]) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) img.data.set(rgba, (y * img.width + x) * 4);
}

/** Imagem 256x256: fundo branco, quadrado vermelho com borda borrada (anti-aliasing). */
function sample(): PixelImage {
  const img = createImage(256, 256);
  fill(img, 0, 0, 256, 256, [255, 255, 255, 255]);
  fill(img, 63, 63, 193, 193, [230, 120, 120, 255]); // borda "suave"
  fill(img, 64, 64, 192, 192, [200, 30, 40, 255]);
  fill(img, 100, 100, 156, 156, [30, 40, 200, 255]);
  return img;
}

describe('pipeline de grade exata', () => {
  const db32 = PRESET_PALETTES[0].colors;

  it('gera exatamente a grade pedida, sem semitransparência e só com cores da paleta', () => {
    for (const size of [16, 24, 32, 64]) {
      const out = convertToSprite(sample(), { ...DEFAULT_CONVERT, gridW: size, gridH: size, palette: db32 });
      expect(out.width).toBe(size);
      expect(out.height).toBe(size);
      const rep = verifySprite(out, db32);
      expect(rep.ok).toBe(true);
      expect(rep.opaquePixels).toBeGreaterThan(0);
    }
  });

  it('remove o fundo a partir dos cantos', () => {
    const out = removeBackground(sample(), 10);
    expect(out.data[3]).toBe(0); // canto transparente
    expect(out.data[(128 * 256 + 128) * 4 + 3]).toBe(255); // centro opaco
  });

  it('extrai paleta com no máximo N cores e ajusta a 15-bit', () => {
    const pal = extractPalette(sample(), 4, { snap15bit: true });
    expect(pal.length).toBeLessThanOrEqual(4);
    const out = mapToPalette(sample(), pal);
    expect(verifySprite(out, pal).offPalette).toBe(0);
  });

  it('o verificador acusa cor fora da paleta e alfa parcial', () => {
    const img = createImage(2, 1);
    img.data.set([1, 2, 3, 255, 0, 0, 0, 100]);
    const rep = verifySprite(img, ['#000000']);
    expect(rep.offPalette).toBe(1); // (1,2,3) fora; o preto está na paleta
    expect(rep.semiTransparent).toBe(1);
    expect(rep.ok).toBe(false);
  });
});
