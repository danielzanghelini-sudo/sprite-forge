import type { PixelImage } from './types';
import { createImage } from './types';

export interface SheetFrame {
  name: string;
  image: PixelImage;
}

export interface SheetOptions {
  /** Colunas da grade; 0 = tudo em uma linha. */
  columns: number;
  /** Espaço transparente entre quadros (evita "sangramento" com filtros da engine). */
  padding: number;
  /** Ampliação inteira (vizinho mais próximo). */
  scale: number;
  imageName: string;
}

/** Formato JSON Hash do TexturePacker, lido direto pelo Phaser (load.atlas) e por importadores de Godot/Unity. */
export interface AtlasJson {
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number };
      rotated: false;
      trimmed: false;
      spriteSourceSize: { x: number; y: number; w: number; h: number };
      sourceSize: { w: number; h: number };
    }
  >;
  meta: {
    app: string;
    version: string;
    image: string;
    format: 'RGBA8888';
    size: { w: number; h: number };
    scale: string;
  };
}

/** Amplia por fator inteiro, sem interpolação. */
export function scaleNearest(img: PixelImage, k: number): PixelImage {
  if (k === 1) return img;
  const out = createImage(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(s, s + 4), (y * out.width + x) * 4);
    }
  return out;
}

/** Garante nomes únicos de quadro (o atlas usa o nome como chave). */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const base = raw.trim() || 'sprite';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}_${n + 1}`;
  });
}

/**
 * Monta a sprite sheet em grade. Cada célula tem o tamanho do maior quadro;
 * quadros menores ficam alinhados no canto superior esquerdo da célula.
 */
export function packSheet(frames: SheetFrame[], opts: SheetOptions): { sheet: PixelImage; atlas: AtlasJson } {
  if (frames.length === 0) throw new Error('Nenhum sprite selecionado.');
  const cols = opts.columns > 0 ? Math.min(opts.columns, frames.length) : frames.length;
  const rows: SheetFrame[][] = [];
  for (let i = 0; i < frames.length; i += cols) rows.push(frames.slice(i, i + cols));
  return packRows(rows, opts);
}

/** Uma linha por grupo (ex.: uma animação por linha); a largura segue a linha mais longa. */
export function packRows(rowsIn: SheetFrame[][], opts: Omit<SheetOptions, 'columns'>): { sheet: PixelImage; atlas: AtlasJson } {
  const rowsList = rowsIn.filter((r) => r.length > 0);
  const frames = rowsList.flat();
  if (frames.length === 0) throw new Error('Nenhum sprite selecionado.');
  const k = Math.max(1, Math.floor(opts.scale));
  const pad = Math.max(0, Math.floor(opts.padding)) * k;
  const scaled = frames.map((f) => scaleNearest(f.image, k));
  const cellW = Math.max(...scaled.map((s) => s.width));
  const cellH = Math.max(...scaled.map((s) => s.height));
  const cols = Math.max(...rowsList.map((r) => r.length));
  const rows = rowsList.length;
  const sheet = createImage(cols * cellW + (cols - 1) * pad, rows * cellH + (rows - 1) * pad);
  const names = uniqueNames(frames.map((f) => f.name));
  // posição (linha, coluna) de cada quadro na ordem achatada
  const pos: [number, number][] = [];
  rowsList.forEach((r, ri) => r.forEach((_, ci) => pos.push([ri, ci])));
  const atlas: AtlasJson = {
    frames: {},
    meta: {
      app: 'Sprite Forge 16-bit',
      version: '1.0',
      image: opts.imageName,
      format: 'RGBA8888',
      size: { w: sheet.width, h: sheet.height },
      scale: '1',
    },
  };

  scaled.forEach((img, i) => {
    const x0 = pos[i][1] * (cellW + pad);
    const y0 = pos[i][0] * (cellH + pad);
    for (let y = 0; y < img.height; y++) {
      const s = y * img.width * 4;
      sheet.data.set(img.data.subarray(s, s + img.width * 4), ((y0 + y) * sheet.width + x0) * 4);
    }
    atlas.frames[names[i]] = {
      frame: { x: x0, y: y0, w: img.width, h: img.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: img.width, h: img.height },
      sourceSize: { w: img.width, h: img.height },
    };
  });
  return { sheet, atlas };
}

/** Nome seguro para arquivo e chave de atlas. */
export function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'sprite'
  );
}
