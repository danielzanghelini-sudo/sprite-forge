export type AssetKind = 'character' | 'enemy' | 'item' | 'free';
export type View = 'side' | 'front' | 'three-quarter';

export const KIND_LABEL: Record<AssetKind, string> = {
  character: 'Personagem',
  enemy: 'Inimigo',
  item: 'Item',
  free: 'Livre (só o texto)',
};

export const VIEW_LABEL: Record<View, string> = {
  side: 'Lateral',
  front: 'Frontal',
  'three-quarter': '3/4',
};

const KIND_TEXT: Record<AssetKind, string> = {
  character: 'game character sprite, full body, single character',
  enemy: 'game enemy monster sprite, full body, single creature',
  item: 'game item icon, single object',
  free: '',
};

const VIEW_TEXT: Record<View, string> = {
  side: 'side view facing right',
  front: 'front view',
  'three-quarter': 'three-quarter view',
};

/**
 * Monta o prompt em inglês (os modelos respondem melhor) a partir da descrição do usuário.
 * O fundo liso facilita a remoção do fundo; sem sombra evita "chão" no sprite.
 */
export function buildPrompt(subject: string, kind: AssetKind, view: View, styleHint = ''): string {
  if (kind === 'free') return subject.trim();
  return [
    `16-bit pixel art, ${KIND_TEXT[kind]}: ${subject.trim()}`,
    kind === 'item' ? '' : VIEW_TEXT[view],
    styleHint.trim(),
    'SNES era retro game style, crisp pixels, limited color palette, bold dark outline',
    'centered, isolated on a flat plain white background, no shadow, no ground, no text, no border',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Filtro simples (PRD §11): evita pedir imitação de artistas específicos. */
export function styleWarning(subject: string): string | null {
  return /\b(in the style of|no estilo de|estilo d[eo])\b/i.test(subject)
    ? 'Evite pedir o estilo de artistas específicos; descreva as características visuais.'
    : null;
}
