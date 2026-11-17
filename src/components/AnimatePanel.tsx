import { useEffect, useMemo, useState } from 'react';
import { makeTemplate, TEMPLATE_INFO, type AnimTemplate } from '../core/animate';
import { hexToRgb, luminance } from '../core/color';
import { decodeImage, encodeImage } from '../core/editor';
import { verifySprite } from '../core/gridCheck';
import { currentVersion, newId, type SpriteAnimation, type SpriteRecord } from '../core/project';
import { cloneImage, type PixelImage } from '../core/types';
import { PixelCanvas } from './PixelCanvas';
import { PixelEditor } from './PixelEditor';

interface WorkAnim {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  frames: PixelImage[];
}

interface Props {
  sprite: SpriteRecord | null;
  palette: string[];
  onSave: (animations: SpriteAnimation[]) => Promise<void>;
  onGoToEditor: () => void;
}

const toWork = (a: SpriteAnimation): WorkAnim => ({
  ...a,
  frames: a.frames.map((f) => decodeImage(f)).filter((f): f is PixelImage => !!f),
});

export function AnimatePanel({ sprite, palette, onSave, onGoToEditor }: Props) {
  const base = useMemo(() => (sprite ? decodeImage(currentVersion(sprite).image) : null), [sprite]);
  const [anims, setAnims] = useState<WorkAnim[]>(() => (sprite?.animations ?? []).map(toWork));
  const [currentId, setCurrentId] = useState<string | null>(() => sprite?.animations?.[0]?.id ?? null);
  const [frame, setFrame] = useState(0);
  const [docKey, setDocKey] = useState(0);
  const [onion, setOnion] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [template, setTemplate] = useState<AnimTemplate | 'blank'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  // troca de sprite: recarrega as animações salvas
  useEffect(() => {
    setAnims((sprite?.animations ?? []).map(toWork));
    setCurrentId(sprite?.animations?.[0]?.id ?? null);
    setFrame(0);
    setDirty(false);
    setDocKey((k) => k + 1);
  }, [sprite?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sprite || !base) {
    return (
      <main className="project-area">
        <section className="panel">
          <h2>Animar</h2>
          <p className="hint">
            Para animar, o sprite precisa estar salvo no projeto. Abra ou crie um sprite no editor e toque em “Salvar no projeto”,
            ou abra um sprite pela aba Projeto.
          </p>
          <div className="row"><button className="primary" onClick={onGoToEditor}>Ir para o editor</button></div>
        </section>
      </main>
    );
  }

  const cur = anims.find((a) => a.id === currentId) ?? null;
  const flash = (): [number, number, number] => {
    const rgbs = palette.map(hexToRgb);
    return rgbs.reduce((a, c) => (luminance(c) > luminance(a) ? c : a), rgbs[0] ?? [255, 255, 255]);
  };

  const update = (fn: (a: WorkAnim) => WorkAnim) => {
    if (!cur) return;
    setAnims((as) => as.map((a) => (a.id === cur.id ? fn(a) : a)));
    setDirty(true);
  };
  const goFrame = (i: number) => {
    setFrame(i);
    setDocKey((k) => k + 1);
  };

  const addAnimation = () => {
    const info = template === 'blank' ? { label: 'Nova animação', fps: 8, loop: true } : TEMPLATE_INFO[template];
    const frames = template === 'blank' ? [cloneImage(base)] : makeTemplate(base, template, flash());
    const usedNames = new Set(anims.map((a) => a.name));
    let name = template === 'blank' ? 'nova' : template;
    for (let n = 2; usedNames.has(name); n++) name = `${template === 'blank' ? 'nova' : template}_${n}`;
    const a: WorkAnim = { id: newId(), name, fps: info.fps, loop: info.loop, frames };
    setAnims((as) => [...as, a]);
    setCurrentId(a.id);
    goFrame(0);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    await onSave(anims.map((a) => ({ id: a.id, name: a.name.trim() || 'animacao', fps: a.fps, loop: a.loop, frames: a.frames.map(encodeImage) })));
    setSaving(false);
    setDirty(false);
  };

  const f = cur ? Math.min(frame, cur.frames.length - 1) : 0;
  const onionFrame = cur && onion && cur.frames.length > 1 ? (f > 0 ? cur.frames[f - 1] : cur.loop ? cur.frames[cur.frames.length - 1] : null) : null;
  const badFrames = cur ? cur.frames.filter((fr) => !verifySprite(fr, palette).ok).length : 0;

  return (
    <main className="project-area">
      <section className="panel">
        <header className="panel-head">
          <h2>Animar · {sprite.name}</h2>
          <div className="row">
            {dirty && <span className="hint warn">alterações não salvas</span>}
            <button className="primary" onClick={save} disabled={!dirty || saving}>{saving ? 'Salvando…' : 'Salvar animações'}</button>
          </div>
        </header>

        <div className="row anim-list">
          {anims.map((a) => (
            <button key={a.id} className={a.id === currentId ? 'on' : ''} onClick={() => { setCurrentId(a.id); goFrame(0); setConfirmDelete(false); }}>
              {a.name} <span className="hint">· {a.frames.length}</span>
            </button>
          ))}
          {anims.length === 0 && <span className="hint">Nenhuma animação ainda. Escolha um modelo e crie a primeira.</span>}
        </div>

        <div className="row">
          <label className="field grow">
            <span>Nova animação a partir do sprite-base</span>
            <select id="anim-template" value={template} onChange={(e) => setTemplate(e.target.value as AnimTemplate | 'blank')}>
              {(Object.keys(TEMPLATE_INFO) as AnimTemplate[]).map((t) => <option key={t} value={t}>{TEMPLATE_INFO[t].label}</option>)}
              <option value="blank">Em branco (1 quadro, cópia do base)</option>
            </select>
          </label>
          <button onClick={addAnimation}>Criar</button>
        </div>
        {template !== 'blank' && <p className="hint">{TEMPLATE_INFO[template].hint} Os quadros são cópias: depois de mudar o sprite-base, crie a animação de novo.</p>}
      </section>

      {cur && (
        <>
          <section className="panel">
            <div className="anim-top">
              <div className="anim-preview">
                <AnimPreview frames={cur.frames} fps={cur.fps} loop={cur.loop} playing={playing} />
                <button onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pausar' : '▶ Tocar'}</button>
              </div>
              <div className="anim-settings">
                <label className="field">
                  <span>Nome (vira o nome da animação na engine)</span>
                  <input id="anim-name" type="text" value={cur.name} onChange={(e) => update((a) => ({ ...a, name: e.target.value }))} />
                </label>
                <div className="row">
                  <label className="field">
                    <span>FPS</span>
                    <input id="anim-fps" type="number" min={1} max={30} value={cur.fps} onChange={(e) => update((a) => ({ ...a, fps: Math.max(1, Math.min(30, +e.target.value || 1)) }))} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={cur.loop} onChange={(e) => update((a) => ({ ...a, loop: e.target.checked }))} /> Repetir (loop)
                  </label>
                </div>
                {confirmDelete ? (
                  <div className="row">
                    <span className="error">Excluir “{cur.name}”?</span>
                    <button
                      className="danger"
                      onClick={() => {
                        setAnims((as) => as.filter((a) => a.id !== cur.id));
                        setCurrentId(anims.find((a) => a.id !== cur.id)?.id ?? null);
                        setConfirmDelete(false);
                        setDirty(true);
                      }}
                    >
                      Excluir
                    </button>
                    <button onClick={() => setConfirmDelete(false)}>Cancelar</button>
                  </div>
                ) : (
                  <div className="row"><button onClick={() => setConfirmDelete(true)}>Excluir animação</button></div>
                )}
              </div>
            </div>

            <div className="frames">
              {cur.frames.map((fr, i) => (
                <button key={i} className={`frame ${i === f ? 'sel' : ''}`} onClick={() => goFrame(i)} title={`Quadro ${i + 1}`}>
                  <PixelCanvas image={fr} displaySize={48} />
                  <span className="hint">{i + 1}</span>
                </button>
              ))}
            </div>
            <div className="row tight">
              <button onClick={() => { update((a) => ({ ...a, frames: [...a.frames.slice(0, f + 1), cloneImage(a.frames[f]), ...a.frames.slice(f + 1)] })); goFrame(f + 1); }}>Duplicar quadro</button>
              <button onClick={() => { update((a) => ({ ...a, frames: [...a.frames.slice(0, f + 1), cloneImage(base), ...a.frames.slice(f + 1)] })); goFrame(f + 1); }}>+ Quadro do base</button>
              <button disabled={f === 0} onClick={() => { update((a) => { const fr = [...a.frames]; [fr[f - 1], fr[f]] = [fr[f], fr[f - 1]]; return { ...a, frames: fr }; }); goFrame(f - 1); }}>◀ Mover</button>
              <button disabled={f >= cur.frames.length - 1} onClick={() => { update((a) => { const fr = [...a.frames]; [fr[f + 1], fr[f]] = [fr[f], fr[f + 1]]; return { ...a, frames: fr }; }); goFrame(f + 1); }}>Mover ▶</button>
              <button disabled={cur.frames.length < 2} onClick={() => { update((a) => ({ ...a, frames: a.frames.filter((_, i) => i !== f) })); goFrame(Math.max(0, f - 1)); }}>Excluir quadro</button>
            </div>
            {badFrames > 0 && <p className="error">{badFrames} quadro(s) com cor fora da paleta ou semitransparência.</p>}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Quadro {f + 1} de {cur.frames.length}</h2>
              <label className="check">
                <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} /> Onion skin (quadro anterior)
              </label>
            </header>
            <PixelEditor
              image={cur.frames[f]}
              setImage={(img) => update((a) => ({ ...a, frames: a.frames.map((x, i) => (i === f ? img : x)) }))}
              palette={palette}
              docKey={docKey}
              onion={onionFrame}
            />
          </section>
        </>
      )}
    </main>
  );
}

function AnimPreview({ frames, fps, loop, playing }: { frames: PixelImage[]; fps: number; loop: boolean; playing: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const t = setInterval(() => {
      setI((n) => {
        if (n + 1 < frames.length) return n + 1;
        return loop ? 0 : n; // sem loop: para no último quadro
      });
    }, 1000 / fps);
    return () => clearInterval(t);
  }, [playing, fps, loop, frames.length]);
  // sem loop: recomeça depois de uma pausa curta, para dar para ver de novo
  useEffect(() => {
    if (loop || !playing || i !== frames.length - 1) return;
    const t = setTimeout(() => setI(0), 700);
    return () => clearTimeout(t);
  }, [i, loop, playing, frames.length]);
  const frame = frames[Math.min(i, frames.length - 1)];
  return frame ? <PixelCanvas image={frame} displaySize={160} /> : null;
}
