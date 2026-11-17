import { useMemo, useState } from 'react';
import { decodeImage } from '../core/editor';
import { addVersion, currentVersion, type Project, type ProjectBackup, type SpriteRecord, type SpriteVersion } from '../core/project';
import { packSheet, slug } from '../core/sheet';
import { createImage, type PixelImage } from '../core/types';
import { downloadJson, downloadPng } from '../lib/imageIO';
import { deleteSprite, saveSprite } from '../lib/store';
import { PixelCanvas } from './PixelCanvas';

interface Props {
  project: Project;
  sprites: SpriteRecord[];
  persistent: boolean;
  onChanged: () => void;
  onOpenInEditor: (sprite: SpriteRecord, version: SpriteVersion) => void;
}

const decoded = new Map<string, PixelImage>();
function img(encoded: string): PixelImage {
  let v = decoded.get(encoded);
  if (!v) {
    v = decodeImage(encoded) ?? createImage(1, 1);
    if (decoded.size > 500) decoded.clear();
    decoded.set(encoded, v);
  }
  return v;
}

const SOURCE_LABEL: Record<string, string> = { gerado: 'gerado', convertido: 'convertido', editado: 'editado', importado: 'importado' };
const fmt = (t: number) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function ProjectPanel({ project, sprites, persistent, onChanged, onOpenInEditor }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [historyOf, setHistoryOf] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [columns, setColumns] = useState(4);
  const [padding, setPadding] = useState(1);
  const [scale, setScale] = useState(1);

  const chosen = sprites.filter((s) => selected.has(s.id));
  const exportList = chosen.length ? chosen : sprites;
  const sheetName = `${slug(project.name)}_sheet`;

  const packed = useMemo(() => {
    if (!exportList.length) return null;
    try {
      return packSheet(
        exportList.map((s) => ({ name: slug(s.name), image: img(currentVersion(s).image) })),
        { columns, padding, scale, imageName: `${sheetName}.png` },
      );
    } catch {
      return null;
    }
  }, [exportList, columns, padding, scale, sheetName]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const historySprite = sprites.find((s) => s.id === historyOf) ?? null;

  return (
    <main className="project-area">
      {!persistent && (
        <p className="error">Este navegador não permite salvar dados (janela privada?). Os projetos ficam só até fechar a página.</p>
      )}

      <section className="panel">
        <header className="panel-head">
          <h2>Sprites · {sprites.length}</h2>
          {sprites.length > 0 && (
            <div className="row">
              <button onClick={() => setSelected(new Set(sprites.map((s) => s.id)))}>Selecionar todos</button>
              {selected.size > 0 && <button onClick={() => setSelected(new Set())}>Limpar seleção</button>}
            </div>
          )}
        </header>
        {sprites.length === 0 ? (
          <p className="hint">
            Nenhum sprite neste projeto ainda. Gere ou converta um sprite, abra no editor e toque em “Salvar no projeto”.
          </p>
        ) : (
          <div className="gallery">
            {sprites.map((s) => {
              const cur = currentVersion(s);
              const im = img(cur.image);
              return (
                <div key={s.id} className={`tile ${selected.has(s.id) ? 'sel' : ''}`}>
                  <label className="tile-check" title="Incluir na sprite sheet">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                  </label>
                  <button className="tile-thumb" onClick={() => onOpenInEditor(s, cur)} title="Abrir no editor">
                    <PixelCanvas image={im} displaySize={96} />
                  </button>
                  {renaming?.id === s.id ? (
                    <form
                      className="row"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await saveSprite({ ...s, name: renaming.name.trim() || s.name, updatedAt: Date.now() });
                        setRenaming(null);
                        onChanged();
                      }}
                    >
                      <input id={`rename-${s.id}`} type="text" autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: s.id, name: e.target.value })} />
                      <button type="submit">OK</button>
                    </form>
                  ) : (
                    <button className="tile-name" onClick={() => setRenaming({ id: s.id, name: s.name })} title="Renomear">
                      {s.name}
                    </button>
                  )}
                  <span className="hint">{im.width}×{im.height} · {s.versions.length} {s.versions.length === 1 ? 'versão' : 'versões'}</span>
                  <div className="row tight">
                    <button onClick={() => onOpenInEditor(s, cur)}>Editar</button>
                    <button onClick={() => setHistoryOf(historyOf === s.id ? null : s.id)}>Histórico</button>
                    {confirmDelete === s.id ? (
                      <>
                        <button
                          className="danger"
                          onClick={async () => {
                            await deleteSprite(s.id);
                            setConfirmDelete(null);
                            setSelected((x) => { const n = new Set(x); n.delete(s.id); return n; });
                            if (historyOf === s.id) setHistoryOf(null);
                            onChanged();
                          }}
                        >
                          Confirmar
                        </button>
                        <button onClick={() => setConfirmDelete(null)}>Não</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(s.id)} title="Excluir sprite e todo o histórico">Excluir</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {historySprite && (
        <HistoryPanel
          key={historySprite.id}
          sprite={historySprite}
          onClose={() => setHistoryOf(null)}
          onOpen={(v) => onOpenInEditor(historySprite, v)}
          onRestore={async (v) => {
            await saveSprite(addVersion(historySprite, v.image, 'editado'));
            onChanged();
          }}
        />
      )}

      {sprites.length > 0 && (
        <section className="panel">
          <h2>Exportar sprite sheet</h2>
          <p className="hint">
            {chosen.length ? `${chosen.length} selecionados` : `Todos os ${sprites.length} sprites`}, na ordem da galeria.
            Formato do atlas: JSON Hash (TexturePacker), lido direto pelo Phaser com <code>load.atlas</code>.
          </p>
          <div className="row">
            <label className="field">
              <span>Colunas</span>
              <input id="sheet-cols" type="number" min={0} max={64} value={columns} onChange={(e) => setColumns(Math.max(0, Math.min(64, +e.target.value || 0)))} />
            </label>
            <label className="field">
              <span>Espaço (px)</span>
              <input id="sheet-pad" type="number" min={0} max={8} value={padding} onChange={(e) => setPadding(Math.max(0, Math.min(8, +e.target.value || 0)))} />
            </label>
            <label className="field">
              <span>Escala</span>
              <select id="sheet-scale" value={scale} onChange={(e) => setScale(+e.target.value)}>
                {[1, 2, 3, 4, 6, 8].map((k) => <option key={k} value={k}>{k}×</option>)}
              </select>
            </label>
          </div>
          <p className="hint">0 colunas = tudo em uma linha.</p>
          {packed && (
            <>
              <div className="sheet-preview">
                <PixelCanvas image={packed.sheet} displaySize={Math.min(640, Math.max(packed.sheet.width, packed.sheet.height) * 4)} />
              </div>
              <p className="hint">{packed.sheet.width}×{packed.sheet.height} px · {Object.keys(packed.atlas.frames).length} quadros</p>
              <div className="row">
                <button className="primary" onClick={() => downloadPng(packed.sheet, `${sheetName}.png`)}>Baixar PNG da sheet</button>
                <button className="primary" onClick={() => downloadJson(packed.atlas, `${sheetName}.json`)}>Baixar atlas JSON</button>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function HistoryPanel({ sprite, onClose, onOpen, onRestore }: {
  sprite: SpriteRecord;
  onClose: () => void;
  onOpen: (v: SpriteVersion) => void;
  onRestore: (v: SpriteVersion) => void;
}) {
  const versions = [...sprite.versions].reverse(); // mais recente primeiro
  const [a, setA] = useState(versions[1]?.id ?? versions[0].id);
  const [b, setB] = useState(versions[0].id);
  const va = sprite.versions.find((v) => v.id === a)!;
  const vb = sprite.versions.find((v) => v.id === b)!;
  const currentId = currentVersion(sprite).id;

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Histórico · {sprite.name}</h2>
        <button onClick={onClose}>Fechar</button>
      </header>
      {sprite.versions.length > 1 && (
        <div className="compare">
          {[{ v: va, label: 'A' }, { v: vb, label: 'B' }].map(({ v, label }) => (
            <figure key={label}>
              <PixelCanvas image={img(v.image)} displaySize={192} showGrid />
              <figcaption className="hint">{label} · {fmt(v.createdAt)} · {SOURCE_LABEL[v.source]}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="versions">
        {versions.map((v, i) => (
          <div key={v.id} className={`version ${v.id === a || v.id === b ? 'sel' : ''}`}>
            <PixelCanvas image={img(v.image)} displaySize={48} />
            <div className="version-info">
              <span>v{versions.length - i} {v.id === currentId && <strong>· atual</strong>}</span>
              <span className="hint">{fmt(v.createdAt)} · {SOURCE_LABEL[v.source]}</span>
            </div>
            <div className="row tight">
              {sprite.versions.length > 1 && (
                <>
                  <button className={v.id === a ? 'on' : ''} onClick={() => setA(v.id)} title="Comparar como A">A</button>
                  <button className={v.id === b ? 'on' : ''} onClick={() => setB(v.id)} title="Comparar como B">B</button>
                </>
              )}
              <button onClick={() => onOpen(v)}>Abrir</button>
              {v.id !== currentId && <button onClick={() => onRestore(v)} title="Cria uma nova versão igual a esta">Restaurar</button>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Barra de projetos (fica na lateral). */
export function ProjectBar({ projects, active, onSelect, onCreate, onRename, onDelete, onExport, onImport }: {
  projects: Project[];
  active: Project;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'new' | 'rename' | 'delete'>('idle');
  const [name, setName] = useState('');

  return (
    <section className="panel">
      <h2>Projeto</h2>
      <label className="field">
        <span>Projeto ativo</span>
        <select id="project-select" value={active.id} onChange={(e) => onSelect(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <p className="hint">Paleta, trava e grade ficam salvas em cada projeto.</p>

      {mode === 'new' || mode === 'rename' ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            mode === 'new' ? onCreate(name.trim()) : onRename(name.trim());
            setMode('idle');
          }}
        >
          <input id="project-name" type="text" autoFocus placeholder="Nome do projeto" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="primary">{mode === 'new' ? 'Criar' : 'Salvar'}</button>
          <button type="button" onClick={() => setMode('idle')}>Cancelar</button>
        </form>
      ) : mode === 'delete' ? (
        <div className="row">
          <span className="error">Excluir “{active.name}” e todos os sprites?</span>
          <button className="danger" onClick={() => { onDelete(); setMode('idle'); }}>Excluir</button>
          <button onClick={() => setMode('idle')}>Cancelar</button>
        </div>
      ) : (
        <div className="row">
          <button onClick={() => { setName(''); setMode('new'); }}>Novo</button>
          <button onClick={() => { setName(active.name); setMode('rename'); }}>Renomear</button>
          <button onClick={() => setMode('delete')} disabled={projects.length < 2} title={projects.length < 2 ? 'É preciso ter outro projeto' : ''}>Excluir</button>
        </div>
      )}
      <div className="row">
        <button onClick={onExport} title="Arquivo .json com paleta, sprites e histórico">Backup</button>
        <label className="button">
          Importar backup
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        </label>
      </div>
      <p className="hint">Use o backup para levar um projeto do PC para o celular.</p>
    </section>
  );
}

export type { ProjectBackup };
