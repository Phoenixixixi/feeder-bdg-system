import { FeederSchedule, CustomAudioAlert } from '../data/scheduleData';

export type TrainStatus =
  | 'UPCOMING'           // Belum Checking
  | 'DELAYED'            // Terlambat (Keterlambatan Kereta)
  | 'GATE_OPENING_SOON'  // 2 Menit Sebelum Gate In Dibuka
  | 'CHECKING'           // Waktu Checking (Gate Dibuka)
  | 'GATE_CLOSING_SOON'  // Mendekati Batas Akhir (Notifikasi Suara & Alert)
  | 'GATE_CLOSED'        // Gate Ditutup (5 menit sebelum berangkat)
  | 'DEPARTED';          // Sudah Lewat (Otomatis Dihapus)

export interface ComputedTrainInfo {
  schedule: FeederSchedule;
  checkingStartTime: string;
  closeGateTime: string;
  departureTime: string;
  effectiveDepartureTime: string;
  effectiveWhooshDepartureTime: string;
  effectiveFeederArrivalTime: string;
  isDelayed: boolean;
  delayMinutes: number;
  delayReason?: string;
  status: TrainStatus;
  statusLabel: string;
  statusColor: 'slate' | 'emerald' | 'amber' | 'rose' | 'gray' | 'cyan';
  minutesUntilDeparture: number;
  secondsUntilDeparture: number;
  minutesUntilCloseGate: number;
  secondsUntilCloseGate: number;
  minutesUntilGateOpen: number;
  secondsUntilGateOpen: number;
  isGateOpeningSoon: boolean;     // 2 menit sebelum gate in dibuka
  isGateJustOpened: boolean;      // Saat gate in resmi dibuka
  isApproachingDeadline: boolean; // 2 menit sebelum gate ditutup
  hasDeparted: boolean;           // Sudah lewat
}

/**
 * Parses "HH:mm" into total minutes from midnight (0 to 1439).
 */
export function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converts total minutes from midnight into "HH:mm".
 */
