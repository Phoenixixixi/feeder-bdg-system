/**
 * Audio Alert Utility using Web Audio API for station chime
 * and Web Speech API for train departure boarding calls in Bahasa Indonesia.
 * Designed for full cross-browser compatibility (Chrome, Safari, Firefox, Edge, Opera, iOS/Android).
 */
import { FeederSchedule } from '../data/scheduleData';

let audioCtx: AudioContext | null = null;
let activeAudioElement: HTMLAudioElement | null = null;
let activeBufferSource: AudioBufferSourceNode | null = null;
let isAudioUnlocked = false;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  // Safari / WebKit can enter 'suspended' or 'interrupted' state
  if (audioCtx.state === 'suspended' || (audioCtx.state as string) === 'interrupted') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Cross-browser decodeAudioData supporting Promise and Callback forms (Safari WebKit)
 */
function decodeAudioDataCrossBrowser(ctx: AudioContext, arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let handled = false;
    const onSuccess = (buffer: AudioBuffer) => {
      if (!handled) {
        handled = true;
        resolve(buffer);
      }
    };
    const onError = (err: unknown) => {
      if (!handled) {
        handled = true;
        reject(err);
      }
    };

    try {
      const res = ctx.decodeAudioData(arrayBuffer, onSuccess, onError);
      if (res && typeof (res as unknown as Promise<AudioBuffer>).then === 'function') {
        (res as unknown as Promise<AudioBuffer>).then(onSuccess).catch(onError);
      }
    } catch (e) {
      onError(e);
    }
  });
}

/**
 * Speech synthesis voice cache & loader for Chrome, Safari, Edge, Firefox
 */
let cachedVoices: SpeechSynthesisVoice[] = [];
function updateVoicesList() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      cachedVoices = window.speechSynthesis.getVoices() || [];
    } catch {
      cachedVoices = [];
    }
  }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  updateVoicesList();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = updateVoicesList;
  }
}

function findBestIndonesianVoice(): SpeechSynthesisVoice | undefined {
  if (cachedVoices.length === 0) {
    updateVoicesList();
  }
  const list = cachedVoices.length > 0 ? cachedVoices : (window.speechSynthesis ? window.speechSynthesis.getVoices() : []);
  if (!list || list.length === 0) return undefined;

  return (
    list.find((v) => v.lang === 'id-ID' || v.lang === 'id_ID') ||
    list.find((v) => v.lang.toLowerCase().startsWith('id')) ||
    list.find((v) => v.name.toLowerCase().includes('indonesia')) ||
    list.find((v) => v.lang.startsWith('ms')) // Melayu / Malay fallback if Indonesian not installed
  );
}

/**
 * Unlocks browser audio autoplay restrictions on user gesture.
 */
export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    // Also warm up HTML5 Audio element
    const dummyAudio = new Audio();
    dummyAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    dummyAudio.play().catch(() => {});
    isAudioUnlocked = true;
  } catch (err) {
    console.warn('Could not unlock audio context:', err);
  }
}

// Auto-register user interaction listener for audio unlock across all platforms
if (typeof window !== 'undefined') {
  const onUserInteract = () => {
    unlockAudio();
    window.removeEventListener('click', onUserInteract);
    window.removeEventListener('touchstart', onUserInteract);
    window.removeEventListener('keydown', onUserInteract);
  };
  window.addEventListener('click', onUserInteract, { passive: true });
  window.addEventListener('touchstart', onUserInteract, { passive: true });
  window.addEventListener('keydown', onUserInteract, { passive: true });
}

/**
 * Stops any currently active announcement audio or speech synthesis.
 */
