import { useState } from 'react';
import { EXTRACT_ID, PRESET_PALETTES, SNES_EXTRACT_ID } from '../core/palettes';
import { extractPalette } from '../core/quantize';
import type { Palette, PixelImage } from '../core/types';

interface Props {
  palette: Palette;
  locked: boolean;
  source: PixelImage | null;
  onChange: (p: Palette) => void;
  onToggleLock: () => void;
}

export function PalettePanel({ palette, locked, source, onChange, onToggleLock }: Props) {
  const [kind, setKind] = useState(palette.id);
  const [count, setCount] = useState(16);
  const isExtract = kind === EXTRACT_ID || kind === SNES_EXTRACT_ID;

  const pick = (id: string) => {
    setKind(id);
    const preset = PRESET_PALETTES.find((p) => p.id === id);
    if (preset) onChange(preset);
  };

  const extract = () => {
    if (!source) return;
    const snes = kind === SNES_EXTRACT_ID;
    onChange({
      id: kind,
      name: snes ? `SNES 15-bit (${count} cores)` : `Extraída (${count} cores)`,
      colors: extractPalette(source, count, { snap15bit: snes }),
    });
  };

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Paleta do projeto</h2>
        <button className={locked ? 'chip on' : 'chip'} onClick={onToggleLock} title="RF-04: impede cores fora da paleta e trava a escolha">
          {locked ? '🔒 Travada' : '🔓 Livre'}
        </button>
      </header>

      <label className="field">
        <span>Origem</span>
        <select value={kind} disabled={locked} onChange={(e) => pick(e.target.value)}>
          {PRESET_PALETTES.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
          <option value={SNES_EXTRACT_ID}>SNES 15-bit (extraída da imagem)</option>
          <option value={EXTRACT_ID}>Extraída da imagem</option>
        </select>
      </label>

      {isExtract && (
        <div className="row">
          <label className="field grow">
            <span>Cores: {count}</span>
            <input type="range" min={2} max={32} value={count} disabled={locked} onChange={(e) => setCount(+e.target.value)} />
          </label>
          <button onClick={extract} disabled={locked || !source}>Extrair</button>
        </div>
      )}
      {isExtract && !source && <p className="hint">Carregue uma imagem para extrair a paleta.</p>}

      <p className="hint">{palette.name} · {palette.colors.length} cores</p>
      <div className="swatches">
        {palette.colors.map((c) => (
          <span key={c} className="swatch" style={{ background: c }} title={c} />
        ))}
      </div>
    </section>
  );
}