export function minutesToTimeStr(totalMin: number): string {
  const normalized = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calculates checking start time, close gate time, and departure time for a train.
 * Specific rules from user:
 * - Menit 46: checking di menit 35 (11 min sebelum), close gate di menit 41 (5 min sebelum)
 * - Menit 16: checking di menit 05 (11 min sebelum), close gate di menit 11 (5 min sebelum)
 */
export function getTrainGateTimes(departureTime: string) {
  const depMinutes = timeStrToMinutes(departureTime);
  const depM = depMinutes % 60;

  let checkingMin: number;
  let closeGateMin: number;

  if (depM === 46) {
    // Exact rule: 46 -> checking 35, close gate 41
    checkingMin = depMinutes - 11;
    closeGateMin = depMinutes - 5;
  } else if (depM === 16) {
    // Exact rule: 16 -> checking 05, close gate 11
    checkingMin = depMinutes - 11;
    closeGateMin = depMinutes - 5;
  } else {
    // General fallback consistent with rules
    checkingMin = depMinutes - 11;
    closeGateMin = depMinutes - 5;
  }

  return {
    checkingMinutes: checkingMin,
    closeGateMinutes: closeGateMin,
    departureMinutes: depMinutes,
    checkingStartTime: minutesToTimeStr(checkingMin),
    closeGateTime: minutesToTimeStr(closeGateMin),
  };
}

/**
 * Calculates the exact trigger time for a custom audio alert (e.g. 5 minutes before departure).
 */
export function getCustomAlertTriggerTime(
  departureTime: string,
  alert: CustomAudioAlert
): { triggerMinutes: number; triggerTimeStr: string; label: string } {
  const { checkingMinutes, closeGateMinutes, departureMinutes } = getTrainGateTimes(departureTime);

  let baseMinutes = departureMinutes;
  let relLabel = 'sebelum keberangkatan';

  if (alert.relativeTo === 'gate_open') {
    baseMinutes = checkingMinutes;
    relLabel = 'sebelum gate dibuka';
  } else if (alert.relativeTo === 'close_gate') {
    baseMinutes = closeGateMinutes;
    relLabel = 'sebelum gate ditutup';
  }

  const triggerMinutes = baseMinutes - (alert.offsetMinutes || 0);
  const triggerTimeStr = minutesToTimeStr(triggerMinutes);

  return {
    triggerMinutes,
    triggerTimeStr,
    label: alert.label || `${alert.offsetMinutes} menit ${relLabel}`,
  };
}

/**
 * Evaluates the live status of a train against a given current time (HH:mm:ss or Date).
 */
export function evaluateTrainStatus(
  schedule: FeederSchedule,
  currentDate: Date
): ComputedTrainInfo {
  const currentTotalSeconds =
    currentDate.getHours() * 3600 +
    currentDate.getMinutes() * 60 +
    currentDate.getSeconds();

  const isDelayed = Boolean(schedule.isDelayed);

  // Compute effective departure and arrival times (using delayed values if set)
  const effectiveDepartureTime =
    (isDelayed && schedule.delayedDepartureTime)
      ? schedule.delayedDepartureTime
      : (isDelayed && schedule.delayMinutes
          ? minutesToTimeStr(timeStrToMinutes(schedule.departureTime) + schedule.delayMinutes)
          : schedule.departureTime);

  // Whoosh runs on its own fixed schedule and is not delayed when Feeder is delayed
  const effectiveWhooshDepartureTime = schedule.whooshDepartureTime;

  const effectiveFeederArrivalTime =
    (isDelayed && schedule.delayedFeederArrivalTime)
      ? schedule.delayedFeederArrivalTime
      : minutesToTimeStr(timeStrToMinutes(effectiveDepartureTime) + (schedule.feederDurationMin || 18));

  const delayMinutes =
    schedule.delayMinutes !== undefined
      ? schedule.delayMinutes
      : Math.max(0, timeStrToMinutes(effectiveDepartureTime) - timeStrToMinutes(schedule.departureTime));

  const {
    checkingMinutes,
    closeGateMinutes,
    departureMinutes,
    checkingStartTime,
    closeGateTime,
  } = getTrainGateTimes(effectiveDepartureTime);

  const depSec = departureMinutes * 60;
  const closeSec = closeGateMinutes * 60;
  const checkSec = checkingMinutes * 60;

  const secondsUntilDeparture = depSec - currentTotalSeconds;
  const minutesUntilDeparture = Math.ceil(secondsUntilDeparture / 60);

  const secondsUntilCloseGate = closeSec - currentTotalSeconds;
  const minutesUntilCloseGate = Math.ceil(secondsUntilCloseGate / 60);

  const secondsUntilGateOpen = checkSec - currentTotalSeconds;
  const minutesUntilGateOpen = Math.ceil(secondsUntilGateOpen / 60);

  let status: TrainStatus;
  let statusLabel: string;
  let statusColor: ComputedTrainInfo['statusColor'];
  let isGateOpeningSoon = false;
  let isGateJustOpened = false;
  let isApproachingDeadline = false;
  let hasDeparted = false;

  if (currentTotalSeconds >= depSec) {
    // Already departed (Sudah lewat)
    status = 'DEPARTED';
    statusLabel = 'SUDAH BERANGKAT';
    statusColor = 'gray';
    hasDeparted = true;
  } else if (isDelayed) {
    // Explicit Delayed Status as requested by user
    status = 'DELAYED';
    statusLabel = delayMinutes > 0 ? `TERLAMBAT +${delayMinutes}M` : 'TERLAMBAT';
    statusColor = 'amber';

    // Gate alerts still work according to new schedule
    if (currentTotalSeconds >= closeSec) {
      isApproachingDeadline = false;
    } else if (currentTotalSeconds >= checkSec) {
      if (currentTotalSeconds - checkSec < 60) {
        isGateJustOpened = true;
      }
      // NEW: Trigger 2 minutes before gate close
      if (secondsUntilCloseGate <= 120 && secondsUntilCloseGate > 0) {
        isApproachingDeadline = true;
      }
    } else if (secondsUntilGateOpen <= 120 && secondsUntilGateOpen > 0) {
      isGateOpeningSoon = true;
    }
  } else if (currentTotalSeconds >= closeSec) {
    // Between close gate and departure (Gate closed, preparing to leave)
    status = 'GATE_CLOSED';
    statusLabel = 'GATE DITUTUP';
    statusColor = 'rose';
  } else if (currentTotalSeconds >= checkSec) {
    // In checking period! (Gate in is currently open)
    if (currentTotalSeconds - checkSec < 60) {
      isGateJustOpened = true;
    }

    // NEW: Trigger 2 minutes before gate close
    if (secondsUntilCloseGate <= 120 && secondsUntilCloseGate > 0) {
      status = 'GATE_CLOSING_SOON';
      statusLabel = 'MENDEKATI BATAS AKHIR';
      statusColor = 'amber';
      isApproachingDeadline = true;
    } else {
      status = 'CHECKING';
      statusLabel = 'CHECKING / GATE BUKA';
      statusColor = 'emerald';
    }
  } else {
    // Before checking starts
    if (secondsUntilGateOpen <= 120 && secondsUntilGateOpen > 0) {
      status = 'GATE_OPENING_SOON';
      statusLabel = 'GATE BUKA 2 MENIT LAGI';
      statusColor = 'cyan';
      isGateOpeningSoon = true;
    } else {
      status = 'UPCOMING';
      statusLabel = 'TERJADWAL';
      statusColor = 'slate';
    }
  }

  return {
    schedule,
    checkingStartTime,
    closeGateTime,
    departureTime: schedule.departureTime,
    effectiveDepartureTime,
    effectiveWhooshDepartureTime,
    effectiveFeederArrivalTime,
    isDelayed,
    delayMinutes,
    delayReason: schedule.delayReason,
    status,
    statusLabel,
    statusColor,
    minutesUntilDeparture,
    secondsUntilDeparture,
    minutesUntilCloseGate,
    secondsUntilCloseGate,
    minutesUntilGateOpen,
    secondsUntilGateOpen,
    isGateOpeningSoon,
    isGateJustOpened,
    isApproachingDeadline,
    hasDeparted,
  };
}
