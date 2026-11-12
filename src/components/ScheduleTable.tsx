import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Train,
  AlertTriangle,
  DoorClosed,
  DoorOpen,
  Clock,
  ArrowRight,
  Volume2,
  Database,
  Sun,
  Moon,
  Sparkles,
  Play,
} from 'lucide-react';
import { ComputedTrainInfo } from '../utils/scheduleRules';
import { GateRowAnimationOverlay, GateAnimationPayload } from './GateRowAnimationOverlay';

interface ScheduleTableProps {
  computedList: ComputedTrainInfo[];
  currentTime: Date;
  onClockClick?: () => void;
  isDbConnected?: boolean;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  externalGateAnimation?: GateAnimationPayload | null;
  onExternalGateAnimationComplete?: () => void;
  gateAnimationEnabled?: boolean;
  onToggleGateAnimation?: (enabled: boolean) => void;
}

export const ScheduleTable: React.FC<ScheduleTableProps> = ({
  computedList,
  currentTime,
  onClockClick,
  isDbConnected,
  theme = 'dark',
  onToggleTheme,
  externalGateAnimation,
  onExternalGateAnimationComplete,
  gateAnimationEnabled = false,
  onToggleGateAnimation,
}) => {
  // Active upcoming trains for the TV display
  const activeList = computedList.filter((item) => !item.hasDeparted);
  const MAX_VISIBLE_DEPARTURES = 31;
  const displayedList = (activeList.length > 0 ? activeList : computedList).slice(
    0,
    MAX_VISIBLE_DEPARTURES
  );

  // 10-second alternating bilingual display (10s Indonesian, 10s English)
  const isEnglish = Math.floor(currentTime.getSeconds() / 10) % 2 === 1;

  const hoursStr = String(currentTime.getHours()).padStart(2, '0');
  const minutesStr = String(currentTime.getMinutes()).padStart(2, '0');
  const secondsStr = String(currentTime.getSeconds()).padStart(2, '0');

  const dateFormatted = currentTime.toLocaleDateString(isEnglish ? 'en-US' : 'id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Gate Transition Animation state (Train running RTL, Row color shift, Layer 2 Wave Text, 8 seconds)
  const [gateAnimation, setGateAnimation] = useState<GateAnimationPayload | null>(null);
  const [overlayPosition, setOverlayPosition] = useState<{ top: number; height: number } | null>(null);
  const [showTestMenu, setShowTestMenu] = useState<boolean>(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const previousStatusesRef = useRef<Map<string, string>>(new Map());
  const animatedTransitionsRef = useRef<Set<string>>(new Set());

  // Listen to external animation request (e.g. from App.tsx alert system)
  useEffect(() => {
    if (gateAnimationEnabled === false) {
      if (externalGateAnimation) {
        onExternalGateAnimationComplete?.();
      }
      return;
    }
    if (externalGateAnimation) {
      const transKey = `${externalGateAnimation.trainNo}-${externalGateAnimation.type}`;
      if (!animatedTransitionsRef.current.has(transKey)) {
        animatedTransitionsRef.current.add(transKey);
        setGateAnimation(externalGateAnimation);
      }
    }
  }, [externalGateAnimation, gateAnimationEnabled, onExternalGateAnimationComplete]);

  const triggerGateAnimation = (
    trainNo: string,
    type: 'GATE_OPEN' | 'GATE_CLOSED',
    feederNo?: string,
    isManualTest: boolean = false
  ) => {
    if (gateAnimationEnabled === false) return;
    const transKey = `${trainNo}-${type}`;
    if (!isManualTest && animatedTransitionsRef.current.has(transKey)) {
      return;
    }
    animatedTransitionsRef.current.add(transKey);

    setGateAnimation({
      trainNo,
      whooshTrainNo: trainNo,
      feederTrainNo: feederNo,
      type,
      id: `${trainNo}-${type}-${Date.now()}`,
    });
  };

  const handleAnimationComplete = useCallback(() => {
    // Selesai 8 detik: bersihkan total seluruh animasi transisi
    // Baris tabel kembali ke tampilan normal (status Gate Open / Gate Closed tetap aktif secara biasa)
    setGateAnimation(null);
    setOverlayPosition(null);
    onExternalGateAnimationComplete?.();
  }, [onExternalGateAnimationComplete]);

  // Safety timer: Pastikan tepat 8 detik seluruh animasi transisi bersih total
  useEffect(() => {
    if (!gateAnimation) return;
    const safetyTimer = setTimeout(() => {
      handleAnimationComplete();
    }, 8000);
    return () => clearTimeout(safetyTimer);
  }, [gateAnimation?.id, handleAnimationComplete]);

  // Otomatis mendeteksi transisi status gate secara real time (hanya sebagai transisi 8 detik sekali jalan):
  // - Transisi ke CHECKING (Gate In Open)
  // - Transisi ke GATE_CLOSED (Gate In Closed)
  useEffect(() => {
    if (gateAnimationEnabled === false) return;

    displayedList.forEach((item) => {
      const key = item.schedule.whooshTrainNo;
      const prev = previousStatusesRef.current.get(key);
      if (prev && prev !== item.status) {
        if (
          (prev === 'UPCOMING' || prev === 'GATE_OPENING_SOON') &&
          (item.status === 'CHECKING' || item.isGateJustOpened)
        ) {
          triggerGateAnimation(key, 'GATE_OPEN', item.schedule.feederTrainNo, false);
        } else if (
          (prev === 'CHECKING' || prev === 'GATE_CLOSING_SOON') &&
          item.status === 'GATE_CLOSED'
        ) {
          triggerGateAnimation(key, 'GATE_CLOSED', item.schedule.feederTrainNo, false);
        }
      }
      previousStatusesRef.current.set(key, item.status);
    });
  }, [displayedList, gateAnimationEnabled]);

  // Recalculate target row coordinates for pixel-perfect Layer 2 overlay
  useEffect(() => {
    if (!gateAnimation) {
      setOverlayPosition(null);
      return;
    }

    const computeCoords = () => {
      const rowEl = document.getElementById(`row-${gateAnimation.trainNo}`);
      const containerEl = tableContainerRef.current;
      if (rowEl && containerEl) {
        const rowRect = rowEl.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();
        setOverlayPosition({
          top: rowRect.top - containerRect.top + containerEl.scrollTop,
          height: rowRect.height,
        });
        try {
          // Scroll row smoothly to center of view
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
          // ignore
        }
      }
    };

    computeCoords();
    const timer = setTimeout(computeCoords, 60);
    return () => clearTimeout(timer);
  }, [gateAnimation]);

  return (
    <div
      className={`border-2 shadow-2xl overflow-hidden mb-16 pb-2 flex flex-col max-h-screen transition-colors duration-200 ${
        theme === 'light'
          ? 'bg-white border-red-300 theme-light'
          : 'bg-[#08152e] border-blue-800/90'
      }`}
    >
      {/* Table Header Bar - Integrated with Digital Clock for TV Display */}
      <div
        className={`px-6 py-4 border-b-2 flex flex-col sm:flex-row sm:items-center justify-center gap-4 relative transition-colors duration-200 ${
          theme === 'light'
            ? 'bg-[#b91c1c] border-red-900 shadow-md'
            : 'bg-[#0a1f47] border-blue-700/80'
        }`}
        style={{
          backgroundColor: theme === 'light' ? '#b91c1c' : '#0a1f47',
          backgroundImage:
            theme === 'light'
              ? 'linear-gradient(to right, #b91c1c, #dc2626, #b91c1c)'
              : 'linear-gradient(to right, #0a1f47, #0f2a5e, #0a1f47)',
        }}
      >
        {/* Right: Integrated Digital Clock (Clickable for Admin) with Corner Theme Toggle */}
        <div className="relative inline-flex items-center justify-center">
          <button
            type="button"
            onClick={onClockClick}
            className="group text-center transition-all cursor-pointer px-3 py-1 border-0 shadow-none outline-none"
            style={{ backgroundColor: 'transparent', background: 'transparent' }}
            title="Waktu Real-Time Stasiun Bandung (WIB) • Klik untuk membuka menu pengaturan"
          >
            <div
              className="flex items-baseline justify-center gap-1.5 font-mono-tabular text-3xl sm:text-4xl font-black tracking-wider transition-colors"
              style={{ color: theme === 'light' ? '#ffffff' : '#facc15' }}
            >
              <span style={{ color: theme === 'light' ? '#ffffff' : '#facc15' }}>{hoursStr}</span>
              <span className="mx-0.5 animate-pulse" style={{ color: theme === 'light' ? '#ffffff' : '#fde047' }}>
                :
              </span>
              <span style={{ color: theme === 'light' ? '#ffffff' : '#facc15' }}>{minutesStr}</span>
              <span className="mx-0.5 animate-pulse" style={{ color: theme === 'light' ? '#ffffff' : '#fde047' }}>
                :
              </span>
              <span style={{ color: theme === 'light' ? '#ffffff' : '#facc15' }}>{secondsStr}</span>
              <span
                className="text-[12px] font-sans font-bold ml-2 px-2 py-0.5 rounded shadow-sm"
                style={{
                  color: theme === 'light' ? '#ffffff' : '#93c5fd',
                  backgroundColor: theme === 'light' ? 'rgba(0, 0, 0, 0.25)' : '#1e3a8a',
                  border: theme === 'light' ? '1px solid rgba(255, 255, 255, 0.4)' : '1px solid #2563eb',
                }}
              >
                WIB
              </span>
            </div>
          </button>

          {/* Button kecil di pojok jam untuk toggle tema */}
          <button
            type="button"
            id="theme-toggle-corner-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleTheme?.();
            }}
            className={`p-2 rounded-full border transition-all cursor-pointer flex items-center justify-center shadow-md hover:scale-110 active:scale-95 ml-2.5 ${
              theme === 'light'
                ? 'bg-red-950/80 text-amber-300 border-amber-400/60 hover:bg-red-900 shadow-red-950/40'
                : 'bg-[#061430] text-amber-300 border-pink-500/60 hover:border-pink-400 hover:bg-[#0c224e] shadow-[0_0_15px_rgba(244,63,94,0.3)]'
            }`}
            title={theme === 'light' ? 'Ganti ke Tema Gelap (Biru PIDS)' : 'Ganti ke Tema Terang (Merah & Putih)'}
            aria-label="Toggle tema tampilan"
          >
            {theme === 'light' ? (
              <Sun className="w-4 h-4 fill-amber-300 text-amber-300" />
            ) : (
              <Moon className="w-4 h-4 fill-amber-300 text-amber-300" />
            )}
          </button>

          {/* Button Test Animasi Gate (Train & Layer 2 Wave) */}
          <div className="relative inline-block ml-2">
           

            {/* Dropdown Menu Test Animasi */}
            {showTestMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute right-0 top-full mt-2 w-64 rounded-xl border-2 shadow-2xl z-50 p-2.5 text-left backdrop-blur-xl ${
                  theme === 'light'
                    ? 'bg-white/95 border-red-300 text-slate-800'
                    : 'bg-[#071329]/95 border-blue-600 text-white'
                }`}
              >
                <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wider px-2 py-1 flex items-center justify-between border-b border-blue-800/40 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Animasi Gate (8 Detik)</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-black ${
                    gateAnimationEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {gateAnimationEnabled ? 'AKTIF' : 'NONAKTIF'}
                  </span>
                </div>

                {/* Quick Toggle in Table Menu */}
                {onToggleGateAnimation && (
                  <div className="px-2 py-1 mb-2 bg-black/40 rounded-lg flex items-center justify-between border border-white/5">
                    <span className="text-[10px] font-bold text-slate-300">Izinkan Animasi:</span>
                    <button
                      type="button"
                      onClick={() => onToggleGateAnimation(!gateAnimationEnabled)}
                      className={`px-2 py-0.5 rounded text-[10px] font-black transition-colors cursor-pointer ${
                        gateAnimationEnabled
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      {gateAnimationEnabled ? 'ON (8 Detik)' : 'OFF'}
                    </button>
                  </div>
                )}

                <p className="text-[10px] text-slate-400 px-2 mb-2 leading-relaxed">
                  Jalankan animasi kereta KAI Feeder (kanan ke kiri 8 detik), efek warna baris tabel di tengah, dan teks gelombang:
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setShowTestMenu(false);
                    if (displayedList.length > 0) {
                      triggerGateAnimation(
                        displayedList[0].schedule.whooshTrainNo,
                        'GATE_OPEN',
                        displayedList[0].schedule.feederTrainNo,
                        true
                      );
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/50 transition-colors mb-2 cursor-pointer text-left"
                >
                  <DoorOpen className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div>Test Gate IN Open (8s)</div>
                    <div className="text-[9px] text-emerald-400/80 font-normal">Kereta + Hijau Tengah Baris + Wave</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowTestMenu(false);
                    if (displayedList.length > 0) {
                      triggerGateAnimation(
                        displayedList[0].schedule.whooshTrainNo,
                        'GATE_CLOSED',
                        displayedList[0].schedule.feederTrainNo,
                        true
                      );
                    }
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/50 transition-colors cursor-pointer text-left"
                >
                  <DoorClosed className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <div>
                    <div>Test Gate IN Closed (8s)</div>
                    <div className="text-[9px] text-rose-400/80 font-normal">Kereta Merah + Tengah Baris + Wave</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div
        ref={tableContainerRef}
        className="overflow-y-auto no-scrollbar webkit-momentum-scroll flex-1 min-h-0 relative"
      >
        {/* Layer 2: Floating Gate Animation Overlay */}
        {gateAnimation && overlayPosition && (
          <GateRowAnimationOverlay
            animation={gateAnimation}
            onComplete={handleAnimationComplete}
            top={overlayPosition.top}
            height={overlayPosition.height}
            theme={theme}
          />
        )}
        <table className="w-full text-left border-collapse">
          {/* Table Column Headers - Sticky on TH for Safari/WebKit, Firefox & Chrome */}
          <thead className="sticky top-0 z-30">
            <tr
              className={`border-b-2 text-[.8rem] font-bold tracking-wider uppercase transition-colors ${
                theme === 'light'
                  ? 'border-red-800 text-white'
                  : 'border-blue-700 text-blue-200'
              }`}
            >
              <th
                style={{ backgroundColor: theme === 'light' ? '#b91c1c' : '#0b1c3e' }}
                className={`sticky top-0 z-30 py-3.5 px-4 text-center w-14 ${theme === 'light' ? 'bg-red-700 text-white' : 'bg-[#0b1c3e] text-blue-200'}`}
              >
                No
              </th>
              <th
                style={{ backgroundColor: theme === 'light' ? '#b91c1c' : '#0b1c3e' }}
                className={`sticky top-0 z-30 py-3.5 px-4 ${theme === 'light' ? 'bg-red-700 text-white' : 'bg-[#0b1c3e] text-blue-200'}`}
              >
                {isEnglish ? 'Train No.' : 'No. Kereta'}
              </th>
              <th
                style={{ backgroundColor: theme === 'light' ? '#b91c1c' : '#0b1c3e' }}
                className={`sticky top-0 z-30 py-3.5 px-4 ${theme === 'light' ? 'bg-red-700 text-white' : 'bg-[#0b1c3e] text-blue-200'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-white' : 'text-blue-400'}`} />
                  <span>{isEnglish ? 'Feeder Departure' : 'Keberangkatan Feeder'}</span>
                </div>
              </th>
              <th
                style={{ backgroundColor: theme === 'light' ? '#b91c1c' : '#0b1c3e' }}
                className={`sticky top-0 z-30 py-3.5 px-4 ${theme === 'light' ? 'bg-red-700 text-white' : 'bg-[#0b1c3e] text-blue-200'}`}
              >
                <div className="flex items-center gap-1.5">
                  <ArrowRight className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-white' : 'text-blue-400'}`} />
                  <span>{isEnglish ? 'Arrival at Padalarang' : 'Tiba di Padalarang'}</span>
                </div>
              </th>
              <th
                style={{ backgroundColor: theme === 'light' ? '#b91c1c' : '#0b1c3e' }}
                className={`sticky top-0 z-30 py-3.5 px-4 ${theme === 'light' ? 'bg-red-700 text-white' : 'bg-[#0b1c3e] text-blue-200'}`}
              >
                <div className="flex items-center gap-1.5">
                  <Clock className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-200' : 'text-cyan-400'}`} />
                  <span>{isEnglish ? 'Whoosh Departure' : 'Keberangkatan Whoosh'}</span>
                </div>
              </th>
              <th
                style={{ backgroundColor: theme === 'light' ? '#b91c1c' : '#0b1c3e' }}
                className={`sticky top-0 z-30 py-3.5 px-4 text-center ${theme === 'light' ? 'bg-red-700 text-white' : 'bg-[#0b1c3e] text-blue-200'}`}
              >
                {isEnglish ? 'Status' : 'Status'}
              </th>
            </tr>
          </thead>

          <tbody className={`divide-y font-medium text-sm ${theme === 'light' ? 'divide-red-100' : 'divide-blue-900/50'}`}>
            {displayedList.length === 0 ? (
              <tr>
                <td colSpan={6} className={`py-12 text-center ${theme === 'light' ? 'bg-white text-slate-500' : 'text-slate-400 bg-[#071329]'}`}>
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Train className={`w-8 h-8 ${theme === 'light' ? 'text-red-500' : 'text-blue-500 opacity-60'}`} />
                    <p className={`text-base font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                      {isEnglish ? 'No train schedules available' : 'Tidak ada jadwal kereta'}
                    </p>
                    <p className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-blue-300/70'}`}>
                      {isEnglish
                        ? 'All operational schedules for today have departed.'
                        : 'Seluruh jadwal operasional hari ini telah selesai diberangkatkan.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              displayedList.map((item, index) => {
                const isDelayed = Boolean(item.isDelayed || item.status === 'DELAYED');
                const isOpeningSoon = item.status === 'GATE_OPENING_SOON';
                const isChecking = item.status === 'CHECKING';
                const isClosingSoon = item.status === 'GATE_CLOSING_SOON';
                const isClosed = item.status === 'GATE_CLOSED';
                const isDeparted = item.status === 'DEPARTED';

                // Row styling for both themes
                let rowBgClass = '';
                if (theme === 'light') {
                  rowBgClass =
                    index % 2 === 0
                      ? 'bg-white hover:bg-red-50/50'
                      : 'bg-[#fff8f8] hover:bg-red-50/70';

                  if (isDelayed) {
                    rowBgClass = 'bg-amber-50/90 hover:bg-amber-100/90 border-l-4 border-amber-500 ring-1 ring-amber-400/40';
                  } else if (isChecking) {
                    rowBgClass = 'bg-emerald-500/70 hover:bg-emerald-100/90 border-l-4 border-emerald-600 ring-1 ring-emerald-500/30';
                  } else if (isOpeningSoon) {
                    rowBgClass = 'bg-sky-500/70 hover:bg-sky-100/90 border-l-4 border-sky-600 ring-1 ring-sky-500/30';
                  } else if (isClosed) {
                    rowBgClass = 'bg-rose-500/30 hover:bg-rose-100/90 border-l-4 border-red-600 ring-1 ring-red-500/30 opacity-90';
                  } else if (isDeparted) {
                    rowBgClass = 'bg-slate-100/80 border-l-4 border-slate-400 opacity-50 hover:opacity-75';
                  }
                } else {
                  rowBgClass =
                    index % 2 === 0
                      ? 'bg-[#08152e] hover:bg-[#11264f]'
                      : 'bg-[#0b1b3b] hover:bg-[#132c5a]';

                  if (isDelayed) {
                    rowBgClass = 'bg-amber-950/40 hover:bg-amber-900/50 border-l-4 border-amber-500 ring-1 ring-amber-500/40';
                  } else if (isChecking) {
                    rowBgClass = 'bg-emerald-600/60 hover:bg-emerald-900/50 border-l-4 border-emerald-400 ring-1 ring-emerald-400/40';
                  } else if (isOpeningSoon) {
                    rowBgClass = 'bg-cyan-600/40 hover:bg-cyan-900/50 border-l-4 border-cyan-400 ring-1 ring-cyan-400/40';
                  } else if (isClosed) {
                    rowBgClass = 'bg-rose-600/60 hover:bg-rose-900/50 border-l-4 border-rose-500 ring-1 ring-rose-500/30 opacity-80';
                  } else if (isDeparted) {
                    rowBgClass = 'bg-slate-900/30 border-l-4 border-slate-700 opacity-50 hover:opacity-75';
                  }
                }

                const isAnimatingRow = gateAnimation?.trainNo === item.schedule.whooshTrainNo;
                const animRowClass = isAnimatingRow
                  ? gateAnimation.type === 'GATE_OPEN'
                    ? 'animate-row-gate-open ring-2 ring-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.7)]'
                    : 'animate-row-gate-close ring-2 ring-rose-500 shadow-[0_0_25px_rgba(244,63,94,0.7)]'
                  : '';

                return (
                  <tr
                    key={item.schedule.id}
                    id={`row-${item.schedule.whooshTrainNo}`}
                    className={`transition-colors duration-200 ${rowBgClass} ${animRowClass}`}
                  >
                    {/* Col 0: Index */}
                    <td className={`py-3 px-4 text-center text-xs font-mono ${theme === 'light' ? 'text-slate-500 font-bold' : 'text-blue-300/70'}`}>
                      {index + 1}
                    </td>

                    {/* Col 1: Train Numbers (Whoosh & Feeder) */}
                    <td className="py-5 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-lg border flex items-center justify-center flex-shrink-0 shadow-sm ${
                          isDelayed
                            ? 'bg-amber-500 border-amber-300 text-slate-950'
                            : 'bg-red-600 border-white text-white'
                        }`}>
                          <Train className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-black tracking-wide flex items-center gap-2">
                            <span className={`font-mono text-2xl ${theme === 'light' ? 'text-slate-900 font-black' : 'text-white'}`}>
                              {item.schedule.whooshTrainNo}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded bg-red-600 text-white font-black uppercase">
                              Whoosh
                            </span>
                            {isDelayed && (
                              <span className="text-xs px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-black uppercase flex items-center gap-1 shadow-sm">
                                <AlertTriangle className="w-3 h-3 fill-slate-950" />
                                {isEnglish ? 'DELAY' : 'TERLAMBAT'}
                              </span>
                            )}
                          </div>
                          <div className={`text-sm font-mono ${theme === 'light' ? 'text-blue-700 font-bold' : 'text-blue-300'}`}>
                            <span>{item.schedule.feederTrainNo}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Col 2: Departure Time at Bandung */}
                    <td className="py-5 px-4">
                      {isDelayed ? (
                        <div className="flex flex-col">
                          <div className={`font-mono-tabular text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1.5 ${
                            theme === 'light' ? 'text-amber-600' : 'text-amber-400'
                          }`}>
                            <span className="text-base sm:text-lg line-through text-slate-400 font-semibold mr-0.5">
                              {item.departureTime}
                            </span>
                            <span>{item.effectiveDepartureTime}</span>
                            <span className={`text-sm font-sans font-semibold ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`}></span>
                          </div>
                          <div className={`text-[.7rem] font-bold ${theme === 'light' ? 'text-amber-800' : 'text-amber-300/90'}`}>
                            {isEnglish ? `Est. Delayed (+${item.delayMinutes}m)` : `Estimasi Terlambat (+${item.delayMinutes} mnt)`}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className={`font-mono-tabular text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1.5 ${
                            theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
                          }`}>
                            <span>{item.departureTime}</span>
                            <span className={`text-sm font-sans font-semibold ${theme === 'light' ? 'text-slate-600 font-bold' : 'text-blue-400'}`}></span>
                          </div>
                          <div className={`text-[.7rem] ${theme === 'light' ? 'text-slate-600 font-medium' : 'text-blue-300'}`}>
                            {isEnglish ? 'Bandung' : 'Bandung'}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Col 3: Tiba di Padalarang */}
                    <td className="py-5 px-4">
                      {isDelayed ? (
                        <div className="flex flex-col">
                          <div className={`font-mono-tabular text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1.5 ${
                            theme === 'light' ? 'text-amber-600' : 'text-amber-300'
                          }`}>
                            <span>{item.effectiveFeederArrivalTime}</span>
                            <span className={`text-sm font-sans font-semibold ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`}></span>
                          </div>
                          <div className={`text-[.7rem] font-bold ${theme === 'light' ? 'text-amber-800' : 'text-amber-300/80'}`}>
                            {isEnglish ? 'Est. Padalarang Arrival' : 'Estimasi Tiba Padalarang'}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className={`font-mono-tabular text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1.5 ${
                            theme === 'light' ? 'text-slate-900 font-black' : 'text-white'
                          }`}>
                            {item.schedule.feederArrivalTime}
                            <span className={`text-sm font-sans font-semibold ${theme === 'light' ? 'text-slate-600 font-bold' : 'text-blue-400'}`}></span>
                          </div>
                          <div className={`text-[.7rem] ${theme === 'light' ? 'text-slate-600 font-medium' : 'text-blue-300/80'}`}>
                            {isEnglish ? 'Padalarang' : 'Padalarang'}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Col 4: Waktu Keberangkatan Whoosh */}
                    <td className="py-5 px-4">
                      <div>
                        <div className={`font-mono-tabular text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1.5 ${
                          theme === 'light' ? 'text-red-700 font-black' : 'text-amber-400'
                        }`}>
                          <span>{item.schedule.whooshDepartureTime}</span>
                          <span className={`text-sm font-sans font-semibold ${theme === 'light' ? 'text-red-600 font-bold' : 'text-amber-500'}`}></span>
                        </div>
                        <div className={`text-[.6rem] ${theme === 'light' ? 'text-red-800/80 font-semibold' : 'text-blue-300'}`}>
                          {isEnglish ? 'Padalarang ➔ Halim' : 'Padalarang ➔ Halim'}
                        </div>
                      </div>
                    </td>

                    {/* Status Real-Time Badge */}
                    <td className="py-3 px-4 text-center">
                      {isDelayed ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-lg border-2 border-amber-300 animate-pulse">
                            <AlertTriangle className="w-4 h-4 fill-slate-950 text-slate-950" />
                            {isEnglish ? 'DELAYED' : 'TERLAMBAT'}
                          </span>
                          <span className={`text-[18px] font-black mt-1 font-mono ${
                            theme === 'light' ? 'text-amber-900 font-bold' : 'text-amber-300'
                          }`}>
                            {isEnglish
                              ? `Est. ${item.effectiveDepartureTime} (+${item.delayMinutes}m)`
                              : `Est. ${item.effectiveDepartureTime} (+${item.delayMinutes} mnt)`}
                          </span>
                          {item.delayReason ? (
                            <span className={`text-[10px] mt-0.5 truncate max-w-[140px] italic ${
                              theme === 'light' ? 'text-slate-700' : 'text-blue-200/90'
                            }`}>
                              {item.delayReason}
                            </span>
                          ) : (
                            <span className={`text-[18px] mt-0.5 ${
                              theme === 'light' ? 'text-slate-600' : 'text-blue-300/80'
                            }`}>
                              {isEnglish ? `Late by ${item.delayMinutes} min` : `Keterlambatan ${item.delayMinutes} mnt`}
                            </span>
                          )}
                        </div>
                      ) : isClosingSoon ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-md">
                            <AlertTriangle className="w-3.5 h-3.5 fill-slate-950" />
                            {isEnglish ? 'CLOSING SOON' : 'AKAN DITUTUP'}
                          </span>
                          <span className={`text-[18px] font-bold mt-1 ${theme === 'light' ? 'text-amber-900' : 'text-amber-300'}`}>
                            {isEnglish
                              ? `Gate closes in ${Math.max(1, item.minutesUntilCloseGate)} min!`
                              : `Tutup dalam ${Math.max(1, item.minutesUntilCloseGate)} mnt!`}
                          </span>
                        </div>
                      ) : isChecking ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-md ${
                            theme === 'light'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-600'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/80'
                          }`}>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            {isEnglish ? 'BOARDING' : 'CHECKING'}
                          </span>
                          <span className={`text-[18px] mt-1 font-mono ${theme === 'light' ? 'text-emerald-800 font-bold' : 'text-emerald-300/90'}`}>
                            {isEnglish
                              ? `Gate closes at ${item.closeGateTime}`
                              : `Gate tutup pkl ${item.closeGateTime}`}
                          </span>
                        </div>
                      ) : isClosed ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            theme === 'light'
                              ? 'bg-red-100 text-red-800 border border-red-500'
                              : 'bg-rose-950 text-rose-300 border border-rose-600'
                          }`}>
                            <DoorClosed className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-red-700' : 'text-rose-400'}`} />
                            {isEnglish ? 'CLOSED' : 'DITUTUP'}
                          </span>
                        </div>
                      ) : isOpeningSoon ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-md ${
                            theme === 'light'
                              ? 'bg-sky-100 text-sky-800 border border-sky-500'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400'
                          }`}>
                            <Volume2 className={`w-3.5 h-3.5 animate-pulse ${theme === 'light' ? 'text-sky-700' : 'text-cyan-400'}`} />
                            {isEnglish ? 'OPENING SOON' : 'SEGERA DIBUKA'}
                          </span>
                          <span className={`text-[18px] mt-1 font-mono ${theme === 'light' ? 'text-sky-800 font-bold' : 'text-cyan-300/90'}`}>
                            {isEnglish
                              ? `Opens at ${item.checkingStartTime} `
                              : `Buka pkl ${item.checkingStartTime} `}
                          </span>
                        </div>
                      ) : isDeparted ? (
                        <div className="inline-flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            theme === 'light'
                              ? 'bg-slate-200 text-slate-600 border border-slate-300'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            {isEnglish ? 'DEPARTED' : 'SUDAH LEWAT'}
                          </span>
                          <span className="text-[10px] mt-0.5 text-slate-500">
                            {isEnglish ? 'Auto cleared' : 'Otomatis terhapus'}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            theme === 'light'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}>
                            {isEnglish ? 'SCHEDULED' : 'TERJADWAL'}
                          </span>
                          <span className={`text-[18px] font-bold mt-1 ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                            {isEnglish
                              ? `Boarding at ${item.checkingStartTime}`
                              : `Naik Kereta ${item.checkingStartTime}`}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer with Official Notes matching the original poster */}

      {/* Fixed Bottom Announcement Bar */}
      <aside
        aria-label="Pengumuman Penting"
        className={`fixed bottom-0 left-0 right-0 z-50 px-4 py-2.5 transition-colors duration-200 ${
          theme === 'light'
            ? 'bg-[#c51c1c] border-t-2 border-white shadow-[0_-6px_25px_rgba(197,28,28,0.4)]'
            : 'bg-black border-t-2 border-amber-200 shadow-[0_-6px_25px_rgba(0,0,0,0.95)]'
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Center Text */}
          <div className="flex-1 text-center overflow-hidden px-2">
            <p
              className={`font-black text-xs sm:text-base md:text-lg tracking-wider uppercase animate-slow-blink transition-all duration-300 ${
                theme === 'light'
                  ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]'
                  : 'text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]'
              }`}
            >
              {isEnglish
                ? 'GATE IN CLOSES 5 MINUTES BEFORE DEPARTURE'
                : 'GATE IN DITUTUP 5 MENIT SEBELUM KEBERANGKATAN'}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
};

