import { useEffect, useRef } from 'react';
import type { PixelImage } from '../core/types';

interface Props {
  image: PixelImage;
  /** Tamanho de exibição desejado (lado maior, em px de tela). */
  displaySize?: number;
  showGrid?: boolean;
}

/** Mostra uma PixelImage ampliada por inteiro (sem suavização), com xadrez de transparência e grade. */
export function PixelCanvas({ image, displaySize = 384, showGrid = false }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoom = Math.max(1, Math.floor(displaySize / Math.max(image.width, image.height)));

  useEffect(() => {
    const canvas = ref.current!;
    canvas.width = image.width * zoom;
    canvas.height = image.height * zoom;
    const ctx = canvas.getContext('2d')!;
    const d = image.data;
    // xadrez
    const cell = Math.max(4, Math.floor(zoom / 2));
    for (let y = 0; y < canvas.height; y += cell)
      for (let x = 0; x < canvas.width; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) === 0 ? '#2a2a33' : '#33333d';
        ctx.fillRect(x, y, cell, cell);
      }
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const o = (y * image.width + x) * 4;
        if (d[o + 3] === 0) continue;
        ctx.fillStyle = `rgba(${d[o]},${d[o + 1]},${d[o + 2]},${d[o + 3] / 255})`;
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    if (showGrid && zoom >= 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= image.width; x++) {
        ctx.moveTo(x * zoom + 0.5, 0);
        ctx.lineTo(x * zoom + 0.5, canvas.height);
      }
      for (let y = 0; y <= image.height; y++) {
        ctx.moveTo(0, y * zoom + 0.5);
        ctx.lineTo(canvas.width, y * zoom + 0.5);
      }
      ctx.stroke();
    }
  }, [image, zoom, showGrid]);

  return <canvas ref={ref} className="pixel-canvas" title={`${image.width}×${image.height} · zoom ${zoom}×`} />;
}