export function stopCurrentAlertAudio(): void {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // ignore
    }
    activeAudioElement = null;
  }
  if (activeBufferSource) {
    try {
      activeBufferSource.stop();
    } catch {
      // ignore
    }
    activeBufferSource = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Plays an authentic 4-tone train station melodic chime (E5 -> G#5 -> B5 -> E6).
 */
export function playStationChime(volume = 0.8): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const notes = [
        { freq: 659.25, time: 0.0, duration: 0.4 }, // E5
        { freq: 830.61, time: 0.35, duration: 0.4 }, // G#5
        { freq: 987.77, time: 0.7, duration: 0.45 }, // B5
        { freq: 1318.51, time: 1.1, duration: 0.9 }, // E6
      ];

      notes.forEach(({ freq, time, duration }) => {
        // Oscillator 1 (Warm tone)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Oscillator 2 (Bell overtone)
        const oscOvertone = ctx.createOscillator();
        const gainOvertone = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        oscOvertone.type = 'triangle';
        oscOvertone.frequency.setValueAtTime(freq * 2, now + time);

        // Natural chime envelope
        gain.gain.setValueAtTime(0.0001, now + time);
        gain.gain.exponentialRampToValueAtTime(volume * 0.4, now + time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

        gainOvertone.gain.setValueAtTime(0.0001, now + time);
        gainOvertone.gain.exponentialRampToValueAtTime(volume * 0.15, now + time + 0.03);
        gainOvertone.gain.exponentialRampToValueAtTime(0.0001, now + time + duration * 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);

        oscOvertone.connect(gainOvertone);
        gainOvertone.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + duration);

        oscOvertone.start(now + time);
        oscOvertone.stop(now + time + duration);
      });

      setTimeout(() => {
        resolve();
      }, 2100);
    } catch (err) {
      console.warn('Audio playback error:', err);
      resolve();
    }
  });
}

/**
 * Plays an authentic closing train station bell/chime (outro chime: E6 -> B5 -> G#5 -> E5).
 */
export function playStationClosingChime(volume = 0.8): Promise<void> {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      // Melodic descending station outro chime
      const notes = [
        { freq: 1318.51, time: 0.0, duration: 0.38 }, // E6
        { freq: 987.77, time: 0.32, duration: 0.38 },  // B5
        { freq: 830.61, time: 0.65, duration: 0.42 }, // G#5
        { freq: 659.25, time: 1.0, duration: 1.1 },   // E5 (resonant concluding tone)
      ];

      notes.forEach(({ freq, time, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const oscOvertone = ctx.createOscillator();
        const gainOvertone = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        oscOvertone.type = 'triangle';
        oscOvertone.frequency.setValueAtTime(freq * 2, now + time);

        gain.gain.setValueAtTime(0.0001, now + time);
        gain.gain.exponentialRampToValueAtTime(volume * 0.38, now + time + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

        gainOvertone.gain.setValueAtTime(0.0001, now + time);
        gainOvertone.gain.exponentialRampToValueAtTime(volume * 0.14, now + time + 0.03);
        gainOvertone.gain.exponentialRampToValueAtTime(0.0001, now + time + duration * 0.7);

        osc.connect(gain);
        gain.connect(ctx.destination);
        oscOvertone.connect(gainOvertone);
        gainOvertone.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + duration);
        oscOvertone.start(now + time);
        oscOvertone.stop(now + time + duration);
      });

      setTimeout(() => {
        resolve();
      }, 2100);
    } catch (err) {
      console.warn('Closing chime error:', err);
      resolve();
    }
  });
}

/**
 * Speaks an announcement in Bahasa Indonesia when Gate In is opening in 2 minutes.
 */
export function speakGateOpeningSoonAnnouncement(
  trainNo: string,
  checkingTime: string,
  departureTime: string
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const text = `Perhatian. Informasi bagi para penumpang Kereta Feeder ${trainNo} tujuan Padalarang keberangkatan pukul ${departureTime.replace(':', ' lewat ')}. Pemeriksaan tiket dan boarding gate in akan dibuka dalam 2 menit, pada pukul ${checkingTime.replace(':', ' lewat ')} WIB. Mohon persiapkan tiket fisik atau e-ticket Anda.`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const idVoice = findBestIndonesianVoice();
      if (idVoice) {
        utterance.voice = idVoice;
      }

      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      utterance.onend = done;
      utterance.onerror = done;

      // Watchdog timeout in case browser speech engine pauses or stalls
      setTimeout(done, 14000);

      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          done();
        }
      }, 250);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      resolve();
    }
  });
}

