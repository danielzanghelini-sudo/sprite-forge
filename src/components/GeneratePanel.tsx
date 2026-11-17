import { useEffect, useMemo, useRef, useState } from 'react';
import { verifySprite } from '../core/gridCheck';
import { convertToSprite, maskRect, type ConvertOptions } from '../core/pixelate';
import type { PixelImage } from '../core/types';
import { buildPrompt, KIND_LABEL, styleWarning, VIEW_LABEL, type AssetKind, type View } from '../gen/prompt';
import { findProvider, PROVIDERS } from '../gen/providers';
import { fileToPixelImage } from '../lib/imageIO';
import { PixelCanvas } from './PixelCanvas';

type Opts = Omit<ConvertOptions, 'palette'>;

interface Candidate {
  id: number;
  seed: number;
  status: 'pending' | 'running' | 'done' | 'error';
  raw?: PixelImage;
  rawUrl?: string;
  error?: string;
  ms?: number;
}

interface GenLog {
  count: number;
  totalMs: number;
  totalCost: number;
}

interface Props {
  options: Opts;
  palette: string[];
  onUseInConverter: (raw: PixelImage, name: string) => void;
  onOpenInEditor: (sprite: PixelImage) => void;
}

const KEY = 'sprite-app:1c';
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(`${KEY}:${k}`);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(`${KEY}:${k}`, JSON.stringify(v));
  } catch {
    /* sem armazenamento */
  }
};

const SOURCE_SIZE = 512;

