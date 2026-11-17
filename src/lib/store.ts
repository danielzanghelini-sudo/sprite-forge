import type { Project, SpriteRecord } from '../core/project';

/**
 * Armazenamento local em IndexedDB (cabe muito mais que o localStorage).
 * Se o navegador bloquear o IndexedDB (ex.: janela privada), usa memória e avisa.
 */
const DB_NAME = 'sprite-forge';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
const memory = { projects: new Map<string, Project>(), sprites: new Map<string, SpriteRecord>() };
export let persistent = true;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('sem IndexedDB'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sprites')) {
          const s = db.createObjectStore('sprites', { keyPath: 'id' });
          s.createIndex('projectId', 'projectId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      persistent = false;
    });
  }
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(name: 'projects' | 'sprites', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb();
    return await wrap(fn(db.transaction(name, mode).objectStore(name)));
  } catch {
    persistent = false;
    return null;
  }
}

export async function listProjects(): Promise<Project[]> {
  const r = await withStore('projects', 'readonly', (s) => s.getAll() as IDBRequest<Project[]>);
  const list = r ?? [...memory.projects.values()];
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(p: Project): Promise<void> {
  memory.projects.set(p.id, p);
  await withStore('projects', 'readwrite', (s) => s.put(p));
}

export async function listSprites(projectId: string): Promise<SpriteRecord[]> {
  const r = await withStore('sprites', 'readonly', (s) => s.index('projectId').getAll(projectId) as IDBRequest<SpriteRecord[]>);
  const list = r ?? [...memory.sprites.values()].filter((x) => x.projectId === projectId);
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getSprite(id: string): Promise<SpriteRecord | null> {
  const r = await withStore('sprites', 'readonly', (s) => s.get(id) as IDBRequest<SpriteRecord | undefined>);
  return r ?? memory.sprites.get(id) ?? null;
}

export async function saveSprite(s: SpriteRecord): Promise<void> {
  memory.sprites.set(s.id, s);
  await withStore('sprites', 'readwrite', (st) => st.put(s));
}

export async function deleteSprite(id: string): Promise<void> {
  memory.sprites.delete(id);
  await withStore('sprites', 'readwrite', (s) => s.delete(id));
}

export async function deleteProject(id: string): Promise<void> {
  for (const s of await listSprites(id)) await deleteSprite(s.id);
  memory.projects.delete(id);
  await withStore('projects', 'readwrite', (s) => s.delete(id));
}