/**
 * Speaks an announcement in Bahasa Indonesia when Gate In is officially opened.
 */
export function speakGateOpenedAnnouncement(
  trainNo: string,
  departureTime: string
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const text = `Perhatian. Pemeriksaan tiket dan boarding gate in untuk Kereta Feeder ${trainNo} tujuan Padalarang keberangkatan pukul ${departureTime.replace(':', ' lewat ')} kini telah dibuka. Para penumpang dipersilakan masuk melalui pintu gate dan menuju peron keberangkatan.`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const idVoice = findBestIndonesianVoice();
      if (idVoice) {
        utterance.voice = idVoice;
      }

      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      utterance.onend = done;
      utterance.onerror = done;

      setTimeout(done, 14000);

      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          done();
        }
      }, 250);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      resolve();
    }
  });
}

/**
 * Speaks an official station announcement in Bahasa Indonesia (Last Call / Approaching Deadline).
 */
export function speakStationAnnouncement(
  trainNo: string,
  departureTime: string,
  gateMinutesLeft: number
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // cancel any ongoing speech

      const text = `Perhatian. Panggilan terakhir untuk para penumpang Kereta Feeder ${trainNo} tujuan Padalarang keberangkatan pukul ${departureTime.replace(':', ' lewat ')}. Gate keberangkatan akan ditutup dalam ${Math.max(1, gateMinutesLeft)} menit. Silakan segera menuju gate keberangkatan.`;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.95;
      utterance.pitch = 1.05;

      const idVoice = findBestIndonesianVoice();
      if (idVoice) {
        utterance.voice = idVoice;
      }

      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      utterance.onend = done;
      utterance.onerror = done;

      setTimeout(done, 14000);

      // Give small gap after chime
      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          done();
        }
      }, 250);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
      resolve();
    }
  });
}

/**
 * Plays a custom recorded or uploaded audio track (MP3/data URL).
 * Returns true if successfully played, false if playback failed.
 */
export async function playCustomAudio(audioUrl: string, volume = 0.8): Promise<boolean> {
  if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.trim()) {
    return false;
  }

  stopCurrentAlertAudio();
  unlockAudio();

  // Try HTMLAudioElement first
  const result = await new Promise<boolean>((resolve) => {
    try {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.volume = Math.max(0, Math.min(1, volume));
      activeAudioElement = audio;

      let settled = false;
      const finish = (success: boolean) => {
        if (!settled) {
          settled = true;
          resolve(success);
        }
      };

      audio.onended = () => {
        if (activeAudioElement === audio) {
          activeAudioElement = null;
        }
        finish(true);
      };

      audio.onerror = async (e) => {
        console.warn('Audio element error, trying Web Audio API decoding fallback:', e);
        const webAudioSuccess = await playCustomAudioViaWebAudio(audioUrl, volume);
        finish(webAudioSuccess);
      };

      audio.src = audioUrl;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(async (err) => {
          console.warn('Audio play() rejected, trying Web Audio fallback:', err);
          const webAudioSuccess = await playCustomAudioViaWebAudio(audioUrl, volume);
          finish(webAudioSuccess);
        });
      }
    } catch (err) {
      console.warn('Exception creating Audio element, trying Web Audio:', err);
      playCustomAudioViaWebAudio(audioUrl, volume).then(resolve);
    }
  });

  return result;
}

/**
 * Decodes and plays audio via AudioContext buffer source.
 */
async function playCustomAudioViaWebAudio(audioUrl: string, volume = 0.8): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await decodeAudioDataCrossBrowser(ctx, arrayBuffer);

    return new Promise<boolean>((resolve) => {
      try {
        const source = ctx.createBufferSource();
        const gainNode = ctx.createGain();

        gainNode.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
        source.buffer = audioBuffer;
        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        activeBufferSource = source;

        source.onended = () => {
          if (activeBufferSource === source) {
            activeBufferSource = null;
          }
          resolve(true);
        };

        source.start(0);
      } catch (err) {
        console.warn('Web Audio buffer playback error:', err);
        resolve(false);
      }
    });
  } catch (err) {
    console.warn('Web Audio decode failed:', err);
    return false;
  }
}

