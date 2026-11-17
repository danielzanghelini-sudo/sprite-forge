import type { ConvertOptions } from '../core/pixelate';

type Opts = Omit<ConvertOptions, 'palette'>;

interface Props {
  options: Opts;
  onChange: (o: Opts) => void;
}

const GRID_SIZES = [16, 24, 32, 64];

export function ConvertPanel({ options: o, onChange }: Props) {
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => onChange({ ...o, [k]: v });
  const square = o.gridW === o.gridH && GRID_SIZES.includes(o.gridW);

  return (
    <section className="panel">
      <h2>Grade e conversão</h2>

      <div className="field">
        <span>Tamanho da grade</span>
        <div className="seg">
          {GRID_SIZES.map((s) => (
            <button key={s} className={square && o.gridW === s ? 'on' : ''} onClick={() => onChange({ ...o, gridW: s, gridH: s })}>
              {s}×{s}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <label className="field grow">
          <span>Largura</span>
          <input type="number" min={4} max={128} value={o.gridW} onChange={(e) => set('gridW', clamp(+e.target.value))} />
        </label>
        <label className="field grow">
          <span>Altura</span>
          <input type="number" min={4} max={128} value={o.gridH} onChange={(e) => set('gridH', clamp(+e.target.value))} />
        </label>
        <label className="field grow">
          <span>Margem</span>
          <input type="number" min={0} max={8} value={o.padding} onChange={(e) => set('padding', Math.max(0, Math.min(8, +e.target.value)))} />
        </label>
      </div>

      <label className="field">
        <span>Amostragem</span>
        <select value={o.mode} onChange={(e) => set('mode', e.target.value as Opts['mode'])}>
          <option value="dominant">Cor dominante (preserva contornos)</option>
          <option value="average">Média (mais suave)</option>
        </select>
      </label>

      <label className="field">
        <span>Cobertura mínima: {Math.round(o.coverage * 100)}%</span>
        <input type="range" min={0.1} max={0.9} step={0.05} value={o.coverage} onChange={(e) => set('coverage', +e.target.value)} />
      </label>

      <label className="check">
        <input type="checkbox" checked={o.removeBackground} onChange={(e) => set('removeBackground', e.target.checked)} />
        Remover fundo (cor dos cantos)
      </label>
      {o.removeBackground && (
        <label className="field">
          <span>Tolerância do fundo: {o.bgTolerance}</span>
          <input type="range" min={0} max={60} value={o.bgTolerance} onChange={(e) => set('bgTolerance', +e.target.value)} />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={o.autoCrop} onChange={(e) => set('autoCrop', e.target.checked)} />
        Recortar ao conteúdo
      </label>
      <label className="check">
        <input type="checkbox" checked={o.outline} onChange={(e) => set('outline', e.target.checked)} />
        Contorno de 1px (cor mais escura)
      </label>
      <label className="field">
        <span>Dithering: {o.dither === 0 ? 'desligado' : Math.round(o.dither * 100) + '%'}</span>
        <input type="range" min={0} max={1} step={0.05} value={o.dither} onChange={(e) => set('dither', +e.target.value)} />
      </label>
    </section>
  );
}

const clamp = (n: number) => Math.max(4, Math.min(128, Math.round(n) || 4));
