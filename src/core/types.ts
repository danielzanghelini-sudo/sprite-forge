/** Imagem RGBA simples, independente do DOM (testável em Node). */
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, 4 bytes por pixel
}

export type RGB = [number, number, number];

export interface Palette {
  id: string;
  name: string;
  colors: string[]; // hex "#rrggbb"
}

export function createImage(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneImage(img: PixelImage): PixelImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}
