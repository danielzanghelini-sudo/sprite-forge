import { useCallback, useEffect, useRef, useState } from 'react';
import { hexToRgb, rgbToHex } from '../core/color';
import {
  clearRegion, copyRegion, flip, floodFill, getPixel, History, inRect, pasteRegion, rectFromPoints,
  strokeLine, TRANSPARENT, type Mirror, type Rect, type RGBA,
} from '../core/editor';
import type { PixelImage } from '../core/types';

export type Tool = 'pencil' | 'eraser' | 'bucket' | 'picker' | 'select';

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'pencil', label: 'Lápis', icon: '✏️', key: 'B' },
  { id: 'eraser', label: 'Borracha', icon: '🩹', key: 'E' },
  { id: 'bucket', label: 'Balde', icon: '🪣', key: 'G' },
  { id: 'picker', label: 'Conta-gotas', icon: '💧', key: 'I' },
  { id: 'select', label: 'Seleção', icon: '⬚', key: 'M' },
];

interface Props {
  image: PixelImage;
  setImage: (img: PixelImage) => void;
  palette: string[];
  /** Muda quando uma imagem nova é carregada de fora: zera o histórico e a seleção. */
  docKey: number;
  /** Quadro de referência mostrado em transparência por baixo (onion skin). */
  onion?: PixelImage | null;
}

type Drag =
  | { kind: 'stroke'; lastX: number; lastY: number; color: RGBA }
  | { kind: 'select'; ax: number; ay: number }
  | { kind: 'move'; sx: number; sy: number; base: PixelImage; piece: PixelImage; from: Rect };