let globalAlertSession = 0;

/**
 * Alert 1: Saat 2 menit sebelum gate in dibuka.
 */
export async function triggerGateOpeningSoonAlert(
  trainNo: string,
  checkingStartTime: string,
  departureTime: string,
  volume = 0.8,
  customAudioUrl?: string,
  customAudioEnUrl?: string
): Promise<void> {
  const sessionId = ++globalAlertSession;
  stopCurrentAlertAudio();

  await playStationChime(volume);
  if (sessionId !== globalAlertSession) return;

  const hasCustomAudio = !!(customAudioUrl && typeof customAudioUrl === 'string' && customAudioUrl.trim() !== '');
  const hasCustomAudioEn = !!(customAudioEnUrl && typeof customAudioEnUrl === 'string' && customAudioEnUrl.trim() !== '');

  if (hasCustomAudio) {
    const played = await playCustomAudio(customAudioUrl, volume);
    if (sessionId !== globalAlertSession) return;
    if (!played) {
      console.warn('Custom audio failed to play, falling back to voice announcement');
      await speakGateOpeningSoonAnnouncement(trainNo, checkingStartTime, departureTime);
    }
  } else {
    await speakGateOpeningSoonAnnouncement(trainNo, checkingStartTime, departureTime);
  }
  if (sessionId !== globalAlertSession) return;

  // If English MP3 is available, play it after a 1.5 second pause (Indonesian first -> 1.5s -> English)
  if (hasCustomAudioEn) {
    await new Promise((r) => setTimeout(r, 1500));
    if (sessionId !== globalAlertSession) return;
    await playCustomAudio(customAudioEnUrl, volume);
  }
  if (sessionId !== globalAlertSession) return;

  // Bell chime penutup di akhir suara
  await new Promise((r) => setTimeout(r, 400));
  if (sessionId !== globalAlertSession) return;
  await playStationClosingChime(volume);
}

/**
 * Alert 2: Saat gate in resmi dibuka.
 */
export async function triggerGateOpenedAlert(
  trainNo: string,
  departureTime: string,
  volume = 0.8,
  customAudioUrl?: string,
  customAudioEnUrl?: string
): Promise<void> {
  const sessionId = ++globalAlertSession;
  stopCurrentAlertAudio();

  await playStationChime(volume);
  if (sessionId !== globalAlertSession) return;

  const hasCustomAudio = !!(customAudioUrl && typeof customAudioUrl === 'string' && customAudioUrl.trim() !== '');
  const hasCustomAudioEn = !!(customAudioEnUrl && typeof customAudioEnUrl === 'string' && customAudioEnUrl.trim() !== '');

  if (hasCustomAudio) {
    const played = await playCustomAudio(customAudioUrl, volume);
    if (sessionId !== globalAlertSession) return;
    if (!played) {
      console.warn('Custom audio failed to play, falling back to voice announcement');
      await speakGateOpenedAnnouncement(trainNo, departureTime);
    }
  } else {
    await speakGateOpenedAnnouncement(trainNo, departureTime);
  }
  if (sessionId !== globalAlertSession) return;

  // If English MP3 is available, play it after a 1.5 second pause (Indonesian first -> 1.5s -> English)
  if (hasCustomAudioEn) {
    await new Promise((r) => setTimeout(r, 1500));
    if (sessionId !== globalAlertSession) return;
    await playCustomAudio(customAudioEnUrl, volume);
  }
  if (sessionId !== globalAlertSession) return;

  // Bell chime penutup di akhir suara
  await new Promise((r) => setTimeout(r, 400));
  if (sessionId !== globalAlertSession) return;
  await playStationClosingChime(volume);
}

/**
 * Alert 3: Full warning alert saat mendekati batas akhir tutup gate (panggilan terakhir).
 */
