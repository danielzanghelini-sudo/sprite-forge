import type { Palette } from './types';

export type VersionSource = 'gerado' | 'convertido' | 'editado' | 'importado';

export interface SpriteVersion {
  id: string;
  createdAt: number;
  /** Imagem serializada por encodeImage ("WxH:base64"). */
  image: string;
  source: VersionSource;
}

export interface SpriteAnimation {
  id: string;
  name: string;
  fps: number;
  loop: boolean;
  /** Quadros serializados por encodeImage, todos do tamanho do sprite. */
  frames: string[];
}

export interface SpriteRecord {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  versions: SpriteVersion[]; // a última é a atual
  animations?: SpriteAnimation[];
}

export interface Project {
  id: string;
  name: string;
  palette: Palette;
  locked: boolean;
  gridW: number;
  gridH: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectBackup {
  format: 'sprite-forge-project';
  version: 1;
  exportedAt: string;
  project: Project;
  sprites: SpriteRecord[];
}

export const MAX_VERSIONS = 50;

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function currentVersion(s: SpriteRecord): SpriteVersion {
  return s.versions[s.versions.length - 1];
}

/**
 * Acrescenta uma versão. Não duplica se a imagem for igual à atual e mantém só as
 * MAX_VERSIONS mais recentes (a primeira versão é preservada como origem).
 */
export function addVersion(s: SpriteRecord, image: string, source: VersionSource, now = Date.now()): SpriteRecord {
  const last = s.versions[s.versions.length - 1];
  if (last && last.image === image) return s;
  let versions = [...s.versions, { id: newId(), createdAt: now, image, source }];
  if (versions.length > MAX_VERSIONS) versions = [versions[0], ...versions.slice(versions.length - MAX_VERSIONS + 1)];
  return { ...s, versions, updatedAt: now };
}

export function createSprite(projectId: string, name: string, image: string, source: VersionSource, now = Date.now()): SpriteRecord {
  return {
    id: newId(),
    projectId,
    name: name.trim() || 'Sprite sem nome',
    createdAt: now,
    updatedAt: now,
    versions: [{ id: newId(), createdAt: now, image, source }],
  };
}

/** Valida um arquivo de backup e devolve cópias com ids novos (evita colisão ao importar duas vezes). */
export function parseBackup(text: string): ProjectBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  const b = data as ProjectBackup;
  if (!b || b.format !== 'sprite-forge-project' || !b.project || !Array.isArray(b.sprites))
    throw new Error('Este arquivo não é um backup de projeto do Sprite Forge.');
  const ok = (s: SpriteRecord) =>
    typeof s.name === 'string' && Array.isArray(s.versions) && s.versions.length > 0 &&
    s.versions.every((v) => typeof v.image === 'string' && /^\d+x\d+:/.test(v.image)) &&
    (s.animations === undefined ||
      (Array.isArray(s.animations) &&
        s.animations.every((a) => typeof a.name === 'string' && Array.isArray(a.frames) && a.frames.every((f) => /^\d+x\d+:/.test(f)))));
  if (!b.sprites.every(ok)) throw new Error('O backup tem sprites corrompidos.');
  const projectId = newId();
  const now = Date.now();
  return {
    ...b,
    project: { ...b.project, id: projectId, name: `${b.project.name} (importado)`, updatedAt: now },
    sprites: b.sprites.map((s) => ({ ...s, id: newId(), projectId })),
  };
}