export function GeneratePanel({ options, palette, onUseInConverter, onOpenInEditor }: Props) {
  const [subject, setSubject] = useState(() => read('subject', ''));
  const [kind, setKind] = useState<AssetKind>(() => read('kind', 'character'));
  const [view, setView] = useState<View>(() => read('view', 'side'));
  const [count, setCount] = useState(() => read('count', 4));
  const [providerId, setProviderId] = useState(() => read('provider', 'pollinations'));
  const [urlTemplate, setUrlTemplate] = useState(() => read('urlTemplate', ''));
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => read('apiKeys', {}));
  const [models, setModels] = useState<Record<string, string>>(() => read('models', {}));
  const [showKey, setShowKey] = useState(false);
  const [fixedSeed, setFixedSeed] = useState<number | ''>('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<GenLog>(() => read('log', { count: 0, totalMs: 0, totalCost: 0 }));
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    write('subject', subject); write('kind', kind); write('view', view);
    write('count', count); write('provider', providerId); write('urlTemplate', urlTemplate);
    write('apiKeys', apiKeys); write('models', models);
  }, [subject, kind, view, count, providerId, urlTemplate, apiKeys, models]);
  useEffect(() => write('log', log), [log]);
  useEffect(() => () => abort.current?.abort(), []);

  const provider = findProvider(providerId);
  const prompt = buildPrompt(subject || '…', kind, view);
  const warning = styleWarning(subject);

  const generate = async () => {
    if (!subject.trim() || running) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    const base = fixedSeed === '' ? Math.floor(Math.random() * 1e9) : fixedSeed;
    const list: Candidate[] = Array.from({ length: count }, (_, i) => ({ id: Date.now() + i, seed: base + i, status: 'pending' }));
    setCandidates(list);
    const update = (id: number, patch: Partial<Candidate>) =>
      setCandidates((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

    // em sequência: provedores gratuitos limitam requisições simultâneas
    for (const c of list) {
      if (ctrl.signal.aborted) break;
      update(c.id, { status: 'running' });
      const t0 = performance.now();
      try {
        const blob = await provider.generate(
          { prompt: buildPrompt(subject, kind, view), seed: c.seed, width: SOURCE_SIZE, height: SOURCE_SIZE, signal: ctrl.signal },
          { urlTemplate, apiKey: apiKeys[provider.id], model: models[provider.id] },
        );
        let raw = await fileToPixelImage(blob);
        if (provider.watermark) raw = maskRect(raw, provider.watermark);
        const ms = performance.now() - t0;
        update(c.id, { status: 'done', raw, rawUrl: URL.createObjectURL(blob), ms });
        setLog((l) => ({ count: l.count + 1, totalMs: l.totalMs + ms, totalCost: l.totalCost + provider.costPerImage }));
      } catch (e) {
        if (ctrl.signal.aborted) {
          update(c.id, { status: 'error', error: 'Cancelado' });
          break;
        }
        update(c.id, { status: 'error', error: e instanceof Error ? e.message : 'Falha na geração' });
      }
    }
    setCandidates((cs) => cs.map((c) => (c.status === 'pending' ? { ...c, status: 'error', error: 'Cancelado' } : c)));
    setRunning(false);
  };

  const name = subject.trim().toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 32) || 'sprite';

  return (
    <main className="gen-area">
      <section className="panel">
        <h2>Gerar por texto</h2>
        <label className="field">
          <span>Descrição</span>
          <textarea
            rows={3}
            value={subject}
            placeholder="ex.: cogumelo aventureiro com chapéu vermelho de pintas brancas e uma pequena espada"
            onChange={(e) => setSubject(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); }}
          />
        </label>
        {warning && <p className="error">{warning}</p>}
        <div className="row">
          <label className="field grow">
            <span>Tipo</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field grow">
            <span>Vista</span>
            <select value={view} disabled={kind === 'item' || kind === 'free'} onChange={(e) => setView(e.target.value as View)}>
              {Object.entries(VIEW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Variações</span>
            <select value={count} onChange={(e) => setCount(+e.target.value)}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Semente</span>
            <input
              type="number"
              placeholder="aleatória"
              value={fixedSeed}
              onChange={(e) => setFixedSeed(e.target.value === '' ? '' : Math.max(0, Math.floor(+e.target.value)))}
              style={{ width: 110 }}
            />
          </label>
        </div>
        <div className="row">
          <label className="field grow">
            <span>Provedor</span>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <p className="hint">{provider.description} Custo: {provider.costPerImage === 0 ? 'grátis' : `US$ ${provider.costPerImage.toFixed(3)}/imagem`}.</p>
        {provider.needsConfig === 'apiKey' && (
          <div className="row">
            <label className="field grow">
              <span>Chave sk_ (fica só neste aparelho)</span>
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={apiKeys[provider.id] ?? ''}
                placeholder="sk_…"
                onChange={(e) => setApiKeys((k) => ({ ...k, [provider.id]: e.target.value.trim() }))}
              />
            </label>
            <button onClick={() => setShowKey((s) => !s)}>{showKey ? 'Ocultar' : 'Mostrar'}</button>
            {apiKeys[provider.id] && (
              <button onClick={() => setApiKeys((k) => { const n = { ...k }; delete n[provider.id]; return n; })}>Apagar</button>
            )}
          </div>
        )}
        {provider.models && (
          <label className="field">
            <span>Modelo</span>
            <select value={models[provider.id] ?? provider.models[0].id} onChange={(e) => setModels((m) => ({ ...m, [provider.id]: e.target.value }))}>
              {provider.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
        {provider.needsConfig === 'apiKey' && !apiKeys[provider.id] && (
          <p className="hint">
            Crie a chave em <a href="https://enter.pollinations.ai/keys" target="_blank" rel="noreferrer">enter.pollinations.ai/keys</a> e cole acima.
            Sem chave, use “Demonstração offline” para testar.
          </p>
        )}
        {provider.needsConfig === 'urlTemplate' && (
          <label className="field">
            <span>Modelo de URL</span>
            <input
              type="text"
              value={urlTemplate}
              placeholder="https://exemplo.com/gerar?q={prompt}&seed={seed}&w={width}&h={height}"
              onChange={(e) => setUrlTemplate(e.target.value)}
            />
          </label>
        )}
        <details>
          <summary className="hint">Prompt enviado</summary>
          <p className="hint mono">{prompt}</p>
        </details>
        <div className="row">
          <button className="primary" disabled={!subject.trim() || running} onClick={generate}>
            {running ? 'Gerando…' : `Gerar ${count} ${count > 1 ? 'variações' : 'variação'}`}
          </button>
          {running && <button onClick={() => abort.current?.abort()}>Cancelar</button>}
          <span className="hint">Ctrl+Enter gera · grade {options.gridW}×{options.gridH} e paleta do projeto</span>
        </div>
        <p className="hint">
          Uso: {log.count} imagens · tempo médio {log.count ? (log.totalMs / log.count / 1000).toFixed(1) : '–'} s (meta ≤ 15 s) · custo acumulado US$ {log.totalCost.toFixed(2)}
        </p>
      </section>

      {candidates.length > 0 && (
        <section className="candidates">
          {candidates.map((c) => (
            <CandidateCard
              key={c.id}
              c={c}
              options={options}
              palette={palette}
              onUse={() => c.raw && onUseInConverter(c.raw, `${name}-${c.seed}`)}
              onEdit={(s) => onOpenInEditor(s)}
            />
          ))}
        </section>
      )}
    </main>
  );
}

function CandidateCard({ c, options, palette, onUse, onEdit }: {
  c: Candidate;
  options: Opts;
  palette: string[];
  onUse: () => void;
  onEdit: (s: PixelImage) => void;
}) {
  const sprite = useMemo(() => (c.raw ? convertToSprite(c.raw, { ...options, palette }) : null), [c.raw, options, palette]);
  const ok = useMemo(() => (sprite ? verifySprite(sprite, palette).ok : false), [sprite, palette]);

  return (
    <div className="panel candidate">
      <header className="panel-head">
        <span className="hint">semente {c.seed}</span>
        {c.ms !== undefined && <span className={`hint ${c.ms > 15000 ? 'warn' : ''}`}>{(c.ms / 1000).toFixed(1)} s</span>}
      </header>
      {c.status === 'pending' && <div className="placeholder">Na fila…</div>}
      {c.status === 'running' && <div className="placeholder busy">Gerando…</div>}
      {c.status === 'error' && <div className="placeholder err">{c.error}</div>}
      {c.status === 'done' && sprite && (
        <>
          <div className="cand-images">
            <img src={c.rawUrl} alt="imagem gerada" className="raw" />
            <PixelCanvas image={sprite} displaySize={160} />
          </div>
          <span className={`hint ${ok ? 'okc' : 'warn'}`}>{ok ? '✔ grade e paleta ok' : '✖ verificar'}</span>
          <div className="row">
            <button className="primary" onClick={() => onEdit(sprite)}>Abrir no editor</button>
            <button onClick={onUse}>Ajustar no conversor</button>
          </div>
        </>
      )}
    </div>
  );
}
