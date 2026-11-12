import React, { useState } from 'react';
import {
  X,
  Train,
  Clock,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { FeederSchedule, addMinutesToTime, calculateDurationMinutes } from '../data/scheduleData';
import { createSchedule, updateSchedule } from '../services/scheduleService';

interface ScheduleFormModalProps {
  initialData?: FeederSchedule | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
  initialData,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(initialData);

  const [whooshTrainNo, setWhooshTrainNo] = useState(initialData?.whooshTrainNo || 'G1004');
  const [feederTrainNo, setFeederTrainNo] = useState(
    initialData?.feederTrainNo || (initialData?.whooshTrainNo ? `Feeder ${initialData.whooshTrainNo}` : 'Feeder G1004')
  );
  const [departureTime, setDepartureTime] = useState(initialData?.departureTime || '05:46');
  const [whooshDepartureTime, setWhooshDepartureTime] = useState(
    initialData?.whooshDepartureTime || '06:23'
  );
  const [isActive, setIsActive] = useState(initialData?.isActive !== false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto calculate arrival time (departure + 18 mins)
  const computedArrivalTime = addMinutesToTime(departureTime, 18);
  const computedTransit = calculateDurationMinutes(computedArrivalTime, whooshDepartureTime);

  const handleWhooshNoChange = (val: string) => {
    setWhooshTrainNo(val);
    if (!isEditing) {
      setFeederTrainNo(`Feeder ${val}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whooshTrainNo || !departureTime || !whooshDepartureTime) {
      setErrorMessage('Harap isi semua kolom.');
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      if (isEditing && initialData) {
        await updateSchedule(initialData.id, {
          whooshTrainNo,
          feederTrainNo,
          departureTime,
          whooshDepartureTime,
          isActive,
        });
      } else {
        await createSchedule({
          whooshTrainNo,
          feederTrainNo,
          departureTime,
          whooshDepartureTime,
          origin: 'Bandung',
          destination: 'Padalarang',
          whooshDestination: 'Halim (Jakarta)',
          transitDurationMin: computedTransit,
          isActive,
        });
      }

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Error saving schedule:', err);
      setErrorMessage('Gagal menyimpan jadwal: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#060c1c]/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-[#0e2247] to-[#071329] border-2 border-blue-600/90 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-white">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-blue-800/80 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center border border-blue-400/40 shadow-md">
              <Train className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {isEditing ? 'Ubah Data Jadwal KA' : 'Tambah Jadwal KA Feeder Baru'}
              </h3>
              <p className="text-xs text-blue-200/80">
                Stasiun Bandung ➔ Stasiun Padalarang (Whoosh)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-blue-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-blue-200 mb-1">
                No. Kereta Whoosh
              </label>
              <input
                type="text"
                required
                value={whooshTrainNo}
                onChange={(e) => handleWhooshNoChange(e.target.value.toUpperCase())}
                placeholder="G1004"
                className="w-full bg-[#050e24] border border-blue-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-blue-200 mb-1">
                Nama/No. KA Feeder
              </label>
              <input
                type="text"
                required
                value={feederTrainNo}
                onChange={(e) => setFeederTrainNo(e.target.value)}
                placeholder="Feeder G1004"
                className="w-full bg-[#050e24] border border-blue-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-blue-200 mb-1">
                Berangkat dari Bandung (WIB)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-blue-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  pattern="[0-2][0-9]:[0-5][0-9]"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  placeholder="05:46"
                  className="w-full bg-[#050e24] border border-blue-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Format: HH:mm (cth: 05:46)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-cyan-300 mb-1">
                Waktu Keberangkatan Whoosh (WIB)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-cyan-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  pattern="[0-2][0-9]:[0-5][0-9]"
                  value={whooshDepartureTime}
                  onChange={(e) => setWhooshDepartureTime(e.target.value)}
                  placeholder="06:23"
                  className="w-full bg-[#050e24] border border-cyan-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">Di Stasiun Padalarang ke Halim</span>
            </div>
          </div>

          {/* Auto-computed info preview */}
          <div className="bg-[#050f24] border border-blue-800/80 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <div>
              <div className="text-slate-400">Tiba di Padalarang (+18 mnt):</div>
              <div className="font-mono text-white font-bold text-sm mt-0.5">
                {computedArrivalTime} WIB
              </div>
            </div>
            <div>
              <div className="text-slate-400">Waktu Transit:</div>
              <div className="font-mono text-cyan-300 font-bold text-sm mt-0.5">
                {computedTransit} Menit
              </div>
            </div>
          </div>

          {/* Active Schedule Toggle */}
          <div className="flex items-center justify-between bg-[#050f24] border border-blue-800/80 rounded-xl p-3.5">
            <div>
              <div className="text-xs font-bold text-white">Status Jadwal Aktif</div>
              <div className="text-[11px] text-blue-300/80">
                Tampilkan jadwal ini di layar publik display stasiun
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-blue-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-blue-950 hover:bg-blue-900 border border-blue-800 text-xs font-semibold text-slate-300 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-900 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambahkan Jadwal'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
