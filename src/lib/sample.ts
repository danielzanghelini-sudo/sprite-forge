import type { PixelImage } from '../core/types';

/** Imagem de exemplo desenhada em código (um cogumelo em fundo claro), para testar sem arquivo. */
export function makeSampleImage(): PixelImage {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f1ea';
  g.fillRect(0, 0, s, s);

  // haste
  const stem = g.createLinearGradient(200, 0, 312, 0);
  stem.addColorStop(0, '#d9c9a8');
  stem.addColorStop(1, '#f7ecd6');
  g.fillStyle = stem;
  g.beginPath();
  g.roundRect(196, 250, 120, 190, 40);
  g.fill();
  // olhos
  g.fillStyle = '#2b1d14';
  g.fillRect(226, 320, 18, 36);
  g.fillRect(268, 320, 18, 36);

  // chapéu
  const cap = g.createRadialGradient(220, 170, 20, 256, 220, 200);
  cap.addColorStop(0, '#ff6b5a');
  cap.addColorStop(1, '#a8201a');
  g.fillStyle = cap;
  g.beginPath();
  g.ellipse(256, 240, 190, 150, 0, Math.PI, 0);
  g.closePath();
  g.fill();
  // pintas
  g.fillStyle = '#fff8ee';
  for (const [x, y, r] of [[180, 170, 28], [270, 130, 22], [340, 200, 26], [230, 215, 16]]) {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const { data } = g.getImageData(0, 0, s, s);
  return { width: s, height: s, data };
}
