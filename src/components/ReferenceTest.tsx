import { useEffect, useMemo, useRef, useState } from 'react';
import { verifySprite } from '../core/gridCheck';
import { convertToSprite, type ConvertOptions } from '../core/pixelate';
import type { PixelImage } from '../core/types';
import { fetchModelPrices, generateWithReference, REFERENCE_MODELS, uploadReference } from '../gen/providers';
import { fileToPixelImage, spriteToReferenceBlob } from '../lib/imageIO';
import { PixelCanvas } from './PixelCanvas';

type Opts = Omit<ConvertOptions, 'palette'>;

const POSES = [
  { id: 'back', label: 'De costas', text: 'seen from behind (back view)' },
  { id: 'front', label: 'De frente', text: 'seen from the front (front view)' },
  { id: 'left', label: 'Virado para a esquerda', text: 'facing left (side view)' },
  { id: 'walk', label: 'Passo de caminhada', text: 'mid-stride walking pose, one leg forward' },
  { id: 'attack', label: 'Atacando', text: 'attacking pose, swinging forward' },
];

const buildRefPrompt = (pose: string) =>
  `The exact same character as in the reference image: same colors, same proportions, same outfit, same pixel art style. ` +
  `Now ${pose}. 16-bit pixel art game sprite, full body, centered, flat plain white background, no shadow, no text.`;

interface Cell {
  key: string;
  model: string;
  pose: string;
  status: 'pending' | 'running' | 'done' | 'error';
  raw?: PixelImage;
  rawUrl?: string;
  ms?: number;
  error?: string;
  rating?: 'good' | 'bad';
}

interface Props {
  base: { image: PixelImage; name: string };
  apiKey: string;
  palette: string[];
  options: Opts;
  onOpenInEditor: (img: PixelImage, name: string) => void;
}

