import { describe, expect, it } from 'vitest';
import {
  clearRegion, copyRegion, decodeImage, encodeImage, flip, floodFill, getPixel, History,
  linePoints, mirrorPoints, pasteRegion, rectFromPoints, setPixel, strokeLine, type RGBA,
} from './editor';
import { createImage } from './types';

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

describe('editor de pixels', () => {
  it('linha de Bresenham é contínua', () => {
    const pts = linePoints(0, 0, 5, 2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([5, 2]);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
    }
  });

  it('espelho X+Y gera 4 pontos e traço espelhado', () => {
    const img = createImage(8, 8);
    expect(mirrorPoints(img, 1, 2, { x: true, y: true })).toEqual([[1, 2], [6, 2], [1, 5], [6, 5]]);
    strokeLine(img, 0, 0, 0, 0, RED, { x: true, y: false });
    expect(getPixel(img, 7, 0)).toEqual(RED);
  });

  it('balde preenche só a área contígua e respeita a seleção', () => {
    const img = createImage(5, 5);
    for (let y = 0; y < 5; y++) setPixel(img, 2, y, BLUE); // parede
    const filled = floodFill(img, 0, 0, RED);
    expect(getPixel(filled, 1, 4)).toEqual(RED);
    expect(getPixel(filled, 3, 0)[3]).toBe(0);
    const clipped = floodFill(img, 0, 0, RED, { x: 0, y: 0, w: 1, h: 1 });
    expect(getPixel(clipped, 1, 0)[3]).toBe(0);
  });

  it('seleção: copiar, apagar, colar e espelhar', () => {
    const img = createImage(4, 4);
    setPixel(img, 0, 0, RED);
    const r = rectFromPoints(img, 1, 1, 0, 0)!;
    expect(r).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    const piece = copyRegion(img, r);
    const moved = pasteRegion(clearRegion(img, r), piece, 2, 2);
    expect(getPixel(moved, 0, 0)[3]).toBe(0);
    expect(getPixel(moved, 2, 2)).toEqual(RED);
    expect(getPixel(flip(img, 'h'), 3, 0)).toEqual(RED);
    expect(getPixel(flip(img, 'v', r), 0, 1)).toEqual(RED);
  });

  it('desfazer e refazer', () => {
    const h = new History();
    const a = createImage(2, 2);
    const b = createImage(2, 2);
    setPixel(b, 0, 0, RED);
    h.push(a);
    const undone = h.undo(b)!;
    expect(getPixel(undone, 0, 0)[3]).toBe(0);
    const redone = h.redo(undone)!;
    expect(getPixel(redone, 0, 0)).toEqual(RED);
    expect(h.canRedo).toBe(false);
  });

  it('serializa e restaura a imagem', () => {
    const img = createImage(3, 2);
    setPixel(img, 2, 1, BLUE);
    expect(getPixel(decodeImage(encodeImage(img))!, 2, 1)).toEqual(BLUE);
  });
});
