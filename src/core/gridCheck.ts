import { hexToRgb, rgbToHex } from './color';
import type { PixelImage } from './types';

export interface SpriteReport {
  ok: boolean;
  width: number;
  height: number;
  opaquePixels: number;
  semiTransparent: number; // alfa entre 1 e 254 (anti-aliasing indesejado)
  offPalette: number; // pixels com cor fora da paleta travada
  colorsUsed: string[];
}

/** Verificação automática (RNF "qualidade de pixel" e RF-03/RF-04). */
export function verifySprite(img: PixelImage, palette: string[]): SpriteReport {
  const allowed = new Set(palette.map((c) => rgbToHex(hexToRgb(c))));
  const used = new Set<string>();
  let semi = 0, off = 0, opaque = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    const a = img.data[o + 3];
    if (a === 0) continue;
    if (a !== 255) semi++;
    opaque++;
    const hex = rgbToHex([img.data[o], img.data[o + 1], img.data[o + 2]]);
    used.add(hex);
    if (!allowed.has(hex)) off++;
  }
  return {
    ok: semi === 0 && off === 0,
    width: img.width,
    height: img.height,
    opaquePixels: opaque,
    semiTransparent: semi,
    offPalette: off,
    colorsUsed: [...used],
  };
}
