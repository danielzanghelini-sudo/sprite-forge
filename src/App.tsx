import { useEffect, useMemo, useState } from 'react';
import { ConvertPanel } from './components/ConvertPanel';
import { GeneratePanel } from './components/GeneratePanel';
import { PalettePanel } from './components/PalettePanel';
import { PixelCanvas } from './components/PixelCanvas';
import { PixelEditor } from './components/PixelEditor';
import { AnimatePanel } from './components/AnimatePanel';
import { ProjectBar, ProjectPanel } from './components/ProjectPanel';
import { decodeImage, encodeImage } from './core/editor';
import {
  addVersion, createSprite, newId, parseBackup,
  type Project, type ProjectBackup, type SpriteRecord, type VersionSource,
} from './core/project';
import { slug } from './core/sheet';
import * as store from './lib/store';
import { downloadJson } from './lib/imageIO';
import { verifySprite, type SpriteReport } from './core/gridCheck';
import { PRESET_PALETTES } from './core/palettes';
import { convertToSprite, DEFAULT_CONVERT, type ConvertOptions } from './core/pixelate';
import { mapToPalette } from './core/quantize';
import { createImage, type Palette, type PixelImage } from './core/types';
import { downloadPng, fileToPixelImage } from './lib/imageIO';
import { makeSampleImage } from './lib/sample';

type Opts = Omit<ConvertOptions, 'palette'>;
let initPromise: Promise<Project[]> | null = null;
type Tab = 'generate' | 'convert' | 'editor' | 'animate' | 'project';

