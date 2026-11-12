/**
 * Local IndexedDB Audio Storage
 * Allows storing MP3 audio files of any size reliably in the browser,
 * bypassing Firestore's 1MB document size limit and network latency.
 */

const DB_NAME = 'feeder_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_files';

interface AudioRecord {
  key: string; // e.g. `${scheduleId}_${slot}`
  scheduleId: string;
  slot: string; // 'pre_open' | 'gate_open' | 'closing' | 'default'
  dataUrl: string;
  updatedAt: string;
}

let persistenceRequested = false;

/**
 * Requests persistent browser storage so TV/kiosk browsers do not evict IndexedDB audio cache.
 */
export async function ensurePersistentAudioStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    const alreadyPersisted = await navigator.storage.persisted?.();
    if (alreadyPersisted) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

function openAudioDb(): Promise<IDBDatabase> {
  if (!persistenceRequested) {
    persistenceRequested = true;
    void ensurePersistentAudioStorage();
  }
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('scheduleId', 'scheduleId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioToIndexedDB(
  scheduleId: string,
  slot: string,
  dataUrl: string,
  updatedAt: string = new Date().toISOString()
): Promise<void> {
  try {
    const db = await openAudioDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: AudioRecord = {
        key: `${scheduleId}_${slot}`,
        scheduleId,
        slot,
        dataUrl,
        updatedAt,
      };
      console.log(`[DEBUG] saveAudioToIndexedDB: Key=${record.key}, UpdatedAt=${record.updatedAt}`);
    const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save audio to IndexedDB:', err);
  }
}

export async function getAudioRecordFromIndexedDB(
  scheduleId: string,
  slot: string
): Promise<AudioRecord | null> {
  try {
    const db = await openAudioDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`${scheduleId}_${slot}`);
      req.onsuccess = () => {
        resolve(req.result || null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAudioFromIndexedDB(
  scheduleId: string,
  slot: string
): Promise<string | null> {
  const record = await getAudioRecordFromIndexedDB(scheduleId, slot);
  return record?.dataUrl || null;
}

export async function deleteAudioFromIndexedDB(
  scheduleIdOrTrainNo: string,
  slot: string
): Promise<void> {
  try {
    const db = await openAudioDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // 1. Direct key deletions
      store.delete(`${scheduleIdOrTrainNo}_${slot}`);
      if (slot === 'closing') {
        store.delete(`${scheduleIdOrTrainNo}_default`);
      }

      // 2. Cursor scan to delete all variations matching this schedule or train number
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
        if (cursor) {
          const val = cursor.value as AudioRecord;
          const isMatchingSchedule =
            val.scheduleId === scheduleIdOrTrainNo ||
            val.key.startsWith(`${scheduleIdOrTrainNo}_`);

          const isMatchingSlot =
            val.slot === slot ||
            (slot === 'closing' && val.slot === 'default');

          if (isMatchingSchedule && isMatchingSlot) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Could not delete audio from IndexedDB:', err);
  }
}

export async function getAllLocalAudioRecords(): Promise<Record<string, Record<string, string>>> {
  try {
    const db = await openAudioDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results: Record<string, Record<string, string>> = {};
        const records = (req.result || []) as AudioRecord[];
        records.forEach((r) => {
          if (!results[r.scheduleId]) {
            results[r.scheduleId] = {};
          }
          results[r.scheduleId][r.slot] = r.dataUrl;
        });
        resolve(results);
      };
      req.onerror = () => resolve({});
    });
  } catch {
    return {};
  }
}

/**
 * Completely clears all audio recordings stored in IndexedDB.
 */
export async function clearAllAudioFromIndexedDB(): Promise<void> {
  try {
    const db = await openAudioDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('Could not clear all audio from IndexedDB:', err);
  }
}