export async function triggerApproachingDeadlineAlert(
  trainNo: string,
  departureTime: string,
  minutesLeft: number,
  volume = 0.8,
  customAudioUrl?: string,
  customAudioEnUrl?: string
): Promise<void> {
  const sessionId = ++globalAlertSession;
  stopCurrentAlertAudio();

  await playStationChime(volume);
  if (sessionId !== globalAlertSession) return;

  const hasCustomAudio = !!(customAudioUrl && typeof customAudioUrl === 'string' && customAudioUrl.trim() !== '');
  const hasCustomAudioEn = !!(customAudioEnUrl && typeof customAudioEnUrl === 'string' && customAudioEnUrl.trim() !== '');

  if (hasCustomAudio) {
    const played = await playCustomAudio(customAudioUrl, volume);
    if (sessionId !== globalAlertSession) return;
    if (!played) {
      console.warn('Custom audio failed to play, falling back to voice announcement');
      await speakStationAnnouncement(trainNo, departureTime, minutesLeft);
    }
  } else {
    await speakStationAnnouncement(trainNo, departureTime, minutesLeft);
  }
  if (sessionId !== globalAlertSession) return;

  // If English MP3 is available, play it after a 1.5 second pause (Indonesian first -> 1.5s -> English)
  if (hasCustomAudioEn) {
    await new Promise((r) => setTimeout(r, 1500));
    if (sessionId !== globalAlertSession) return;
    await playCustomAudio(customAudioEnUrl, volume);
  }
  if (sessionId !== globalAlertSession) return;

  // Bell chime penutup di akhir suara
  await new Promise((r) => setTimeout(r, 400));
  if (sessionId !== globalAlertSession) return;
  await playStationClosingChime(volume);
}

/**
 * Alert Pemicu Waktu MP3 Kustom (misal: 5 menit sebelum keberangkatan).
 * Memutar file MP3 asli yang diunggah oleh petugas (Bahasa Indonesia dan/atau Bahasa Inggris).
 */
export async function triggerCustomMp3Alert(
  customAudioUrl: string,
  volume = 0.8,
  customAudioEnUrl?: string
): Promise<boolean> {
  const hasId = !!(customAudioUrl && typeof customAudioUrl === 'string' && customAudioUrl.trim() !== '');
  const hasEn = !!(customAudioEnUrl && typeof customAudioEnUrl === 'string' && customAudioEnUrl.trim() !== '');

  if (!hasId && !hasEn) {
    return false;
  }

  const sessionId = ++globalAlertSession;
  stopCurrentAlertAudio();

  await playStationChime(volume);
  if (sessionId !== globalAlertSession) return false;

  let played = false;

  if (hasId) {
    played = await playCustomAudio(customAudioUrl, volume);
    if (sessionId !== globalAlertSession) return false;
  }

  if (hasEn) {
    if (hasId) {
      // Jeda 1.5 detik setelah audio Indonesia selesai sebelum audio Inggris diputar
      await new Promise((r) => setTimeout(r, 1500));
      if (sessionId !== globalAlertSession) return false;
    }
    const playedEn = await playCustomAudio(customAudioEnUrl, volume);
    if (sessionId !== globalAlertSession) return false;
    played = played || playedEn;
  }

  await new Promise((r) => setTimeout(r, 400));
  if (sessionId !== globalAlertSession) return false;
  await playStationClosingChime(volume);
  return played;
}

export type ManualAnnouncementType =
  | 'auto'           // Cek MP3 dulu jika ada, atau suara boarding resmi
  | 'boarding'       // Panggilan Keberangkatan / Boarding
  | 'gate_soon'      // Gate In Dibuka 2 Menit Lagi
  | 'gate_opened'    // Gate In Resmi Dibuka
  | 'last_call'      // Panggilan Terakhir (Gate Segera Ditutup)
  | 'custom_mp3'     // File rekaman MP3 terunggah
  | 'slot_pre_open'  // Slot 2 Menit Sebelum Buka
  | 'slot_gate_open' // Slot Saat Gate Dibuka
  | 'slot_closing'   // Slot Batas Akhir / Panggilan Terakhir
  | (string & {});   // Custom alert ID (misal custom_xxx) atau identifier lainnya

