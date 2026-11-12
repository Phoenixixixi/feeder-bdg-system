import React from 'react';
import {
  Volume2,
  AlertTriangle,
  DoorOpen,
  Clock,
  X,
  Play,
} from 'lucide-react';
import { ComputedTrainInfo } from '../utils/scheduleRules';

export type AlertPhase = 'PRE_OPEN' | 'GATE_OPENED' | 'CLOSING_SOON' | 'CUSTOM_MP3';

export interface ActiveAlertInfo {
  train: ComputedTrainInfo;
  type: AlertPhase;
  customLabel?: string;
  customAudioUrl?: string;
  customAudioEnUrl?: string;
}

interface AudioNotificationToastProps {
  alert: ActiveAlertInfo | null;
  onDismiss: () => void;
  onReplayAudio: () => void;
}

export const AudioNotificationToast: React.FC<AudioNotificationToastProps> = ({
  alert,
  onDismiss,
  onReplayAudio,
}) => {
  if (!alert) return null;

  const { train, type, customLabel } = alert;

  // Configuration based on alert phase
  let badgeLabel = 'PERINGATAN BATAS AKHIR';
  let badgeBg = 'bg-amber-500/20 text-amber-300 border-amber-500/50';
  let cardBorder = 'border-amber-500';
  let cardBg = 'bg-[#180e03]';
  let iconBg = 'bg-amber-500 text-black';
  let title = `Panggilan Terakhir: KA Feeder ${train.schedule.whooshTrainNo}`;
  let description = `Gate keberangkatan akan ditutup dalam ${Math.max(1, train.minutesUntilCloseGate)} menit (pukul ${train.closeGateTime} WIB). Silakan segera menuju gate keberangkatan.`;
  let btnColor = 'bg-amber-500 hover:bg-amber-400 text-black';
  let icon = <AlertTriangle className="w-6 h-6 fill-black" />;

  if (type === 'PRE_OPEN') {
    badgeLabel = 'PERSIAPAN GATE IN (2 MENIT)';
    badgeBg = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50';
    cardBorder = 'border-cyan-500';
    cardBg = 'bg-[#04152b]';
    iconBg = 'bg-cyan-500 text-black';
    title = `Gate In Dibuka 2 Menit Lagi: KA Feeder ${train.schedule.whooshTrainNo}`;
    description = `Pemeriksaan tiket dibuka pukul ${train.checkingStartTime} WIB (keberangkatan ${train.departureTime} WIB). Mohon persiapkan tiket fisik atau e-ticket Anda.`;
    btnColor = 'bg-cyan-500 hover:bg-cyan-400 text-black';
    icon = <Clock className="w-6 h-6 text-black" />;
  } else if (type === 'GATE_OPENED') {
    badgeLabel = 'GATE IN RESMI DIBUKA';
    badgeBg = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
    cardBorder = 'border-emerald-500';
    cardBg = 'bg-[#041f17]';
    iconBg = 'bg-emerald-500 text-black';
    title = `Gate In Dibuka: KA Feeder ${train.schedule.whooshTrainNo}`;
    description = `Pemeriksaan tiket dan boarding gate in kini telah dibuka. Para penumpang dipersilakan masuk melalui pintu gate dan menuju peron.`;
    btnColor = 'bg-emerald-500 hover:bg-emerald-400 text-black';
    icon = <DoorOpen className="w-6 h-6 text-black" />;
  } else if (type === 'CUSTOM_MP3') {
    badgeLabel = 'PENGUMUMAN MP3 KHUSUS';
    badgeBg = 'bg-purple-500/20 text-purple-300 border-purple-500/50';
    cardBorder = 'border-purple-500';
    cardBg = 'bg-[#150a26]';
    iconBg = 'bg-purple-600 text-white';
    title = `${customLabel || 'Pengumuman MP3'}: KA Feeder ${train.schedule.whooshTrainNo}`;
    description = `Memutar rekaman audio MP3 khusus stasiun untuk jadwal keberangkatan ${train.departureTime} WIB.`;
    btnColor = 'bg-purple-600 hover:bg-purple-500 text-white';
    icon = <Volume2 className="w-6 h-6 text-white" />;
  }

  return (
    <aside
      aria-label="Notifikasi Pengumuman Suara Stasiun"
      className="fixed bottom-5 right-5 z-50 max-w-md w-full px-4 animate-slideUp"
    >
      <div className={`${cardBg} border-2 ${cardBorder} rounded-2xl p-4 shadow-[0_10px_35px_rgba(0,0,0,0.5)] text-white relative`}>
        <div className="flex items-start gap-3">
          <div className={`p-2.5 rounded-xl ${iconBg} flex-shrink-0 animate-pulse`}>
            {icon}
          </div>

          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${badgeBg}`}>
                {badgeLabel}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-blue-200">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                {Boolean(
                  alert.customAudioUrl ||
                  alert.customAudioEnUrl ||
                  train.schedule.audioUrl ||
                  train.schedule.audioPreOpenUrl ||
                  train.schedule.audioGateOpenUrl ||
                  train.schedule.audioClosingUrl
                )
                  ? (alert.customAudioEnUrl || train.schedule.audioPreOpenEnUrl || train.schedule.audioGateOpenEnUrl || train.schedule.audioClosingEnUrl || train.schedule.audioEnUrl)
                    ? 'MP3 Bilingual (🇮🇩 ID + 🇬🇧 EN)'
                    : 'MP3 Rekaman Petugas'
                  : 'Suara Sistem'}
              </span>
            </div>

            <h4 className="text-base font-black text-white mt-1">
              {title}
            </h4>

            <p className="text-xs text-slate-200 mt-1 leading-relaxed">
              {description}
            </p>

            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={onReplayAudio}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg ${btnColor} shadow transition-transform active:scale-95`}
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                Putar Ulang Pengumuman
              </button>
              <button
                onClick={onDismiss}
                className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-800"
              >
                Tutup
              </button>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 absolute top-3 right-3"
            title="Tutup Notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
