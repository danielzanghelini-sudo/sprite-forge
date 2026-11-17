import { describe, expect, it } from 'vitest';
import { maskRect } from '../core/pixelate';
import { createImage } from '../core/types';
import { buildPrompt, styleWarning } from './prompt';
import { customUrl, findProvider } from './providers';

describe('geração por texto', () => {
  it('monta prompt com estilo 16-bit e fundo liso', () => {
    const p = buildPrompt('cogumelo guerreiro com escudo', 'character', 'side');
    expect(p).toContain('16-bit pixel art');
    expect(p).toContain('cogumelo guerreiro com escudo');
    expect(p).toContain('plain white background');
    expect(buildPrompt('só isto', 'free', 'front')).toBe('só isto');
  });

  it('avisa sobre pedido de estilo de artista', () => {
    expect(styleWarning('herói no estilo de Fulano')).not.toBeNull();
    expect(styleWarning('herói de armadura azul')).toBeNull();
  });

  it('mascara a marca d’água com a cor de fundo acima dela', () => {
    const img = createImage(10, 10);
    for (let i = 0; i < 100; i++) img.data.set([255, 255, 255, 255], i * 4);
    img.data.set([0, 0, 0, 255], (9 * 10 + 9) * 4); // "logo"
    const out = maskRect(img, { x: 0.7, y: 0.9, w: 0.3, h: 0.1 });
    expect([...out.data.slice((9 * 10 + 9) * 4, (9 * 10 + 9) * 4 + 4)]).toEqual([255, 255, 255, 255]);
  });

  it('URL personalizada exige http(s) e o provedor padrão é o gratuito', () => {
    expect(() => customUrl.generate({ prompt: 'x', seed: 1, width: 8, height: 8 }, { urlTemplate: 'ftp://x' })).toThrow();
    expect(findProvider('nao-existe').id).toBe('pollinations');
  });

  it('Pollinations exige chave sk_', () => {
    const p = findProvider('pollinations');
    expect(() => p.generate({ prompt: 'x', seed: 1, width: 8, height: 8 }, {})).toThrow(/chave/i);
    expect(() => p.generate({ prompt: 'x', seed: 1, width: 8, height: 8 }, { apiKey: 'pk_abc' })).toThrow(/sk_/);
  });
});