/** A que sprite do projeto pertence o que está no editor (null = ainda não salvo). */
interface EditMeta {
  spriteId: string | null;
  name: string;
  source: VersionSource;
}
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
  const [editMeta, setEditMeta] = useState<EditMeta>(() => load('editMeta', { spriteId: null, name: 'Sprite', source: 'editado' }));
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ---- projetos ----
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => load('activeProject', null));
  const [sprites, setSprites] = useState<SpriteRecord[]>([]);
  const active = projects.find((p) => p.id === activeId) ?? null;

  const refreshSprites = async (id = activeId) => {
    if (id) setSprites(await store.listSprites(id));
  };

  // carrega projetos; cria o primeiro com a paleta e a grade atuais
  useEffect(() => {
    (async () => {
      // uma única inicialização por página (o modo estrito do React roda efeitos duas vezes)
      initPromise ??= (async () => {
        const found = await store.listProjects();
        if (found.length) return found;
        const now = Date.now();
        const first: Project = {
          id: newId(), name: 'Meu projeto', palette, locked,
          gridW: options.gridW, gridH: options.gridH, createdAt: now, updatedAt: now,
        };
        await store.saveProject(first);
        return [first];
      })();
      const list = await initPromise;
      setProjects(list);
      const id = list.some((p) => p.id === activeId) ? activeId! : list[0].id;
      setActiveId(id);
      refreshSprites(id);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // paleta, trava e grade atuais ficam gravadas no projeto ativo
  useEffect(() => {
    if (!active) return;
    if (active.palette === palette && active.locked === locked && active.gridW === options.gridW && active.gridH === options.gridH) return;
    const updated = { ...active, palette, locked, gridW: options.gridW, gridH: options.gridH, updatedAt: Date.now() };
    setProjects((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
    const t = setTimeout(() => store.saveProject(updated), 300);
    return () => clearTimeout(t);
  }, [palette, locked, options.gridW, options.gridH, active]);

  const selectProject = (id: string, list = projects) => {
    const p = list.find((x) => x.id === id);
    if (!p) return;
    setActiveId(id);
    setPalette(p.palette);
    setLocked(p.locked);
    setOptions((o) => ({ ...o, gridW: p.gridW, gridH: p.gridH }));
    refreshSprites(id);
  };

  const createProject = async (name: string) => {
    const now = Date.now();
    const p: Project = { id: newId(), name, palette, locked: false, gridW: options.gridW, gridH: options.gridH, createdAt: now, updatedAt: now };
    await store.saveProject(p);
    const list = [p, ...projects];
    setProjects(list);
    selectProject(p.id, list);
  };

  const renameProject = async (name: string) => {
    if (!active) return;
    const p = { ...active, name, updatedAt: Date.now() };
    await store.saveProject(p);
    setProjects((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  };

  const removeProject = async () => {
    if (!active || projects.length < 2) return;
    await store.deleteProject(active.id);
    const list = projects.filter((p) => p.id !== active.id);
    setProjects(list);
    selectProject(list[0].id, list);
  };

  const exportProject = async () => {
    if (!active) return;
    const backup: ProjectBackup = {
      format: 'sprite-forge-project', version: 1, exportedAt: new Date().toISOString(),
      project: active, sprites: await store.listSprites(active.id),
    };
    downloadJson(backup, `${slug(active.name)}_backup.json`);
  };

  const importProject = async (file: File) => {
    try {
      const b = parseBackup(await file.text());
      await store.saveProject(b.project);
      for (const s of b.sprites) await store.saveSprite(s);
      const list = [b.project, ...projects];
      setProjects(list);
      selectProject(b.project.id, list);
      setTab('project');
      setSaveMsg(`Projeto importado com ${b.sprites.length} sprites.`);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Falha ao importar.');
    }
  };

  const saveToProject = async () => {
    if (!active) return;
    const encoded = encodeImage(editImage);
    const existing = editMeta.spriteId ? await store.getSprite(editMeta.spriteId) : null;
    let rec: SpriteRecord;
    if (existing && existing.projectId === active.id) {
      rec = addVersion({ ...existing, name: editMeta.name.trim() || existing.name }, encoded, 'editado');
      setSaveMsg(rec === existing ? 'Nada mudou desde a última versão.' : `Versão ${rec.versions.length} salva.`);
    } else {
      rec = createSprite(active.id, editMeta.name, encoded, editMeta.source);
      setSaveMsg(`Salvo em “${active.name}”.`);
    }
    await store.saveSprite(rec);
    setEditMeta({ spriteId: rec.id, name: rec.name, source: 'editado' });
    refreshSprites();
  };

  useEffect(() => save('editMeta', editMeta), [editMeta]);

  // sprite do projeto que está no editor (base das animações)
  const [animSprite, setAnimSprite] = useState<SpriteRecord | null>(null);
  useEffect(() => {
    if (tab !== 'animate') return;
    let alive = true;
    (editMeta.spriteId ? store.getSprite(editMeta.spriteId) : Promise.resolve(null)).then((s) => {
      if (alive) setAnimSprite(s && s.projectId === activeId ? s : null);
    });
    return () => { alive = false; };
  }, [tab, editMeta.spriteId, activeId]);

  const saveAnimations = async (animations: SpriteRecord['animations']) => {
    if (!animSprite) return;
    const fresh = (await store.getSprite(animSprite.id)) ?? animSprite;
    const rec = { ...fresh, animations, updatedAt: Date.now() };
    await store.saveSprite(rec);
    setAnimSprite(rec);
    setSaveMsg(`${animations?.length ?? 0} animações salvas em “${rec.name}”.`);
    refreshSprites();
  };
  useEffect(() => { if (activeId) save('activeProject', activeId); }, [activeId]);
  useEffect(() => {
    if (!saveMsg) return;
    const t = setTimeout(() => setSaveMsg(null), 4000);
    return () => clearTimeout(t);
  }, [saveMsg]);

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

  const loadIntoEditor = (img: PixelImage, meta: EditMeta = { spriteId: null, name: 'Sprite', source: 'editado' }) => {
    setEditImage(img);
    setEditMeta(meta);
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
          <button className={tab === 'animate' ? 'on' : ''} onClick={() => setTab('animate')}>Animar</button>
          <button className={tab === 'project' ? 'on' : ''} onClick={() => setTab('project')}>Projeto</button>
        </nav>
        <span className="stage">{active ? active.name : 'Carregando…'}</span>
      </header>

      {saveMsg && <div className="toast" role="status">{saveMsg}</div>}

      <aside className="sidebar">
        {active && (
          <ProjectBar
            projects={projects}
            active={active}
            onSelect={(id) => selectProject(id)}
            onCreate={createProject}
            onRename={renameProject}
            onDelete={removeProject}
            onExport={exportProject}
            onImport={importProject}
          />
        )}
        <PalettePanel
          palette={palette}
          locked={locked}
          source={source}
          onChange={setPalette}
          onToggleLock={() => setLocked((l) => !l)}
        />
        {(tab === 'generate' || tab === 'convert') && <ConvertPanel options={options} onChange={setOptions} />}
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
          onOpenInEditor={(img, name) => loadIntoEditor(img, { spriteId: null, name, source: 'gerado' })}
          base={{ image: editImage, name: editMeta.name }}
        />
      ) : tab === 'animate' ? (
        <AnimatePanel sprite={animSprite} palette={palette.colors} onSave={saveAnimations} onGoToEditor={() => setTab('editor')} />
      ) : tab === 'project' ? (
        active ? (
          <ProjectPanel
            project={active}
            sprites={sprites}
            persistent={store.persistent}
            onChanged={() => refreshSprites()}
            onOpenInEditor={(s, v) => {
              const im = decodeImage(v.image);
              if (im) loadIntoEditor(im, { spriteId: s.id, name: s.name, source: 'editado' });
            }}
          />
        ) : (
          <main className="project-area"><p className="hint">Carregando projetos…</p></main>
        )
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
                  <button className="primary" onClick={() => loadIntoEditor(result, { spriteId: null, name: sourceName, source: 'convertido' })}>Abrir no editor</button>
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
                <button onClick={() => downloadPng(editImage, `${slug(editMeta.name)}.png`)}>Baixar PNG 1×</button>
                <button onClick={() => downloadPng(editImage, `${slug(editMeta.name)}@8x.png`, 8)}>Baixar PNG 8×</button>
              </div>
            </header>
            <form
              className="row save-row"
              onSubmit={(e) => { e.preventDefault(); saveToProject(); }}
            >
              <label className="field grow">
                <span>Nome do sprite</span>
                <input id="sprite-name" type="text" value={editMeta.name} onChange={(e) => setEditMeta((m) => ({ ...m, name: e.target.value }))} />
              </label>
              <button type="submit" className="primary" disabled={!active}>
                {editMeta.spriteId ? 'Salvar nova versão' : 'Salvar no projeto'}
              </button>
              {editMeta.spriteId && (
                <button type="button" onClick={() => setEditMeta((m) => ({ ...m, spriteId: null }))} title="Salvar como um sprite separado">
                  Salvar como novo
                </button>
              )}
            </form>
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
