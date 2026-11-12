export interface CustomAudioAlert {
  id: string; // unique ID, e.g. "custom_dep_5" or timestamp
  label: string; // e.g. "5 Menit Sebelum Keberangkatan"
  offsetMinutes: number; // e.g. 5
  relativeTo: 'departure' | 'gate_open' | 'close_gate'; // 'departure' = sebelum berangkat, 'gate_open' = sebelum gate buka, 'close_gate' = sebelum gate tutup
  audioUrl?: string; // base64 / dataUrl (MP3 audio - Bahasa Indonesia / default)
  audioFileName?: string; // e.g. "G1004_5m_sebelum_berangkat.mp3"
  audioEnUrl?: string; // base64 / dataUrl (MP3 audio - Bahasa Inggris / English)
  audioEnFileName?: string; // e.g. "G1004_5m_sebelum_berangkat_en.mp3"
  audioDurationSec?: number;
  enabled?: boolean; // default true
  createdAt?: string;
}

export interface FeederSchedule {
  id: string;
  tripIndex: number;
  departureTime: string; // "HH:mm" at Bandung
  feederTrainNo: string;  // e.g. "Feeder G1004"
  whooshTrainNo: string;  // e.g. "G1004"
  origin: string;         // "Bandung"
  destination: string;    // "Padalarang"
  whooshDestination: string; // "Halim (Jakarta)"
  feederDurationMin: number; // 18 mins
  feederArrivalTime: string; // calculated: departure + 18 mins
  whooshDepartureTime: string; // from poster: e.g. "06:23"
  transitDurationMin: number; // 19 mins
  platform?: string;       // e.g. "Jalur 5" / "Jalur 6"
  isActive?: boolean;     // true if active in schedule
  isDelayed?: boolean;    // true jika kereta mengalami keterlambatan
  delayMinutes?: number;  // selisih menit keterlambatan (misal 15)
  delayedDepartureTime?: string;       // waktu keberangkatan Feeder baru di Bandung (HH:mm)
  delayedWhooshDepartureTime?: string; // waktu keberangkatan Whoosh baru di Padalarang (HH:mm)
  delayedFeederArrivalTime?: string;   // estimasi waktu tiba Feeder baru di Padalarang (HH:mm)
  delayReason?: string;   // keterangan alasan keterlambatan
  // Audio MP3 - Bahasa Indonesia (ID)
  audioUrl?: string;      // custom recorded or uploaded MP3 file data (general/fallback)
  audioFileName?: string; // formatted as <whooshTrainNo>_announcement.mp3
  audioPreOpenUrl?: string;     // custom audio for 2 menit sebelum gate in dibuka (ID)
  audioPreOpenFileName?: string;
  audioGateOpenUrl?: string;    // custom audio for saat gate in dibuka (ID)
  audioGateOpenFileName?: string;
  audioClosingUrl?: string;     // custom audio for saat gate closing soon (ID)
  audioClosingFileName?: string;
  // Audio MP3 - Bahasa Inggris (EN)
  audioEnUrl?: string;          // custom audio Bahasa Inggris (general/fallback)
  audioEnFileName?: string;
  audioPreOpenEnUrl?: string;   // custom audio for 2 menit sebelum gate in dibuka (EN)
  audioPreOpenEnFileName?: string;
  audioGateOpenEnUrl?: string;  // custom audio for saat gate in dibuka (EN)
  audioGateOpenEnFileName?: string;
  audioClosingEnUrl?: string;   // custom audio for saat gate closing soon (EN)
  audioClosingEnFileName?: string;
  customAudioAlerts?: CustomAudioAlert[]; // Konfigurasi waktu pemicu MP3 baru kustom (misal 5 menit sebelum keberangkatan)
  audioDurationSec?: number;
  audioUpdatedAt?: string;
  updatedAt?: string;
}

// Function to add minutes to "HH:mm"
export function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const totalMin = h * 60 + m + minutesToAdd;
  const newH = Math.floor((totalMin % 1440) / 60);
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// Helper to calculate travel duration in minutes between two "HH:mm" strings
export function calculateDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60; // next day
  }
  return endMinutes - startMinutes;
}

