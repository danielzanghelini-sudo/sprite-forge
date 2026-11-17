import type { PixelImage } from './types';
import { cloneImage, createImage } from './types';

export type RGBA = [number, number, number, number];
export const TRANSPARENT: RGBA = [0, 0, 0, 0];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mirror {
  x: boolean; // espelho no eixo vertical (esquerda ↔ direita)
  y: boolean; // espelho no eixo horizontal (cima ↔ baixo)
}

export function getPixel(img: PixelImage, x: number, y: number): RGBA {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

const inside = (img: PixelImage, x: number, y: number) => x >= 0 && y >= 0 && x < img.width && y < img.height;

/** Escreve um pixel (alterando a imagem no lugar). Transparente zera RGB também. */
export function setPixel(img: PixelImage, x: number, y: number, c: RGBA): void {
  if (!inside(img, x, y)) return;
  const o = (y * img.width + x) * 4;
  if (c[3] === 0) img.data.set(TRANSPARENT, o);
  else img.data.set(c, o);
}

/** Pontos espelhados de (x, y) conforme o modo de espelho (sem repetidos). */
export function mirrorPoints(img: PixelImage, x: number, y: number, m: Mirror): [number, number][] {
  const mx = img.width - 1 - x;
  const my = img.height - 1 - y;
  const pts: [number, number][] = [[x, y]];
  if (m.x) pts.push([mx, y]);
  if (m.y) pts.push([x, my]);
  if (m.x && m.y) pts.push([mx, my]);
  const seen = new Set<string>();
  return pts.filter(([a, b]) => {
    const k = `${a},${b}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Linha de Bresenham entre dois pontos (traço contínuo mesmo com o mouse rápido). */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

/** Traça uma linha com espelho, alterando a imagem no lugar. */
export function strokeLine(img: PixelImage, x0: number, y0: number, x1: number, y1: number, c: RGBA, m: Mirror): void {
  for (const [x, y] of linePoints(x0, y0, x1, y1))
    for (const [px, py] of mirrorPoints(img, x, y, m)) setPixel(img, px, py, c);
}

const sameColor = (a: RGBA, b: RGBA) =>
  (a[3] === 0 && b[3] === 0) || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);

/** Balde: preenche a área contígua (4 vizinhos) da mesma cor. Limita-se a `clip` se houver seleção. */
export function floodFill(img: PixelImage, x: number, y: number, c: RGBA, clip?: Rect | null): PixelImage {
  const out = cloneImage(img);
  if (!inside(img, x, y) || (clip && !inRect(clip, x, y))) return out;
  const target = getPixel(img, x, y);
  if (sameColor(target, c)) return out;
  const w = img.width;
  const seen = new Uint8Array(w * img.height);
  const stack = [y * w + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = 1;
    const px = i % w, py = (i - px) / w;
    if (clip && !inRect(clip, px, py)) continue;
    if (!sameColor(getPixel(img, px, py), target)) continue;
    setPixel(out, px, py, c);
    if (px > 0) stack.push(i - 1);
    if (px < w - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - w);
    if (py < img.height - 1) stack.push(i + w);
  }
  return out;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/** Normaliza um retângulo a partir de dois cantos e o recorta aos limites da imagem. */
export function rectFromPoints(img: PixelImage, ax: number, ay: number, bx: number, by: number): Rect | null {
  const x0 = Math.max(0, Math.min(ax, bx)), y0 = Math.max(0, Math.min(ay, by));
  const x1 = Math.min(img.width - 1, Math.max(ax, bx)), y1 = Math.min(img.height - 1, Math.max(ay, by));
  if (x1 < x0 || y1 < y0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function copyRegion(img: PixelImage, r: Rect): PixelImage {
  const out = createImage(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const s = ((r.y + y) * img.width + r.x) * 4;
    out.data.set(img.data.subarray(s, s + r.w * 4), y * r.w * 4);
  }
  return out;
}

export function clearRegion(img: PixelImage, r: Rect): PixelImage {
  const out = cloneImage(img);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setPixel(out, x, y, TRANSPARENT);
  return out;
}

/** Cola `piece` em (x, y); pixels transparentes da peça não apagam o fundo. */
export function pasteRegion(img: PixelImage, piece: PixelImage, x: number, y: number): PixelImage {
  const out = cloneImage(img);
  for (let py = 0; py < piece.height; py++)
    for (let px = 0; px < piece.width; px++) {
      const c = getPixel(piece, px, py);
      if (c[3] !== 0) setPixel(out, x + px, y + py, c);
    }
  return out;
}

/** Espelha a imagem inteira ou só a região. */
export function flip(img: PixelImage, axis: 'h' | 'v', r?: Rect | null): PixelImage {
  const area = r ?? { x: 0, y: 0, w: img.width, h: img.height };
  const piece = copyRegion(img, area);
  const flipped = createImage(piece.width, piece.height);
  for (let y = 0; y < piece.height; y++)
    for (let x = 0; x < piece.width; x++) {
      const sx = axis === 'h' ? piece.width - 1 - x : x;
      const sy = axis === 'v' ? piece.height - 1 - y : y;
      setPixel(flipped, x, y, getPixel(piece, sx, sy));
    }
  return pasteRegionReplace(img, flipped, area.x, area.y);
}

/** Cola substituindo tudo, inclusive com transparência. */
function pasteRegionReplace(img: PixelImage, piece: PixelImage, x: number, y: number): PixelImage {
  const out = cloneImage(img);
  for (let py = 0; py < piece.height; py++)
    for (let px = 0; px < piece.width; px++) setPixel(out, x + px, y + py, getPixel(piece, px, py));
  return out;
}

/** Histórico de desfazer/refazer por instantâneos (sprites são pequenos). */
export class History {
  private past: PixelImage[] = [];
  private future: PixelImage[] = [];
  constructor(private limit = 200) {}

  push(before: PixelImage) {
    this.past.push(cloneImage(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(current: PixelImage): PixelImage | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(cloneImage(current));
    return prev;
  }
  redo(current: PixelImage): PixelImage | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneImage(current));
    return next;
  }
  clear() {
    this.past = [];
    this.future = [];
  }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}

/** Serialização compacta para salvar no navegador. */
export function encodeImage(img: PixelImage): string {
  let bin = '';
  for (let i = 0; i < img.data.length; i++) bin += String.fromCharCode(img.data[i]);
  return `${img.width}x${img.height}:${btoa(bin)}`;
}

export function decodeImage(s: string): PixelImage | null {
  const m = /^(\d+)x(\d+):(.*)$/.exec(s);
  if (!m) return null;
  const w = +m[1], h = +m[2];
  const bin = atob(m[3]);
  if (bin.length !== w * h * 4) return null;
  const img = createImage(w, h);
  for (let i = 0; i < bin.length; i++) img.data[i] = bin.charCodeAt(i);
  return img;
}
