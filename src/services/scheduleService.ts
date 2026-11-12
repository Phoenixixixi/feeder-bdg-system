import { FeederSchedule, INITIAL_SCHEDULES, addMinutesToTime, calculateDurationMinutes, CustomAudioAlert } from '../data/scheduleData';
import {
  saveAudioToIndexedDB,
  getAudioFromIndexedDB,
  getAudioRecordFromIndexedDB,
  deleteAudioFromIndexedDB,
  getAllLocalAudioRecords,
  clearAllAudioFromIndexedDB,
} from './audioStorage';

export type AudioSlot = 'pre_open' | 'gate_open' | 'closing' | 'default';
export type AudioLanguage = 'id' | 'en';

export interface AppSettings {
  gateAnimationEnabled: boolean;
  universalPreOpenUrl?: string;
  universalPreOpenFileName?: string;
  universalPreOpenEnUrl?: string;
  universalPreOpenEnFileName?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// In-memory schedules cache for instant UI updates and zero-latency playback
let inMemorySchedules: FeederSchedule[] = INITIAL_SCHEDULES.map((s) => ({ ...s }));
const subscribers = new Set<(schedules: FeederSchedule[]) => void>();

// In-memory app settings cache
let inMemorySettings: AppSettings = {
  gateAnimationEnabled: false,
  universalPreOpenUrl: '',
  universalPreOpenFileName: undefined,
  universalPreOpenEnUrl: '',
  universalPreOpenEnFileName: undefined,
};
const settingsSubscribers = new Set<(settings: AppSettings) => void>();

export function notifySubscribers() {
  const snapshot = inMemorySchedules.map((s) => ({ ...s }));
  subscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.warn('Listener error:', err);
    }
  });
}

function notifySettingsSubscribers() {
  const snapshot: AppSettings = { ...inMemorySettings };
  settingsSubscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch (err) {
      console.warn('Settings listener error:', err);
    }
  });
}

/**
 * Uploads audio to MongoDB Atlas via /api/audio with real byte-level progress reporting.
 */
async function uploadAudioToMongo(
  body: {
    key: string;
    scheduleId?: string;
    slot?: string;
    lang?: string;
    fileName?: string;
    dataUrl: string;
    aliasFor?: string | null;
  },
  onProgress?: (percent: number, stepText: string) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/audio');
    xhr.setRequestHeader('Content-Type', 'application/json');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const uploadPercent = Math.min(85, Math.round(30 + (event.loaded / event.total) * 55));
        onProgress(uploadPercent, `Mengunggah ke MongoDB Atlas Cloud (${Math.round((event.loaded / event.total) * 100)}%)...`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({ success: true });
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Koneksi jaringan terputus saat mengunggah ke MongoDB'));
    xhr.send(JSON.stringify(body));
  });
}

/**
 * Saves audio to cloud database (MongoDB Atlas).
 * Retained for backwards compatibility with any callers expecting this method.
 */
export async function saveAudioToFirestoreChunks(
  audioKey: string,
  dataUrl: string,
  meta: {
    scheduleId: string;
    whooshTrainNo: string;
    slot: string;
    lang: AudioLanguage;
    fileName?: string;
  },
  onProgress?: (percent: number, stepText: string) => void
): Promise<void> {
  onProgress?.(30, 'Mengunggah audio ke MongoDB Atlas...');
  await uploadAudioToMongo(
    {
      key: audioKey,
      scheduleId: meta.scheduleId,
      slot: meta.slot,
      lang: meta.lang,
      fileName: meta.fileName || '',
      dataUrl,
    },
    onProgress
  );
  onProgress?.(90, 'Audio tersimpan di MongoDB Atlas Cloud.');
}

/**
 * Fetches audio dataUrl from MongoDB Atlas cloud.
 */