// Complete 31 schedule rows directly from the official Bandung -> Padalarang timetable banner
export const RAW_SCHEDULE_DATA: Array<{
  departure: string;
  whooshTrainNo: string;
  whooshDeparture: string;
}> = [
  { departure: '05:46', whooshTrainNo: 'G1004', whooshDeparture: '06:23' },
  { departure: '06:16', whooshTrainNo: 'G1006', whooshDeparture: '06:53' },
  { departure: '06:46', whooshTrainNo: 'G1008', whooshDeparture: '07:23' },
  { departure: '07:16', whooshTrainNo: 'G1010', whooshDeparture: '07:53' },
  { departure: '07:46', whooshTrainNo: 'G1012', whooshDeparture: '08:23' },
  { departure: '08:16', whooshTrainNo: 'G1014', whooshDeparture: '08:53' },
  { departure: '08:46', whooshTrainNo: 'G1016', whooshDeparture: '09:23' },
  { departure: '09:16', whooshTrainNo: 'G1018', whooshDeparture: '09:53' },
  { departure: '09:46', whooshTrainNo: 'G1020', whooshDeparture: '10:23' },
  { departure: '10:16', whooshTrainNo: 'G1022', whooshDeparture: '10:53' },
  { departure: '10:46', whooshTrainNo: 'G1024', whooshDeparture: '11:23' },
  { departure: '11:16', whooshTrainNo: 'G1026', whooshDeparture: '11:53' },
  { departure: '11:46', whooshTrainNo: 'G1028', whooshDeparture: '12:23' },
  { departure: '12:16', whooshTrainNo: 'G1030', whooshDeparture: '12:53' },
  { departure: '12:46', whooshTrainNo: 'G1032', whooshDeparture: '13:23' },
  { departure: '13:16', whooshTrainNo: 'G1034', whooshDeparture: '13:53' },
  { departure: '13:46', whooshTrainNo: 'G1036', whooshDeparture: '14:23' },
  { departure: '14:16', whooshTrainNo: 'G1038', whooshDeparture: '14:53' },
  { departure: '14:46', whooshTrainNo: 'G1040', whooshDeparture: '15:23' },
  { departure: '15:16', whooshTrainNo: 'G1042', whooshDeparture: '15:53' },
  { departure: '15:46', whooshTrainNo: 'G1044', whooshDeparture: '16:23' },
  { departure: '16:16', whooshTrainNo: 'G1046', whooshDeparture: '16:53' },
  { departure: '16:46', whooshTrainNo: 'G1048', whooshDeparture: '17:23' },
  { departure: '17:16', whooshTrainNo: 'G1050', whooshDeparture: '17:53' },
  { departure: '17:46', whooshTrainNo: 'G1052', whooshDeparture: '18:23' },
  { departure: '18:16', whooshTrainNo: 'G1054', whooshDeparture: '18:53' },
  { departure: '18:46', whooshTrainNo: 'G1056', whooshDeparture: '19:23' },
  { departure: '19:16', whooshTrainNo: 'G1058', whooshDeparture: '19:53' },
  { departure: '19:46', whooshTrainNo: 'G1060', whooshDeparture: '20:23' },
  { departure: '20:16', whooshTrainNo: 'G1062', whooshDeparture: '20:53' },
  { departure: '20:46', whooshTrainNo: 'G1064', whooshDeparture: '21:23' },
];

export const INITIAL_SCHEDULES: FeederSchedule[] = RAW_SCHEDULE_DATA.map((item, idx) => {
  const duration = 18; // 18 minutes travel time Bandung to Padalarang
  const feederArrival = addMinutesToTime(item.departure, duration);
  return {
    id: `feeder-${idx + 1}`,
    tripIndex: idx + 1,
    departureTime: item.departure,
    feederTrainNo: `KF-${item.whooshTrainNo.substring(1)}`,
    whooshTrainNo: item.whooshTrainNo,
    origin: 'Bandung (BD)',
    destination: 'Padalarang (PDL)',
    whooshDestination: 'Halim (HLM)',
    feederDurationMin: duration,
    feederArrivalTime: feederArrival,
    whooshDepartureTime: item.whooshDeparture,
    transitDurationMin: 19,
    platform: (idx % 2 === 0) ? 'Peron 5' : 'Peron 6',
  };
});

