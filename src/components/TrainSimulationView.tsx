import React, { useState, useEffect, useMemo } from 'react';
import {
  Train,
  Clock,
  Navigation,
  Info,
  AlertCircle,
  Zap,
  MapPin,
  Flame,
  Layers,
  ChevronRight,
  Radio,
  Map as MapIcon,
} from 'lucide-react';
import { FeederSchedule } from '../data/scheduleData';
import { RailwayGoogleMapView } from './RailwayGoogleMapView';

interface TrainSimulationViewProps {
  schedules: FeederSchedule[];
  initialScheduleId?: string;
  onBackToDashboard?: () => void;
}

// Convert "HH:mm:ss" or "HH:mm" to seconds from midnight
function timeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 3600 + m * 60 + s;
}

// Convert seconds from midnight to "HH:mm:ss"
function secondsToTimeString(sec: number): string {
  const norm = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(norm / 3600);
  const m = Math.floor((norm % 3600) / 60);
  const s = norm % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Format seconds into MM:SS
function formatMinutesSeconds(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Station Coordinates on Schematic SVG Map:
// Padalarang (Km 130) at X = 130
// Cimahi (Km 140) at X = 540
// Bandung (Km 155) at X = 890
export const STATION_PDL_X = 130;
export const STATION_CMI_X = 540;
export const STATION_BDG_X = 890;

export const TrainSimulationView: React.FC<TrainSimulationViewProps> = ({
  schedules,
  initialScheduleId,
  onBackToDashboard,
}) => {
  // Find initial schedule (prefer 07:46 or initialScheduleId or first schedule)
  const defaultSchedule = useMemo(() => {
    if (initialScheduleId) {
      const found = schedules.find((s) => s.id === initialScheduleId);
      if (found) return found;
    }
    // Search for 07:46 (user's requested test case)
    const trip746 = schedules.find((s) => s.departureTime === '07:46');
    return trip746 || schedules[0] || null;
  }, [schedules, initialScheduleId]);

  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(
    defaultSchedule ? defaultSchedule.id : ''
  );
  const [viewMode, setViewMode] = useState<'google_maps' | 'schematic'>('google_maps');

  const activeSchedule = useMemo(() => {
    return schedules.find((s) => s.id === selectedScheduleId) || defaultSchedule;
  }, [schedules, selectedScheduleId, defaultSchedule]);

  // If activeSchedule has delay, use delayedDepartureTime, else regular departureTime
  const depBandungTime = activeSchedule?.isDelayed && activeSchedule.delayedDepartureTime
    ? activeSchedule.delayedDepartureTime
    : activeSchedule?.departureTime || '07:46';

  const depWhooshTime = activeSchedule?.isDelayed && activeSchedule.delayedWhooshDepartureTime
    ? activeSchedule.delayedWhooshDepartureTime
    : activeSchedule?.whooshDepartureTime || '08:23';

  // Base trip timing parameters for Down Train (Bandung -> Padalarang):
  // User model: 07:46 departs Bandung -> 07:58 arrives Cimahi (12 min) -> stops 2 min (07:58-08:00) -> 08:04 arrives Padalarang (4 min)
  const t_dep_bdg_sec = useMemo(() => timeToSeconds(depBandungTime), [depBandungTime]);
  const t_arr_cmi_sec = t_dep_bdg_sec + 12 * 60; // +12 min (07:58)
  const t_dep_cmi_sec = t_arr_cmi_sec + 2 * 60;  // +2 min dwell (08:00)
  const t_arr_pdl_sec = t_dep_cmi_sec + 4 * 60;  // +4 min travel (08:04)

  // Opposite Up Train (Padalarang -> Bandung - Kereta Lawan):
  // User model: 07:41 departs Padalarang -> 07:47 arrives Cimahi (6 min) -> stops 2 min (07:47-07:49) -> 07:59 arrives Bandung (10 min)
  const u_dep_pdl_sec = t_dep_bdg_sec - 5 * 60;  // 07:41
  const u_arr_cmi_sec = u_dep_pdl_sec + 6 * 60;  // 07:47 (tiba Cimahi)
  const u_dep_cmi_sec = u_arr_cmi_sec + 2 * 60;  // 07:49 (+2 min dwell berhenti di Cimahi)
  const u_arr_bdg_sec = u_dep_cmi_sec + 10 * 60; // 07:59 (tiba Stasiun Bandung)

  // Live Clock: Sinkronisasi waktu langsung dari jam sistem (real-time clock)
  const getInitialSeconds = () => {
    const d = new Date();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  };

  const [simClockSec, setSimClockSec] = useState<number>(getInitialSeconds);

  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setSimClockSec(d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // ==================== CALCULATION FOR DOWN TRAIN (BDG -> CMI -> PDL) ====================
  // Moves from Bandung (X = 890) -> Cimahi (X = 540) -> Padalarang (X = 130)
  const downTrainState = useMemo(() => {
    const t = simClockSec;

    // Status & positioning
    let status: 'STANDBY_BDG' | 'RUNNING_BDG_CMI' | 'DWELL_CMI' | 'RUNNING_CMI_PDL' | 'ARRIVED_PDL';
    let speed = 0; // km/h
    let currentSegment = 'Stasiun Bandung (Peron 5)';
    let dwellRemainingSec = 0;
    let etaSec = 0;
    let svgX = STATION_BDG_X;

    if (t < t_dep_bdg_sec) {
      status = 'STANDBY_BDG';
      svgX = STATION_BDG_X;
      speed = 0;
      currentSegment = 'Stasiun Bandung (Persiapan Berangkat)';
      etaSec = t_dep_bdg_sec - t;
    } else if (t < t_arr_cmi_sec) {
      status = 'RUNNING_BDG_CMI';
      const legDuration = t_arr_cmi_sec - t_dep_bdg_sec; // 12 min
      const legProgress = Math.max(0, Math.min(1, (t - t_dep_bdg_sec) / legDuration)); // 0 to 1
      // Smooth travel from BDG (890) directly to Cimahi (540)
      svgX = STATION_BDG_X - legProgress * (STATION_BDG_X - STATION_CMI_X);

      // Smooth bell curve speed: 0 -> 78 km/h -> 0
      if (legProgress < 0.2) {
        speed = Math.round((legProgress / 0.2) * 78);
      } else if (legProgress > 0.8) {
        speed = Math.round(((1 - legProgress) / 0.2) * 78);
      } else {
        speed = 78;
      }

      if (legProgress < 0.25) currentSegment = 'Petak Bandung - Ciroyom (Km 153)';
      else if (legProgress < 0.5) currentSegment = 'Petak Ciroyom - Andir (Km 150)';
      else if (legProgress < 0.75) currentSegment = 'Petak Andir - Cimindi (Km 143)';
      else currentSegment = 'Menuju Stasiun Cimahi (Km 140)';

      etaSec = t_arr_cmi_sec - t;
    } else if (t < t_dep_cmi_sec) {
      status = 'DWELL_CMI';
      svgX = STATION_CMI_X; // EXACTLY 540 AT CIMAHI STATION
      speed = 0;
      currentSegment = 'Stasiun Cimahi (Jalur 1 - Berhenti 2 Menit)';
      dwellRemainingSec = t_dep_cmi_sec - t;
      etaSec = t_dep_cmi_sec - t;
    } else if (t < t_arr_pdl_sec) {
      status = 'RUNNING_CMI_PDL';
      const legDuration = t_arr_pdl_sec - t_dep_cmi_sec; // 4 min
      const legProgress = Math.max(0, Math.min(1, (t - t_dep_cmi_sec) / legDuration)); // 0 to 1
      // Smooth travel from Cimahi (540) directly to Padalarang (130)
      svgX = STATION_CMI_X - legProgress * (STATION_CMI_X - STATION_PDL_X);

      if (legProgress < 0.2) {
        speed = Math.round((legProgress / 0.2) * 72);
      } else if (legProgress > 0.8) {
        speed = Math.round(((1 - legProgress) / 0.2) * 72);
      } else {
        speed = 72;
      }

      if (legProgress < 0.5) currentSegment = 'Petak Cimahi - Gadobangkong (Km 133)';
      else currentSegment = 'Menuju Stasiun Padalarang (Km 130)';

      etaSec = t_arr_pdl_sec - t;
    } else {
      status = 'ARRIVED_PDL';
      svgX = STATION_PDL_X; // EXACTLY 130 AT PADALARANG
      speed = 0;
      currentSegment = 'Stasiun Padalarang (Tiba - Transit Whoosh)';
      etaSec = 0;
    }

    // Overall progress ratio: 0 (BDG) to 1 (PDL)
    const progressRatio = Math.max(0, Math.min(1, (STATION_BDG_X - svgX) / (STATION_BDG_X - STATION_PDL_X)));

    return {
      status,
      progressRatio,
      speed,
      currentSegment,
      dwellRemainingSec,
      etaSec,
      svgX,
      trainNo: activeSchedule?.feederTrainNo || 'KF-1012',
      whooshNo: activeSchedule?.whooshTrainNo || 'G1012',
    };
  }, [simClockSec, t_dep_bdg_sec, t_arr_cmi_sec, t_dep_cmi_sec, t_arr_pdl_sec, activeSchedule]);

  // ==================== CALCULATION FOR UP TRAIN (PDL -> CMI -> BDG - KERETA LAWAN) ====================
  // Moves from Padalarang (X = 130) -> Cimahi (X = 540) -> Bandung (X = 890)
  // Stops at Cimahi for 2 minutes from 07:47 to 07:49 WIB
  const upTrainState = useMemo(() => {
    const t = simClockSec;

    let status: 'STANDBY_PDL' | 'RUNNING_PDL_CMI' | 'DWELL_CMI' | 'RUNNING_CMI_BDG' | 'ARRIVED_BDG';
    let speed = 0;
    let currentSegment = 'Stasiun Padalarang';
    let dwellRemainingSec = 0;
    let etaSec = 0;
    let svgX = STATION_PDL_X;

    if (t < u_dep_pdl_sec) {
      status = 'STANDBY_PDL';
      svgX = STATION_PDL_X;
      speed = 0;
      currentSegment = 'Stasiun Padalarang (Persiapan Berangkat)';
      etaSec = u_dep_pdl_sec - t;
    } else if (t < u_arr_cmi_sec) {
      status = 'RUNNING_PDL_CMI';
      const legDuration = u_arr_cmi_sec - u_dep_pdl_sec; // 6 min (07:41 to 07:47)
      const legProgress = Math.max(0, Math.min(1, (t - u_dep_pdl_sec) / legDuration)); // 0 to 1
      // Smooth travel from Padalarang (130) directly to Cimahi (540)
      svgX = STATION_PDL_X + legProgress * (STATION_CMI_X - STATION_PDL_X);

      if (legProgress < 0.2) speed = Math.round((legProgress / 0.2) * 72);
      else if (legProgress > 0.8) speed = Math.round(((1 - legProgress) / 0.2) * 72);
      else speed = 72;

      if (legProgress < 0.5) currentSegment = 'Petak Padalarang - Gadobangkong (Km 133)';
      else currentSegment = 'Menuju Stasiun Cimahi (Km 140)';

      etaSec = u_arr_cmi_sec - t;
    } else if (t < u_dep_cmi_sec) {
      status = 'DWELL_CMI';
      svgX = STATION_CMI_X; // EXACTLY 540 AT CIMAHI STATION
      speed = 0;
      currentSegment = 'Stasiun Cimahi (Jalur 2 - Berhenti 2 Menit)';
      dwellRemainingSec = u_dep_cmi_sec - t;
      etaSec = u_dep_cmi_sec - t;
    } else if (t < u_arr_bdg_sec) {
      status = 'RUNNING_CMI_BDG';
      const legDuration = u_arr_bdg_sec - u_dep_cmi_sec; // 10 min (07:49 to 07:59)
      const legProgress = Math.max(0, Math.min(1, (t - u_dep_cmi_sec) / legDuration)); // 0 to 1
      // Smooth travel from Cimahi (540) directly to Bandung (890)
      svgX = STATION_CMI_X + legProgress * (STATION_BDG_X - STATION_CMI_X);

      if (legProgress < 0.2) speed = Math.round((legProgress / 0.2) * 80);
      else if (legProgress > 0.8) speed = Math.round(((1 - legProgress) / 0.2) * 80);
      else speed = 80;

      if (legProgress < 0.3) currentSegment = 'Petak Cimahi - Cimindi (Km 143)';
      else if (legProgress < 0.6) currentSegment = 'Petak Cimindi - Andir (Km 150)';
      else if (legProgress < 0.85) currentSegment = 'Petak Andir - Ciroyom (Km 153)';
      else currentSegment = 'Menuju Stasiun Bandung (Km 155)';

      etaSec = u_arr_bdg_sec - t;
    } else {
      status = 'ARRIVED_BDG';
      svgX = STATION_BDG_X; // EXACTLY 890 AT BANDUNG
      speed = 0;
      currentSegment = 'Stasiun Bandung (Tiba di Tujuan Akhir)';
      etaSec = 0;
    }

    // Overall progress ratio: 0 (PDL) to 1 (BDG)
    const progressRatio = Math.max(0, Math.min(1, (svgX - STATION_PDL_X) / (STATION_BDG_X - STATION_PDL_X)));

    // Number of opposite train (e.g. KF-1011 or KF-XX)
    const numPart = parseInt((activeSchedule?.whooshTrainNo || 'G1012').substring(1), 10);
    const upTrainNo = `KF-${numPart - 1 > 1000 ? numPart - 1 : 1011}`;

    return {
      status,
      progressRatio,
      speed,
      currentSegment,
      dwellRemainingSec,
      etaSec,
      svgX,
      trainNo: upTrainNo,
    };
  }, [simClockSec, u_dep_pdl_sec, u_arr_cmi_sec, u_dep_cmi_sec, u_arr_bdg_sec, activeSchedule]);

  // Check if trains are passing each other (persilangan)
  const isPassingEachOther = useMemo(() => {
    const diff = Math.abs(downTrainState.svgX - upTrainState.svgX);
    const bothMoving =
      downTrainState.speed > 0 &&
      upTrainState.speed > 0 &&
      downTrainState.status !== 'STANDBY_BDG' &&
      upTrainState.status !== 'STANDBY_PDL';
    return diff < 85 && bothMoving;
  }, [downTrainState, upTrainState]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Navigation, Title & Live Status */}
      <div className="bg-gradient-to-r from-[#07152e] via-[#0b1e42] to-[#08152e] border-2 border-blue-700/80 rounded-2xl p-5 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                MONITORING LIVE PERJALANAN KA FEEDER
              </span>
              <span className="px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-bold font-mono">
                BANDUNG ⟷ CIMAHI ⟷ PADALARANG
              </span>
              {activeSchedule?.isDelayed && (
                <span className="px-2.5 py-1 rounded-md bg-amber-500 text-slate-950 text-xs font-black uppercase flex items-center gap-1 animate-pulse">
                  <AlertCircle className="w-3.5 h-3.5 fill-slate-950" />
                  Jadwal Berstatus Terlambat (+{activeSchedule.delayMinutes ?? 0}m)
                </span>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-1.5 flex items-center gap-2">
              <span>Live Tracking Kereta Arah Bandung & Arah Padalarang</span>
            </h2>
            <p className="text-xs text-blue-200/80 mt-1 max-w-2xl">
              Memantau pergerakan dinamis <strong>Kereta Arah Padalarang</strong> dan <strong>Kereta Arah Bandung</strong> secara langsung (real-time) dengan pemberhentian 2 menit di Stasiun Cimahi.
            </p>
          </div>

          {/* Quick Schedule Switcher, Live Clock Indicator & Back button */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Real-time Clock Badge */}
            <div className="flex items-center gap-2.5 bg-[#050e1f] border-2 border-emerald-500/60 rounded-xl px-3.5 py-2 shadow-inner">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
              <div>
                <div className="text-[9px] uppercase font-black tracking-widest text-emerald-400">
                  WAKTU LIVE SISTEM
                </div>
                <div className="text-lg font-black font-mono tracking-tight text-white flex items-baseline gap-1">
                  <span>{secondsToTimeString(simClockSec)}</span>
                  <span className="text-[10px] font-sans text-emerald-300 font-bold">WIB</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-[#050e1f] border border-blue-800/80 rounded-xl px-3 py-2">
              <label htmlFor="schedule-select" className="text-xs text-blue-300 font-semibold whitespace-nowrap">
                Pilih Jadwal:
              </label>
              <select
                id="schedule-select"
                value={selectedScheduleId}
                onChange={(e) => setSelectedScheduleId(e.target.value)}
                className="bg-transparent text-white text-xs font-black outline-none cursor-pointer"
              >
                {schedules.map((item) => (
                  <option key={item.id} value={item.id} className="bg-[#0c1c38] text-white">
                    {item.departureTime} WIB (Whoosh {item.whooshTrainNo}) {item.isDelayed ? '⚠️ Delay' : ''}
                  </option>
                ))}
              </select>
            </div>

            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="px-3.5 py-2 rounded-xl bg-blue-900/80 hover:bg-blue-800 border border-blue-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow"
              >
                <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                <span>Ke Tabel Jadwal</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* View Mode Selector: Google Maps vs Diagram Skematik */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-[#061226] via-[#091a38] to-[#061226] border-2 border-blue-700/80 rounded-2xl p-3 shadow-xl">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('google_maps')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'google_maps'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg ring-2 ring-cyan-400/50 scale-[1.02]'
                : 'text-blue-300 hover:text-white hover:bg-blue-900/50'
            }`}
          >
            <MapIcon className="w-4 h-4 text-cyan-200" />
            <span>Peta Google Maps (Jalur Rel)</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[10px] font-black uppercase">
              Aktif
            </span>
          </button>

          <button
            onClick={() => setViewMode('schematic')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer ${
              viewMode === 'schematic'
                ? 'bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-lg ring-2 ring-indigo-400/50 scale-[1.02]'
                : 'text-blue-300 hover:text-white hover:bg-blue-900/50'
            }`}
          >
            <Layers className="w-4 h-4 text-indigo-300" />
            <span>Diagram Rel Skematik (SVG)</span>
          </button>
        </div>

        <div className="text-xs text-blue-200/80 font-medium px-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>
            {viewMode === 'google_maps'
              ? 'Model Google Maps dengan jalur rel & lintasan KA Feeder Bandung - Cimahi - Padalarang'
              : 'Model diagram skematik teknis koridor jalur ganda (double track)'}
          </span>
        </div>
      </div>

      {/* View 1: GOOGLE MAPS CORRIDOR VIEW */}
      {viewMode === 'google_maps' && (
        <RailwayGoogleMapView
          simClockSec={simClockSec}
          t_dep_bdg_sec={t_dep_bdg_sec}
          t_arr_cmi_sec={t_arr_cmi_sec}
          t_dep_cmi_sec={t_dep_cmi_sec}
          t_arr_pdl_sec={t_arr_pdl_sec}
          u_dep_pdl_sec={u_dep_pdl_sec}
          u_arr_cmi_sec={u_arr_cmi_sec}
          u_dep_cmi_sec={u_dep_cmi_sec}
          u_arr_bdg_sec={u_arr_bdg_sec}
          downTrainState={downTrainState}
          upTrainState={upTrainState}
          isPassingEachOther={isPassingEachOther}
          depWhooshTime={depWhooshTime}
        />
      )}

      {/* View 2: SCHEMATIC SVG TRACK DIAGRAM */}
      {viewMode === 'schematic' && (
      <div className="bg-gradient-to-b from-[#050d1e] to-[#08162f] border-2 border-blue-700/80 rounded-2xl p-5 shadow-2xl relative overflow-hidden">
        {/* Background Grid Accent */}
        <div
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        ></div>

        {/* Header inside Map Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 relative z-10">
          <div>
            <div className="text-xs font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-cyan-400" />
              PETA SCHEMATIC PERJALANAN & JALUR GANDA (DOUBLE TRACK)
            </div>
            <div className="text-xs text-blue-200/70">
              Koridor KA Cepat Feeder: Stasiun Padalarang (Km 130) ⟷ Stasiun Cimahi (Km 140) ⟷ Stasiun Bandung (Km 155)
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Persilangan Banner / Alert */}
            {isPassingEachOther && (
              <div className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg animate-bounce border-2 border-amber-300">
                <Flame className="w-4 h-4 fill-slate-950 text-slate-950" />
                <span>PERSILANGAN KERETA! Kereta Arah Padalarang & Arah Bandung Berpapasan</span>
              </div>
            )}

            {/* Cimahi Stop Banner - Arah Padalarang */}
            {downTrainState.status === 'DWELL_CMI' && (
              <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg animate-pulse border-2 border-emerald-300">
                <Clock className="w-4 h-4 fill-slate-950 text-slate-950" />
                <span>KERETA ARAH PADALARANG BERHENTI DI CIMAHI (Sisa: {formatMinutesSeconds(downTrainState.dwellRemainingSec)})</span>
              </div>
            )}

            {/* Cimahi Stop Banner - Arah Bandung */}
            {upTrainState.status === 'DWELL_CMI' && (
              <div className="px-3.5 py-1.5 rounded-xl bg-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg animate-pulse border-2 border-teal-200">
                <Clock className="w-4 h-4 fill-slate-950 text-slate-950" />
                <span>KERETA ARAH BANDUNG BERHENTI DI CIMAHI (Sisa: {formatMinutesSeconds(upTrainState.dwellRemainingSec)})</span>
              </div>
            )}
          </div>
        </div>

        {/* SVG Railway Corridor Map */}
        <div className="w-full overflow-x-auto pb-2">
          <div className="min-w-[950px] relative">
            <svg
              viewBox="0 0 1020 340"
              className="w-full h-auto drop-shadow-md select-none"
              style={{ minHeight: '320px' }}
            >
              <defs>
                {/* Filters for Realistic Lighting & Shadows */}
                <filter id="train-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="1.8" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <filter id="beam-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3" result="glow" />
                  <feComposite in="SourceGraphic" in2="glow" operator="over" />
                </filter>
                <filter id="tail-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2.5" result="glow" />
                  <feComposite in="SourceGraphic" in2="glow" operator="over" />
                </filter>
                <filter id="cmi-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>

                {/* Metallic Train Body Paint Gradient (Pearl White / Silver Sheen) */}
                <linearGradient id="feeder-metallic-white" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="25%" stopColor="#f8fafc" />
                  <stop offset="70%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#cbd5e1" />
                </linearGradient>

                {/* Authentic KCIC Crimson Maroon Red Stripe Gradient */}
                <linearGradient id="feeder-crimson-red" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ef4444" />
                  <stop offset="35%" stopColor="#dc2626" />
                  <stop offset="100%" stopColor="#991b1b" />
                </linearGradient>

                {/* Headlight Beams (Left & Right) */}
                <linearGradient id="beam-left" x1="100%" y1="0%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.55" />
                  <stop offset="30%" stopColor="#fef08a" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="beam-right" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.55" />
                  <stop offset="30%" stopColor="#fef08a" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                </linearGradient>

                {/* Whoosh High Speed Train gradient */}
                <linearGradient id="whooshGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#991b1b" />
                  <stop offset="45%" stopColor="#dc2626" />
                  <stop offset="100%" stopColor="#f1f5f9" />
                </linearGradient>
              </defs>

              {/* ================= BACKGROUND LANDSCAPE & TERRAIN ================= */}
              {/* Mountain silhouettes of Parahyangan Basin */}
              <path
                d="M 50 120 Q 200 40 380 120 T 700 120 T 1000 120 L 1000 130 L 50 130 Z"
                fill="#0c1f3d"
                opacity="0.4"
              />
              <path
                d="M 20 125 Q 160 70 320 125 T 600 125 T 980 125 L 980 130 L 20 130 Z"
                fill="#0e274d"
                opacity="0.5"
              />

              {/* ================= RAILWAY TRACK BED & BALLAST ================= */}
              {/* Ballast bed background */}
              <rect x="70" y="145" width="880" height="70" rx="8" fill="#091426" stroke="#1e3a8a" strokeWidth="1.5" />

              {/* Railway Ties / Bantalan Rel (Horizontal dashed lines) */}
              <line
                x1="80"
                y1="165"
                x2="940"
                y2="165"
                stroke="#1e293b"
                strokeWidth="18"
                strokeDasharray="4 6"
              />
              <line
                x1="80"
                y1="195"
                x2="940"
                y2="195"
                stroke="#1e293b"
                strokeWidth="18"
                strokeDasharray="4 6"
              />

              {/* TRACK 1: JALUR HILIR (Bandung -> Padalarang, Top Track Y=165) */}
              <line
                x1="80"
                y1="165"
                x2="940"
                y2="165"
                stroke={downTrainState.speed > 0 ? '#38bdf8' : '#334155'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* TRACK 2: JALUR HULU (Padalarang -> Bandung, Bottom Track Y=195) */}
              <line
                x1="80"
                y1="195"
                x2="940"
                y2="195"
                stroke={upTrainState.speed > 0 ? '#f43f5e' : '#334155'}
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Track Labels & Direction Arrows */}
              <text x="85" y="156" fill="#38bdf8" fontSize="10" fontWeight="bold" fontFamily="monospace">
                ◄ Jalur Hilir (BDG ➔ PDL)
              </text>
              <text x="85" y="214" fill="#f43f5e" fontSize="10" fontWeight="bold" fontFamily="monospace">
                ► Jalur Hulu (PDL ➔ BDG)
              </text>

              {/* Wesel / Track Cross-over at Cimahi */}
              <line x1="510" y1="165" x2="530" y2="195" stroke="#475569" strokeWidth="2" strokeDasharray="3 3" />
              <line x1="550" y1="195" x2="570" y2="165" stroke="#475569" strokeWidth="2" strokeDasharray="3 3" />

              {/* ================= INTERMEDIATE WAYPOINTS (ANDIR, CIMINDI, GADOBANGKONG) ================= */}
              {/* Ciroyom Km 153 */}
              <g transform="translate(830, 180)">
                <circle cx="0" cy="0" r="3" fill="#64748b" />
                <text x="0" y="38" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
                  Ciroyom
                </text>
                <text x="0" y="48" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                  Km 153
                </text>
              </g>

              {/* Andir Km 150 */}
              <g transform="translate(760, 180)">
                <circle cx="0" cy="0" r="4" fill="#64748b" />
                <line x1="0" y1="-25" x2="0" y2="25" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                <text x="0" y="38" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
                  Andir
                </text>
                <text x="0" y="48" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                  Km 150
                </text>
              </g>

              {/* Cimindi Km 143 */}
              <g transform="translate(660, 180)">
                <circle cx="0" cy="0" r="4" fill="#64748b" />
                <line x1="0" y1="-25" x2="0" y2="25" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                <text x="0" y="38" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
                  Cimindi
                </text>
                <text x="0" y="48" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                  Km 143
                </text>
              </g>

              {/* Gadobangkong Km 133 */}
              <g transform="translate(250, 180)">
                <circle cx="0" cy="0" r="4" fill="#64748b" />
                <line x1="0" y1="-25" x2="0" y2="25" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />
                <text x="0" y="38" fill="#94a3b8" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
                  Gadobangkong
                </text>
                <text x="0" y="48" fill="#64748b" fontSize="8" textAnchor="middle" fontFamily="monospace">
                  Km 133
                </text>
              </g>

              {/* ================= STASIUN 1: STASIUN PADALARANG (PDL - X=130) ================= */}
              <g transform="translate(130, 180)">
                {/* Elevated Whoosh Viaduct Platform */}
                {/* Viaduct concrete pillars */}
                <rect x="-42" y="-126" width="6" height="42" rx="1.5" fill="#1e293b" />
                <rect x="36" y="-126" width="6" height="42" rx="1.5" fill="#1e293b" />
                {/* Viaduct concrete deck */}
                <rect x="-60" y="-126" width="120" height="5" rx="1.5" fill="#334155" />
                <line x1="-58" y1="-127" x2="58" y2="-127" stroke="#64748b" strokeWidth="1.2" />

                {/* Whoosh CR400AF High-Speed Bullet Train Parked on Elevated Track */}
                <g transform="translate(0, -127)">
                  {/* Train Body Shadow */}
                  <ellipse cx="0" cy="0" rx="48" ry="1.2" fill="#000000" opacity="0.4" />
                  {/* Aerodynamic High-Speed Nose & Coach */}
                  <path
                    d="M -48 -1.2 Q -42 -9 -25 -10 L 45 -10 L 45 -1.2 L -35 -1.2 Q -44 -1.2 -48 -1.2 Z"
                    fill="#f8fafc"
                    stroke="#cbd5e1"
                    strokeWidth="0.5"
                  />
                  {/* Whoosh Crimson Red Iconic "Red Snapper" Nose Accent */}
                  <path
                    d="M -47 -1.2 Q -40 -4 -25 -4.5 L 45 -4.5 L 45 -6.5 L -25 -6.5 Q -40 -6.5 -47 -1.2 Z"
                    fill="#dc2626"
                  />
                  {/* Cockpit Windshield (Black tinted eagle-eye) */}
                  <path
                    d="M -43 -2.2 Q -38 -6.8 -28 -7.5 L -26 -7.5 L -28 -2.2 Z"
                    fill="#0f172a"
                  />
                  {/* High speed windows */}
                  <rect x="-18" y="-7.5" width="8" height="2.5" rx="0.6" fill="#1e293b" />
                  <rect x="-6" y="-7.5" width="8" height="2.5" rx="0.6" fill="#1e293b" />
                  <rect x="6" y="-7.5" width="8" height="2.5" rx="0.6" fill="#1e293b" />
                  <rect x="18" y="-7.5" width="8" height="2.5" rx="0.6" fill="#1e293b" />
                  <rect x="30" y="-7.5" width="8" height="2.5" rx="0.6" fill="#1e293b" />
                  {/* Red Tail Marker on rear */}
                  <circle cx="44" cy="-3.5" r="0.8" fill="#ef4444" />
                </g>

                {/* Connecting Modern Glass Skybridge to Whoosh KCIC */}
                <rect x="-48" y="-116" width="96" height="24" rx="5" fill="#0b1329" stroke="#6366f1" strokeWidth="1.5" />
                <text x="0" y="-103" fill="#818cf8" fontSize="8.5" fontWeight="900" textAnchor="middle" letterSpacing="0.5">
                  🚄 PERON WHOOSH (LT. 2)
                </text>
                <text x="0" y="-94" fill="#cbd5e1" fontSize="7.5" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  G1012 (Ke Halim) {depWhooshTime} WIB
                </text>

                {/* Skybridge vertical transit escalator connector */}
                <rect x="-12" y="-92" width="24" height="47" rx="3" fill="#1e1b4b" fillOpacity="0.7" stroke="#6366f1" strokeWidth="1" strokeDasharray="2 2" />
                <line x1="0" y1="-92" x2="0" y2="-45" stroke="#a5b4fc" strokeWidth="1.5" strokeDasharray="3 2" />

                {/* Station Platform Building */}
                <rect x="-40" y="-45" width="80" height="30" rx="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                <text x="0" y="-30" fill="#ffffff" fontSize="11" fontWeight="900" textAnchor="middle">
                  PADALARANG
                </text>
                <text x="0" y="-18" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  PDL • Km 130
                </text>

                {/* Station Node Core Circle */}
                <circle cx="0" cy="0" r="14" fill="#0284c7" stroke="#ffffff" strokeWidth="3" />
                <circle cx="0" cy="0" r="6" fill="#ffffff" />

                {/* Elevation Badge */}
                <text x="0" y="38" fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle">
                  Stasiun Padalarang
                </text>
                <text x="0" y="50" fill="#94a3b8" fontSize="8" textAnchor="middle">
                  Elevasi +673m • Integrasi KCIC
                </text>
              </g>

              {/* ================= STASIUN 2: STASIUN CIMAHI (CMI - X=540) ================= */}
              <g transform="translate(540, 180)">
                {/* Dwell Zone Indicator (Pemberhentian 2 Menit) */}
                {downTrainState.status === 'DWELL_CMI' || upTrainState.status === 'DWELL_CMI' ? (
                  <circle cx="0" cy="0" r="38" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="6 4" filter="url(#cmi-glow)">
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                  </circle>
                ) : null}

                {/* Station Building Box */}
                <rect x="-45" y="-55" width="90" height="38" rx="6" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
                <text x="0" y="-38" fill="#ffffff" fontSize="12" fontWeight="900" textAnchor="middle">
                  CIMAHI
                </text>
                <text x="0" y="-24" fill="#34d399" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  CMI • Km 140
                </text>

                {/* Node Core */}
                <circle cx="0" cy="0" r="14" fill="#059669" stroke="#ffffff" strokeWidth="3" />
                <circle cx="0" cy="0" r="6" fill="#ffffff" />

                {/* Stop Rule Badge */}
                <rect x="-55" y="24" width="110" height="18" rx="4" fill="#064e3b" stroke="#10b981" strokeWidth="1" />
                <text x="0" y="36" fill="#6ee7b7" fontSize="9" fontWeight="bold" textAnchor="middle">
                  ⏱️ BERHENTI 2 MENIT
                </text>

                <text x="0" y="54" fill="#94a3b8" fontSize="8" textAnchor="middle">
                  Elevasi +723m • Jalur 1 & 2
                </text>
              </g>

              {/* ================= STASIUN 3: STASIUN BANDUNG (BDG - X=890) ================= */}
              <g transform="translate(890, 180)">
                {/* Station Building (Iconic Art Deco Roof) */}
                <path d="M -45 -25 L -20 -50 L 20 -50 L 45 -25 Z" fill="#0f172a" stroke="#ef4444" strokeWidth="1.5" />
                <rect x="-45" y="-45" width="90" height="30" rx="4" fill="#0f172a" stroke="#ef4444" strokeWidth="2" />
                <text x="0" y="-30" fill="#ffffff" fontSize="12" fontWeight="900" textAnchor="middle">
                  BANDUNG
                </text>
                <text x="0" y="-18" fill="#f87171" fontSize="9" fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                  BD • Km 155
                </text>

                {/* Node Core */}
                <circle cx="0" cy="0" r="14" fill="#dc2626" stroke="#ffffff" strokeWidth="3" />
                <circle cx="0" cy="0" r="6" fill="#ffffff" />

                <text x="0" y="38" fill="#e2e8f0" fontSize="10" fontWeight="bold" textAnchor="middle">
                  Stasiun Bandung
                </text>
                <text x="0" y="50" fill="#94a3b8" fontSize="8" textAnchor="middle">
                  Elevasi +709m • Peron 5 & 6
                </text>
              </g>

              {/* ================= MOVING TRAIN 1: KERETA HILIR (BDG -> PDL) ================= */}
              {/* Upper track Y = 165, moving towards Padalarang (leftwards) */}
              <g transform={`translate(${downTrainState.svgX}, 165)`}>
                {/* Realistic Ground Drop Shadow on Ballast */}
                <ellipse cx="0" cy="1" rx="66" ry="2.2" fill="#000000" opacity="0.6" filter="url(#train-shadow)" />

                {/* Headlight Beam Cone (forward illumination on track) */}
                {downTrainState.speed > 0 ? (
                  <polygon points="-63,-5.8 -150,-16 -150,5 -63,-5" fill="url(#beam-left)" />
                ) : (
                  <polygon points="-63,-5.8 -95,-10 -95,2 -63,-5" fill="url(#beam-left)" opacity="0.4" />
                )}

                {/* Bogies & Wheels (sitting right on rail Y=0) */}
                {/* Bogie 1 (Front Cab) */}
                <g transform="translate(-46, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <rect x="-3" y="-6.5" width="6" height="1.8" rx="0.4" fill="#334155" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>
                {/* Bogie 2 (Mid-front) */}
                <g transform="translate(-18, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>
                {/* Bogie 3 (Mid-rear) */}
                <g transform="translate(18, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>
                {/* Bogie 4 (Rear Cab) */}
                <g transform="translate(46, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <rect x="-3" y="-6.5" width="6" height="1.8" rx="0.4" fill="#334155" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>

                {/* Underfloor Mechanical & Electrical Equipment */}
                <rect x="-35" y="-5.5" width="15" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />
                <rect x="-7" y="-5.5" width="14" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />
                <rect x="29" y="-5.5" width="12" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />

                {/* 1. FRONT CAB CAR (X = -64 to -22, facing left) */}
                <g>
                  {/* Aerodynamic Body Shell */}
                  <path
                    d="M -64 -6.2 Q -62 -14.5 -48 -16.5 L -22 -16.5 L -22 -4.2 L -49 -4.2 Q -60 -4.2 -64 -6.2 Z"
                    fill="url(#feeder-metallic-white)"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                  />
                  {/* Dark Charcoal Skirt */}
                  <path
                    d="M -64 -6.2 Q -61 -4.2 -49 -4.2 L -22 -4.2 L -22 -5.5 L -49 -5.5 Q -60 -5.5 -64 -6.2 Z"
                    fill="#1e293b"
                  />
                  {/* Authentic KCIC Crimson Red Sweep Stripe */}
                  <path
                    d="M -63.5 -6.2 Q -58 -6.3 -48 -6.6 L -22 -6.6 L -22 -9.6 L -48 -9.6 Q -58 -9.1 -63.5 -6.2 Z"
                    fill="url(#feeder-crimson-red)"
                  />
                  {/* Golden Accent Pinstripe */}
                  <line x1="-54" y1="-5.5" x2="-22" y2="-5.5" stroke="#f59e0b" strokeWidth="0.8" />

                  {/* Cockpit Windshield (Kaca Masinis) */}
                  <path
                    d="M -61 -7.3 L -56.5 -13.8 L -48 -14.2 L -49.5 -7.3 Z"
                    fill="#090d16"
                    stroke="#38bdf8"
                    strokeWidth="0.5"
                  />
                  {/* Windshield Reflection */}
                  <path
                    d="M -59 -8 L -56 -13 L -52.5 -13.2 L -55 -8 Z"
                    fill="#38bdf8"
                    opacity="0.4"
                  />
                  {/* Wiper Arm */}
                  <line x1="-56" y1="-7.3" x2="-53.5" y2="-12" stroke="#94a3b8" strokeWidth="0.6" />

                  {/* High-Intensity Dual LED Headlights */}
                  <ellipse cx="-62.2" cy="-6" rx="1.6" ry="1.8" fill="#fef08a" filter="url(#beam-glow)" />
                  <circle cx="-62.2" cy="-6" r="0.9" fill="#ffffff" />

                  {/* Passenger Door with Window */}
                  <rect x="-28" y="-15.5" width="5" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="-27" y="-14" width="3" height="4.5" rx="0.5" fill="#0f172a" />

                  {/* 3 Flush Tinted Windows with Warm Interior Glow */}
                  <g>
                    <rect x="-46" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-45.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="-39.5" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-39" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="-33.5" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-33" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                  </g>

                  {/* Streamlined Rooftop AC Unit */}
                  <rect x="-43" y="-19.2" width="16" height="2.8" rx="0.8" fill="#334155" stroke="#64748b" strokeWidth="0.5" />
                  <line x1="-40" y1="-17.8" x2="-30" y2="-17.8" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="1 1" />
                </g>

                {/* GANGWAY 1 (Bellows / Sambungan) */}
                <rect x="-22" y="-15.5" width="4" height="11" rx="0.5" fill="#0f172a" stroke="#334155" strokeWidth="0.6" />
                <line x1="-22" y1="-13" x2="-18" y2="-13" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="-22" y1="-10" x2="-18" y2="-10" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="-22" y1="-7" x2="-18" y2="-7" stroke="#1e293b" strokeWidth="0.6" />
                <rect x="-21" y="-4.8" width="2" height="1.2" fill="#64748b" />

                {/* 2. INTERMEDIATE TRAILER CAR (X = -18 to 18) */}
                <g>
                  {/* Carbody */}
                  <rect x="-18" y="-16.5" width="36" height="12.3" rx="1" fill="url(#feeder-metallic-white)" stroke="#cbd5e1" strokeWidth="0.6" />
                  <rect x="-18" y="-5.5" width="36" height="1.3" fill="#1e293b" />
                  <rect x="-18" y="-9.6" width="36" height="3" fill="url(#feeder-crimson-red)" />
                  <line x1="-18" y1="-5.5" x2="18" y2="-5.5" stroke="#f59e0b" strokeWidth="0.8" />

                  {/* 2 Passenger Doors */}
                  <rect x="-16.5" y="-15.5" width="4.8" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="-15.5" y="-14" width="2.8" height="4.5" rx="0.5" fill="#0f172a" />
                  <rect x="11.7" y="-15.5" width="4.8" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="12.7" y="-14" width="2.8" height="4.5" rx="0.5" fill="#0f172a" />

                  {/* 4 Panoramic Passenger Windows */}
                  <g>
                    <rect x="-9.8" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-9.3" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="-4.2" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-3.7" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="1.4" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="1.9" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="6.8" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="7.3" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                  </g>

                  {/* Rooftop AC Unit */}
                  <rect x="-9" y="-19.2" width="18" height="2.8" rx="0.8" fill="#334155" stroke="#64748b" strokeWidth="0.5" />
                  <line x1="-7" y1="-17.8" x2="7" y2="-17.8" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="1 1" />
                </g>

                {/* GANGWAY 2 (Bellows / Sambungan) */}
                <rect x="18" y="-15.5" width="4" height="11" rx="0.5" fill="#0f172a" stroke="#334155" strokeWidth="0.6" />
                <line x1="18" y1="-13" x2="22" y2="-13" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="18" y1="-10" x2="22" y2="-10" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="18" y1="-7" x2="22" y2="-7" stroke="#1e293b" strokeWidth="0.6" />
                <rect x="19" y="-4.8" width="2" height="1.2" fill="#64748b" />

                {/* 3. REAR DRIVING CAB CAR (X = 22 to 64, facing right) */}
                <g>
                  {/* Aerodynamic Body Shell (trailing rear) */}
                  <path
                    d="M 22 -16.5 L 48 -16.5 Q 62 -14.5 64 -6.2 Q 60 -4.2 49 -4.2 L 22 -4.2 Z"
                    fill="url(#feeder-metallic-white)"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                  />
                  {/* Dark Charcoal Skirt */}
                  <path
                    d="M 22 -5.5 L 49 -5.5 Q 60 -5.5 64 -6.2 Q 61 -4.2 49 -4.2 L 22 -4.2 Z"
                    fill="#1e293b"
                  />
                  {/* Authentic KCIC Crimson Red Sweep Stripe */}
                  <path
                    d="M 22 -9.6 L 48 -9.6 Q 58 -9.1 63.5 -6.2 Q 58 -6.3 48 -6.6 L 22 -6.6 Z"
                    fill="url(#feeder-crimson-red)"
                  />
                  {/* Golden Accent Pinstripe */}
                  <line x1="22" y1="-5.5" x2="54" y2="-5.5" stroke="#f59e0b" strokeWidth="0.8" />

                  {/* Rear Cockpit Windshield */}
                  <path
                    d="M 49.5 -7.3 L 48 -14.2 L 56.5 -13.8 L 61 -7.3 Z"
                    fill="#090d16"
                    stroke="#38bdf8"
                    strokeWidth="0.5"
                  />

                  {/* Semboyan 21 Ruby Red Tail Marker Lights */}
                  <ellipse cx="62.2" cy="-6" rx="1.6" ry="1.8" fill="#ef4444" filter="url(#tail-glow)" />
                  <circle cx="62.2" cy="-6" r="0.9" fill="#fca5a5" />
                  {/* Tail light aura */}
                  <polygon points="62.5,-6 82,-10 82,-2 62.5,-6" fill="rgba(239, 68, 68, 0.22)" />

                  {/* Passenger Door with Window */}
                  <rect x="23" y="-15.5" width="5" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="24" y="-14" width="3" height="4.5" rx="0.5" fill="#0f172a" />

                  {/* 3 Flush Tinted Windows */}
                  <g>
                    <rect x="29" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="29.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="35" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="35.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="41" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="41.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                  </g>

                  {/* Streamlined Rooftop AC Unit */}
                  <rect x="27" y="-19.2" width="16" height="2.8" rx="0.8" fill="#334155" stroke="#64748b" strokeWidth="0.5" />
                  <line x1="30" y1="-17.8" x2="40" y2="-17.8" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="1 1" />
                </g>

                {/* Floating Telemetry HUD Capsule (Above Train) */}
                <g transform="translate(0, -28)">
                  <polygon points="-4,-2 4,-2 0,1" fill="#061226" stroke="#38bdf8" strokeWidth="0.8" />
                  <rect
                    x="-68"
                    y="-18"
                    width="136"
                    height="18"
                    rx="9"
                    fill="#040c1d"
                    fillOpacity="0.94"
                    stroke="#38bdf8"
                    strokeWidth="1.2"
                  />
                  <circle cx="-56" cy="-9" r="2.8" fill="#38bdf8" />
                  <circle cx="-56" cy="-9" r="4.5" fill="none" stroke="#38bdf8" strokeWidth="0.8" opacity="0.7" />
                  <text x="-48" y="-5.5" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">
                    ARAH PADALARANG
                  </text>
                  <text x="36" y="-5.5" fill="#38bdf8" fontSize="8.5" fontWeight="900" fontFamily="monospace">
                    {downTrainState.speed} km/j
                  </text>
                </g>
              </g>

              {/* ================= MOVING TRAIN 2: KERETA HULU (PDL -> BDG - KERETA ARAH BANDUNG) ================= */}
              {/* Lower track Y = 195, moving towards Bandung (rightwards) */}
              <g transform={`translate(${upTrainState.svgX}, 195)`}>
                {/* Realistic Ground Drop Shadow on Ballast */}
                <ellipse cx="0" cy="1" rx="66" ry="2.2" fill="#000000" opacity="0.6" filter="url(#train-shadow)" />

                {/* Headlight Beam Cone (forward illumination to the right on track) */}
                {upTrainState.speed > 0 ? (
                  <polygon points="63,-5.8 150,-16 150,5 63,-5" fill="url(#beam-right)" />
                ) : (
                  <polygon points="63,-5.8 95,-10 95,2 63,-5" fill="url(#beam-right)" opacity="0.4" />
                )}

                {/* Bogies & Wheels (sitting right on rail Y=0) */}
                {/* Bogie 1 (Rear Cab on Left) */}
                <g transform="translate(-46, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <rect x="-3" y="-6.5" width="6" height="1.8" rx="0.4" fill="#334155" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>
                {/* Bogie 2 (Mid-left) */}
                <g transform="translate(-18, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>
                {/* Bogie 3 (Mid-right) */}
                <g transform="translate(18, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>
                {/* Bogie 4 (Lead Front Cab on Right) */}
                <g transform="translate(46, 0)">
                  <rect x="-9" y="-5.5" width="18" height="2.8" rx="0.8" fill="#0f172a" />
                  <rect x="-3" y="-6.5" width="6" height="1.8" rx="0.4" fill="#334155" />
                  <circle cx="-5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="-5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                  <circle cx="5.5" cy="-2.7" r="2.8" fill="#1e293b" stroke="#64748b" strokeWidth="0.8" />
                  <circle cx="5.5" cy="-2.7" r="1.1" fill="#94a3b8" />
                </g>

                {/* Underfloor Equipment */}
                <rect x="-35" y="-5.5" width="15" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />
                <rect x="-7" y="-5.5" width="14" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />
                <rect x="29" y="-5.5" width="12" height="3" rx="0.5" fill="#1e293b" stroke="#0f172a" strokeWidth="0.5" />

                {/* 1. REAR CAB CAR (X = -64 to -22, facing left as rear) */}
                <g>
                  {/* Aerodynamic Body Shell */}
                  <path
                    d="M -22 -16.5 L -48 -16.5 Q -62 -14.5 -64 -6.2 Q -60 -4.2 -49 -4.2 L -22 -4.2 Z"
                    fill="url(#feeder-metallic-white)"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                  />
                  {/* Dark Skirt */}
                  <path
                    d="M -22 -5.5 L -49 -5.5 Q -60 -5.5 -64 -6.2 Q -61 -4.2 -49 -4.2 L -22 -4.2 Z"
                    fill="#1e293b"
                  />
                  {/* KCIC Crimson Red Sweep Stripe */}
                  <path
                    d="M -22 -9.6 L -48 -9.6 Q -58 -9.1 -63.5 -6.2 Q -58 -6.3 -48 -6.6 L -22 -6.6 Z"
                    fill="url(#feeder-crimson-red)"
                  />
                  {/* Golden Accent Pinstripe */}
                  <line x1="-22" y1="-5.5" x2="-54" y2="-5.5" stroke="#f59e0b" strokeWidth="0.8" />

                  {/* Rear Cockpit Windshield */}
                  <path
                    d="M -49.5 -7.3 L -48 -14.2 L -56.5 -13.8 L -61 -7.3 Z"
                    fill="#090d16"
                    stroke="#fb7185"
                    strokeWidth="0.5"
                  />

                  {/* Semboyan 21 Ruby Red Tail Marker Lights (Facing Left) */}
                  <ellipse cx="-62.2" cy="-6" rx="1.6" ry="1.8" fill="#ef4444" filter="url(#tail-glow)" />
                  <circle cx="-62.2" cy="-6" r="0.9" fill="#fca5a5" />
                  {/* Tail light aura */}
                  <polygon points="-62.5,-6 -82,-10 -82,-2 -62.5,-6" fill="rgba(239, 68, 68, 0.22)" />

                  {/* Passenger Door with Window */}
                  <rect x="-28" y="-15.5" width="5" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="-27" y="-14" width="3" height="4.5" rx="0.5" fill="#0f172a" />

                  {/* 3 Flush Tinted Windows */}
                  <g>
                    <rect x="-46" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-45.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="-39.5" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-39" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="-33.5" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-33" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                  </g>

                  {/* Streamlined Rooftop AC Unit */}
                  <rect x="-43" y="-19.2" width="16" height="2.8" rx="0.8" fill="#334155" stroke="#64748b" strokeWidth="0.5" />
                  <line x1="-40" y1="-17.8" x2="-30" y2="-17.8" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="1 1" />
                </g>

                {/* GANGWAY 1 (Bellows) */}
                <rect x="-22" y="-15.5" width="4" height="11" rx="0.5" fill="#0f172a" stroke="#334155" strokeWidth="0.6" />
                <line x1="-22" y1="-13" x2="-18" y2="-13" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="-22" y1="-10" x2="-18" y2="-10" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="-22" y1="-7" x2="-18" y2="-7" stroke="#1e293b" strokeWidth="0.6" />
                <rect x="-21" y="-4.8" width="2" height="1.2" fill="#64748b" />

                {/* 2. INTERMEDIATE TRAILER CAR (X = -18 to 18) */}
                <g>
                  {/* Carbody */}
                  <rect x="-18" y="-16.5" width="36" height="12.3" rx="1" fill="url(#feeder-metallic-white)" stroke="#cbd5e1" strokeWidth="0.6" />
                  <rect x="-18" y="-5.5" width="36" height="1.3" fill="#1e293b" />
                  <rect x="-18" y="-9.6" width="36" height="3" fill="url(#feeder-crimson-red)" />
                  <line x1="-18" y1="-5.5" x2="18" y2="-5.5" stroke="#f59e0b" strokeWidth="0.8" />

                  {/* 2 Passenger Doors */}
                  <rect x="-16.5" y="-15.5" width="4.8" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="-15.5" y="-14" width="2.8" height="4.5" rx="0.5" fill="#0f172a" />
                  <rect x="11.7" y="-15.5" width="4.8" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="12.7" y="-14" width="2.8" height="4.5" rx="0.5" fill="#0f172a" />

                  {/* 4 Panoramic Passenger Windows */}
                  <g>
                    <rect x="-9.8" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-9.3" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="-4.2" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="-3.7" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="1.4" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="1.9" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="6.8" y="-14" width="4.5" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="7.3" y="-13.5" width="3.5" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                  </g>

                  {/* Rooftop AC Unit */}
                  <rect x="-9" y="-19.2" width="18" height="2.8" rx="0.8" fill="#334155" stroke="#64748b" strokeWidth="0.5" />
                  <line x1="-7" y1="-17.8" x2="7" y2="-17.8" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="1 1" />
                </g>

                {/* GANGWAY 2 (Bellows) */}
                <rect x="18" y="-15.5" width="4" height="11" rx="0.5" fill="#0f172a" stroke="#334155" strokeWidth="0.6" />
                <line x1="18" y1="-13" x2="22" y2="-13" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="18" y1="-10" x2="22" y2="-10" stroke="#1e293b" strokeWidth="0.6" />
                <line x1="18" y1="-7" x2="22" y2="-7" stroke="#1e293b" strokeWidth="0.6" />
                <rect x="19" y="-4.8" width="2" height="1.2" fill="#64748b" />

                {/* 3. LEAD FRONT CAB CAR (X = 22 to 64, facing right towards Bandung) */}
                <g>
                  {/* Aerodynamic Body Shell */}
                  <path
                    d="M 22 -16.5 L 48 -16.5 Q 62 -14.5 64 -6.2 Q 60 -4.2 49 -4.2 L 22 -4.2 Z"
                    fill="url(#feeder-metallic-white)"
                    stroke="#cbd5e1"
                    strokeWidth="0.6"
                  />
                  {/* Dark Charcoal Skirt */}
                  <path
                    d="M 22 -5.5 L 49 -5.5 Q 60 -5.5 64 -6.2 Q 61 -4.2 49 -4.2 L 22 -4.2 Z"
                    fill="#1e293b"
                  />
                  {/* KCIC Crimson Red Sweep Stripe */}
                  <path
                    d="M 22 -9.6 L 48 -9.6 Q 58 -9.1 63.5 -6.2 Q 58 -6.3 48 -6.6 L 22 -6.6 Z"
                    fill="url(#feeder-crimson-red)"
                  />
                  {/* Golden Accent Pinstripe */}
                  <line x1="22" y1="-5.5" x2="54" y2="-5.5" stroke="#f59e0b" strokeWidth="0.8" />

                  {/* Cockpit Windshield (Kaca Masinis Depan) */}
                  <path
                    d="M 49.5 -7.3 L 48 -14.2 L 56.5 -13.8 L 61 -7.3 Z"
                    fill="#090d16"
                    stroke="#fb7185"
                    strokeWidth="0.5"
                  />
                  {/* Windshield Reflection */}
                  <path
                    d="M 52.5 -13.2 L 56 -13 L 59 -8 L 55 -8 Z"
                    fill="#fb7185"
                    opacity="0.4"
                  />
                  {/* Wiper Arm */}
                  <line x1="56" y1="-7.3" x2="53.5" y2="-12" stroke="#94a3b8" strokeWidth="0.6" />

                  {/* High-Intensity Dual LED Headlights (Facing Right) */}
                  <ellipse cx="62.2" cy="-6" rx="1.6" ry="1.8" fill="#fef08a" filter="url(#beam-glow)" />
                  <circle cx="62.2" cy="-6" r="0.9" fill="#ffffff" />

                  {/* Passenger Door with Window */}
                  <rect x="23" y="-15.5" width="5" height="11" rx="0.5" fill="none" stroke="#94a3b8" strokeWidth="0.5" />
                  <rect x="24" y="-14" width="3" height="4.5" rx="0.5" fill="#0f172a" />

                  {/* 3 Flush Tinted Windows */}
                  <g>
                    <rect x="29" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="29.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="35" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="35.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                    <rect x="41" y="-14" width="4.8" height="4.5" rx="0.8" fill="#0f172a" stroke="#475569" strokeWidth="0.4" />
                    <rect x="41.5" y="-13.5" width="3.8" height="1.8" rx="0.3" fill="#fef3c7" opacity="0.28" />
                  </g>

                  {/* Streamlined Rooftop AC Unit */}
                  <rect x="27" y="-19.2" width="16" height="2.8" rx="0.8" fill="#334155" stroke="#64748b" strokeWidth="0.5" />
                  <line x1="30" y1="-17.8" x2="40" y2="-17.8" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="1 1" />
                </g>

                {/* Floating Telemetry HUD Capsule (Below Train) */}
                <g transform="translate(0, 18)">
                  <polygon points="-4,-1 4,-1 0,-4" fill="#061226" stroke="#f43f5e" strokeWidth="0.8" />
                  <rect
                    x="-64"
                    y="0"
                    width="128"
                    height="18"
                    rx="9"
                    fill="#040c1d"
                    fillOpacity="0.94"
                    stroke="#f43f5e"
                    strokeWidth="1.2"
                  />
                  <circle cx="-52" cy="9" r="2.8" fill="#f43f5e" />
                  <circle cx="-52" cy="9" r="4.5" fill="none" stroke="#f43f5e" strokeWidth="0.8" opacity="0.7" />
                  <text x="-44" y="12.5" fill="#ffffff" fontSize="8" fontWeight="bold" fontFamily="sans-serif">
                    ARAH BANDUNG
                  </text>
                  <text x="32" y="12.5" fill="#fb7185" fontSize="8.5" fontWeight="900" fontFamily="monospace">
                    {upTrainState.speed} km/j
                  </text>
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
      )}

      {/* Two Telemetry & Status HUD Cards: Kereta Arah Padalarang & Kereta Arah Bandung */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* CARD 1: KERETA ARAH PADALARANG */}
        <div className="bg-gradient-to-br from-[#0c1e3d] to-[#08152e] border-2 border-blue-600/80 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-blue-800/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-cyan-600 flex items-center justify-center text-white shadow-md">
                <Train className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg text-white">
                    Kereta Arah Padalarang
                  </span>
                  <span className="px-2 py-0.5 rounded bg-cyan-700 text-white font-black text-[10px] uppercase">
                    Jalur Hilir
                  </span>
                </div>
                <div className="text-xs text-blue-300 font-medium">
                  Rute: Stasiun Bandung ➔ Cimahi ➔ Padalarang
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black font-mono text-cyan-300">
                {downTrainState.speed} <span className="text-xs font-sans text-blue-300">km/j</span>
              </div>
              <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">
                Kecepatan Saat Ini
              </div>
            </div>
          </div>

          {/* Status & Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <span className="text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                {downTrainState.currentSegment}
              </span>
              <span className="font-mono text-cyan-400">
                {Math.round(downTrainState.progressRatio * 100)}%
              </span>
            </div>
            <div className="w-full h-3 bg-blue-950 rounded-full overflow-hidden border border-blue-800">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(downTrainState.progressRatio * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Detailed Timetable Milestones */}
          <div className="grid grid-cols-3 gap-2.5 pt-1 text-center font-mono">
            <div className="bg-[#061226] p-2.5 rounded-xl border border-blue-900">
              <div className="text-[10px] text-blue-400 font-sans font-bold">BERANGKAT BDG</div>
              <div className="text-sm font-black text-white">{depBandungTime}</div>
              <div className="text-[9px] text-blue-300 font-sans">Peron 5/6</div>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              downTrainState.status === 'DWELL_CMI'
                ? 'bg-emerald-950/80 border-emerald-500 ring-2 ring-emerald-400/30'
                : 'bg-[#061226] border-blue-900'
            }`}>
              <div className="text-[10px] text-emerald-400 font-sans font-bold">CIMAHI (BERHENTI 2M)</div>
              <div className="text-sm font-black text-emerald-300">
                {secondsToTimeString(t_arr_cmi_sec).substring(0, 5)} - {secondsToTimeString(t_dep_cmi_sec).substring(0, 5)}
              </div>
              <div className="text-[9px] text-emerald-400/80 font-sans">
                {downTrainState.status === 'DWELL_CMI'
                  ? `Sisa: ${formatMinutesSeconds(downTrainState.dwellRemainingSec)}`
                  : 'Jalur 1'}
              </div>
            </div>

            <div className="bg-[#061226] p-2.5 rounded-xl border border-blue-900">
              <div className="text-[10px] text-cyan-400 font-sans font-bold">TIBA PADALARANG</div>
              <div className="text-sm font-black text-cyan-300">
                {secondsToTimeString(t_arr_pdl_sec).substring(0, 5)}
              </div>
              <div className="text-[9px] text-cyan-400/80 font-sans">Sambung Whoosh</div>
            </div>
          </div>

          {/* Connection to Whoosh Info */}
          <div className="bg-blue-950/60 border border-blue-800 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-blue-200">
                Koneksi Kereta Cepat Whoosh <strong>{downTrainState.whooshNo}</strong>:
              </span>
            </div>
            <div className="font-mono font-bold text-amber-300">
              Berangkat Padalarang {depWhooshTime} WIB
            </div>
          </div>
        </div>

        {/* CARD 2: KERETA ARAH BANDUNG */}
        <div className="bg-gradient-to-br from-[#0c1e3d] to-[#08152e] border-2 border-rose-800/80 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-blue-800/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-md">
                <Train className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-lg text-white">
                    Kereta Arah Bandung
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-700 text-white font-black text-[10px] uppercase">
                    Jalur Hulu
                  </span>
                </div>
                <div className="text-xs text-blue-300 font-medium">
                  Rute: Stasiun Padalarang ➔ Cimahi ➔ Bandung
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-2xl font-black font-mono text-rose-400">
                {upTrainState.speed} <span className="text-xs font-sans text-blue-300">km/j</span>
              </div>
              <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">
                Kecepatan Saat Ini
              </div>
            </div>
          </div>

          {/* Status & Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5 font-bold">
              <span className="text-white flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                {upTrainState.currentSegment}
              </span>
              <span className="font-mono text-rose-400">
                {Math.round(upTrainState.progressRatio * 100)}%
              </span>
            </div>
            <div className="w-full h-3 bg-blue-950 rounded-full overflow-hidden border border-blue-800">
              <div
                className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(upTrainState.progressRatio * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Detailed Timetable Milestones */}
          <div className="grid grid-cols-3 gap-2.5 pt-1 text-center font-mono">
            <div className="bg-[#061226] p-2.5 rounded-xl border border-blue-900">
              <div className="text-[10px] text-blue-400 font-sans font-bold">BERANGKAT PDL</div>
              <div className="text-sm font-black text-white">
                {secondsToTimeString(u_dep_pdl_sec).substring(0, 5)}
              </div>
              <div className="text-[9px] text-blue-300 font-sans">Padalarang</div>
            </div>

            <div className={`p-2.5 rounded-xl border ${
              upTrainState.status === 'DWELL_CMI'
                ? 'bg-emerald-950/80 border-emerald-500 ring-2 ring-emerald-400/30'
                : 'bg-[#061226] border-blue-900'
            }`}>
              <div className="text-[10px] text-emerald-400 font-sans font-bold">CIMAHI (BERHENTI 2M)</div>
              <div className="text-sm font-black text-emerald-300">
                {secondsToTimeString(u_arr_cmi_sec).substring(0, 5)} - {secondsToTimeString(u_dep_cmi_sec).substring(0, 5)}
              </div>
              <div className="text-[9px] text-emerald-400/80 font-sans">
                {upTrainState.status === 'DWELL_CMI'
                  ? `Sisa: ${formatMinutesSeconds(upTrainState.dwellRemainingSec)}`
                  : 'Jalur 2'}
              </div>
            </div>

            <div className="bg-[#061226] p-2.5 rounded-xl border border-blue-900">
              <div className="text-[10px] text-rose-400 font-sans font-bold">TIBA BANDUNG</div>
              <div className="text-sm font-black text-rose-300">
                {secondsToTimeString(u_arr_bdg_sec).substring(0, 5)}
              </div>
              <div className="text-[9px] text-rose-400/80 font-sans">Stasiun Akhir</div>
            </div>
          </div>

          {/* Train Schedule Information Banner */}
          <div className="bg-rose-950/40 border border-rose-900 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-rose-400" />
              <span className="text-blue-200">
                Waktu Kedatangan di Stasiun Bandung:
              </span>
            </div>
            <div className="font-mono font-bold text-rose-300">
              {secondsToTimeString(u_arr_bdg_sec).substring(0, 5)} WIB (Selesai Trip)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
