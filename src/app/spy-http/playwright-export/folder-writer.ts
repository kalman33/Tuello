/**
 * Écriture de l'export Playwright directement dans le dépôt de l'application, via l'API
 * File System Access de Chrome, au lieu d'un zip à décompresser.
 *
 * Le dossier choisi est mémorisé (IndexedDB) : les exports suivants y écrivent sans
 * redemander, Chrome demandant seulement de reconfirmer l'accès à chaque session.
 */
import { ZipEntry } from '../../core/utils/zip';

/** Fichiers que le développeur adapte à son projet : jamais écrasés s'ils existent déjà */
const USER_OWNED_FILES = ['package.json', 'playwright.config.ts', 'README.md', 'gitlab-ci.exemple.yml', '.gitignore'];

const DB_NAME = 'tuello-playwright';
const STORE_NAME = 'handles';
const FOLDER_KEY = 'repository';

export interface FolderWriteResult {
  folderName: string;
  written: string[];
  /** Fichiers existants laissés intacts (configuration du développeur) */
  kept: string[];
}

interface PermissionAwareHandle extends FileSystemDirectoryHandle {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>;
}

type DirectoryPicker = (options: { id?: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;

export function isFolderWriteSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker === 'function';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(FOLDER_KEY);
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(handle, FOLDER_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    });
  } catch {
    // Sans mémorisation, le dossier sera simplement redemandé au prochain export
  }
}

/** Nom du dossier mémorisé, pour l'afficher avant l'export */
export async function savedFolderName(): Promise<string | null> {
  return (await readHandle())?.name ?? null;
}

/**
 * Dossier où écrire : celui mémorisé si l'accès est (re)confirmé, sinon un nouveau choix.
 * Doit être appelé depuis un clic de l'utilisateur (exigence de Chrome).
 */
export async function resolveFolder(forceNew = false): Promise<FileSystemDirectoryHandle> {
  if (!forceNew) {
    const saved = (await readHandle()) as PermissionAwareHandle | null;
    if (saved) {
      const permission = (await saved.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'granted' : await saved.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        return saved;
      }
    }
  }
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker;
  const handle = await picker({ id: 'tuello-playwright', mode: 'readwrite' });
  await saveHandle(handle);
  return handle;
}

async function exists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Écrit les fichiers de l'export. Le dossier choisi peut être la racine du dépôt (les
 * fichiers vont dans son sous-dossier e2e/) ou directement le dossier e2e/.
 */
export async function writeToFolder(root: FileSystemDirectoryHandle, files: ZipEntry[]): Promise<FolderWriteResult> {
  const pickedE2e = root.name === 'e2e';
  const result: FolderWriteResult = { folderName: root.name, written: [], kept: [] };

  for (const file of files) {
    const path = pickedE2e ? file.path.replace(/^e2e\//, '') : file.path;
    const segments = path.split('/');
    const fileName = segments.pop();
    let directory = root;
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    const isUserOwned = segments.length <= (pickedE2e ? 0 : 1) && USER_OWNED_FILES.includes(fileName);
    if (isUserOwned && (await exists(directory, fileName))) {
      result.kept.push(path);
      continue;
    }
    const writable = await (await directory.getFileHandle(fileName, { create: true })).createWritable();
    await writable.write(file.content);
    await writable.close();
    result.written.push(path);
  }
  return result;
}
