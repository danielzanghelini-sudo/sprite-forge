import type { Palette } from './types';

const hex = (list: string) => list.trim().split(/\s+/).map((c) => '#' + c.toLowerCase());

export const PRESET_PALETTES: Palette[] = [
  {
    id: 'db32',
    name: 'DawnBringer 32',
    colors: hex(`000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a fbf236 99e550 6abe30 37946e
      4b692f 524b24 323c39 3f3f74 306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 696a6a 595652
      76428a ac3232 d95763 d77bba 8f974a 8a6f30`),
  },
  {
    id: 'gameboy',
    name: 'Game Boy (4 cores)',
    colors: hex('0f380f 306230 8bac0f 9bbc0f'),
  },
  {
    id: 'nes',
    name: 'NES',
    colors: hex(`000000 7c7c7c 0000fc 0000bc 4428bc 940084 a80020 a81000 881400 503000 007800 006800
      005800 004058 bcbcbc 0078f8 0058f8 6844fc d800cc e40058 f83800 e45c10 ac7c00 00b800 00a800 00a844
      008888 f8f8f8 3cbcfc 6888fc 9878f8 f878f8 f85898 f87858 fca044 f8b800 b8f818 58d854 58f898 00e8d8
      787878 fcfcfc a4e4fc b8b8f8 d8b8f8 f8b8f8 f8a4c0 f0d0b0 fce0a8 f8d878 d8f878 b8f8b8 b8f8d8 00fcfc f8d8f8`),
  },
  {
    id: 'pico8',
    name: 'PICO-8',
    colors: hex(`000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436
      29adff 83769c ff77a8 ffccaa`),
  },
];

/** Paleta "SNES" não é fixa: o console usa 15-bit; ela é extraída da imagem e ajustada a 5 bits por canal. */
export const SNES_EXTRACT_ID = 'snes15';
export const EXTRACT_ID = 'extracted';

export function findPreset(id: string): Palette | undefined {
  return PRESET_PALETTES.find((p) => p.id === id);
}
