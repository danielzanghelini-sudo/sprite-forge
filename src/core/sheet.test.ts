import { describe, expect, it } from 'vitest';
import { getPixel, setPixel } from './editor';
import { packRows, packSheet, scaleNearest, slug, uniqueNames } from './sheet';
import { createImage } from './types';

const RED = [255, 0, 0, 255] as [number, number, number, number];

function frame(w: number, h: number) {
  const img = createImage(w, h);
  setPixel(img, 0, 0, RED);
  return img;
}

describe('sprite sheet e atlas', () => {
  it('amplia sem interpolação', () => {
    const big = scaleNearest(frame(2, 2), 3);
    expect(big.width).toBe(6);
    expect(getPixel(big, 2, 2)).toEqual(RED);
    expect(getPixel(big, 3, 3)[3]).toBe(0);
  });

  it('monta grade com espaçamento e atlas coerente', () => {
    const frames = ['a', 'b', 'c'].map((name) => ({ name, image: frame(16, 16) }));
    const { sheet, atlas } = packSheet(frames, { columns: 2, padding: 2, scale: 1, imageName: 'x.png' });
    expect(sheet.width).toBe(16 * 2 + 2);
    expect(sheet.height).toBe(16 * 2 + 2);
    expect(atlas.frames.b.frame).toEqual({ x: 18, y: 0, w: 16, h: 16 });
    expect(atlas.frames.c.frame).toEqual({ x: 0, y: 18, w: 16, h: 16 });
    expect(atlas.meta.size).toEqual({ w: 34, h: 34 });
    // o pixel vermelho de cada quadro está na origem do quadro
    expect(getPixel(sheet, 18, 0)).toEqual(RED);
    expect(getPixel(sheet, 0, 18)).toEqual(RED);
  });

  it('escala também as coordenadas do atlas', () => {
    const { sheet, atlas } = packSheet([{ name: 'a', image: frame(8, 8) }, { name: 'b', image: frame(8, 8) }], {
      columns: 0, padding: 1, scale: 4, imageName: 'x.png',
    });
    expect(sheet.width).toBe(32 * 2 + 4);
    expect(atlas.frames.b.frame.x).toBe(36);
  });

  it('nomes únicos e seguros', () => {
    expect(uniqueNames(['heroi', 'heroi', ''])).toEqual(['heroi', 'heroi_2', 'sprite']);
    expect(slug('Cogumelo Aventureiro #1')).toBe('cogumelo_aventureiro_1');
  });

  it('uma linha por animação, com linhas de tamanhos diferentes', () => {
    const f = (name: string) => ({ name, image: frame(8, 8) });
    const { sheet, atlas } = packRows([[f('idle_0'), f('idle_1')], [f('walk_0'), f('walk_1'), f('walk_2')]], {
      padding: 0, scale: 1, imageName: 'x.png',
    });
    expect(sheet.width).toBe(24);
    expect(sheet.height).toBe(16);
    expect(atlas.frames.walk_2.frame).toEqual({ x: 16, y: 8, w: 8, h: 8 });
    expect(atlas.frames.idle_1.frame).toEqual({ x: 8, y: 0, w: 8, h: 8 });
  });

  it('recusa lista vazia', () => {
    expect(() => packSheet([], { columns: 0, padding: 0, scale: 1, imageName: 'x' })).toThrow();
  });
});