export type ManualAudioPhase = 'idle' | 'chime_start' | 'announcing' | 'chime_end';

let currentManualCancelToken = 0;

/**
 * Membatalkan / menghentikan pemutaran audio manual yang sedang berlangsung.
 */
export function cancelManualAnnouncement(): void {
  currentManualCancelToken++;
  stopCurrentAlertAudio();
}

/**
 * Menghasilkan teks pengumuman suara resmi stasiun dalam Bahasa Indonesia.
 */
export function generateStationAnnouncementText(
  schedule: FeederSchedule,
  announcementType: ManualAnnouncementType = 'boarding'
): string {
  const depTime =
    schedule.isDelayed && schedule.delayedDepartureTime
      ? `${schedule.delayedDepartureTime} (keterlambatan ${schedule.delayMinutes || 0} menit)`
      : schedule.departureTime;
  const depSpoken = depTime.replace(':', ' lewat ');
  const trainNo = schedule.feederTrainNo || `Feeder ${schedule.whooshTrainNo}`;
  const whooshNo = schedule.whooshTrainNo;
  const platform = schedule.platform ? `di ${schedule.platform}` : 'di peron keberangkatan';

  if (announcementType === 'gate_soon' || announcementType === 'slot_pre_open') {
    return `Perhatian. Informasi bagi para penumpang Kereta Api Feeder ${trainNo} tujuan Cimahi dan Padalarang, keberangkatan pukul ${depSpoken} WIB yang terkoneksi dengan Kereta Cepat Whoosh nomor ${whooshNo}. Pemeriksaan tiket dan boarding gate in akan segera dibuka dalam 2 menit. Mohon persiapkan tiket fisik atau e-ticket Anda. Terima kasih.`;
  }

  if (announcementType === 'gate_opened' || announcementType === 'slot_gate_open') {
    return `Perhatian. Pemeriksaan tiket dan boarding gate in untuk Kereta Api Feeder ${trainNo} tujuan Cimahi dan Padalarang, keberangkatan pukul ${depSpoken} WIB yang terkoneksi dengan Kereta Cepat Whoosh nomor ${whooshNo} kini telah dibuka. Para penumpang dipersilakan masuk melalui pintu gate dan menuju ${platform}. Terima kasih.`;
  }

  if (announcementType === 'last_call' || announcementType === 'slot_closing') {
    return `Perhatian. Panggilan terakhir untuk para penumpang Kereta Api Feeder ${trainNo} tujuan Cimahi dan Padalarang, keberangkatan pukul ${depSpoken} WIB yang terkoneksi dengan Kereta Cepat Whoosh nomor ${whooshNo}. Pintu gate keberangkatan akan segera ditutup. Para penumpang yang belum masuk dipersilakan segera menuju pintu boarding gate. Terima kasih.`;
  }

  // Default: Panggilan Boarding / Keberangkatan
  return `Perhatian. Panggilan keberangkatan untuk para penumpang Kereta Api Feeder ${trainNo} keberangkatan Stasiun Bandung pukul ${depSpoken} WIB menuju Stasiun Cimahi dan Stasiun Padalarang, terkoneksi dengan Kereta Cepat Whoosh nomor ${whooshNo}. Pemeriksaan tiket dan boarding telah dibuka ${platform}. Para penumpang dipersilakan mempersiapkan tiket dan menuju peron keberangkatan. Semoga perjalanan Anda menyenangkan. Terima kasih.`;
}

/**
 * Berbicara pengumuman resmi stasiun untuk jadwal kereta via Web Speech API.
 */
export function speakManualScheduleAnnouncement(
  schedule: FeederSchedule,
  announcementType: ManualAnnouncementType = 'boarding'
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const text = generateStationAnnouncementText(schedule, announcementType);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 0.95;
      utterance.pitch = 1.02;

      const idVoice = findBestIndonesianVoice();
      if (idVoice) {
        utterance.voice = idVoice;
      }

      let finished = false;
      const done = () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      };

      utterance.onend = done;
      utterance.onerror = done;

      // Watchdog timeout
      setTimeout(done, 18000);

      setTimeout(() => {
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          done();
        }
      }, 250);
    } catch (e) {
      console.warn('Speech synthesis error in manual announcement:', e);
      resolve();
    }
  });
}

