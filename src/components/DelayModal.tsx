import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Clock,
  Train,
  CheckCircle2,
  X,
  RotateCcw,
  ArrowRight,
  Info,
} from 'lucide-react';
import { FeederSchedule, addMinutesToTime } from '../data/scheduleData';
import { timeStrToMinutes, minutesToTimeStr } from '../utils/scheduleRules';

interface DelayModalProps {
  schedule: FeederSchedule | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    scheduleId: string,
    delayData: {
      isDelayed: boolean;
      delayMinutes: number;
      delayedDepartureTime: string;
      delayedWhooshDepartureTime: string;
      delayedFeederArrivalTime: string;
      delayReason?: string;
    }
  ) => Promise<void>;
}

export const DelayModal: React.FC<DelayModalProps> = ({
  schedule,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen || !schedule) return null;

  const [isDelayed, setIsDelayed] = useState<boolean>(schedule.isDelayed ?? false);
  const [delayMinutes, setDelayMinutes] = useState<number>(schedule.delayMinutes ?? 10);
  const [delayedDepartureTime, setDelayedDepartureTime] = useState<string>(
    schedule.delayedDepartureTime || addMinutesToTime(schedule.departureTime, 10)
  );
  const [delayedWhooshDepartureTime, setDelayedWhooshDepartureTime] = useState<string>(
    schedule.delayedWhooshDepartureTime || addMinutesToTime(schedule.whooshDepartureTime, 10)
  );
  const [delayReason, setDelayReason] = useState<string>(schedule.delayReason || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Sync state if schedule changes
  useEffect(() => {
    if (schedule) {
      const currentlyDelayed = schedule.isDelayed ?? false;
      setIsDelayed(currentlyDelayed);
      const mins = schedule.delayMinutes ?? 10;
      setDelayMinutes(mins);
      setDelayedDepartureTime(
        schedule.delayedDepartureTime || addMinutesToTime(schedule.departureTime, mins)
      );
      setDelayedWhooshDepartureTime(
        schedule.delayedWhooshDepartureTime || addMinutesToTime(schedule.whooshDepartureTime, mins)
      );
      setDelayReason(schedule.delayReason || '');
    }
  }, [schedule]);

  // Handler for quick delay preset buttons (+5m, +10m, +15m, +20m, +30m, etc.)
  const handleApplyPreset = (presetMins: number) => {
    setIsDelayed(true);
    setDelayMinutes(presetMins);
    const newFeeder = addMinutesToTime(schedule.departureTime, presetMins);
    setDelayedDepartureTime(newFeeder);
    setDelayedWhooshDepartureTime(schedule.whooshDepartureTime);
  };

  // When manual feeder time changes
  const handleFeederTimeChange = (newTime: string) => {
    setDelayedDepartureTime(newTime);
    const origMins = timeStrToMinutes(schedule.departureTime);
    const newMins = timeStrToMinutes(newTime);
    const diff = newMins >= origMins ? newMins - origMins : (newMins + 1440) - origMins;
    setDelayMinutes(diff);
    // Whoosh remains on fixed schedule
    setDelayedWhooshDepartureTime(schedule.whooshDepartureTime);
  };

  const handleResetToOnTime = async () => {
    setIsSaving(true);
    try {
      await onSave(schedule.id, {
        isDelayed: false,
        delayMinutes: 0,
        delayedDepartureTime: '',
        delayedWhooshDepartureTime: '',
        delayedFeederArrivalTime: '',
        delayReason: '',
      });
      onClose();
    } catch (e) {
      console.error('Failed to reset delay:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDelay = async () => {
    setIsSaving(true);
    try {
      const feederArrival = addMinutesToTime(
        delayedDepartureTime,
        schedule.feederDurationMin || 18
      );

      await onSave(schedule.id, {
        isDelayed,
        delayMinutes: isDelayed ? Math.max(1, delayMinutes) : 0,
        delayedDepartureTime: isDelayed ? delayedDepartureTime : '',
        delayedWhooshDepartureTime: isDelayed ? delayedWhooshDepartureTime : '',
        delayedFeederArrivalTime: isDelayed ? feederArrival : '',
        delayReason: isDelayed ? delayReason : '',
      });
      onClose();
    } catch (e) {
      console.error('Failed to save delay:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const commonReasons = [
    'Pemeriksaan Rangkaian KA',
    'Antrean Masuk Jalur',
    'Menunggu Kereta Sambungan',
    'Kendala Teknis Operasional',
    'Cuaca Buruk / Pemeliharaan',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      id="delay-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-[#0b1b3b] border-2 border-amber-500/80 rounded-2xl max-w-xl w-full text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        id="delay-modal-container"
      >
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 px-6 py-4 flex items-center justify-between text-slate-950 font-bold">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-950/20 rounded-xl">
              <AlertTriangle className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">
                Kelola Keterlambatan Kereta
              </h2>
              <p className="text-xs text-slate-950/80 font-medium">
                Atur status delay & waktu baru keberangkatan Feeder dan Whoosh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-950/80 hover:text-slate-950 hover:bg-black/10 transition-colors"
            title="Tutup"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Train Identity Banner */}
          <div className="bg-[#071329] border border-blue-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center text-white font-black shadow-md">
                <Train className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xl font-black text-white">
                    {schedule.whooshTrainNo}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-red-600 text-white font-black uppercase">
                    Whoosh
                  </span>
                </div>
                <div className="text-xs text-blue-300 font-mono">
                  {schedule.feederTrainNo} (Bandung ➔ Padalarang)
                </div>
              </div>
            </div>

            {/* Current Status Pill */}
            <div>
              {schedule.isDelayed ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-slate-950 border border-amber-400 shadow-md">
                  <AlertTriangle className="w-3.5 h-3.5 fill-slate-950" />
                  TERLAMBAT (+{schedule.delayMinutes ?? 0}m)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  TEPAT WAKTU (ON TIME)
                </span>
              )}
            </div>
          </div>

          {/* Original Schedule Reference */}
          <div className="grid grid-cols-2 gap-3 bg-[#0f244a]/60 border border-blue-900/60 rounded-xl p-3.5 text-xs">
            <div>
              <span className="text-blue-300 block mb-1">Jadwal Asli Feeder (Bandung):</span>
              <span className="font-mono text-base font-black text-white">
                {schedule.departureTime} WIB
              </span>
            </div>
            <div>
              <span className="text-blue-300 block mb-1">Jadwal Asli Whoosh (Padalarang):</span>
              <span className="font-mono text-base font-black text-amber-300">
                {schedule.whooshDepartureTime} WIB
              </span>
            </div>
          </div>

          {/* Delay Toggle Switch */}
          <div className="flex items-center justify-between p-4 bg-[#0a1835] border border-amber-500/40 rounded-xl">
            <div>
              <label htmlFor="delay-status-toggle" className="font-bold text-white text-sm block cursor-pointer">
                Aktifkan Status Keterlambatan
              </label>
              <p className="text-xs text-blue-300 mt-0.5">
                PIDS akan menampilkan badge "TERLAMBAT" dan waktu baru
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="delay-status-toggle"
                type="checkbox"
                checked={isDelayed}
                onChange={(e) => setIsDelayed(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Quick Delay Presets */}
          {isDelayed && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Pilihan Cepat Tambahan Waktu Terlambat:
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[5, 10, 15, 20, 30, 45].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => handleApplyPreset(mins)}
                    className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                      delayMinutes === mins
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md scale-105'
                        : 'bg-[#0f244a] text-blue-200 border-blue-700/60 hover:bg-[#163366] hover:border-amber-400'
                    }`}
                  >
                    +{mins} Menit
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Time Input Fields */}
          {isDelayed && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#071329] border border-blue-800/80 rounded-xl p-4">
              {/* Feeder Departure Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Keberangkatan Feeder Baru (Bandung):
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={delayedDepartureTime}
                    onChange={(e) => handleFeederTimeChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-[#0b1c3e] border-2 border-amber-500/80 rounded-lg text-white font-mono text-lg font-black tracking-wider focus:outline-none focus:border-amber-400"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-blue-300 font-bold pointer-events-none">
                    WIB
                  </span>
                </div>
                <div className="text-[11px] text-blue-300/80 flex items-center gap-1">
                  <span>Asli: {schedule.departureTime}</span>
                  <ArrowRight className="w-3 h-3 text-amber-400" />
                  <span className="text-amber-400 font-bold">+{delayMinutes} mnt</span>
                </div>
              </div>

              {/* Whoosh Departure Info (Fixed Schedule) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Train className="w-3.5 h-3.5 text-amber-400" />
                  Keberangkatan Whoosh (Padalarang):
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={schedule.whooshDepartureTime}
                    disabled
                    className="w-full px-3 py-2 bg-[#08152e] border border-blue-900/80 rounded-lg text-amber-300/90 font-mono text-lg font-black tracking-wider cursor-not-allowed opacity-90"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-blue-300 font-bold pointer-events-none">
                    WIB
                  </span>
                </div>
                <div className="text-[11px] text-blue-300/80 flex items-center gap-1">
                  <span>Jadwal Tetap Padalarang ➔ Halim (Tidak Berubah)</span>
                </div>
              </div>
            </div>
          )}

          {/* Delay Reason (Optional) */}
          {isDelayed && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-blue-200 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-400" />
                Alasan Keterlambatan (Opsional):
              </label>
              <input
                type="text"
                placeholder="Contoh: Pemeriksaan Rangkaian KA, Antrean Jalur..."
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#0a1835] border border-blue-700/60 rounded-lg text-sm text-white placeholder-blue-400/50 focus:outline-none focus:border-blue-400"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {commonReasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setDelayReason(reason)}
                    className="px-2.5 py-1 rounded-md text-[11px] bg-[#0f244a] text-blue-200 border border-blue-800 hover:border-amber-400 transition-colors"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-[#071329] border-t border-blue-900 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          {schedule.isDelayed ? (
            <button
              type="button"
              onClick={handleResetToOnTime}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Kembalikan Tepat Waktu (On Time)
            </button>
          ) : (
            <div></div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleSaveDelay}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSaving ? 'Menyimpan...' : 'Simpan Keterlambatan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
