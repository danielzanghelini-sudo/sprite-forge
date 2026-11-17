import { useEffect, useMemo, useState } from 'react';
import { ConvertPanel } from './components/ConvertPanel';
import { GeneratePanel } from './components/GeneratePanel';
import { PalettePanel } from './components/PalettePanel';
import { PixelCanvas } from './components/PixelCanvas';
import { PixelEditor } from './components/PixelEditor';
import { decodeImage, encodeImage } from './core/editor';
import { verifySprite, type SpriteReport } from './core/gridCheck';
import { PRESET_PALETTES } from './core/palettes';
import { convertToSprite, DEFAULT_CONVERT, type ConvertOptions } from './core/pixelate';
import { mapToPalette } from './core/quantize';
import { createImage, type Palette, type PixelImage } from './core/types';
import { downloadPng, fileToPixelImage } from './lib/imageIO';
import { makeSampleImage } from './lib/sample';

type Opts = Omit<ConvertOptions, 'palette'>;
type Tab = 'generate' | 'convert' | 'editor';
const STORE = 'sprite-app:1a';

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`${STORE}:${key}`);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(v));
  } catch {
    /* armazenamento indisponível: segue sem persistir */
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>(() => load('tab', 'convert'));
  const [palette, setPalette] = useState<Palette>(() => load('palette', PRESET_PALETTES[0]));
  const [locked, setLocked] = useState<boolean>(() => load('locked', false));
  const [options, setOptions] = useState<Opts>(() => ({ ...DEFAULT_CONVERT, ...load('options', {}) }));
  const [source, setSource] = useState<PixelImage | null>(null);
  const [sourceName, setSourceName] = useState('sprite');
  const [showGrid, setShowGrid] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editImage, setEditImage] = useState<PixelImage>(() => {
    const saved = load<string | null>('editImage', null);
    return (saved && decodeImage(saved)) || createImage(32, 32);
  });
  const [docKey, setDocKey] = useState(0);

  useEffect(() => save('tab', tab), [tab]);
  useEffect(() => save('palette', palette), [palette]);
  useEffect(() => save('locked', locked), [locked]);
  useEffect(() => save('options', options), [options]);
  useEffect(() => {
    const t = setTimeout(() => save('editImage', encodeImage(editImage)), 300);
    return () => clearTimeout(t);
  }, [editImage]);

  const result = useMemo(
    () => (source ? convertToSprite(source, { ...options, palette: palette.colors }) : null),
    [source, options, palette],
  );
  const report = useMemo(() => (result ? verifySprite(result, palette.colors) : null), [result, palette]);
  const editReport = useMemo(() => verifySprite(editImage, palette.colors), [editImage, palette]);

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Arquivo não é uma imagem.');
      return;
    }
    try {
      setSource(await fileToPixelImage(file));
      setSourceName(file.name.replace(/\.[^.]+$/, ''));
      setError(null);
    } catch {
      setError('Não foi possível ler a imagem.');
    }
  };

  const loadIntoEditor = (img: PixelImage) => {
    setEditImage(img);
    setDocKey((k) => k + 1);
    setTab('editor');
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>Sprite Forge <small>16-bit</small></h1>
        <nav className="tabs">
          <button className={tab === 'generate' ? 'on' : ''} onClick={() => setTab('generate')}>Gerar</button>
          <button className={tab === 'convert' ? 'on' : ''} onClick={() => setTab('convert')}>Converter</button>
          <button className={tab === 'editor' ? 'on' : ''} onClick={() => setTab('editor')}>Editor</button>
        </nav>
        <span className="stage">Etapa 1c · geração por texto</span>
      </header>

      <aside className="sidebar">
        <PalettePanel
          palette={palette}
          locked={locked}
          source={source}
          onChange={setPalette}
          onToggleLock={() => setLocked((l) => !l)}
        />
        {tab !== 'editor' && <ConvertPanel options={options} onChange={setOptions} />}
        {tab === 'editor' && (
          <section className="panel">
            <h2>Novo sprite em branco</h2>
            <p className="hint">Usa o tamanho de grade da aba Converter ({options.gridW}×{options.gridH}).</p>
            <button
              onClick={() => {
                if (confirm('Descartar o sprite atual do editor?')) loadIntoEditor(createImage(options.gridW, options.gridH));
              }}
            >
              Criar {options.gridW}×{options.gridH}
            </button>
          </section>
        )}
      </aside>

      {tab === 'generate' ? (
        <GeneratePanel
          options={options}
          palette={palette.colors}
          onUseInConverter={(raw, name) => { setSource(raw); setSourceName(name); setTab('convert'); }}
          onOpenInEditor={loadIntoEditor}
        />
      ) : tab === 'convert' ? (
        <main className="stage-area">
          <section
            className={`panel drop ${dragging ? 'over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); openFile(e.dataTransfer.files[0]); }}
          >
            <h2>Imagem de referência</h2>
            {source ? (
              <img className="ref" alt="referência" src={sourceToUrl(source)} />
            ) : (
              <p className="hint">Arraste uma imagem aqui ou escolha um arquivo.</p>
            )}
            <div className="row">
              <label className="button">
                Escolher arquivo
                <input type="file" accept="image/*" hidden onChange={(e) => openFile(e.target.files?.[0])} />
              </label>
              <button onClick={() => { setSource(makeSampleImage()); setSourceName('exemplo'); }}>Usar exemplo</button>
            </div>
            {error && <p className="error">{error}</p>}
          </section>

          <section className="panel result">
            <header className="panel-head">
              <h2>Sprite {result ? `${result.width}×${result.height}` : ''}</h2>
              <label className="check">
                <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grade
              </label>
            </header>
            {result ? (
              <>
                <div className="previews">
                  <PixelCanvas image={result} displaySize={384} showGrid={showGrid} />
                  <div className="actual">
                    <PixelCanvas image={result} displaySize={result.width * 2} />
                    <span className="hint">2×</span>
                    <PixelCanvas image={result} displaySize={result.width} />
                    <span className="hint">1×</span>
                  </div>
                </div>
                {report && <ReportBar report={report} />}
                <div className="row">
                  <button className="primary" onClick={() => loadIntoEditor(result)}>Abrir no editor</button>
                  <button onClick={() => downloadPng(result, `${sourceName}_${result.width}x${result.height}.png`)}>Baixar PNG 1×</button>
                  <button onClick={() => downloadPng(result, `${sourceName}_${result.width}x${result.height}@8x.png`, 8)}>Baixar PNG 8×</button>
                </div>
              </>
            ) : (
              <p className="hint">O sprite aparece aqui depois de carregar uma imagem.</p>
            )}
          </section>
        </main>
      ) : (
        <main className="editor-area">
          <section className="panel">
            <header className="panel-head">
              <h2>Editor · {editImage.width}×{editImage.height}</h2>
              <div className="row">
                <PixelCanvas image={editImage} displaySize={editImage.width} />
                <button onClick={() => downloadPng(editImage, `sprite_${editImage.width}x${editImage.height}.png`)}>Baixar PNG 1×</button>
                <button onClick={() => downloadPng(editImage, `sprite_${editImage.width}x${editImage.height}@8x.png`, 8)}>Baixar PNG 8×</button>
              </div>
            </header>
            <PixelEditor image={editImage} setImage={setEditImage} palette={palette.colors} docKey={docKey} />
            <ReportBar report={editReport}>
              {editReport.offPalette > 0 && (
                <button onClick={() => setEditImage(mapToPalette(editImage, palette.colors))}>Ajustar à paleta</button>
              )}
            </ReportBar>
          </section>
        </main>
      )}
    </div>
  );
}

function ReportBar({ report, children }: { report: SpriteReport; children?: React.ReactNode }) {
  return (
    <div className={`report ${report.ok ? 'ok' : 'bad'}`}>
      <strong>{report.ok ? '✔ Grade e paleta verificadas' : '✖ Problemas encontrados'}</strong>
      <span>{report.opaquePixels} pixels opacos</span>
      <span>{report.colorsUsed.length} cores usadas</span>
      <span>{report.semiTransparent} semitransparentes</span>
      <span>{report.offPalette} fora da paleta</span>
      {children}
    </div>
  );
}

const urlCache = new WeakMap<PixelImage, string>();
function sourceToUrl(img: PixelImage): string {
  let url = urlCache.get(img);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    url = c.toDataURL();
    urlCache.set(img, url);
  }
  return url;
}
