import React from 'react';
import {
  Clock,
  Train,
  Sun,
  Moon,
} from 'lucide-react';

interface ClockHeaderProps {
  currentTime: Date;
  isSimulated?: boolean;
  onResetToRealTime?: () => void;
  onSetSimulatedTime?: (hours: number, minutes: number, seconds?: number) => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  volume?: number;
  onVolumeChange?: (newVol: number) => void;
  activeTrainCount?: number;
  onClockClick?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const ClockHeader: React.FC<ClockHeaderProps> = ({
  currentTime,
  onClockClick,
  theme = 'dark',
  onToggleTheme,
}) => {
  const hoursStr = String(currentTime.getHours()).padStart(2, '0');
  const minutesStr = String(currentTime.getMinutes()).padStart(2, '0');
  const secondsStr = String(currentTime.getSeconds()).padStart(2, '0');

  const dateFormatted = currentTime.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      className={`border-2 rounded-2xl p-5 shadow-2xl mb-5 transition-colors duration-200 ${
        theme === 'light'
          ? 'bg-gradient-to-r from-[#b91c1c] via-[#dc2626] to-[#b91c1c] border-red-800'
          : 'bg-gradient-to-r from-[#0a1c3d] via-[#0e2752] to-[#0a1c3d] border-blue-700/80'
      }`}
    >
      <div className="flex flex-col md:flex-row items-center justify-between gap-5">
        
        {/* Left: Station & Route Info for Passengers */}
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shadow-lg border border-white/20 flex-shrink-0">
            <Train className="w-8 h-8 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-black rounded bg-red-600 text-white tracking-wider uppercase">
                KA FEEDER
              </span>
              <span className={`text-xs font-bold ${theme === 'light' ? 'text-amber-200' : 'text-cyan-300'}`}>
                WHOOSH CONNECTION
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-1">
              JADWAL KERETA FEEDER • STASIUN BANDUNG
            </h1>
            <p className={`text-sm font-medium ${theme === 'light' ? 'text-red-100' : 'text-blue-200'}`}>
              Rute Stasiun Bandung ➔ Stasiun Padalarang
            </p>
          </div>
        </div>

        {/* Right: Prominent Digital Real-Time Clock with Corner Theme Toggle */}
        <div className="w-full md:w-auto flex justify-end items-center gap-2">
          <div className="relative inline-flex items-center">
            <button
              type="button"
              onClick={onClockClick}
              className={`group text-left border-2 rounded-2xl px-6 py-3 flex flex-col items-end transition-all cursor-pointer ${
                theme === 'light'
                  ? 'bg-white hover:bg-white border-red-300 shadow-[0_0_25px_rgba(220,38,38,0.25)] hover:shadow-[0_0_30px_rgba(220,38,38,0.4)] tv-clock-light'
                  : 'bg-[#050e24] hover:bg-[#071638] border-cyan-500/80 hover:border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.25)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)]'
              }`}
              style={
                theme === 'light'
                  ? { backgroundColor: '#ffffff', borderColor: '#fca5a5' }
                  : { backgroundColor: '#050e24', borderColor: '#06b6d4' }
              }
              title="Klik jam untuk membuka menu pengaturan"
            >
              <div
                className={`flex items-baseline gap-1 font-mono-tabular text-3xl sm:text-4xl font-black tracking-wider ${
                  theme === 'light'
                    ? 'text-red-600 group-hover:text-red-700'
                    : 'text-cyan-400 group-hover:text-cyan-300'
                }`}
                style={theme === 'light' ? { color: '#dc2626' } : undefined}
              >
                <span style={theme === 'light' ? { color: '#dc2626' } : undefined}>{hoursStr}</span>
                <span className={`animate-pulse ${theme === 'light' ? 'text-red-500 tv-clock-light-colon' : 'text-blue-400'}`} style={theme === 'light' ? { color: '#ef4444' } : undefined}>:</span>
                <span style={theme === 'light' ? { color: '#dc2626' } : undefined}>{minutesStr}</span>
                <span className={`animate-pulse ${theme === 'light' ? 'text-red-500 tv-clock-light-colon' : 'text-blue-400'}`} style={theme === 'light' ? { color: '#ef4444' } : undefined}>:</span>
                <span className={`text-2xl sm:text-3xl ${theme === 'light' ? 'text-red-700 tv-clock-light-sec' : 'text-cyan-300'}`} style={theme === 'light' ? { color: '#b91c1c' } : undefined}>{secondsStr}</span>
                <span className={`text-xs font-sans font-bold ml-2 px-1.5 py-0.5 rounded ${theme === 'light' ? 'text-white bg-red-600 tv-clock-light-badge' : 'text-blue-300'}`} style={theme === 'light' ? { color: '#ffffff', backgroundColor: '#dc2626' } : undefined}>WIB</span>
              </div>
              <div className={`text-xs font-medium flex items-center gap-1.5 mt-0.5 ${theme === 'light' ? 'text-red-700' : 'text-blue-200/90'}`} style={theme === 'light' ? { color: '#b91c1c' } : undefined}>
                <Clock className="w-3.5 h-3.5" style={theme === 'light' ? { color: '#dc2626' } : undefined} />
                <span>{dateFormatted}</span>
              </div>
            </button>

            {onToggleTheme && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTheme();
                }}
                className={`p-1.5 rounded-full border transition-all cursor-pointer flex items-center justify-center shadow-md hover:scale-110 active:scale-95 ml-2.5 ${
                  theme === 'light'
                    ? 'bg-white text-red-600 border-red-200 hover:bg-red-50 shadow-red-950/20'
                    : 'bg-[#061430] text-amber-300 border-cyan-500/60 hover:border-cyan-400 hover:bg-[#0c224e] shadow-cyan-950/40'
                }`}
                title={theme === 'light' ? 'Ganti ke Tema Gelap (Biru PIDS)' : 'Ganti ke Tema Terang (Merah & Putih)'}
                aria-label="Toggle tema tampilan"
              >
                {theme === 'light' ? (
                  <Sun className="w-4 h-4 fill-red-600 text-red-600" />
                ) : (
                  <Moon className="w-4 h-4 fill-amber-300 text-amber-300" />
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