export async function fetchAudioFromFirestoreChunks(audioKey: string): Promise<{ dataUrl: string; updatedAt: string } | null> {
  try {
    const res = await fetch(`/api/audio/${encodeURIComponent(audioKey)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return { dataUrl: data.dataUrl || '', updatedAt: data.updatedAt || new Date().toISOString() };
  } catch (err) {
    console.warn(`Could not fetch audio ${audioKey} from MongoDB:`, err);
    return null;
  }
}

/**
 * Deletes audio from MongoDB Atlas cloud.
 */
export async function deleteAudioFromFirestoreChunks(audioKey: string): Promise<void> {
  try {
    await fetch(`/api/audio/${encodeURIComponent(audioKey)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn(`Could not delete audio ${audioKey} from MongoDB:`, err);
  }
}

/**
 * Applies resolved audio data URL into in-memory schedule and notifies subscribers.
 */
function applyAudioUrlToSchedule(
  schedule: FeederSchedule,
  slot: string,
  url: string,
  lang: AudioLanguage = 'id'
) {
  const normSlot = slot.replace(/^slot_/, '');
  if (lang === 'en') {
    if (normSlot === 'pre_open') schedule.audioPreOpenEnUrl = url;
    else if (normSlot === 'gate_open') schedule.audioGateOpenEnUrl = url;
    else if (normSlot === 'closing') {
      schedule.audioClosingEnUrl = url;
      schedule.audioEnUrl = url;
    } else {
      schedule.audioEnUrl = url;
    }
  } else {
    if (normSlot === 'pre_open') schedule.audioPreOpenUrl = url;
    else if (normSlot === 'gate_open') schedule.audioGateOpenUrl = url;
    else if (normSlot === 'closing') {
      schedule.audioClosingUrl = url;
      schedule.audioUrl = url;
    } else {
      schedule.audioUrl = url;
    }
  }

  if (normSlot.startsWith('custom_') || schedule.customAudioAlerts) {
    const alertId = normSlot.replace(/^custom_/, '');
    const found = (schedule.customAudioAlerts || []).find((a) => a.id === alertId || `custom_${a.id}` === normSlot);
    if (found) {
      if (lang === 'en') found.audioEnUrl = url;
      else found.audioUrl = url;
    }
  }

  const idx = inMemorySchedules.findIndex((s) => s.id === schedule.id);
  if (idx !== -1) {
    inMemorySchedules[idx] = { ...schedule };
  }
}

let isSyncingAudios = false;
let hasFetchedSchedulesFromDb = false;

/**
 * Synchronizes missing audio files from MongoDB Atlas into local IndexedDB and in-memory schedules.
 * Guarantees that when TV screen opens, all uploaded MP3 files stream and play immediately.
 */
export async function syncMissingAudiosFromFirestore(schedules: FeederSchedule[]): Promise<boolean> {
  if (isSyncingAudios) return false;
  isSyncingAudios = true;

  let anyUpdated = false;
  try {
    let remoteMetaMap: Map<string, string> | null = null;
    try {
      const metaRes = await fetch('/api/audio');
      if (metaRes.ok) {
        const metaList = await metaRes.json();
        if (Array.isArray(metaList)) {
          remoteMetaMap = new Map<string, string>();
          for (const m of metaList) {
            if (m?.key) remoteMetaMap.set(m.key, m.updatedAt || '');
          }
        }
      }
    } catch {
      // Fallback to direct fetches if metadata endpoint fails
    }

    const resolveRemoteKey = (keys: string[]): string | null => {
      if (!remoteMetaMap) return keys[0];
      return keys.find((k) => remoteMetaMap!.has(k)) || null;
    };

    const syncSlot = async (
      s: FeederSchedule,
      cleanNo: string,
      localSlot: string,
      candidateKeys: string[],
      apply: (url: string) => void
    ) => {
      const targetKey = resolveRemoteKey(candidateKeys);
      if (!targetKey) return;

      const cached = await getAudioRecordFromIndexedDB(s.id, localSlot);
      const remoteUpdatedAt = remoteMetaMap?.get(targetKey);
      if (cached && remoteMetaMap && (!remoteUpdatedAt || new Date(remoteUpdatedAt) <= new Date(cached.updatedAt))) {
        apply(cached.dataUrl);
        return;
      }

      let cloud = await fetchAudioFromFirestoreChunks(targetKey);
      if (!cloud && !remoteMetaMap) {
        for (const fallbackKey of candidateKeys.slice(1)) {
          cloud = await fetchAudioFromFirestoreChunks(fallbackKey);
          if (cloud) break;
        }
      }

      if (cloud && cloud.dataUrl && (!cached || new Date(cloud.updatedAt) > new Date(cached.updatedAt))) {
        await saveAudioToIndexedDB(s.id, localSlot, cloud.dataUrl, cloud.updatedAt);
        await saveAudioToIndexedDB(cleanNo, localSlot, cloud.dataUrl, cloud.updatedAt);
        apply(cloud.dataUrl);
        anyUpdated = true;
      } else if (cached) {
        apply(cached.dataUrl);
      }
    };

    for (const s of schedules) {
      const cleanNo = s.whooshTrainNo.replace(/[^a-zA-Z0-9]/g, '_');

      // Check ID slots
      const idSlots: { slot: AudioSlot; fileName?: string; url?: string }[] = [
        { slot: 'pre_open', fileName: s.audioPreOpenFileName, url: s.audioPreOpenUrl },
        { slot: 'gate_open', fileName: s.audioGateOpenFileName, url: s.audioGateOpenUrl },
        { slot: 'closing', fileName: s.audioClosingFileName || s.audioFileName, url: s.audioClosingUrl || s.audioUrl },
      ];

      for (const item of idSlots) {
        if (item.fileName && (!item.url || item.url === '')) {
          await syncSlot(
            s,
            cleanNo,
            item.slot,
            [`${s.id}_${item.slot}`, `${cleanNo}_${item.slot}`],
            (url) => applyAudioUrlToSchedule(s, item.slot, url, 'id')
          );
        }
      }

      // Check EN slots
      const enSlots: { slot: AudioSlot; fileName?: string; url?: string }[] = [
        { slot: 'pre_open', fileName: s.audioPreOpenEnFileName, url: s.audioPreOpenEnUrl },
        { slot: 'gate_open', fileName: s.audioGateOpenEnFileName, url: s.audioGateOpenEnUrl },
        { slot: 'closing', fileName: s.audioClosingEnFileName || s.audioEnFileName, url: s.audioClosingEnUrl || s.audioEnUrl },
      ];

      for (const item of enSlots) {
        if (item.fileName && (!item.url || item.url === '')) {
          await syncSlot(
            s,
            cleanNo,
            `${item.slot}_en`,
            [`${s.id}_${item.slot}_en`, `${cleanNo}_${item.slot}_en`],
            (url) => applyAudioUrlToSchedule(s, item.slot, url, 'en')
          );
        }
      }

      // Check custom alerts
      if (s.customAudioAlerts && s.customAudioAlerts.length > 0) {
        for (const ca of s.customAudioAlerts) {
          if (ca.audioFileName && (!ca.audioUrl || ca.audioUrl === '')) {
            const cached = await getAudioRecordFromIndexedDB(s.id, `custom_${ca.id}`);
            const cloud = await fetchAudioFromFirestoreChunks(`${s.id}_custom_${ca.id}`) || 
                          await fetchAudioFromFirestoreChunks(`${cleanNo}_custom_${ca.id}`) ||
                          await fetchAudioFromFirestoreChunks(`global_custom_${ca.id}`);
            
            if (cloud && (!cached || new Date(cloud.updatedAt) > new Date(cached.updatedAt))) {
              await saveAudioToIndexedDB(s.id, `custom_${ca.id}`, cloud.dataUrl, cloud.updatedAt);
              ca.audioUrl = cloud.dataUrl;
              anyUpdated = true;
            } else if (cached) {
              ca.audioUrl = cached.dataUrl;
            }
          }

          if (ca.audioEnFileName && (!ca.audioEnUrl || ca.audioEnUrl === '')) {
            const cached = await getAudioRecordFromIndexedDB(s.id, `custom_${ca.id}_en`);
            const cloud = await fetchAudioFromFirestoreChunks(`${s.id}_custom_${ca.id}_en`) || 
                          await fetchAudioFromFirestoreChunks(`${cleanNo}_custom_${ca.id}_en`) ||
                          await fetchAudioFromFirestoreChunks(`global_custom_${ca.id}_en`);

            if (cloud && (!cached || new Date(cloud.updatedAt) > new Date(cached.updatedAt))) {
              await saveAudioToIndexedDB(s.id, `custom_${ca.id}_en`, cloud.dataUrl, cloud.updatedAt);
              ca.audioEnUrl = cloud.dataUrl;
              anyUpdated = true;
            } else if (cached) {
              ca.audioEnUrl = cached.dataUrl;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error syncing missing audios from MongoDB:', err);
  } finally {
    isSyncingAudios = false;
  }

  if (anyUpdated) {
    notifySubscribers();
  }
  return anyUpdated;
}

/**
 * Strips legacy placeholder mp3 audio attachments.
 */
export function sanitizeScheduleAudio(s: FeederSchedule): FeederSchedule {
  const cleaned: FeederSchedule = { ...s };

  const isLegacyOrAsset = (url?: string, fileName?: string) => {
    return (
      (fileName && (fileName.includes('PRIORITAS') || fileName.includes('FEEDER'))) ||
      (url && (url.includes('PRIORITAS') || url.includes('/assets/aistudio/')))
    );
  };

  if (isLegacyOrAsset(cleaned.audioPreOpenUrl, cleaned.audioPreOpenFileName)) {
    cleaned.audioPreOpenUrl = '';
    cleaned.audioPreOpenFileName = undefined;
  }
  if (isLegacyOrAsset(cleaned.audioGateOpenUrl, cleaned.audioGateOpenFileName)) {
    cleaned.audioGateOpenUrl = '';
    cleaned.audioGateOpenFileName = undefined;
  }
  if (isLegacyOrAsset(cleaned.audioClosingUrl, cleaned.audioClosingFileName)) {
    cleaned.audioClosingUrl = '';
    cleaned.audioClosingFileName = undefined;
  }
  if (isLegacyOrAsset(cleaned.audioUrl, cleaned.audioFileName)) {
    cleaned.audioUrl = '';
    cleaned.audioFileName = undefined;
  }

  if (Array.isArray(cleaned.customAudioAlerts)) {
    cleaned.customAudioAlerts = cleaned.customAudioAlerts.filter((ca) => {
      if (ca.id === 'custom_gate_open_2m') return false;
      if (isLegacyOrAsset(ca.audioUrl, ca.audioFileName)) return false;
      return true;
    });
  }

  return cleaned;
}

/**
 * Merges local IndexedDB custom audios with schedule records.
 */
async function mergeWithLocalAudios(schedules: FeederSchedule[]): Promise<FeederSchedule[]> {
  try {
    const localMap = await getAllLocalAudioRecords();
    return schedules.map((rawS) => {
      const s = sanitizeScheduleAudio(rawS);
      const local = localMap[s.id] || localMap[s.whooshTrainNo];

      const cleanLocal = (val?: string) => {
        if (!val) return '';
        if (val.includes('PRIORITAS') || val.includes('/assets/aistudio/')) return '';
        return val;
      };

      // ID audios
      const preOpen = s.audioPreOpenUrl || cleanLocal(local?.['pre_open']) || '';
      const gateOpen = s.audioGateOpenUrl || cleanLocal(local?.['gate_open']) || '';
      const closing = s.audioClosingUrl || cleanLocal(local?.['closing']) || '';
      const defaultAudio = s.audioUrl || cleanLocal(local?.['default']) || '';

      // EN audios
      const preOpenEn = s.audioPreOpenEnUrl || cleanLocal(local?.['pre_open_en']) || '';
      const gateOpenEn = s.audioGateOpenEnUrl || cleanLocal(local?.['gate_open_en']) || '';
      const closingEn = s.audioClosingEnUrl || cleanLocal(local?.['closing_en']) || '';
      const defaultAudioEn = s.audioEnUrl || cleanLocal(local?.['default_en']) || '';

      // Merge custom audio alerts
      const customAlerts = (s.customAudioAlerts || [])
        .filter((alert) => alert.id !== 'custom_gate_open_2m' && !alert.audioFileName?.includes('PRIORITAS'))
        .map((alert) => {
          const localAlertAudio = cleanLocal(local?.[`custom_${alert.id}`] || local?.[alert.id]);
          const localAlertEnAudio = cleanLocal(local?.[`custom_${alert.id}_en`]);
          const audioUrl = alert.audioUrl || localAlertAudio || undefined;
          const audioEnUrl = alert.audioEnUrl || localAlertEnAudio || undefined;
          return {
            ...alert,
            audioUrl,
            audioEnUrl,
          };
        });

      return {
        ...s,
        audioPreOpenUrl: preOpen,
        audioGateOpenUrl: gateOpen,
        audioClosingUrl: closing,
        audioUrl: defaultAudio,
        audioPreOpenEnUrl: preOpenEn,
        audioGateOpenEnUrl: gateOpenEn,
        audioClosingEnUrl: closingEn,
        audioEnUrl: defaultAudioEn,
        customAudioAlerts: customAlerts,
        audioPreOpenFileName: s.audioPreOpenFileName,
        audioGateOpenFileName: s.audioGateOpenFileName,
        audioClosingFileName: s.audioClosingFileName,
        audioPreOpenEnFileName: s.audioPreOpenEnFileName,
        audioGateOpenEnFileName: s.audioGateOpenEnFileName,
        audioClosingEnFileName: s.audioClosingEnFileName,
      };
    });
  } catch (err) {
    console.warn('Error merging local audios:', err);
    return schedules;
  }
}

/**
 * Loads schedules from MongoDB Atlas.
 */
async function fetchSchedulesFromBackend(): Promise<FeederSchedule[]> {
  const res = await fetch('/api/schedules');
  if (!res.ok) {
    throw new Error(`Failed to fetch schedules: ${res.statusText}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Subscribes to real-time updates of train schedules from MongoDB Atlas with periodic polling.
 */
export function subscribeSchedules(
  onData: (schedules: FeederSchedule[]) => void,
  onError?: (err: Error) => void
): () => void {
  subscribers.add(onData);

  // Push cached DB schedules immediately only if we have already synced from MongoDB
  if (hasFetchedSchedulesFromDb) {
    mergeWithLocalAudios(inMemorySchedules).then((merged) => {
      inMemorySchedules = merged;
      onData(inMemorySchedules);
    });
  }

  let isMounted = true;

  const pullSchedules = async () => {
    try {
      const raw = await fetchSchedulesFromBackend();
      if (!isMounted) return;

      if (raw.length === 0) {
        // Auto-seed if empty
        await seedDefaultSchedules();
        return;
      }

      // Sort by departureTime ascending
      raw.sort((a, b) => (a.departureTime || '').localeCompare(b.departureTime || ''));

      const enriched = await mergeWithLocalAudios(raw);
      hasFetchedSchedulesFromDb = true;
      inMemorySchedules = enriched;
      notifySubscribers();

      // Background audio sync
      syncMissingAudiosFromFirestore(enriched);
    } catch (err: any) {
      if (!isMounted) return;
      console.warn('MongoDB schedules fetch note:', err.message);
      if (onError) onError(err);
    }
  };

  // Initial pull
  pullSchedules();

  // Poll every 5 seconds for smooth cross-device synchronization
  const interval = setInterval(pullSchedules, 5000);

  return () => {
    isMounted = false;
    clearInterval(interval);
    subscribers.delete(onData);
  };
}

/**
 * Seeds all 31 official schedules into MongoDB Atlas and clears local audio caches.
 */
export async function seedDefaultSchedules(): Promise<void> {
  await clearAllAudioFromIndexedDB();

  const res = await fetch('/api/schedules/reset', {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to reset schedules on MongoDB');
  }

  const raw = await fetchSchedulesFromBackend();
  const enriched = await mergeWithLocalAudios(raw);
  inMemorySchedules = enriched;
  notifySubscribers();
}

/**
 * Completely clears all uploaded/attached audio files from all schedules.
 */
export async function clearAllAudiosFromAllSchedules(): Promise<void> {
  await clearAllAudioFromIndexedDB();

  inMemorySchedules = inMemorySchedules.map((s) => ({
    ...s,
    audioUrl: '',
    audioFileName: undefined,
    audioPreOpenUrl: '',
    audioPreOpenFileName: undefined,
    audioGateOpenUrl: '',
    audioGateOpenFileName: undefined,
    audioClosingUrl: '',
    audioClosingFileName: undefined,
    audioEnUrl: '',
    audioEnFileName: undefined,
    audioPreOpenEnUrl: '',
    audioPreOpenEnFileName: undefined,
    audioGateOpenEnUrl: '',
    audioGateOpenEnFileName: undefined,
    audioClosingEnUrl: '',
    audioClosingEnFileName: undefined,
    customAudioAlerts: [],
  }));
  notifySubscribers();

  try {
    await fetch('/api/schedules/clear-audios', { method: 'POST' });
  } catch (err) {
    console.warn('Could not call /api/schedules/clear-audios:', err);
  }
}

/**
 * Adds a new schedule.
 */
export async function createSchedule(
  data: Omit<FeederSchedule, 'id' | 'tripIndex' | 'feederArrivalTime' | 'feederDurationMin'>
): Promise<string> {
  const newId = `schedule_${Date.now()}`;
  const feederArrivalTime = addMinutesToTime(data.departureTime, 18);
  const feederDurationMin = 18;
  const transitDurationMin = calculateDurationMinutes(feederArrivalTime, data.whooshDepartureTime);

  const payload: FeederSchedule = {
    id: newId,
    tripIndex: 999,
    departureTime: data.departureTime,
    feederTrainNo: data.feederTrainNo,
    whooshTrainNo: data.whooshTrainNo,
    origin: data.origin || 'Bandung',
    destination: data.destination || 'Padalarang',
    whooshDestination: data.whooshDestination || 'Halim (Jakarta)',
    feederDurationMin,
    feederArrivalTime,
    whooshDepartureTime: data.whooshDepartureTime,
    transitDurationMin: Math.max(0, transitDurationMin),
    platform: data.platform || 'Jalur 5',
    isActive: data.isActive !== false,
    updatedAt: new Date().toISOString(),
  };

  inMemorySchedules.push(payload);
  notifySubscribers();

  await fetch(`/api/schedules/${newId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return newId;
}

/**
 * Updates an existing schedule in MongoDB Atlas.
 */
export async function updateSchedule(
  id: string,
  updates: Partial<FeederSchedule>
): Promise<void> {
  const computedUpdates: Partial<FeederSchedule> = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  if (updates.departureTime) {
    computedUpdates.feederArrivalTime = addMinutesToTime(updates.departureTime, 18);
    if (updates.whooshDepartureTime) {
      computedUpdates.transitDurationMin = calculateDurationMinutes(
        computedUpdates.feederArrivalTime,
        updates.whooshDepartureTime
      );
    }
  }

  // Update in-memory immediately for zero latency
  const idx = inMemorySchedules.findIndex((s) => s.id === id);
  if (idx !== -1) {
    inMemorySchedules[idx] = {
      ...inMemorySchedules[idx],
      ...computedUpdates,
    };
    notifySubscribers();
  }

  await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(computedUpdates),
  });
}

/**
 * Deletes a schedule.
 */
export async function deleteSchedule(id: string): Promise<void> {
  inMemorySchedules = inMemorySchedules.filter((s) => s.id !== id);
  notifySubscribers();

  await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  const slots: AudioSlot[] = ['pre_open', 'gate_open', 'closing', 'default'];
  for (const slot of slots) {
    try {
      await deleteAudioFromIndexedDB(id, slot);
    } catch {
      // ignore
    }
  }
}

/**
 * Attaches a custom MP3 audio announcement to a schedule for a specific event slot and language (ID/EN).
 * Saves to local IndexedDB for 0ms playback and to MongoDB Atlas Cloud for all devices.
 */
export async function saveScheduleAudio(
  id: string,
  whooshTrainNo: string,
  audioBase64OrDataUrl: string,
  slot: AudioSlot = 'closing',
  durationSec?: number,
  lang: AudioLanguage = 'id',
  onProgress?: (percent: number, stepText: string) => void
): Promise<FeederSchedule | null> {
  const cleanNo = whooshTrainNo.replace(/[^a-zA-Z0-9]/g, '_');
  const now = new Date().toISOString();
  const effectiveSlotKey = lang === 'en' ? `${slot}_en` : slot;
  const fileName =
    lang === 'en'
      ? (slot === 'pre_open' ? `${cleanNo}_2min_sebelum_buka_en.mp3` : slot === 'gate_open' ? `${cleanNo}_gate_in_dibuka_en.mp3` : `${cleanNo}_panggilan_terakhir_en.mp3`)
      : (slot === 'pre_open' ? `${cleanNo}_2min_sebelum_buka.mp3` : slot === 'gate_open' ? `${cleanNo}_gate_in_dibuka.mp3` : `${cleanNo}_panggilan_terakhir.mp3`);

  onProgress?.(15, 'Menyimpan audio ke memori browser lokal...');

  // 1. Save strictly to the targeted slot in local IndexedDB
  await saveAudioToIndexedDB(id, effectiveSlotKey, audioBase64OrDataUrl);
  await saveAudioToIndexedDB(cleanNo, effectiveSlotKey, audioBase64OrDataUrl);

  const updates: Partial<FeederSchedule> = {
    updatedAt: now,
  };

  if (lang === 'en') {
    if (slot === 'pre_open') {
      updates.audioPreOpenEnUrl = audioBase64OrDataUrl;
      updates.audioPreOpenEnFileName = fileName;
    } else if (slot === 'gate_open') {
      updates.audioGateOpenEnUrl = audioBase64OrDataUrl;
      updates.audioGateOpenEnFileName = fileName;
    } else if (slot === 'closing') {
      updates.audioClosingEnUrl = audioBase64OrDataUrl;
      updates.audioClosingEnFileName = fileName;
    } else {
      updates.audioEnUrl = audioBase64OrDataUrl;
      updates.audioEnFileName = fileName;
    }
  } else {
    if (slot === 'pre_open') {
      updates.audioPreOpenUrl = audioBase64OrDataUrl;
      updates.audioPreOpenFileName = fileName;
    } else if (slot === 'gate_open') {
      updates.audioGateOpenUrl = audioBase64OrDataUrl;
      updates.audioGateOpenFileName = fileName;
    } else if (slot === 'closing') {
      updates.audioClosingUrl = audioBase64OrDataUrl;
      updates.audioClosingFileName = fileName;
    } else {
      updates.audioUrl = audioBase64OrDataUrl;
      updates.audioFileName = fileName;
    }
  }

  // 2. Optimistically update in-memory cache
  let updatedSchedule: FeederSchedule | null = null;
  const idx = inMemorySchedules.findIndex((s) => s.id === id || s.whooshTrainNo === whooshTrainNo);
  if (idx !== -1) {
    inMemorySchedules[idx] = {
      ...inMemorySchedules[idx],
      ...updates,
    };
    updatedSchedule = inMemorySchedules[idx];
  }
  notifySubscribers();

  onProgress?.(35, 'Mengunggah audio ke MongoDB Atlas Cloud...');

  // 3. Save audio document to MongoDB Atlas
  try {
    await uploadAudioToMongo(
      {
        key: `${id}_${effectiveSlotKey}`,
        scheduleId: id,
        slot: effectiveSlotKey,
        lang,
        fileName,
        dataUrl: audioBase64OrDataUrl,
      },
      onProgress
    );

    if (cleanNo && cleanNo !== id) {
      await uploadAudioToMongo({
        key: `${cleanNo}_${effectiveSlotKey}`,
        scheduleId: id,
        slot: effectiveSlotKey,
        lang,
        fileName,
        dataUrl: '',
        aliasFor: `${id}_${effectiveSlotKey}`,
      });
    }
  } catch (err: any) {
    console.error('Error saving audio to MongoDB Atlas:', err);
  }

  onProgress?.(92, 'Memperbarui dokumen jadwal di MongoDB Atlas...');

  // 4. Update only lightweight metadata in the schedule document (audio payload lives in audio_files)
  try {
    const mongoScheduleUpdates: any = {
      updatedAt: now,
    };

    if (lang === 'en') {
      if (slot === 'pre_open') {
        mongoScheduleUpdates.audioPreOpenEnFileName = fileName;
        mongoScheduleUpdates.audioPreOpenEnUrl = '';
      } else if (slot === 'gate_open') {
        mongoScheduleUpdates.audioGateOpenEnFileName = fileName;
        mongoScheduleUpdates.audioGateOpenEnUrl = '';
      } else if (slot === 'closing') {
        mongoScheduleUpdates.audioClosingEnFileName = fileName;
        mongoScheduleUpdates.audioClosingEnUrl = '';
      } else {
        mongoScheduleUpdates.audioEnFileName = fileName;
        mongoScheduleUpdates.audioEnUrl = '';
      }
    } else {
      if (slot === 'pre_open') {
        mongoScheduleUpdates.audioPreOpenFileName = fileName;
        mongoScheduleUpdates.audioPreOpenUrl = '';
      } else if (slot === 'gate_open') {
        mongoScheduleUpdates.audioGateOpenFileName = fileName;
        mongoScheduleUpdates.audioGateOpenUrl = '';
      } else if (slot === 'closing') {
        mongoScheduleUpdates.audioClosingFileName = fileName;
        mongoScheduleUpdates.audioClosingUrl = '';
      } else {
        mongoScheduleUpdates.audioFileName = fileName;
        mongoScheduleUpdates.audioUrl = '';
      }
    }

    await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mongoScheduleUpdates),
    });
  } catch (err) {
    console.warn('Could not update schedule in MongoDB:', err);
  }

  onProgress?.(100, 'Audio berhasil disimpan ke MongoDB Atlas!');
  return updatedSchedule;
}

/**
 * Removes custom audio announcement from a schedule for a specific event slot and language.
 */
export async function deleteScheduleAudio(
  id: string,
  slot: AudioSlot = 'closing',
  whooshTrainNo?: string,
  lang: AudioLanguage = 'id'
): Promise<FeederSchedule | null> {
  const targetSchedule = inMemorySchedules.find((s) => s.id === id);
  const trainNo = whooshTrainNo || targetSchedule?.whooshTrainNo || '';
  const cleanNo = trainNo.replace(/[^a-zA-Z0-9]/g, '_');
  const effectiveSlotKey = lang === 'en' ? `${slot}_en` : slot;

  // 1. Delete from local IndexedDB
  await deleteAudioFromIndexedDB(id, effectiveSlotKey);
  if (cleanNo) {
    await deleteAudioFromIndexedDB(cleanNo, effectiveSlotKey);
  }
  if (slot === 'closing') {
    const defKey = lang === 'en' ? 'default_en' : 'default';
    await deleteAudioFromIndexedDB(id, defKey);
    if (cleanNo) await deleteAudioFromIndexedDB(cleanNo, defKey);
  }

  const updates: Partial<FeederSchedule> = {
    updatedAt: new Date().toISOString(),
  };

  if (lang === 'en') {
    if (slot === 'pre_open') {
      updates.audioPreOpenEnUrl = '';
      updates.audioPreOpenEnFileName = undefined;
    } else if (slot === 'gate_open') {
      updates.audioGateOpenEnUrl = '';
      updates.audioGateOpenEnFileName = undefined;
    } else if (slot === 'closing') {
      updates.audioClosingEnUrl = '';
      updates.audioClosingEnFileName = undefined;
      updates.audioEnUrl = '';
      updates.audioEnFileName = undefined;
    } else {
      updates.audioEnUrl = '';
      updates.audioEnFileName = undefined;
    }
  } else {
    if (slot === 'pre_open') {
      updates.audioPreOpenUrl = '';
      updates.audioPreOpenFileName = undefined;
    } else if (slot === 'gate_open') {
      updates.audioGateOpenUrl = '';
      updates.audioGateOpenFileName = undefined;
    } else if (slot === 'closing') {
      updates.audioClosingUrl = '';
      updates.audioClosingFileName = undefined;
      updates.audioUrl = '';
      updates.audioFileName = undefined;
    } else {
      updates.audioUrl = '';
      updates.audioFileName = undefined;
    }
  }

  // 2. Update in-memory immediately
  let updatedSchedule: FeederSchedule | null = null;
  const idx = inMemorySchedules.findIndex((s) => s.id === id || (cleanNo && s.whooshTrainNo === trainNo));
  if (idx !== -1) {
    inMemorySchedules[idx] = {
      ...inMemorySchedules[idx],
      ...updates,
    };
    updatedSchedule = inMemorySchedules[idx];
  }
  notifySubscribers();

  // 3. Delete from MongoDB Atlas
  try {
    await deleteAudioFromFirestoreChunks(`${id}_${effectiveSlotKey}`);
    if (cleanNo) {
      await deleteAudioFromFirestoreChunks(`${cleanNo}_${effectiveSlotKey}`);
    }
  } catch (audioErr) {
    console.warn('Error deleting from MongoDB:', audioErr);
  }

  // 4. Update schedule in MongoDB
  try {
    const mongoUpdates: any = {
      updatedAt: new Date().toISOString(),
    };
    if (lang === 'en') {
      if (slot === 'pre_open') {
        mongoUpdates.audioPreOpenEnUrl = '';
        mongoUpdates.audioPreOpenEnFileName = '';
      } else if (slot === 'gate_open') {
        mongoUpdates.audioGateOpenEnUrl = '';
        mongoUpdates.audioGateOpenEnFileName = '';
      } else if (slot === 'closing') {
        mongoUpdates.audioClosingEnUrl = '';
        mongoUpdates.audioClosingEnFileName = '';
        mongoUpdates.audioEnUrl = '';
        mongoUpdates.audioEnFileName = '';
      } else {
        mongoUpdates.audioEnUrl = '';
        mongoUpdates.audioEnFileName = '';
      }
    } else {
      if (slot === 'pre_open') {
        mongoUpdates.audioPreOpenUrl = '';
        mongoUpdates.audioPreOpenFileName = '';
      } else if (slot === 'gate_open') {
        mongoUpdates.audioGateOpenUrl = '';
        mongoUpdates.audioGateOpenFileName = '';
      } else if (slot === 'closing') {
        mongoUpdates.audioClosingUrl = '';
        mongoUpdates.audioClosingFileName = '';
        mongoUpdates.audioUrl = '';
        mongoUpdates.audioFileName = '';
      } else {
        mongoUpdates.audioUrl = '';
        mongoUpdates.audioFileName = '';
      }
    }
    await fetch(`/api/schedules/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mongoUpdates),
    });
  } catch (err) {
    console.warn('MongoDB deleteScheduleAudio warning:', err);
  }

  return updatedSchedule;
}

/**
 * Loads audio URL from memory, local storage, or MongoDB Atlas cloud.
 */
export async function getOrFetchAudioUrl(
  schedule: FeederSchedule,
  slot: AudioSlot | string,
  lang: AudioLanguage = 'id'
): Promise<string | null> {
  const normSlot = slot.replace(/^slot_/, '');
  const effectiveSlotKey = lang === 'en' ? `${normSlot}_en` : normSlot;

  // 1. Check in-memory schedule first
  if (lang === 'en') {
    if (normSlot === 'pre_open' && schedule.audioPreOpenEnUrl) return schedule.audioPreOpenEnUrl;
    if (normSlot === 'gate_open' && schedule.audioGateOpenEnUrl) return schedule.audioGateOpenEnUrl;
    if (normSlot === 'closing' && (schedule.audioClosingEnUrl || schedule.audioEnUrl)) {
      return schedule.audioClosingEnUrl || schedule.audioEnUrl || null;
    }
    if (normSlot === 'default' && schedule.audioEnUrl) return schedule.audioEnUrl;
  } else {
    if (normSlot === 'pre_open' && schedule.audioPreOpenUrl) return schedule.audioPreOpenUrl;
    if (normSlot === 'gate_open' && schedule.audioGateOpenUrl) return schedule.audioGateOpenUrl;
    if (normSlot === 'closing' && (schedule.audioClosingUrl || schedule.audioUrl)) {
      return schedule.audioClosingUrl || schedule.audioUrl || null;
    }
    if (normSlot === 'default' && schedule.audioUrl) return schedule.audioUrl;
  }

  // Check custom alerts in memory
  if (normSlot.startsWith('custom_') || schedule.customAudioAlerts) {
    const alertId = normSlot.replace(/^custom_/, '');
    const found = (schedule.customAudioAlerts || []).find((a) => a.id === alertId || `custom_${a.id}` === normSlot);
    if (found) {
      const customUrl = lang === 'en' ? found.audioEnUrl : found.audioUrl;
      if (customUrl) return customUrl;
    }
  }

  const cleanNo = schedule.whooshTrainNo.replace(/[^a-zA-Z0-9]/g, '_');

  // 2. Check local IndexedDB
  const local =
    (await getAudioFromIndexedDB(schedule.id, effectiveSlotKey)) ||
    (await getAudioFromIndexedDB(cleanNo, effectiveSlotKey));
  if (local) {
    applyAudioUrlToSchedule(schedule, normSlot, local, lang);
    return local;
  }

  // 3. Fetch from MongoDB Atlas Cloud
  try {
    const fetched =
      (await fetchAudioFromFirestoreChunks(`${schedule.id}_${effectiveSlotKey}`)) ||
      (await fetchAudioFromFirestoreChunks(`${cleanNo}_${effectiveSlotKey}`)) ||
      (await fetchAudioFromFirestoreChunks(`global_${effectiveSlotKey}`));
    if (fetched && fetched.dataUrl) {
      await saveAudioToIndexedDB(schedule.id, effectiveSlotKey, fetched.dataUrl, fetched.updatedAt);
      await saveAudioToIndexedDB(cleanNo, effectiveSlotKey, fetched.dataUrl, fetched.updatedAt);
      applyAudioUrlToSchedule(schedule, normSlot, fetched.dataUrl, lang);
      notifySubscribers();
      return fetched.dataUrl;
    }
  } catch (err) {
    console.warn('Could not fetch audio from MongoDB:', err);
  }

  return null;
}

/**
 * Saves or updates a custom MP3 audio alert configuration for a specific schedule.
 */
export async function saveScheduleCustomAudioAlert(
  scheduleId: string,
  alert: CustomAudioAlert,
  whooshTrainNo?: string,
  lang: AudioLanguage = 'id',
  onProgress?: (percent: number, stepText: string) => void
): Promise<FeederSchedule | null> {
  const targetSchedule = inMemorySchedules.find((s) => s.id === scheduleId);
  const trainNo = whooshTrainNo || targetSchedule?.whooshTrainNo || '';
  const cleanNo = trainNo.replace(/[^a-zA-Z0-9]/g, '_');
  const now = new Date().toISOString();

  onProgress?.(10, 'Menyimpan audio ke memori browser lokal...');

  // 1. Save audio to IndexedDB and MongoDB Atlas
  if (alert.audioUrl) {
    await saveAudioToIndexedDB(scheduleId, `custom_${alert.id}`, alert.audioUrl);
    if (cleanNo) {
      await saveAudioToIndexedDB(cleanNo, `custom_${alert.id}`, alert.audioUrl);
    }
    await uploadAudioToMongo(
      {
        key: `${scheduleId}_custom_${alert.id}`,
        scheduleId,
        slot: `custom_${alert.id}`,
        lang: 'id',
        fileName: alert.audioFileName,
        dataUrl: alert.audioUrl,
      },
      onProgress
    );
  }
  if (alert.audioEnUrl) {
    await saveAudioToIndexedDB(scheduleId, `custom_${alert.id}_en`, alert.audioEnUrl);
    if (cleanNo) {
      await saveAudioToIndexedDB(cleanNo, `custom_${alert.id}_en`, alert.audioEnUrl);
    }
    await uploadAudioToMongo(
      {
        key: `${scheduleId}_custom_${alert.id}_en`,
        scheduleId,
        slot: `custom_${alert.id}_en`,
        lang: 'en',
        fileName: alert.audioEnFileName,
        dataUrl: alert.audioEnUrl,
      },
      onProgress
    );
  }

  onProgress?.(92, 'Memperbarui pemicu audio jadwal kereta...');

  // 2. Prepare updated custom alerts array
  const currentAlerts = targetSchedule?.customAudioAlerts ? [...targetSchedule.customAudioAlerts] : [];
  const existingIdx = currentAlerts.findIndex((a) => a.id === alert.id);

  const newAlertRecord: CustomAudioAlert = {
    ...alert,
    enabled: alert.enabled !== false,
    createdAt: alert.createdAt || now,
  };

  if (existingIdx >= 0) {
    currentAlerts[existingIdx] = newAlertRecord;
  } else {
    currentAlerts.push(newAlertRecord);
  }

  // 3. Update in-memory schedule immediately
  let updatedSchedule: FeederSchedule | null = null;
  const idx = inMemorySchedules.findIndex((s) => s.id === scheduleId);
  if (idx !== -1) {
    inMemorySchedules[idx] = {
      ...inMemorySchedules[idx],
      customAudioAlerts: currentAlerts,
      updatedAt: now,
    };
    updatedSchedule = inMemorySchedules[idx];
  }
  notifySubscribers();

  // 4. Update schedules document in MongoDB Atlas (strip bulky base64 URLs; audio lives in audio_files)
  try {
    const lightweightAlerts = currentAlerts.map(({ audioUrl: _a, audioEnUrl: _b, ...rest }) => ({
      ...rest,
      audioUrl: '',
      audioEnUrl: '',
    }));
    await fetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customAudioAlerts: lightweightAlerts,
        updatedAt: now,
      }),
    });
  } catch (err) {
    console.warn('MongoDB saveScheduleCustomAudioAlert warning:', err);
  }

  onProgress?.(100, 'Audio kustom berhasil disimpan!');
  return updatedSchedule;
}

/**
 * Deletes a custom audio alert from a schedule.
 */
export async function deleteScheduleCustomAudioAlert(
  scheduleId: string,
  alertId: string,
  whooshTrainNo?: string
): Promise<FeederSchedule | null> {
  const targetSchedule = inMemorySchedules.find((s) => s.id === scheduleId);
  const trainNo = whooshTrainNo || targetSchedule?.whooshTrainNo || '';
  const cleanNo = trainNo.replace(/[^a-zA-Z0-9]/g, '_');
  const now = new Date().toISOString();

  // 1. Delete from IndexedDB
  await deleteAudioFromIndexedDB(scheduleId, `custom_${alertId}`);
  await deleteAudioFromIndexedDB(scheduleId, `custom_${alertId}_en`);
  if (cleanNo) {
    await deleteAudioFromIndexedDB(cleanNo, `custom_${alertId}`);
    await deleteAudioFromIndexedDB(cleanNo, `custom_${alertId}_en`);
  }

  // 2. Remove from customAudioAlerts array
  const currentAlerts = (targetSchedule?.customAudioAlerts || []).filter((a) => a.id !== alertId);

  // 3. Update in-memory
  let updatedSchedule: FeederSchedule | null = null;
  const idx = inMemorySchedules.findIndex((s) => s.id === scheduleId);
  if (idx !== -1) {
    inMemorySchedules[idx] = {
      ...inMemorySchedules[idx],
      customAudioAlerts: currentAlerts,
      updatedAt: now,
    };
    updatedSchedule = inMemorySchedules[idx];
  }
  notifySubscribers();

  // 4. Delete from MongoDB Atlas
  try {
    await deleteAudioFromFirestoreChunks(`${scheduleId}_custom_${alertId}`);
    await deleteAudioFromFirestoreChunks(`${scheduleId}_custom_${alertId}_en`);
  } catch (e) {
    console.warn('MongoDB delete audio error:', e);
  }

  // 5. Update schedules document in MongoDB
  try {
    await fetch(`/api/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customAudioAlerts: currentAlerts,
        updatedAt: now,
      }),
    });
  } catch (err) {
    console.warn('MongoDB deleteScheduleCustomAudioAlert error:', err);
  }

  return updatedSchedule;
}

/**
 * Applies a custom MP3 audio alert template to ALL schedules.
 */
export async function applyCustomAlertToAllSchedules(
  alertTemplate: Omit<CustomAudioAlert, 'id'>,
  audioDataUrl: string,
  lang: AudioLanguage = 'id',
  onProgress?: (percent: number, stepText: string) => void
): Promise<void> {
  const now = new Date().toISOString();
  const alertId = `custom_${alertTemplate.relativeTo}_${alertTemplate.offsetMinutes}m`;
  const slotKey = lang === 'en' ? `custom_${alertId}_en` : `custom_${alertId}`;
  const globalAudioKey = `global_${slotKey}`;

  // 1. Upload audio ONCE globally to MongoDB Atlas
  await uploadAudioToMongo(
    {
      key: globalAudioKey,
      scheduleId: 'global',
      slot: slotKey,
      lang,
      fileName: `${alertTemplate.offsetMinutes}m_sebelum_${alertTemplate.relativeTo}.mp3`,
      dataUrl: audioDataUrl,
    },
    onProgress
  );

  onProgress?.(90, 'Menyinkronkan ke 31 jadwal KA Feeder di MongoDB Atlas...');

  // 2. Save locally and update each schedule in memory and MongoDB
  for (const s of inMemorySchedules) {
    const alerts = s.customAudioAlerts ? [...s.customAudioAlerts] : [];
    const cleanNo = s.whooshTrainNo.replace(/[^a-zA-Z0-9]/g, '_');
    const existingIdx = alerts.findIndex((a) => a.id === alertId);

    const prevAlert = existingIdx >= 0 ? alerts[existingIdx] : null;
    const alertItem: CustomAudioAlert = {
      ...alertTemplate,
      id: alertId,
      audioUrl: lang === 'en' ? (prevAlert?.audioUrl || undefined) : audioDataUrl,
      audioFileName: lang === 'en' ? prevAlert?.audioFileName : `${cleanNo}_${alertTemplate.offsetMinutes}m_sebelum_${alertTemplate.relativeTo}.mp3`,
      audioEnUrl: lang === 'en' ? audioDataUrl : prevAlert?.audioEnUrl,
      audioEnFileName: lang === 'en' ? `${cleanNo}_${alertTemplate.offsetMinutes}m_sebelum_${alertTemplate.relativeTo}_en.mp3` : prevAlert?.audioEnFileName,
      enabled: true,
      createdAt: prevAlert?.createdAt || now,
    };

    if (existingIdx >= 0) {
      alerts[existingIdx] = alertItem;
    } else {
      alerts.push(alertItem);
    }

    s.customAudioAlerts = alerts;
    s.updatedAt = now;

    // Save to IndexedDB
    saveAudioToIndexedDB(s.id, slotKey, audioDataUrl).catch(() => {});
    if (cleanNo) {
      saveAudioToIndexedDB(cleanNo, slotKey, audioDataUrl).catch(() => {});
    }

    // Save alias in MongoDB
    uploadAudioToMongo({
      key: `${s.id}_${slotKey}`,
      scheduleId: s.id,
      slot: slotKey,
      lang,
      fileName: alertItem.audioFileName,
      dataUrl: '',
      aliasFor: globalAudioKey,
    }).catch(() => {});

    // Update schedule
    fetch(`/api/schedules/${encodeURIComponent(s.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customAudioAlerts: alerts,
        updatedAt: now,
      }),
    }).catch(() => {});
  }

  notifySubscribers();
  onProgress?.(100, 'Selesai! Audio kustom diterapkan ke 31 jadwal di MongoDB Atlas.');
}

/**
 * Subscribes to real-time global app settings from MongoDB Atlas.
 */
export function subscribeAppSettings(
  onData: (settings: AppSettings) => void,
  onError?: (err: Error) => void
): () => void {
  settingsSubscribers.add(onData);

  // Send current cached value immediately
  onData({ ...inMemorySettings });

  // Warm up universal audio from IndexedDB in parallel
  getAudioFromIndexedDB('universal', 'universal_pre_open').then((cachedId) => {
    if (cachedId && !inMemorySettings.universalPreOpenUrl) {
      inMemorySettings.universalPreOpenUrl = cachedId;
      notifySettingsSubscribers();
    }
  });
  getAudioFromIndexedDB('universal', 'universal_pre_open_en').then((cachedEn) => {
    if (cachedEn && !inMemorySettings.universalPreOpenEnUrl) {
      inMemorySettings.universalPreOpenEnUrl = cachedEn;
      notifySettingsSubscribers();
    }
  });

  let isMounted = true;

  const pullSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const data = await res.json();
      if (!isMounted) return;

      let urlId = data.universalPreOpenUrl || inMemorySettings.universalPreOpenUrl || '';
      let urlEn = data.universalPreOpenEnUrl || inMemorySettings.universalPreOpenEnUrl || '';

      if (!urlId && data.universalPreOpenFileName) {
        const cached = await getAudioFromIndexedDB('universal', 'universal_pre_open');
        if (cached) {
          urlId = cached;
        } else {
          const fetched = await fetchAudioFromFirestoreChunks('universal_pre_open');
          if (fetched && fetched.dataUrl) {
            await saveAudioToIndexedDB('universal', 'universal_pre_open', fetched.dataUrl, fetched.updatedAt);
            urlId = fetched.dataUrl;
          }
        }
      }

      if (!urlEn && data.universalPreOpenEnFileName) {
        const cached = await getAudioFromIndexedDB('universal', 'universal_pre_open_en');
        if (cached) {
          urlEn = cached;
        } else {
          const fetched = await fetchAudioFromFirestoreChunks('universal_pre_open_en');
          if (fetched && fetched.dataUrl) {
            await saveAudioToIndexedDB('universal', 'universal_pre_open_en', fetched.dataUrl, fetched.updatedAt);
            urlEn = fetched.dataUrl;
          }
        }
      }

      inMemorySettings = {
        gateAnimationEnabled: data.gateAnimationEnabled === true,
        universalPreOpenUrl: urlId,
        universalPreOpenFileName: data.universalPreOpenFileName,
        universalPreOpenEnUrl: urlEn,
        universalPreOpenEnFileName: data.universalPreOpenEnFileName,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      };
      notifySettingsSubscribers();
    } catch (err: any) {
      if (onError && isMounted) onError(err);
    }
  };

  pullSettings();
  const interval = setInterval(pullSettings, 6000);

  return () => {
    isMounted = false;
    clearInterval(interval);
    settingsSubscribers.delete(onData);
  };
}

/**
 * Updates global app settings in MongoDB Atlas.
 */
export async function updateAppSetting(updates: Partial<AppSettings>): Promise<void> {
  const now = new Date().toISOString();
  inMemorySettings = {
    ...inMemorySettings,
    ...updates,
    updatedAt: now,
  };
  notifySettingsSubscribers();

  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updates,
        updatedAt: now,
      }),
    });
    if (!res.ok) {
      throw new Error(`Failed to update settings: ${res.statusText}`);
    }
  } catch (err) {
    console.error('Failed to update MongoDB app settings:', err);
    throw err;
  }
}

/**
 * Saves universal audio for "2 Menit Sebelum Gate In Dibuka" (Prioritas Boarding) to MongoDB Atlas.
 */
export async function saveUniversalPreOpenAudio(
  audioBase64OrDataUrl: string,
  fileName: string,
  lang: AudioLanguage = 'id',
  onProgress?: (percent: number, stepText: string) => void
): Promise<void> {
  const now = new Date().toISOString();
  const isEn = lang === 'en';
  const effectiveKey = isEn ? 'universal_pre_open_en' : 'universal_pre_open';

  onProgress?.(10, 'Menyimpan audio ke memori browser lokal...');

  // 1. Save to IndexedDB immediately
  await saveAudioToIndexedDB('universal', effectiveKey, audioBase64OrDataUrl);

  onProgress?.(25, 'Memperbarui cache pengaturan stasiun...');

  // 2. Save in-memory settings
  if (isEn) {
    inMemorySettings.universalPreOpenEnUrl = audioBase64OrDataUrl;
    inMemorySettings.universalPreOpenEnFileName = fileName;
  } else {
    inMemorySettings.universalPreOpenUrl = audioBase64OrDataUrl;
    inMemorySettings.universalPreOpenFileName = fileName;
  }
  inMemorySettings.updatedAt = now;
  notifySettingsSubscribers();

  // 3. Update all in-memory schedules so per-schedule views also immediately reflect this universal audio
  inMemorySchedules = inMemorySchedules.map((s) => ({
    ...s,
    ...(isEn
      ? { audioPreOpenEnUrl: audioBase64OrDataUrl, audioPreOpenEnFileName: fileName }
      : { audioPreOpenUrl: audioBase64OrDataUrl, audioPreOpenFileName: fileName }),
    updatedAt: now,
  }));
  notifySubscribers();

  onProgress?.(35, 'Mengunggah audio ke MongoDB Atlas Cloud...');

  // 4. Save to MongoDB Atlas /api/audio
  try {
    await uploadAudioToMongo(
      {
        key: effectiveKey,
        scheduleId: 'universal',
        slot: effectiveKey,
        lang,
        fileName,
        dataUrl: audioBase64OrDataUrl,
      },
      onProgress
    );
  } catch (err) {
    console.warn('Could not save universal audio to MongoDB:', err);
  }

  onProgress?.(90, 'Memperbarui konfigurasi universal stasiun di MongoDB...');

  // 5. Update AppSettings in MongoDB (metadata only; audio payload lives in audio_files)
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isEn
          ? {
              universalPreOpenEnFileName: fileName,
              universalPreOpenEnUrl: '',
            }
          : {
              universalPreOpenFileName: fileName,
              universalPreOpenUrl: '',
            }),
        updatedAt: now,
      }),
    });
  } catch (err) {
    console.warn('Could not update MongoDB settings for universal audio:', err);
  }

  onProgress?.(100, 'Selesai! Audio universal berhasil disimpan ke MongoDB Atlas.');
}

/**
 * Removes the universal audio for "2 Menit Sebelum Gate In Dibuka".
 */
export async function deleteUniversalPreOpenAudio(lang: AudioLanguage = 'id'): Promise<void> {
  const now = new Date().toISOString();
  const isEn = lang === 'en';
  const effectiveKey = isEn ? 'universal_pre_open_en' : 'universal_pre_open';

  // 1. Delete from IndexedDB
  await deleteAudioFromIndexedDB('universal', effectiveKey);

  // 2. Delete in-memory settings
  if (isEn) {
    inMemorySettings.universalPreOpenEnUrl = '';
    inMemorySettings.universalPreOpenEnFileName = undefined;
  } else {
    inMemorySettings.universalPreOpenUrl = '';
    inMemorySettings.universalPreOpenFileName = undefined;
  }
  inMemorySettings.updatedAt = now;
  notifySettingsSubscribers();

  // 3. Clear from in-memory schedules
  inMemorySchedules = inMemorySchedules.map((s) => ({
    ...s,
    ...(isEn
      ? { audioPreOpenEnUrl: '', audioPreOpenEnFileName: undefined }
      : { audioPreOpenUrl: '', audioPreOpenFileName: undefined }),
    updatedAt: now,
  }));
  notifySubscribers();

  // 4. Delete from MongoDB Atlas
  try {
    await fetch(`/api/audio/${encodeURIComponent(effectiveKey)}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Could not delete universal audio from MongoDB:', err);
  }

  // 5. Update settings document
  try {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(isEn
          ? { universalPreOpenEnFileName: null, universalPreOpenEnUrl: '' }
          : { universalPreOpenFileName: null, universalPreOpenUrl: '' }),
        updatedAt: now,
      }),
    });
  } catch (err) {
    console.warn('Could not update settings on delete:', err);
  }
}