/**
 * Mencari URL audio MP3 yang paling relevan untuk jadwal kereta ini berdasarkan bahasa.
 */
export function getScheduleAudioUrl(
  schedule: FeederSchedule,
  preferredSlot?: string,
  lang: 'id' | 'en' = 'id'
): string | undefined {
  const normSlot = preferredSlot?.replace(/^slot_/, '');

  if (lang === 'en') {
    if (normSlot === 'pre_open' && schedule.audioPreOpenEnUrl) return schedule.audioPreOpenEnUrl;
    if (normSlot === 'gate_open' && schedule.audioGateOpenEnUrl) return schedule.audioGateOpenEnUrl;
    if (normSlot === 'closing' && (schedule.audioClosingEnUrl || schedule.audioEnUrl)) {
      return schedule.audioClosingEnUrl || schedule.audioEnUrl;
    }
    if (normSlot && schedule.customAudioAlerts) {
      const customId = normSlot.startsWith('custom_') ? normSlot.replace('custom_', '') : normSlot;
      const found = schedule.customAudioAlerts.find((c) => c.id === customId || `custom_${c.id}` === normSlot);
      if (found?.audioEnUrl) return found.audioEnUrl;
    }
    return (
      schedule.audioClosingEnUrl ||
      schedule.audioGateOpenEnUrl ||
      schedule.audioPreOpenEnUrl ||
      schedule.audioEnUrl ||
      (schedule.customAudioAlerts && schedule.customAudioAlerts.find((c) => c.audioEnUrl)?.audioEnUrl)
    );
  }

  if (normSlot === 'pre_open' && schedule.audioPreOpenUrl) return schedule.audioPreOpenUrl;
  if (normSlot === 'gate_open' && schedule.audioGateOpenUrl) return schedule.audioGateOpenUrl;
  if (normSlot === 'closing' && (schedule.audioClosingUrl || schedule.audioUrl)) {
    return schedule.audioClosingUrl || schedule.audioUrl;
  }
  if (normSlot && schedule.customAudioAlerts) {
    const customId = normSlot.startsWith('custom_') ? normSlot.replace('custom_', '') : normSlot;
    const found = schedule.customAudioAlerts.find((c) => c.id === customId || `custom_${c.id}` === normSlot);
    if (found?.audioUrl) return found.audioUrl;
  }

  // Fallback priority:
  return (
    schedule.audioClosingUrl ||
    schedule.audioGateOpenUrl ||
    schedule.audioPreOpenUrl ||
    schedule.audioUrl ||
    (schedule.customAudioAlerts && schedule.customAudioAlerts.find((c) => c.audioUrl)?.audioUrl)
  );
}

export interface ManualScheduleAudioOptions {
  announcementType?: ManualAnnouncementType;
  volume?: number;
  preferUploadedAudio?: boolean;
  specificAudioUrl?: string;
  specificAudioEnUrl?: string;
  onPhaseChange?: (phase: ManualAudioPhase) => void;
}

/**
 * Memutar audio pengumuman manual per jadwal di dashboard:
 * 1. Bell Chime Stasiun Pembuka (E5 -> G#5 -> B5 -> E6)
 * 2. Suara Pengumuman Bahasa Indonesia (MP3 jika diunggah / Suara Stasiun Resmi Bahasa Indonesia)
 * 3. Jeda 1.5 detik jika ada versi Bahasa Inggris
 * 4. Suara Pengumuman Bahasa Inggris (MP3 EN jika diunggah)
 * 5. Bell Chime Stasiun Penutup (E6 -> B5 -> G#5 -> E5)
 */
