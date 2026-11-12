import React, { useEffect, useState, useRef } from 'react';
import { KaiFeederTrainSvg } from './KaiFeederTrainSvg';
import { DoorOpen, DoorClosed, CheckCircle2, AlertOctagon } from 'lucide-react';

export interface GateAnimationPayload {
  trainNo: string;
  type: 'GATE_OPEN' | 'GATE_CLOSED';
  id?: string;
  whooshTrainNo?: string;
  feederTrainNo?: string;
}

interface GateRowAnimationOverlayProps {
  animation: GateAnimationPayload | null;
  onComplete: () => void;
  top: number;
  height: number;
  theme?: 'dark' | 'light';
}

export const GateRowAnimationOverlay: React.FC<GateRowAnimationOverlayProps> = ({
  animation,
  onComplete,
  top,
  height,
  theme = 'dark',
}) => {
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!animation) return;

    setIsFadingOut(false);

    // Fade out halus menjelang detik ke-8 (dimulai pada 7.4 detik)
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 7400);

    // Selesai dan bersih total tepat pada detik ke-8.0 (8000ms)
    // Menghilangkan seluruh efek animasi transisi setelah 8 detik
    const clearTimer = setTimeout(() => {
      onCompleteRef.current();
    }, 8000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [animation?.id]);

  if (!animation) return null;

  const isOpen = animation.type === 'GATE_OPEN';
  const mainText = isOpen ? 'GATE IN OPEN' : 'GATE IN CLOSED';
  const subText = isOpen ? 'PEMERIKSAAN TIKET DIBUKA' : 'BATAS AKHIR • PINTU DITUTUP';

  // Exact height matching table row ("ukuranya sesuaikan dengan baris tabel")
  const overlayHeight = height;
  const centeredTop = top;
  // Train height adjusted to 72% of row height so it glides inside the row
  const trainHeightPx = Math.max(24, Math.min(Math.round(overlayHeight * 0.72), 38));
  // Badge max height fits neatly inside row height
  const badgeMaxHeightPx = Math.max(26, overlayHeight - 6);

  return (
    <div
      aria-live="assertive"
      style={{
        top: `${centeredTop}px`,
        height: `${overlayHeight}px`,
      }}
      className={`absolute left-0 right-0 z-40 pointer-events-none overflow-hidden transition-opacity duration-600 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      } ${
        isOpen
          ? 'bg-gradient-to-r from-emerald-950/85 via-[#022c22]/90 to-emerald-950/85 shadow-[0_0_35px_rgba(16,185,129,0.7)]'
          : 'bg-gradient-to-r from-rose-950/90 via-[#350713]/90 to-rose-950/90 shadow-[0_0_35px_rgba(244,63,94,0.7)]'
      }`}
    >
      {/* Cinematic Top & Bottom Glowing Laser Rails */}
      <div
        className={`absolute top-0 left-0 right-0 h-[2px] ${
          isOpen
            ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399]'
            : 'bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_8px_#f43f5e]'
        }`}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 h-[2px] ${
          isOpen
            ? 'bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399]'
            : 'bg-gradient-to-r from-transparent via-rose-500 to-transparent shadow-[0_0_8px_#f43f5e]'
        }`}
      />

      {/* Cinematic Background Atmosphere: Center Volumetric Radiant Core (Durasi 8 detik) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
        <div
          className={`w-4/5 h-full rounded-full blur-2xl opacity-70 ${
            isOpen ? 'bg-emerald-400/35' : 'bg-rose-500/35'
          }`}
        />
        {/* Subtle cinematic horizon laser line */}
        <div
          className={`w-full h-[1px] opacity-40 ${
            isOpen
              ? 'bg-gradient-to-r from-transparent via-emerald-300 to-transparent'
              : 'bg-gradient-to-r from-transparent via-rose-400 to-transparent'
          }`}
        />
      </div>

      {/* Cinematic Glass Sheen Sweep across row (First 1.6s title entrance) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={`animate-cinema-glint w-1/3 h-full pointer-events-none ${
            isOpen
              ? 'bg-gradient-to-r from-transparent via-emerald-300/25 to-transparent'
              : 'bg-gradient-to-r from-transparent via-rose-300/25 to-transparent'
          }`}
        />
      </div>

      {/* Background Neon Pulse / Glow Sweep (Durasi 8 detik) */}
      <div
        className={`absolute inset-0 pointer-events-none ${
          isOpen ? 'animate-row-gate-open' : 'animate-row-gate-close'
        }`}
      />

      {/* Layer 1: Train driving from right to left (Durasi 3 detik melintas dari kanan ke kiri) with Anamorphic Lens Flare & Trail */}
      <div className="absolute inset-0 flex items-center overflow-hidden pointer-events-none z-10">
        <div className="animate-train-rtl absolute inset-y-0 flex items-center">
          {/* Cinematic Anamorphic Lens Flare at the Train Nose (Leading left edge) */}
          <div className="absolute -left-12 sm:-left-20 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center z-20">
            {/* Horizontal light streak (anamorphic laser flare) */}
            <div
              className={`w-36 sm:w-56 h-[2px] rounded-full blur-[0.8px] ${
                isOpen
                  ? 'bg-gradient-to-r from-transparent via-emerald-200 to-transparent opacity-95 shadow-[0_0_12px_#34d399]'
                  : 'bg-gradient-to-r from-transparent via-rose-200 to-transparent opacity-95 shadow-[0_0_12px_#fb7185]'
              }`}
            />
            {/* Center optical flare glint */}
            <div
              className={`absolute w-3 h-3 rounded-full blur-[1px] ${
                isOpen ? 'bg-white shadow-[0_0_10px_#a7f3d0]' : 'bg-white shadow-[0_0_10px_#fecdd3]'
              }`}
            />
          </div>

          {/* Cinematic Speed Streak Trail behind the train carriages */}
          <div className="absolute left-24 right-[-80px] top-1/2 -translate-y-1/2 pointer-events-none flex flex-col gap-1.5 opacity-50 z-0">
            <div
              className={`h-[1px] w-full ${
                isOpen
                  ? 'bg-gradient-to-r from-emerald-400/80 via-emerald-500/40 to-transparent'
                  : 'bg-gradient-to-r from-rose-400/80 via-rose-500/40 to-transparent'
              }`}
            />
          </div>

          {/* Authentic KAI Feeder Train SVG */}
          <KaiFeederTrainSvg
            status={animation.type}
            showHeadlight={true}
            style={{ height: `${trainHeightPx}px` }}
            className={`w-auto filter drop-shadow-[0_2px_14px_rgba(0,0,0,0.95)] ${
              isOpen
                ? 'drop-shadow-[0_0_16px_rgba(16,185,129,0.8)]'
                : 'drop-shadow-[0_0_18px_rgba(244,63,94,0.9)]'
            }`}
          />
        </div>
      </div>

      {/* Layer 2: Rock-Solid Cinematic Center HUD Badge (STATIC: tulisan gate in/close & logo pintu sama sekali TIDAK bergerak) */}
      <div className="absolute inset-0 z-20 flex items-center justify-center px-2 sm:px-4 pointer-events-none">
        <div
          style={{ maxHeight: `${badgeMaxHeightPx}px` }}
          className={`flex items-center justify-center gap-1.5 sm:gap-3 px-3 sm:px-5 py-0.5 sm:py-1 rounded-lg shadow-2xl backdrop-blur-md border ${
            isOpen
              ? 'bg-[#021810]/95 border-emerald-400/90 text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.8)] ring-1 ring-emerald-500/30'
              : 'bg-[#1c040b]/95 border-rose-500/90 text-rose-200 shadow-[0_0_24px_rgba(244,63,94,0.8)] ring-1 ring-rose-500/30'
          }`}
        >
          {/* Logo Pintu & Train Number (TETAP DIAM / STATIS - TIDAK BERGERAK) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {/* Logo Pintu: Completely static (NO animate-bounce, NO animate-pulse) */}
            <div
              className={`p-1 rounded-md flex items-center justify-center ${
                isOpen
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-400/80 shadow-[0_0_8px_rgba(244,63,94,0.7)]'
              }`}
            >
              {isOpen ? (
                <DoorOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              ) : (
                <DoorClosed className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              )}
            </div>

            {/* Train Number Pill (Whoosh Train Number) */}
            {animation.whooshTrainNo && (
              <span className="font-mono text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded bg-black/80 border border-white/20 text-white tracking-wider shadow-inner">
                {animation.whooshTrainNo}
              </span>
            )}
          </div>

          {/* Tulisan Gate In / Gate Close (TETAP DIAM / STATIS - TIDAK BERGERAK) */}
          <div className="flex flex-col items-center justify-center text-center">
            {/* Main Header Text: Clean, rock-solid, static typography */}
            <span
              className={`font-mono font-black text-xs sm:text-sm md:text-base tracking-widest select-none leading-tight ${
                isOpen
                  ? 'text-emerald-200 drop-shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                  : 'text-rose-200 drop-shadow-[0_0_10px_rgba(244,63,94,0.9)]'
              }`}
            >
              {mainText}
            </span>

            {/* Subtitle bilingual: Rock-solid static text */}
            <span
              className={`text-[7.5px] sm:text-[8.5px] font-bold tracking-widest uppercase leading-none text-center ${
                isOpen ? 'text-emerald-300/80' : 'text-rose-300/80'
              }`}
            >
              {subText}
            </span>
          </div>

          {/* Status Indicator: Static, no pulsing */}
          <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-white/15 text-[10px] font-black flex-shrink-0">
            {isOpen ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/25 text-emerald-200 border border-emerald-400/70 shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-300" />
                OPEN
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/25 text-rose-200 border border-rose-400/70 shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                <AlertOctagon className="w-2.5 h-2.5 text-rose-300" />
                CLOSED
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