export function PixelEditor({ image, setImage, palette, docKey, onion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef(new History());
  const drag = useRef<Drag | null>(null);
  const imgRef = useRef(image);
  imgRef.current = image;

  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState<RGBA>(() => [...hexToRgb(palette[0] ?? '#000000'), 255] as RGBA);
  const [mirror, setMirror] = useState<Mirror>({ x: false, y: false });
  const [selection, setSelection] = useState<Rect | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(() => fitZoom(image));
  const [showGrid, setShowGrid] = useState(true);
  const [, bump] = useState(0); // re-render para atualizar botões de desfazer/refazer

  useEffect(() => {
    history.current.clear();
    setSelection(null);
    setZoom(fitZoom(imgRef.current));
    bump((n) => n + 1);
  }, [docKey]);

  // se a paleta mudar e a cor atual não estiver nela, volta para a primeira cor
  useEffect(() => {
    if (color[3] !== 0 && !palette.includes(rgbToHex([color[0], color[1], color[2]])) && palette[0])
      setColor([...hexToRgb(palette[0]), 255] as RGBA);
  }, [palette]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Grava uma alteração com ponto de desfazer. */
  const commit = useCallback((next: PixelImage) => {
    history.current.push(imgRef.current);
    setImage(next);
    bump((n) => n + 1);
  }, [setImage]);

  const undo = useCallback(() => {
    const prev = history.current.undo(imgRef.current);
    if (prev) { setImage(prev); setSelection(null); bump((n) => n + 1); }
  }, [setImage]);
  const redo = useCallback(() => {
    const next = history.current.redo(imgRef.current);
    if (next) { setImage(next); setSelection(null); bump((n) => n + 1); }
  }, [setImage]);

  const doFlip = useCallback((axis: 'h' | 'v') => commit(flip(imgRef.current, axis, selection)), [commit, selection]);
  const deleteSelection = useCallback(() => {
    if (selection) commit(clearRegion(imgRef.current, selection));
  }, [commit, selection]);

  // atalhos de teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'a') {
        e.preventDefault();
        setTool('select');
        setSelection({ x: 0, y: 0, w: imgRef.current.width, h: imgRef.current.height });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); return; }
      if (k === 'escape') { setSelection(null); return; }
      const found = TOOLS.find((x) => x.key.toLowerCase() === k);
      if (found) setTool(found.id);
      if (k === 'h') doFlip('h');
      if (k === 'v') doFlip('v');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteSelection, doFlip]);

  const toPixel = (e: React.PointerEvent): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [
      Math.floor(((e.clientX - r.left) / r.width) * image.width),
      Math.floor(((e.clientY - r.top) / r.height) * image.height),
    ];
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* captura indisponível (ex.: caneta já solta): o traço segue sem ela */
    }
    const [x, y] = toPixel(e);
    const img = imgRef.current;
    const insideImg = x >= 0 && y >= 0 && x < img.width && y < img.height;

    if (tool === 'pencil' || tool === 'eraser') {
      // botão direito com o lápis apaga
      const c = tool === 'eraser' || e.button === 2 ? TRANSPARENT : color;
      history.current.push(img);
      const next = { ...img, data: new Uint8ClampedArray(img.data) };
      strokeLine(next, x, y, x, y, c, mirror);
      clipToSelection(img, next, selection);
      imgRef.current = next; // eventos seguintes já enxergam o traço, mesmo antes do re-render
      setImage(next);
      drag.current = { kind: 'stroke', lastX: x, lastY: y, color: c };
      bump((n) => n + 1);
    } else if (tool === 'bucket' && insideImg) {
      commit(floodFill(img, x, y, e.button === 2 ? TRANSPARENT : color, selection));
    } else if (tool === 'picker' && insideImg) {
      const c = getPixel(img, x, y);
      if (c[3] !== 0) { setColor(c); setTool('pencil'); }
    } else if (tool === 'select') {
      if (selection && inRect(selection, x, y)) {
        history.current.push(img);
        drag.current = {
          kind: 'move', sx: x, sy: y, from: selection,
          piece: copyRegion(img, selection), base: clearRegion(img, selection),
        };
        bump((n) => n + 1);
      } else {
        drag.current = { kind: 'select', ax: x, ay: y };
        setSelection(rectFromPoints(img, x, y, x, y));
      }
    }
  };

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = toPixel(e);
    setHover([x, y]);
    const d = drag.current;
    if (!d) return;
    const img = imgRef.current;
    if (d.kind === 'stroke') {
      if (x === d.lastX && y === d.lastY) return;
      const next = { ...img, data: new Uint8ClampedArray(img.data) };
      strokeLine(next, d.lastX, d.lastY, x, y, d.color, mirror);
      clipToSelection(img, next, selection);
      d.lastX = x; d.lastY = y;
      imgRef.current = next;
      setImage(next);
    } else if (d.kind === 'select') {
      setSelection(rectFromPoints(img, d.ax, d.ay, x, y));
    } else if (d.kind === 'move') {
      const dx = x - d.sx, dy = y - d.sy;
      setImage(pasteRegion(d.base, d.piece, d.from.x + dx, d.from.y + dy));
      setSelection({ ...d.from, x: d.from.x + dx, y: d.from.y + dy });
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'move' && selection) {
      // recorta a seleção à área visível depois de mover
      setSelection(rectFromPoints(image, selection.x, selection.y, selection.x + selection.w - 1, selection.y + selection.h - 1));
    }
  };

  // desenho do canvas
  useEffect(() => {
    const canvas = canvasRef.current!;
    const W = image.width * zoom, H = image.height * zoom;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const cell = Math.max(4, Math.floor(zoom / 2));
    for (let y = 0; y < H; y += cell)
      for (let x = 0; x < W; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) === 0 ? '#2a2a33' : '#33333d';
        ctx.fillRect(x, y, cell, cell);
      }
    if (onion && onion.width === image.width && onion.height === image.height) {
      const od = onion.data;
      for (let y = 0; y < onion.height; y++)
        for (let x = 0; x < onion.width; x++) {
          const o = (y * onion.width + x) * 4;
          if (od[o + 3] === 0) continue;
          ctx.fillStyle = `rgba(${od[o]},${od[o + 1]},${od[o + 2]},0.3)`;
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
    }
    const d = image.data;
    for (let y = 0; y < image.height; y++)
      for (let x = 0; x < image.width; x++) {
        const o = (y * image.width + x) * 4;
        if (d[o + 3] === 0) continue;
        ctx.fillStyle = `rgba(${d[o]},${d[o + 1]},${d[o + 2]},${d[o + 3] / 255})`;
        ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
      }
    if (showGrid && zoom >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      for (let x = 0; x <= image.width; x++) { ctx.moveTo(x * zoom + 0.5, 0); ctx.lineTo(x * zoom + 0.5, H); }
      for (let y = 0; y <= image.height; y++) { ctx.moveTo(0, y * zoom + 0.5); ctx.lineTo(W, y * zoom + 0.5); }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(242,165,65,0.6)';
    ctx.setLineDash([6, 4]);
    if (mirror.x) { ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); }
    if (mirror.y) { ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke(); }
    if (hover && tool !== 'select') {
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeRect(hover[0] * zoom + 0.5, hover[1] * zoom + 0.5, zoom - 1, zoom - 1);
    }
    if (selection) {
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(selection.x * zoom + 0.5, selection.y * zoom + 0.5, selection.w * zoom - 1, selection.h * zoom - 1);
      ctx.lineDashOffset = 4;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(selection.x * zoom + 0.5, selection.y * zoom + 0.5, selection.w * zoom - 1, selection.h * zoom - 1);
      ctx.lineDashOffset = 0;
    }
    ctx.setLineDash([]);
  }, [image, zoom, showGrid, selection, hover, mirror, tool, onion]);

  const colorHex = color[3] === 0 ? null : rgbToHex([color[0], color[1], color[2]]);

  return (
    <div className="editor">
      <div className="toolbar">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? 'on' : ''} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`}>
            <span aria-hidden>{t.icon}</span> {t.label}
          </button>
        ))}
        <span className="sep" />
        <button className={mirror.x ? 'on' : ''} onClick={() => setMirror((m) => ({ ...m, x: !m.x }))} title="Desenhar espelhado esquerda ↔ direita">Espelho ↔</button>
        <button className={mirror.y ? 'on' : ''} onClick={() => setMirror((m) => ({ ...m, y: !m.y }))} title="Desenhar espelhado cima ↕ baixo">Espelho ↕</button>
        <button onClick={() => doFlip('h')} title={`Inverter horizontal ${selection ? 'a seleção' : 'o sprite'} (H)`}>Inverter ↔</button>
        <button onClick={() => doFlip('v')} title={`Inverter vertical ${selection ? 'a seleção' : 'o sprite'} (V)`}>Inverter ↕</button>
        <span className="sep" />
        <button onClick={undo} disabled={!history.current.canUndo} title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
        <button onClick={redo} disabled={!history.current.canRedo} title="Refazer (Ctrl+Y)">↷ Refazer</button>
      </div>

      <div className="editor-body">
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            className={`pixel-canvas edit tool-${tool}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setHover(null)}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>

        <div className="editor-side">
          <div className="current-color">
            <span className="swatch big" style={{ background: colorHex ?? 'transparent' }} />
            <span className="hint">{colorHex ?? 'transparente'}</span>
          </div>
          <div className="swatches">
            {palette.map((c) => (
              <button
                key={c}
                className={`swatch ${colorHex === c ? 'sel' : ''}`}
                style={{ background: c }}
                title={c}
                onClick={() => { setColor([...hexToRgb(c), 255] as RGBA); if (tool === 'eraser' || tool === 'picker' || tool === 'select') setTool('pencil'); }}
              />
            ))}
          </div>
          <label className="field">
            <span>Zoom: {zoom}×</span>
            <input type="range" min={2} max={40} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grade
          </label>
          <p className="hint">
            {hover && hover[0] >= 0 && hover[1] >= 0 && hover[0] < image.width && hover[1] < image.height ? `x ${hover[0]}, y ${hover[1]}` : `${image.width}×${image.height}`}
            {selection ? ` · seleção ${selection.w}×${selection.h}` : ''}
          </p>
          <p className="hint small">
            Botão direito apaga com lápis e balde. Com a seleção: arraste para mover, Delete apaga, Esc cancela, Ctrl+A seleciona tudo.
            Lápis, borracha e balde ficam limitados à seleção.
          </p>
        </div>
      </div>
    </div>
  );
}

function fitZoom(img: PixelImage) {
  // no celular, cabe na largura da tela (descontando margens e bordas)
  const room = typeof window === 'undefined' ? 512 : Math.min(512, window.innerWidth - 64);
  return Math.max(2, Math.min(40, Math.floor(room / Math.max(img.width, img.height))));
}

/** Com seleção ativa, desfaz o que o traço pintou fora dela. */
function clipToSelection(before: PixelImage, next: PixelImage, sel: Rect | null) {
  if (!sel) return;
  for (let y = 0; y < next.height; y++)
    for (let x = 0; x < next.width; x++) {
      if (inRect(sel, x, y)) continue;
      const o = (y * next.width + x) * 4;
      next.data[o] = before.data[o]; next.data[o + 1] = before.data[o + 1];
      next.data[o + 2] = before.data[o + 2]; next.data[o + 3] = before.data[o + 3];
    }
}