export async function triggerManualScheduleAnnouncement(
  schedule: FeederSchedule,
  options?: ManualScheduleAudioOptions
): Promise<boolean> {
  const volume = options?.volume ?? 0.85;
  const announcementType = options?.announcementType ?? 'auto';
  const onPhaseChange = options?.onPhaseChange;

  // Batalkan audio sebelumnya dan siapkan cancel token baru
  currentManualCancelToken++;
  const thisToken = currentManualCancelToken;
  stopCurrentAlertAudio();
  unlockAudio();

  const isCancelled = () => thisToken !== currentManualCancelToken;

  try {
    // ----------------------------------------------------
    // TAHAP 1: BELL CHIME STASIUN PEMBUKA
    // ----------------------------------------------------
    onPhaseChange?.('chime_start');
    await playStationChime(volume);

    if (isCancelled()) {
      onPhaseChange?.('idle');
      return false;
    }

    // Jeda alami setelah bell sebelum suara diumumkan (400ms)
    await new Promise((r) => setTimeout(r, 400));
    if (isCancelled()) {
      onPhaseChange?.('idle');
      return false;
    }

    // ----------------------------------------------------
    // TAHAP 2: PENGUMUMAN BAHASA INDONESIA (MP3 ATAU SUARA STASIUN RESMI)
    // ----------------------------------------------------
    onPhaseChange?.('announcing');

    let slotName: string = announcementType;
    if (announcementType === 'gate_soon' || announcementType === 'slot_pre_open') {
      slotName = 'pre_open';
    } else if (announcementType === 'gate_opened' || announcementType === 'slot_gate_open') {
      slotName = 'gate_open';
    } else if (announcementType === 'last_call' || announcementType === 'slot_closing') {
      slotName = 'closing';
    } else if (announcementType === 'boarding') {
      slotName = 'closing';
    }

    const audioUrlId =
      options?.specificAudioUrl !== undefined
        ? options.specificAudioUrl
        : options?.preferUploadedAudio !== false
        ? getScheduleAudioUrl(schedule, slotName, 'id')
        : undefined;

    const audioUrlEn =
      options?.specificAudioEnUrl !== undefined
        ? options.specificAudioEnUrl
        : options?.preferUploadedAudio !== false
        ? getScheduleAudioUrl(schedule, slotName, 'en')
        : undefined;

    let playedAudioSuccessfully = false;

    if (audioUrlId) {
      playedAudioSuccessfully = await playCustomAudio(audioUrlId, volume);
    }

    // Jika tidak ada MP3 ID atau MP3 gagal putar (atau mode suara), putar speech synthesis resmi
    if (!playedAudioSuccessfully && announcementType !== 'custom_mp3') {
      if (isCancelled()) {
        onPhaseChange?.('idle');
        return false;
      }
      await speakManualScheduleAnnouncement(schedule, announcementType);
    }

    if (isCancelled()) {
      onPhaseChange?.('idle');
      return false;
    }

    // ----------------------------------------------------
    // TAHAP 3: JEDA 1.5 DETIK LALU AUDIO BAHASA INGGRIS (JIKA ADA)
    // ----------------------------------------------------
    if (audioUrlEn) {
      // Jeda tepat 1.5 detik (1500 ms) setelah audio Indonesia selesai
      await new Promise((r) => setTimeout(r, 1500));
      if (isCancelled()) {
        onPhaseChange?.('idle');
        return false;
      }
      await playCustomAudio(audioUrlEn, volume);
    }

    if (isCancelled()) {
      onPhaseChange?.('idle');
      return false;
    }

    // Jeda alami setelah suara selesai sebelum bell penutup (400ms)
    await new Promise((r) => setTimeout(r, 400));
    if (isCancelled()) {
      onPhaseChange?.('idle');
      return false;
    }

    // ----------------------------------------------------
    // TAHAP 4: BELL CHIME STASIUN PENUTUP
    // ----------------------------------------------------
    onPhaseChange?.('chime_end');
    await playStationClosingChime(volume);

    onPhaseChange?.('idle');
    return true;
  } catch (err) {
    console.warn('Error in triggerManualScheduleAnnouncement:', err);
    onPhaseChange?.('idle');
    return false;
  }
}

