import { describe, expect, it } from 'vitest';
import { makeTemplate, mirrorBottom, shift, shiftTop, squash, TEMPLATE_INFO, type AnimTemplate } from './animate';
import { getPixel, setPixel, type RGBA } from './editor';
import { verifySprite } from './gridCheck';
import { opaqueBounds } from './pixelate';
import { createImage, type PixelImage } from './types';

const A: RGBA = [200, 30, 40, 255];
const B: RGBA = [30, 40, 200, 255];
const PAL = ['#c81e28', '#1e28c8', '#ffffff'];

/** Boneco 16x16: cabeça vermelha (y 3..7), corpo azul (y 8..12), pernas assimétricas (y 13..14). */
function dude(): PixelImage {
  const img = createImage(16, 16);
  for (let y = 3; y < 8; y++) for (let x = 5; x < 11; x++) setPixel(img, x, y, A);
  for (let y = 8; y < 13; y++) for (let x = 5; x < 11; x++) setPixel(img, x, y, B);
  for (let y = 13; y < 15; y++) setPixel(img, 5, y, A); // só a perna esquerda
  return img;
}

describe('animação procedural', () => {
  it('deslocamento move o conteúdo', () => {
    const s = shift(dude(), 2, -1);
    expect(getPixel(s, 7, 2)).toEqual(A);
    expect(getPixel(s, 5, 3)[3]).toBe(0);
  });

  it('respiração mexe só a parte de cima', () => {
    const out = shiftTop(dude(), 8, 1);
    expect(getPixel(out, 5, 3)[3]).toBe(0); // topo desceu
    expect(getPixel(out, 5, 8)).toEqual(A); // cabeça sobre a primeira linha do corpo
    expect(getPixel(out, 5, 12)).toEqual(B); // corpo de baixo intacto
  });

  it('achatar mantém a base no mesmo lugar', () => {
    const base = opaqueBounds(dude(), 1);
    const sq = opaqueBounds(squash(dude(), 1.2, 0.8), 1);
    expect(sq.y + sq.h).toBe(base.y + base.h);
    expect(sq.h).toBeLessThan(base.h);
    expect(sq.w).toBeGreaterThanOrEqual(base.w);
  });

  it('troca de pernas espelha só a parte de baixo', () => {
    const m = mirrorBottom(dude(), 13);
    expect(getPixel(m, 10, 13)).toEqual(A); // perna foi para a direita
    expect(getPixel(m, 5, 13)[3]).toBe(0);
    expect(getPixel(m, 5, 3)).toEqual(A); // cabeça não mudou
  });

  it('todos os modelos mantêm tamanho e paleta, e variam entre quadros', () => {
    for (const t of Object.keys(TEMPLATE_INFO) as AnimTemplate[]) {
      const frames = makeTemplate(dude(), t, [255, 255, 255]);
      expect(frames.length).toBeGreaterThanOrEqual(4);
      for (const f of frames) {
        expect(f.width).toBe(16);
        expect(verifySprite(f, PAL).ok).toBe(true);
      }
      const distinct = new Set(frames.map((f) => f.data.join(',')));
      expect(distinct.size).toBeGreaterThan(1);
    }
  });

  it('pulo sobe no quadro do meio; dano pisca com a cor dada', () => {
    const j = makeTemplate(dude(), 'jump');
    expect(opaqueBounds(j[2], 1).y).toBeLessThan(opaqueBounds(dude(), 1).y);
    const h = makeTemplate(dude(), 'hurt', [255, 255, 255]);
    expect(getPixel(h[0], 5, 3)).toEqual([255, 255, 255, 255]);
  });
});