export function ReferenceTest({ base, apiKey, palette, options, onOpenInEditor }: Props) {
  const [models, setModels] = useState<string[]>([REFERENCE_MODELS[0].id, REFERENCE_MODELS[1].id]);
  const [poses, setPoses] = useState<string[]>(['back', 'front', 'walk']);
  const [cells, setCells] = useState<Cell[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchModelPrices().then(setPrices).catch(() => setPrices({}));
    return () => abort.current?.abort();
  }, []);

  const total = models.length * poses.length;
  const estCost = models.reduce((s, m) => s + (prices[m] ?? 0) * poses.length, 0);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // a conversão usa o tamanho do sprite-base, para comparar pixel a pixel
  const convOpts = useMemo(() => ({ ...options, gridW: base.image.width, gridH: base.image.height, palette }), [options, base.image, palette]);

  const run = async () => {
    if (!apiKey || running || total === 0) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    setError(null);
    const list: Cell[] = poses.flatMap((p) => models.map((m) => ({ key: `${m}|${p}`, model: m, pose: p, status: 'pending' as const })));
    setCells(list);
    const upd = (key: string, patch: Partial<Cell>) => setCells((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
    try {
      const refUrl = await uploadReference(await spriteToReferenceBlob(base.image), apiKey, ctrl.signal);
      const seed = Math.floor(Math.random() * 1e9);
      for (const c of list) {
        if (ctrl.signal.aborted) break;
        upd(c.key, { status: 'running' });
        const t0 = performance.now();
        try {
          const pose = POSES.find((p) => p.id === c.pose)!;
          const blob = await generateWithReference(
            { prompt: buildRefPrompt(pose.text), seed, width: 512, height: 512, imageUrl: refUrl, model: c.model, signal: ctrl.signal },
            apiKey,
          );
          upd(c.key, { status: 'done', raw: await fileToPixelImage(blob), rawUrl: URL.createObjectURL(blob), ms: performance.now() - t0 });
        } catch (e) {
          upd(c.key, { status: 'error', error: ctrl.signal.aborted ? 'Cancelado' : e instanceof Error ? e.message : 'Falha' });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar a referência');
      setCells((cs) => cs.map((c) => ({ ...c, status: 'error', error: 'Não rodou' })));
    }
    setCells((cs) => cs.map((c) => (c.status === 'pending' ? { ...c, status: 'error', error: 'Cancelado' } : c)));
    setRunning(false);
  };

  const report = () => {
    const lines = [`Teste de referência · sprite ${base.image.width}×${base.image.height} · ${new Date().toLocaleString('pt-BR')}`];
    for (const m of models) {
      const cs = cells.filter((c) => c.model === m);
      const ok = cs.filter((c) => c.status === 'done');
      const avg = ok.length ? ok.reduce((s, c) => s + (c.ms ?? 0), 0) / ok.length / 1000 : 0;
      const good = cs.filter((c) => c.rating === 'good').length;
      const bad = cs.filter((c) => c.rating === 'bad').length;
      lines.push(
        `${m}: ${ok.length}/${cs.length} geradas, média ${avg.toFixed(1)} s, aprovadas ${good}, reprovadas ${bad}` +
          (prices[m] !== undefined ? `, tabela ${prices[m]} pollen/img` : '') +
          (cs.some((c) => c.error) ? `, erros: ${[...new Set(cs.filter((c) => c.error).map((c) => c.error))].join('; ')}` : ''),
      );
    }
    return lines.join('\n');
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="panel">
      <h2>Teste de referência (etapa 2b)</h2>
      <p className="hint">
        Gera o mesmo personagem em outras poses usando o sprite do editor como referência. Serve para decidir se a IA mantém a
        consistência. A referência é enviada para media.pollinations.ai e fica acessível a quem tiver o link.
      </p>
      <div className="row">
        <PixelCanvas image={base.image} displaySize={96} />
        <span className="hint">Base: {base.name} ({base.image.width}×{base.image.height}). Troque o sprite no editor para testar outro.</span>
      </div>

      <div className="field">
        <span className="hint">Modelos</span>
        <div className="row">
          {REFERENCE_MODELS.map((m) => (
            <label key={m.id} className="check">
              <input type="checkbox" checked={models.includes(m.id)} disabled={running} onChange={() => setModels((x) => toggle(x, m.id))} />
              {m.label} <span className="hint">({m.note}{prices[m.id] !== undefined ? ` · ${prices[m.id]} pollen` : ''})</span>
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="hint">Poses</span>
        <div className="row">
          {POSES.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={poses.includes(p.id)} disabled={running} onChange={() => setPoses((x) => toggle(x, p.id))} />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      <div className="row">
        <button className="primary" disabled={!apiKey || running || total === 0} onClick={run}>
          {running ? 'Testando…' : `Rodar teste (${total} ${total === 1 ? 'imagem' : 'imagens'})`}
        </button>
        {running && <button onClick={() => abort.current?.abort()}>Cancelar</button>}
        <span className="hint">
          {apiKey ? `Custo de tabela estimado: ${estCost ? estCost.toFixed(3) : '?'} pollen.` : 'Cole sua chave sk_ acima para rodar.'}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      {cells.length > 0 && (
        <>
          <div className="ref-grid" style={{ gridTemplateColumns: `auto repeat(${models.length}, minmax(0, 1fr))` }}>
            <span />
            {models.map((m) => <strong key={m} className="hint">{REFERENCE_MODELS.find((x) => x.id === m)?.label}</strong>)}
            {poses.map((p) => (
              <RefRow key={p} label={POSES.find((x) => x.id === p)!.label} cells={models.map((m) => cells.find((c) => c.key === `${m}|${p}`)!)}
                convOpts={convOpts} palette={palette}
                onRate={(key, rating) => setCells((cs) => cs.map((c) => (c.key === key ? { ...c, rating } : c)))}
                onEdit={(img, pose) => onOpenInEditor(img, `${base.name} ${pose}`)} />
            ))}
          </div>
          <p className="hint">Avalie cada resultado (👍 mantém o personagem, 👎 não mantém) e copie o relatório para colar no chat.</p>
          <div className="row">
            <button onClick={copyReport} disabled={running}>{copied ? 'Copiado ✔' : 'Copiar relatório'}</button>
          </div>
          <pre className="hint mono report-text">{report()}</pre>
        </>
      )}
    </section>
  );
}

function RefRow({ label, cells, convOpts, palette, onRate, onEdit }: {
  label: string;
  cells: (Cell | undefined)[];
  convOpts: ConvertOptions;
  palette: string[];
  onRate: (key: string, r: 'good' | 'bad') => void;
  onEdit: (img: PixelImage, pose: string) => void;
}) {
  return (
    <>
      <span className="hint ref-pose">{label}</span>
      {cells.map((c, i) => <RefCell key={c?.key ?? i} c={c} convOpts={convOpts} palette={palette} onRate={onRate} onEdit={(img) => onEdit(img, label)} />)}
    </>
  );
}

function RefCell({ c, convOpts, palette, onRate, onEdit }: {
  c?: Cell;
  convOpts: ConvertOptions;
  palette: string[];
  onRate: (key: string, r: 'good' | 'bad') => void;
  onEdit: (img: PixelImage) => void;
}) {
  const sprite = useMemo(() => (c?.raw ? convertToSprite(c.raw, convOpts) : null), [c?.raw, convOpts]);
  if (!c) return <span />;
  if (c.status !== 'done' || !sprite)
    return <div className={`placeholder small ${c.status === 'running' ? 'busy' : ''} ${c.status === 'error' ? 'err' : ''}`}>{c.status === 'error' ? c.error : c.status === 'running' ? 'Gerando…' : 'Na fila'}</div>;
  const ok = verifySprite(sprite, palette).ok;
  return (
    <div className="ref-cell">
      <div className="row tight">
        <img src={c.rawUrl} alt="gerada" className="raw-sm" />
        <PixelCanvas image={sprite} displaySize={96} />
      </div>
      <span className="hint">{((c.ms ?? 0) / 1000).toFixed(1)} s {ok ? '' : '· ✖ paleta'}</span>
      <div className="row tight">
        <button className={c.rating === 'good' ? 'on' : ''} onClick={() => onRate(c.key, 'good')} title="Mantém o personagem">👍</button>
        <button className={c.rating === 'bad' ? 'on' : ''} onClick={() => onRate(c.key, 'bad')} title="Não mantém o personagem">👎</button>
        <button onClick={() => onEdit(sprite)}>Editar</button>
      </div>
    </div>
  );
}
