import React, { useState, useMemo, useEffect } from 'react';
import {
  Train,
  Plus,
  RotateCcw,
  Search,
  Upload,
  Play,
  Pause,
  Edit2,
  Trash2,
  Volume2,
  VolumeX,
  CheckCircle,
  FileAudio,
  AlertCircle,
  AlertTriangle,
  Shield,
  Clock,
  Sparkles,
  Navigation,
  Radio,
  Bell,
  BellRing,
  Megaphone,
} from 'lucide-react';
import { FeederSchedule } from '../data/scheduleData';
import {
  updateSchedule,
  deleteSchedule,
  seedDefaultSchedules,
  getOrFetchAudioUrl,
  clearAllAudiosFromAllSchedules,
  subscribeAppSettings,
  AppSettings,
} from '../services/scheduleService';
import { AudioUploadModal, AudioEventSlot } from './AudioUploadModal';
import { UniversalAudioModal } from './UniversalAudioModal';
import { ScheduleFormModal } from './ScheduleFormModal';
import { DelayModal } from './DelayModal';
import {
  triggerManualScheduleAnnouncement,
  cancelManualAnnouncement,
  getScheduleAudioUrl,
  ManualAnnouncementType,
  ManualAudioPhase,
} from '../utils/audioAlert';
import {
  getTrainGateTimes,
  getCustomAlertTriggerTime,
  minutesToTimeStr,
} from '../utils/scheduleRules';

export interface SchedulePlaybackOption {
  key: string;
  category: 'schedule' | 'file';
  label: string;
  sublabel: string;
  timeStr?: string;
  fileName?: string;
  lang?: 'id' | 'en' | 'bilingual' | 'system';
  audioUrl?: string;
}

/**
 * Menghasilkan opsi pemutaran audio manual untuk suatu jadwal kereta:
 * 1. Berdasarkan Jadwal Pemutaran (Waktu Pemicu: 2m sblm buka, saat buka, closing/last call, dll.)
 * 2. Berdasarkan Nama File MP3 yang tersimpan/terunggah di server
 */
export function getSchedulePlaybackOptions(item: FeederSchedule): {
  scheduleOptions: SchedulePlaybackOption[];
  fileOptions: SchedulePlaybackOption[];
} {
  const gateTimes = getTrainGateTimes(item.departureTime);
  const preOpenTime = minutesToTimeStr(gateTimes.checkingMinutes - 2);
  const gateOpenTime = gateTimes.checkingStartTime;
  const closingTime = gateTimes.closeGateTime;
  const departureTime = item.departureTime;

  const hasPreOpenId = Boolean(item.audioPreOpenUrl || item.audioPreOpenFileName);
  const hasPreOpenEn = Boolean(item.audioPreOpenEnUrl || item.audioPreOpenEnFileName);
  const hasGateOpenId = Boolean(item.audioGateOpenUrl || item.audioGateOpenFileName);
  const hasGateOpenEn = Boolean(item.audioGateOpenEnUrl || item.audioGateOpenEnFileName);
  const hasClosingId = Boolean(item.audioClosingUrl || item.audioClosingFileName || item.audioUrl || item.audioFileName);
  const hasClosingEn = Boolean(item.audioClosingEnUrl || item.audioClosingEnFileName || item.audioEnUrl || item.audioEnFileName);

  const scheduleOptions: SchedulePlaybackOption[] = [
    {
      key: 'slot_pre_open',
      category: 'schedule',
      label: `🔔 ${preOpenTime} WIB • 2 Mnt Sblm Buka`,
      timeStr: preOpenTime,
      lang: hasPreOpenId && hasPreOpenEn ? 'bilingual' : hasPreOpenId ? 'id' : hasPreOpenEn ? 'en' : 'system',
      sublabel:
        hasPreOpenId && hasPreOpenEn
          ? 'Bilingual (🇮🇩 ID ➔ Jeda 1.5s ➔ 🇬🇧 EN)'
          : hasPreOpenId
          ? `File MP3 (ID): ${item.audioPreOpenFileName || 'pre_open.mp3'}`
          : hasPreOpenEn
          ? `File MP3 (EN): ${item.audioPreOpenEnFileName || 'pre_open_en.mp3'}`
          : 'Suara Sistem Stasiun Resmi',
    },
    {
      key: 'slot_gate_open',
      category: 'schedule',
      label: `🚪 ${gateOpenTime} WIB • Gate In Dibuka`,
      timeStr: gateOpenTime,
      lang: hasGateOpenId && hasGateOpenEn ? 'bilingual' : hasGateOpenId ? 'id' : hasGateOpenEn ? 'en' : 'system',
      sublabel:
        hasGateOpenId && hasGateOpenEn
          ? 'Bilingual (🇮🇩 ID ➔ Jeda 1.5s ➔ 🇬🇧 EN)'
          : hasGateOpenId
          ? `File MP3 (ID): ${item.audioGateOpenFileName || 'gate_open.mp3'}`
          : hasGateOpenEn
          ? `File MP3 (EN): ${item.audioGateOpenEnFileName || 'gate_open_en.mp3'}`
          : 'Suara Sistem Stasiun Resmi',
    },
    {
      key: 'boarding',
      category: 'schedule',
      label: `📢 ${departureTime} WIB • Keberangkatan`,
      timeStr: departureTime,
      lang: 'system',
      sublabel: 'Suara Sistem Stasiun Resmi',
    },
  ];

  if (item.customAudioAlerts && item.customAudioAlerts.length > 0) {
    for (const ca of item.customAudioAlerts) {
      const trigger = getCustomAlertTriggerTime(item.departureTime, ca);
      const hasCaId = Boolean(ca.audioUrl || ca.audioFileName);
      const hasCaEn = Boolean(ca.audioEnUrl || ca.audioEnFileName);
      scheduleOptions.push({
        key: `custom_${ca.id}`,
        category: 'schedule',
        label: `🎵 ${trigger.triggerTimeStr} WIB • ${ca.label}`,
        timeStr: trigger.triggerTimeStr,
        lang: hasCaId && hasCaEn ? 'bilingual' : hasCaId ? 'id' : hasCaEn ? 'en' : 'system',
        sublabel:
          hasCaId && hasCaEn
            ? 'Bilingual (🇮🇩 ID ➔ Jeda 1.5s ➔ 🇬🇧 EN)'
            : hasCaId
            ? `File MP3 (ID): ${ca.audioFileName || 'custom.mp3'}`
            : hasCaEn
            ? `File MP3 (EN): ${ca.audioEnFileName || 'custom_en.mp3'}`
            : 'Alarm Notifikasi',
      });
    }
  }

  // File Options (Berdasarkan Nama File MP3 Terunggah - baik sudah di-cache maupun sedang disinkron dari Cloud)
  const fileOptions: SchedulePlaybackOption[] = [];

  if (item.audioPreOpenUrl || item.audioPreOpenFileName) {
    fileOptions.push({
      key: 'file_pre_open_id',
      category: 'file',
      label: `🇮🇩 ${item.audioPreOpenFileName || 'pre_open_id.mp3'}`,
      sublabel: `2 Mnt Sblm Buka (${preOpenTime} WIB) • Bahasa Indonesia`,
      audioUrl: item.audioPreOpenUrl,
      fileName: item.audioPreOpenFileName,
      lang: 'id',
    });
  }

  if (item.audioPreOpenEnUrl || item.audioPreOpenEnFileName) {
    fileOptions.push({
      key: 'file_pre_open_en',
      category: 'file',
      label: `🇬🇧 ${item.audioPreOpenEnFileName || 'pre_open_en.mp3'}`,
      sublabel: `2 Min Before Open (${preOpenTime} WIB) • English`,
      audioUrl: item.audioPreOpenEnUrl,
      fileName: item.audioPreOpenEnFileName,
      lang: 'en',
    });
  }

  if (item.audioGateOpenUrl || item.audioGateOpenFileName) {
    fileOptions.push({
      key: 'file_gate_open_id',
      category: 'file',
      label: `🇮🇩 ${item.audioGateOpenFileName || 'gate_open_id.mp3'}`,
      sublabel: `Saat Gate Dibuka (${gateOpenTime} WIB) • Bahasa Indonesia`,
      audioUrl: item.audioGateOpenUrl,
      fileName: item.audioGateOpenFileName,
      lang: 'id',
    });
  }

  if (item.audioGateOpenEnUrl || item.audioGateOpenEnFileName) {
    fileOptions.push({
      key: 'file_gate_open_en',
      category: 'file',
      label: `🇬🇧 ${item.audioGateOpenEnFileName || 'gate_open_en.mp3'}`,
      sublabel: `Gate Opened (${gateOpenTime} WIB) • English`,
      audioUrl: item.audioGateOpenEnUrl,
      fileName: item.audioGateOpenEnFileName,
      lang: 'en',
    });
  }

  if (item.customAudioAlerts && item.customAudioAlerts.length > 0) {
    for (const ca of item.customAudioAlerts) {
      const trigger = getCustomAlertTriggerTime(item.departureTime, ca);
      if (ca.audioUrl || ca.audioFileName) {
        fileOptions.push({
          key: `file_custom_${ca.id}_id`,
          category: 'file',
          label: `🇮🇩 ${ca.audioFileName || 'custom_id.mp3'}`,
          sublabel: `${ca.label} (${trigger.triggerTimeStr} WIB) • Bahasa Indonesia`,
          audioUrl: ca.audioUrl,
          fileName: ca.audioFileName,
          lang: 'id',
        });
      }
      if (ca.audioEnUrl || ca.audioEnFileName) {
        fileOptions.push({
          key: `file_custom_${ca.id}_en`,
          category: 'file',
          label: `🇬🇧 ${ca.audioEnFileName || 'custom_en.mp3'}`,
          sublabel: `${ca.label} (${trigger.triggerTimeStr} WIB) • English`,
          audioUrl: ca.audioEnUrl,
          fileName: ca.audioEnFileName,
          lang: 'en',
        });
      }
    }
  }

  return { scheduleOptions, fileOptions };
}

interface AdminScheduleDashboardProps {
  schedules: FeederSchedule[];
  onRefresh?: () => void;
  onOpenSimulate?: (scheduleId?: string) => void;
  gateAnimationEnabled?: boolean;
  onToggleGateAnimation?: (enabled: boolean) => void;
}

export const AdminScheduleDashboard: React.FC<AdminScheduleDashboardProps> = ({
  schedules,
  onRefresh,
  onOpenSimulate,
  gateAnimationEnabled = false,
  onToggleGateAnimation,
}) => {
  const [internalSchedules, setInternalSchedules] = useState<FeederSchedule[]>(schedules);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSchedule, setEditingSchedule] = useState<FeederSchedule | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [audioTargetSchedule, setAudioTargetSchedule] = useState<FeederSchedule | null>(null);
  const [audioTargetSlot, setAudioTargetSlot] = useState<AudioEventSlot>('pre_open');
  const [delayTargetSchedule, setDelayTargetSchedule] = useState<FeederSchedule | null>(null);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [isUniversalModalOpen, setIsUniversalModalOpen] = useState(false);
  const [universalPlaying, setUniversalPlaying] = useState(false);

  useEffect(() => {
    const unsub = subscribeAppSettings((settings) => {
      setAppSettings(settings);
    });
    return () => unsub();
  }, []);

  // State untuk Pemutaran Pengumuman Manual (+ Bell Pembuka & Penutup)
  const [manualPlayingScheduleId, setManualPlayingScheduleId] = useState<string | null>(null);
  const [manualPlayingPhase, setManualPlayingPhase] = useState<ManualAudioPhase>('idle');
  const [selectedAnnounceType, setSelectedAnnounceType] = useState<Record<string, ManualAnnouncementType>>({});
  const [audioFilterMode, setAudioFilterMode] = useState<Record<string, 'all' | 'schedule' | 'file'>>({});

  // Cleanup pemutaran audio saat berpindah halaman/unmount
  useEffect(() => {
    return () => {
      cancelManualAnnouncement();
      if (audioElement) {
        audioElement.pause();
      }
    };
  }, [audioElement]);

  // Sync internal schedules whenever parent schedules prop changes
  useEffect(() => {
    setInternalSchedules(schedules);
  }, [schedules]);

  // Filtered schedules
  const filteredSchedules = useMemo(() => {
    return internalSchedules.filter((item) => {
      const q = searchQuery.toLowerCase();
      return (
        item.whooshTrainNo.toLowerCase().includes(q) ||
        item.feederTrainNo.toLowerCase().includes(q) ||
        item.departureTime.includes(q) ||
        item.whooshDepartureTime.includes(q)
      );
    });
  }, [internalSchedules, searchQuery]);

  const totalSchedules = internalSchedules.length;
  const activeSchedules = internalSchedules.filter((s) => s.isActive !== false).length;
  const delayedCount = internalSchedules.filter((s) => Boolean(s.isDelayed)).length;
  const uploadedAudioCount = internalSchedules.filter(
    (s) =>
      Boolean(
        s.audioPreOpenUrl ||
        s.audioPreOpenFileName ||
        s.audioGateOpenUrl ||
        s.audioGateOpenFileName ||
        s.audioClosingUrl ||
        s.audioClosingFileName ||
        s.audioUrl ||
        (s.customAudioAlerts && s.customAudioAlerts.some((a) => a.audioUrl))
      )
  ).length;

  const handleSaveDelay = async (
    scheduleId: string,
    delayData: {
      isDelayed: boolean;
      delayMinutes: number;
      delayedDepartureTime: string;
      delayedWhooshDepartureTime: string;
      delayedFeederArrivalTime: string;
      delayReason?: string;
    }
  ) => {
    try {
      await updateSchedule(scheduleId, delayData);
      setInternalSchedules((prev) =>
        prev.map((s) => (s.id === scheduleId ? { ...s, ...delayData } : s))
      );
    } catch (err: any) {
      console.error('Failed to update delay status:', err);
      alert('Gagal memperbarui status keterlambatan: ' + err.message);
    }
  };

  const handleToggleActive = async (item: FeederSchedule) => {
    try {
      await updateSchedule(item.id, {
        isActive: item.isActive === false ? true : false,
      });
    } catch (err: any) {
      console.error('Failed to toggle active status:', err);
      alert('Gagal mengubah status: ' + err.message);
    }
  };

  const handleDelete = async (id: string, trainNo: string) => {
    if (!confirm(`Hapus jadwal kereta ${trainNo}? Tindakan ini tidak dapat dibatalkan.`)) return;
    try {
      await deleteSchedule(id);
    } catch (err: any) {
      console.error('Failed to delete schedule:', err);
      alert('Gagal menghapus jadwal: ' + err.message);
    }
  };

  const handlePlayPreview = async (item: FeederSchedule) => {
    const selectedKey = selectedAnnounceType[item.id] || 'slot_pre_open';
    const { fileOptions } = getSchedulePlaybackOptions(item);
    let audioUrlToPlay: string | undefined;

    if (selectedKey.startsWith('file_')) {
      const opt = fileOptions.find((f) => f.key === selectedKey);
      audioUrlToPlay = opt?.audioUrl;
      if (!audioUrlToPlay && opt) {
        // Resolve on demand from Firestore chunked storage
        const slot = selectedKey.replace(/^file_/, '').replace(/_(id|en)$/, '');
        audioUrlToPlay = (await getOrFetchAudioUrl(item, slot, opt.lang === 'en' ? 'en' : 'id')) || undefined;
      }
    } else {
      const slotName = selectedKey.replace(/^slot_/, '');
      audioUrlToPlay =
        getScheduleAudioUrl(item, slotName, 'id') ||
        getScheduleAudioUrl(item, undefined, 'id');
      if (!audioUrlToPlay) {
        audioUrlToPlay = (await getOrFetchAudioUrl(item, slotName, 'id')) || undefined;
      }
    }

    if (!audioUrlToPlay) {
      alert('Tidak ada file rekaman MP3 untuk opsi ini. Anda dapat mengunggah file MP3 di menu Kelola MP3.');
      return;
    }

    if (playingAudioId === item.id && audioElement) {
      audioElement.pause();
      setPlayingAudioId(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    const audio = new Audio(audioUrlToPlay);
    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => {
      alert('Gagal memutar audio preview.');
      setPlayingAudioId(null);
    };
    audio.play().then(() => {
      setAudioElement(audio);
      setPlayingAudioId(item.id);
    });
  };

  const handlePlayManualAnnouncement = async (item: FeederSchedule, overrideType?: ManualAnnouncementType) => {
    // Jika tombol di klik pada jadwal yang sedang berputar siaran, hentikan
    if (manualPlayingScheduleId === item.id) {
      handleStopManualAnnouncement();
      return;
    }

    // Hentikan audio preview biasa jika sedang jalan
    if (audioElement) {
      audioElement.pause();
      setAudioElement(null);
      setPlayingAudioId(null);
    }

    cancelManualAnnouncement();
    const typeToPlay = overrideType || selectedAnnounceType[item.id] || 'slot_pre_open';

    setManualPlayingScheduleId(item.id);
    setManualPlayingPhase('chime_start');

    try {
      // Jika yang dipilih adalah file spesifik (berdasarkan nama file MP3)
      if (typeToPlay.startsWith('file_')) {
        const { fileOptions } = getSchedulePlaybackOptions(item);
        const targetFile = fileOptions.find((f) => f.key === typeToPlay);
        let targetUrl = targetFile?.audioUrl;
        if (!targetUrl && targetFile) {
          const slot = typeToPlay.replace(/^file_/, '').replace(/_(id|en)$/, '');
          targetUrl = (await getOrFetchAudioUrl(item, slot, targetFile.lang === 'en' ? 'en' : 'id')) || undefined;
        }

        if (targetUrl) {
          await triggerManualScheduleAnnouncement(item, {
            specificAudioUrl: targetUrl,
            specificAudioEnUrl: undefined,
            announcementType: 'custom_mp3',
            preferUploadedAudio: true,
            onPhaseChange: (phase) => {
              setManualPlayingPhase(phase);
              if (phase === 'idle') {
                setManualPlayingScheduleId(null);
              }
            },
          });
          return;
        }
      }

      // Opsi berdasarkan Jadwal Pemutaran (Waktu Pemicu: bilingual ID -> jeda 1.5s -> EN -> chime)
      await triggerManualScheduleAnnouncement(item, {
        announcementType: typeToPlay,
        preferUploadedAudio: true,
        onPhaseChange: (phase) => {
          setManualPlayingPhase(phase);
          if (phase === 'idle') {
            setManualPlayingScheduleId(null);
          }
        },
      });
    } catch (e) {
      console.error('Error playing manual schedule announcement:', e);
      setManualPlayingScheduleId(null);
      setManualPlayingPhase('idle');
    }
  };

  const handleStopManualAnnouncement = () => {
    cancelManualAnnouncement();
    setManualPlayingScheduleId(null);
    setManualPlayingPhase('idle');
  };

  // Jadwal yang sedang aktif disiarkan manual
  const manualPlayingSchedule = useMemo(() => {
    if (!manualPlayingScheduleId) return null;
    return internalSchedules.find((s) => s.id === manualPlayingScheduleId) || null;
  }, [internalSchedules, manualPlayingScheduleId]);

  const [isClearingAudios, setIsClearingAudios] = useState(false);

  const handleResetToStandard = async () => {
    if (!confirm('Kembalikan ke jadwal standar 31 KA Feeder? Jadwal kustom yang dibuat manual akan ditimpa.')) return;
    setIsResetting(true);
    try {
      await seedDefaultSchedules();
      alert('Jadwal berhasil di-reset ke standar 31 KA (bersih dari file audio)!');
    } catch (err: any) {
      console.error('Reset error:', err);
      alert('Gagal reset database: ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearAllAudios = async () => {
    if (
      !confirm(
        'Hapus seluruh file audio rekaman/MP3 dari semua jadwal kereta?\n\nJadwal dan jam keberangkatan kereta TIDAK AKAN terhapus, hanya data file audio yang dikosongkan agar Anda dapat menginput file MP3 secara manual.'
      )
    ) {
      return;
    }
    setIsClearingAudios(true);
    try {
      await clearAllAudiosFromAllSchedules();
      alert('Semua data file audio berhasil dihapus! Seluruh slot audio kini kosong dan siap diinput manual.');
    } catch (err: any) {
      console.error('Error clearing all audios:', err);
      alert('Gagal menghapus file audio: ' + err.message);
    } finally {
      setIsClearingAudios(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-gradient-to-br from-[#0c1f44] to-[#071329] border border-blue-700/80 sm:border-2 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5 shadow-lg">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-blue-600 flex items-center justify-center text-white flex-shrink-0 shadow-md">
            <Train className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-[11px] font-bold text-blue-300 uppercase tracking-wider truncate">Total KA</div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{totalSchedules}</div>
            <div className="text-[9px] sm:text-[10px] text-blue-200/70 truncate">{activeSchedules} aktif di display</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#0c1f44] to-[#071329] border border-emerald-700/80 sm:border-2 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5 shadow-lg">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-emerald-600 flex items-center justify-center text-white flex-shrink-0 shadow-md">
            <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-[11px] font-bold text-emerald-300 uppercase tracking-wider truncate">KA Aktif</div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{activeSchedules}</div>
            <div className="text-[9px] sm:text-[10px] text-emerald-200/70 truncate">Tampil di layar TV</div>
          </div>
        </div>

        <div className={`bg-gradient-to-br from-[#0c1f44] to-[#071329] border sm:border-2 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5 shadow-lg transition-colors ${
          delayedCount > 0 ? 'border-amber-500 bg-amber-950/20' : 'border-amber-700/60'
        }`}>
          <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md ${
            delayedCount > 0 ? 'bg-amber-500 text-slate-950 animate-pulse' : 'bg-amber-600'
          }`}>
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-[11px] font-bold text-amber-300 uppercase tracking-wider truncate">KA Delay</div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{delayedCount}</div>
            <div className="text-[9px] sm:text-[10px] text-amber-200/70 truncate">
              {delayedCount > 0 ? 'Status delay aktif' : 'Tepat waktu'}
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#0c1f44] to-[#071329] border border-cyan-700/80 sm:border-2 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3.5 shadow-lg">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-cyan-600 flex items-center justify-center text-white flex-shrink-0 shadow-md">
            <FileAudio className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] sm:text-[11px] font-bold text-cyan-300 uppercase tracking-wider truncate">Audio MP3</div>
            <div className="text-xl sm:text-2xl font-black text-white font-mono">{uploadedAudioCount}</div>
            <div className="text-[9px] sm:text-[10px] text-cyan-200/70 truncate">File tersimpan</div>
          </div>
        </div>
      </div>

      {/* Pengaturan Animasi Visual Gate Open / Close (Sinkronisasi ke Seluruh PIDS Stasiun) */}
      <div className="bg-gradient-to-r from-[#091b3e] via-[#071633] to-[#0a2046] border border-blue-700/80 sm:border-2 rounded-2xl p-3.5 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shadow-xl">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md transition-all ${
            gateAnimationEnabled
              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-950/60 ring-2 ring-emerald-400/50'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            <Train className={`w-5 h-5 ${gateAnimationEnabled ? 'animate-pulse' : ''}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black text-white tracking-wide">
                Animasi Kereta & Gate (Open / Close)
              </span>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border transition-all ${
                gateAnimationEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {gateAnimationEnabled ? 'AKTIF (8 DETIK)' : 'NONAKTIF (DEFAULT)'}
              </span>
              <span className="text-[10px] bg-blue-900/60 text-blue-200 border border-blue-700/60 px-2 py-0.5 rounded-md font-mono">
                Sinkron Semua PIDS
              </span>
            </div>
            <p className="text-[11px] text-blue-200/75 mt-1 leading-relaxed">
              Mengontrol efek animasi transisi (kereta KAI melintas 3 detik, gelombang teks huruf, dan warna baris selama 8 detik) secara terpusat. Sakelar ini langsung mempengaruhi <strong>seluruh layar display PIDS stasiun</strong> secara real-time via Firestore. As default: <strong>OFF</strong>.
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <div className="flex items-center gap-3 self-end sm:self-center flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-blue-900/40 w-full sm:w-auto justify-between sm:justify-end">
          <span className="text-xs font-bold text-slate-300 sm:hidden">
            Status Animasi:
          </span>
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={gateAnimationEnabled === true}
              onChange={(e) => onToggleGateAnimation?.(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-7 peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-emerald-500 peer-checked:to-teal-400 border border-slate-700 peer-checked:border-emerald-400 shadow-inner"></div>
            <span className="ml-2.5 text-xs font-black font-mono text-white min-w-[55px]">
              {gateAnimationEnabled ? 'ON (8s)' : 'OFF'}
            </span>
          </label>
        </div>
      </div>

      {/* Pengaturan Audio Universal (2 Menit Sebelum Gate In Dibuka / Prioritas Boarding) */}
      <div className="bg-gradient-to-r from-[#0d1d42] via-[#091738] to-[#12254e] border-2 border-indigo-500/80 rounded-2xl p-4 sm:p-5 shadow-[0_0_30px_rgba(99,102,241,0.22)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-indigo-950 flex-shrink-0">
              <Radio className="w-6 h-6 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm sm:text-base font-black text-white tracking-wide">
                  Audio Universal: 2 Menit Sebelum Gate In Dibuka
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400 text-[10px] font-black uppercase tracking-wider shadow-sm">
                  Universal Seluruh 31 KA
                </span>
                <span className="text-[10px] bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 px-2 py-0.5 rounded-md font-mono">
                  Prioritas Boarding
                </span>
              </div>
              <p className="text-xs text-blue-200/85 mt-1 leading-relaxed max-w-2xl">
                Satu file MP3 universal yang otomatis dipakai bersama oleh <strong>seluruh 31 jadwal Kereta Api Feeder</strong> tepat pada 2 menit sebelum gate in dibuka.
              </p>

              {/* Status File Indicator */}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 bg-[#051026] border border-blue-900/90 px-3 py-1.5 rounded-xl text-xs">
                  <span className="font-bold text-slate-400">🇮🇩 Bahasa Indonesia:</span>
                  {appSettings?.universalPreOpenFileName ? (
                    <span className="font-mono font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      {appSettings.universalPreOpenFileName}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Suara Sistem Stasiun (Default)</span>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-[#051026] border border-blue-900/90 px-3 py-1.5 rounded-xl text-xs">
                  <span className="font-bold text-slate-400">🇬🇧 English:</span>
                  {appSettings?.universalPreOpenEnFileName ? (
                    <span className="font-mono font-bold text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      {appSettings.universalPreOpenEnFileName}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic">Belum diatur</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
            {appSettings?.universalPreOpenUrl && (
              <button
                type="button"
                onClick={() => {
                  if (audioElement && universalPlaying) {
                    audioElement.pause();
                    setUniversalPlaying(false);
                  } else {
                    if (audioElement) audioElement.pause();
                    const aud = new Audio(appSettings.universalPreOpenUrl);
                    aud.onended = () => setUniversalPlaying(false);
                    aud.onerror = () => {
                      alert('Gagal memutar audio universal.');
                      setUniversalPlaying(false);
                    };
                    aud.play().then(() => {
                      setAudioElement(aud);
                      setUniversalPlaying(true);
                    });
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500/20 to-cyan-500/20 hover:from-teal-500/30 hover:to-cyan-500/30 border border-cyan-400/60 text-cyan-200 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
                title="Dengarkan pratinjau audio universal"
              >
                {universalPlaying ? <Pause className="w-4 h-4 text-cyan-300" /> : <Play className="w-4 h-4 text-cyan-300 ml-0.5" />}
                <span>{universalPlaying ? 'Jeda Suara' : 'Putar Audio Universal'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsUniversalModalOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 border border-indigo-300/60 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-950"
            >
              <Upload className="w-4 h-4" />
              <span>{appSettings?.universalPreOpenFileName ? 'Ubah Audio Universal' : 'Pasang Audio Universal'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Action Buttons */}
      <div className="bg-[#091735] border border-blue-700/80 sm:border-2 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-xl">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-blue-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor KA (G1004) / jam..."
            className="w-full bg-[#050e24] border border-blue-800 rounded-xl pl-10 pr-3.5 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Buttons */}
        <div className="grid grid-cols-1 sm:flex items-center gap-2 sm:gap-2.5 w-full md:w-auto justify-end flex-wrap">
          {onOpenSimulate && (
            <button
              onClick={() => onOpenSimulate()}
              className="text-xs font-black text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 hover:from-cyan-300 hover:to-teal-200 border border-cyan-200 px-3.5 py-2.5 rounded-xl shadow-lg shadow-cyan-950/80 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Buka Simulasi Rute Real-time Bandung-Cimahi-Padalarang (/admin/simulate)"
            >
              <Navigation className="w-4 h-4 fill-slate-950" />
              <span>Simulasi Rute (/admin/simulate)</span>
            </button>
          )}

          <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleClearAllAudios}
              disabled={isClearingAudios}
              className="text-xs font-semibold text-rose-200 bg-[#24080e] hover:bg-rose-950 border border-rose-800/80 px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-rose-950/50"
              title="Hapus seluruh data file audio dari semua jadwal (agar bersih untuk input manual)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>{isClearingAudios ? 'Menghapus Audio...' : 'Hapus Semua Audio'}</span>
            </button>

            <button
              onClick={handleResetToStandard}
              disabled={isResetting}
              className="text-xs font-semibold text-blue-200 bg-[#071329] hover:bg-blue-900 border border-blue-800 px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              title="Kembalikan database ke 31 jadwal resmi (tanpa audio)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isResetting ? 'Mereset...' : 'Reset 31 KA'}</span>
            </button>

            <button
              onClick={() => {
                setEditingSchedule(null);
                setIsAddModalOpen(true);
              }}
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 border border-blue-400/50 px-3 py-2.5 rounded-xl shadow-lg shadow-blue-900 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Jadwal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Banner Status Pengumuman Manual Aktif (Sedang Mengudara) */}
      {manualPlayingSchedule && (
        <div className="bg-gradient-to-r from-[#07243e] via-[#05182e] to-[#0a2f4d] border-2 border-emerald-400 rounded-2xl p-4 shadow-[0_0_30px_rgba(16,185,129,0.3)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-lg animate-bounce">
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-black text-[10px] uppercase tracking-wider shadow-sm">
                  📢 Sedang Mengudara (Manual Announce)
                </span>
                <span className="font-mono text-white font-bold text-sm">
                  KA Feeder {manualPlayingSchedule.feederTrainNo} (Whoosh {manualPlayingSchedule.whooshTrainNo})
                </span>
                <span className="text-xs text-blue-300 font-semibold">
                  • Keberangkatan {manualPlayingSchedule.departureTime} WIB
                </span>
              </div>
              <div className="text-xs font-bold mt-1.5 flex items-center gap-2 flex-wrap">
                {manualPlayingPhase === 'chime_start' && (
                  <span className="text-amber-300 flex items-center gap-1.5 bg-amber-950/70 px-2.5 py-1 rounded-lg border border-amber-500/50">
                    <Bell className="w-4 h-4 text-amber-400 animate-spin" />
                    Tahap 1: Membunyikan Bell Stasiun Pembuka (Melodic Chime E5-G#5-B5-E6)...
                  </span>
                )}
                {manualPlayingPhase === 'announcing' && (
                  <span className="text-emerald-300 flex items-center gap-1.5 bg-emerald-950/70 px-2.5 py-1 rounded-lg border border-emerald-500/50">
                    <Megaphone className="w-4 h-4 text-emerald-400 animate-pulse" />
                    Tahap 2: Menyiarkan Pengumuman Suara Resmi / MP3...
                  </span>
                )}
                {manualPlayingPhase === 'chime_end' && (
                  <span className="text-teal-300 flex items-center gap-1.5 bg-teal-950/70 px-2.5 py-1 rounded-lg border border-teal-500/50">
                    <Bell className="w-4 h-4 text-teal-300 animate-spin" />
                    Tahap 3: Membunyikan Bell Stasiun Penutup (Closing Chime E6-B5-G#5-E5)...
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleStopManualAnnouncement}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center gap-2 shadow-lg transition-transform hover:scale-105 cursor-pointer whitespace-nowrap"
            title="Hentikan pemutaran audio dan chime stasiun sekarang"
          >
            <VolumeX className="w-4 h-4" />
            <span>Hentikan Siaran (Stop)</span>
          </button>
        </div>
      )}

      {/* 1. Mobile Cards View (Tampilan Khusus Layar HP / Smartphone & Tablet - block lg:hidden) */}
      <div className="block lg:hidden space-y-3.5">
        {filteredSchedules.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-[#071329] border border-blue-800/80 rounded-2xl p-6">
            <AlertCircle className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-60" />
            <p className="font-semibold text-white">Tidak ada jadwal ditemukan</p>
            <p className="text-xs text-blue-300/70 mt-0.5">
              Coba kata kunci pencarian lain atau tambahkan jadwal baru.
            </p>
          </div>
        ) : (
          filteredSchedules.map((item, index) => {
            const { scheduleOptions, fileOptions } = getSchedulePlaybackOptions(item);
            const filterMode = audioFilterMode[item.id] || 'all';
            const currentSelectedKey = selectedAnnounceType[item.id] || scheduleOptions[0]?.key || 'slot_pre_open';
            const selectedOptionObj =
              [...scheduleOptions, ...fileOptions].find((o) => o.key === currentSelectedKey) ||
              scheduleOptions[0];

            const hasPreOpen = Boolean(item.audioPreOpenUrl || item.audioPreOpenFileName);
            const hasGateOpen = Boolean(item.audioGateOpenUrl || item.audioGateOpenFileName);
            const hasClosing = Boolean(item.audioClosingUrl || item.audioClosingFileName || item.audioUrl);
            const customAlerts = item.customAudioAlerts || [];
            const totalAudioCount = fileOptions.length;
            const isThisPlaying = playingAudioId === item.id;
            const isManualPlayingThis = manualPlayingScheduleId === item.id;

            return (
              <div
                key={`mobile-${item.id}`}
                className={`bg-[#071329] border-2 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col gap-3 transition-colors ${
                  item.isDelayed
                    ? 'border-amber-500/90 bg-gradient-to-b from-[#0e1d38] to-[#071329]'
                    : item.isActive === false
                    ? 'border-slate-800/80 opacity-60 bg-[#050b18]'
                    : 'border-blue-700/80'
                }`}
              >
                {/* Header Kartu: Nomor KA, Whoosh, Delay badge & Status Toggle */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-mono font-bold text-blue-300 bg-blue-950/80 border border-blue-800 rounded px-1.5 py-0.5">
                      #{index + 1}
                    </span>
                    <span className="font-mono font-black text-sm text-white bg-blue-900/60 border border-blue-600/60 px-2 py-0.5 rounded-lg shadow-sm">
                      {item.feederTrainNo}
                    </span>
                    <span className="font-mono font-black text-xs text-red-100 bg-red-700 border border-red-500/60 px-2 py-0.5 rounded-lg shadow-sm">
                      {item.whooshTrainNo}
                    </span>
                    {item.isDelayed && (
                      <span className="text-[10px] font-bold text-slate-950 bg-amber-400 border border-amber-300 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-mono animate-pulse">
                        <AlertTriangle className="w-2.5 h-2.5 fill-slate-950" />
                        Delay +{item.delayMinutes}m
                      </span>
                    )}
                  </div>

                  {/* Toggle Aktif / Nonaktif */}
                  <button
                    onClick={() => handleToggleActive(item)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer flex-shrink-0 ${
                      item.isActive !== false
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-700 hover:bg-emerald-900'
                        : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${item.isActive !== false ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>{item.isActive !== false ? 'Aktif' : 'Off'}</span>
                  </button>
                </div>

                {/* Grid Waktu 3 Stasiun */}
                <div className="grid grid-cols-3 gap-2 bg-[#050e24] p-2.5 rounded-xl border border-blue-900/60 text-center">
                  <div>
                    <div className="text-[10px] text-blue-300 font-semibold uppercase flex items-center justify-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-blue-400" />
                      <span>Bandung</span>
                    </div>
                    {item.isDelayed && item.delayedDepartureTime ? (
                      <div className="mt-0.5">
                        <span className="font-mono text-[11px] text-slate-500 line-through mr-1 block">{item.departureTime}</span>
                        <span className="font-mono font-black text-amber-400 text-sm">{item.delayedDepartureTime}</span>
                        <span className="text-[9px] text-amber-400 font-bold block leading-none">WIB</span>
                      </div>
                    ) : (
                      <div className="font-mono font-black text-white text-sm mt-0.5">
                        {item.departureTime} <span className="text-[9px] text-blue-400 font-bold">WIB</span>
                      </div>
                    )}
                  </div>

                  <div className="border-x border-blue-900/60 px-1">
                    <div className="text-[10px] text-cyan-300 font-semibold uppercase flex items-center justify-center gap-0.5">
                      <Clock className="w-2.5 h-2.5 text-cyan-400" />
                      <span>Whoosh PDL</span>
                    </div>
                    {item.isDelayed && item.delayedWhooshDepartureTime ? (
                      <div className="mt-0.5">
                        <span className="font-mono text-[11px] text-slate-500 line-through mr-1 block">{item.whooshDepartureTime}</span>
                        <span className="font-mono font-black text-amber-300 text-sm">{item.delayedWhooshDepartureTime}</span>
                        <span className="text-[9px] text-amber-300 font-bold block leading-none">WIB</span>
                      </div>
                    ) : (
                      <div className="font-mono font-black text-cyan-300 text-sm mt-0.5">
                        {item.whooshDepartureTime} <span className="text-[9px] text-cyan-500 font-bold">WIB</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Tiba PDL</div>
                    <div className="font-mono font-bold text-slate-200 text-sm mt-0.5">
                      {item.delayedFeederArrivalTime || item.feederArrivalTime} <span className="text-[9px] text-slate-400 font-bold">WIB</span>
                    </div>
                  </div>
                </div>

                {/* Section Audio Pengumuman Mobile */}
                <div className="bg-[#051126] border border-blue-800/60 rounded-xl p-3 flex flex-col gap-2.5">
                  {/* Slot Status Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setAudioTargetSlot('pre_open');
                        setAudioTargetSchedule(item);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 cursor-pointer ${
                        hasPreOpen
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900'
                          : 'bg-slate-900/70 text-slate-400 border-slate-700/60 hover:border-slate-500'
                      }`}
                      title="Slot 1: 2 Menit Sebelum Gate Buka"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${hasPreOpen ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span>2m Buka</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAudioTargetSlot('gate_open');
                        setAudioTargetSchedule(item);
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 cursor-pointer ${
                        hasGateOpen
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900'
                          : 'bg-slate-900/70 text-slate-400 border-slate-700/60 hover:border-slate-500'
                      }`}
                      title="Slot 2: Gate Masuk Dibuka"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${hasGateOpen ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span>Gate Buka</span>
                    </button>

                    {customAlerts.map((ca) => (
                      <button
                        key={ca.id}
                        type="button"
                        onClick={() => {
                          setAudioTargetSlot(`custom_${ca.id}`);
                          setAudioTargetSchedule(item);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-full border bg-cyan-950/80 text-cyan-300 border-cyan-700/80 hover:bg-cyan-900 transition-colors flex items-center gap-1 cursor-pointer"
                        title={`Custom: ${ca.label}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        <span className="max-w-[70px] truncate">{ca.label}</span>
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setAudioTargetSlot('new_custom');
                        setAudioTargetSchedule(item);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-cyan-500/60 text-cyan-300 hover:bg-cyan-950/60 transition-colors flex items-center gap-0.5 cursor-pointer ml-auto"
                      title="Tambah slot audio kustom baru"
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>Waktu</span>
                    </button>
                  </div>

                  {/* Filter Mode Selector */}
                  <div className="flex items-center gap-1 text-[10px] bg-slate-950/80 p-1 rounded-lg border border-blue-900/50">
                    <span className="text-slate-400 font-semibold px-1">Mode:</span>
                    <button
                      type="button"
                      onClick={() => setAudioFilterMode((prev) => ({ ...prev, [item.id]: 'all' }))}
                      className={`px-2 py-0.5 rounded transition-all font-medium ${
                        filterMode === 'all'
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioFilterMode((prev) => ({ ...prev, [item.id]: 'schedule' }))}
                      className={`px-2 py-0.5 rounded transition-all font-medium ${
                        filterMode === 'schedule'
                          ? 'bg-cyan-700 text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Waktu Jadwal
                    </button>
                    <button
                      type="button"
                      onClick={() => setAudioFilterMode((prev) => ({ ...prev, [item.id]: 'file' }))}
                      className={`px-2 py-0.5 rounded transition-all font-medium ${
                        filterMode === 'file'
                          ? 'bg-indigo-700 text-white font-bold shadow-xs'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Nama File ({fileOptions.length})
                    </button>
                  </div>

                  {/* Dropdown Selection */}
                  <select
                    value={currentSelectedKey}
                    onChange={(e) => {
                      setSelectedAnnounceType((prev) => ({
                        ...prev,
                        [item.id]: e.target.value as ManualAnnouncementType,
                      }));
                    }}
                    className="w-full bg-[#030917] border border-blue-700 text-blue-100 text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-cyan-400 font-mono cursor-pointer"
                  >
                    {(filterMode === 'all' || filterMode === 'schedule') && (
                      <optgroup label="⏰ BERDASARKAN JADWAL PEMUTARAN">
                        {scheduleOptions.map((opt) => (
                          <option key={opt.key} value={opt.key} className="bg-[#071329] text-white">
                            {opt.label} • {opt.sublabel}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {(filterMode === 'all' || filterMode === 'file') && fileOptions.length > 0 && (
                      <optgroup label="📁 BERDASARKAN NAMA FILE MP3">
                        {fileOptions.map((opt) => (
                          <option key={opt.key} value={opt.key} className="bg-[#071329] text-cyan-200">
                            {opt.label} • {opt.sublabel}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {filterMode === 'file' && fileOptions.length === 0 && (
                      <option disabled value="" className="bg-[#071329] text-slate-400">
                        (Belum ada file MP3 yang diunggah)
                      </option>
                    )}
                  </select>

                  {/* Ribbon Info Audio yang Dipilih */}
                  {selectedOptionObj && (
                    <div className="flex items-center justify-between gap-1.5 text-[10px] bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-300">
                      <div className="flex items-center gap-1.5 truncate">
                        {selectedOptionObj.timeStr && (
                          <span className="font-mono font-bold text-cyan-300 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {selectedOptionObj.timeStr} WIB
                          </span>
                        )}
                        <span className="text-slate-400 truncate">• {selectedOptionObj.sublabel}</span>
                      </div>
                      {selectedOptionObj.lang === 'bilingual' && (
                        <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 rounded px-1 font-extrabold whitespace-nowrap">
                          🇮🇩 ➔ 1.5s ➔ 🇬🇧
                        </span>
                      )}
                      {selectedOptionObj.lang === 'id' && (
                        <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800 rounded px-1 font-bold whitespace-nowrap">
                          Bahasa ID
                        </span>
                      )}
                      {selectedOptionObj.lang === 'en' && (
                        <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-800 rounded px-1 font-bold whitespace-nowrap">
                          English
                        </span>
                      )}
                    </div>
                  )}

                  {/* Tombol Aksi Siaran & Preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handlePlayManualAnnouncement(item)}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                        isManualPlayingThis
                          ? 'bg-rose-600 text-white border-2 border-rose-400 animate-pulse'
                          : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 border border-emerald-300 hover:brightness-110 active:scale-98'
                      }`}
                    >
                      {isManualPlayingThis ? (
                        <>
                          <VolumeX className="w-4 h-4" />
                          <span>
                            {manualPlayingPhase === 'chime_start' && '🔔 Bell Pembuka...'}
                            {manualPlayingPhase === 'announcing' && '📢 Siaran Suara...'}
                            {manualPlayingPhase === 'chime_end' && '🔔 Bell Penutup...'}
                            {manualPlayingPhase === 'idle' && 'Stop Siaran'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Bell className="w-4 h-4 fill-slate-950 text-slate-950" />
                          <span>Putar Audio (+Bell)</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      {totalAudioCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handlePlayPreview(item)}
                          className="flex-1 py-2 px-2.5 rounded-xl bg-cyan-900/80 hover:bg-cyan-700 text-cyan-200 border border-cyan-600/50 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow"
                          title="Preview Cepat Audio MP3 Mentah"
                        >
                          {isThisPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          <span>Preview</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setAudioTargetSlot('pre_open');
                          setAudioTargetSchedule(item);
                        }}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-[#06183a] hover:bg-blue-800 border border-blue-700/80 text-blue-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow"
                      >
                        <Upload className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{totalAudioCount > 0 ? `Kelola (${totalAudioCount})` : 'Upload'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Footer Kartu Mobile: Tombol Delay, Live, Ubah & Hapus */}
                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-blue-900/40">
                  <button
                    type="button"
                    onClick={() => setDelayTargetSchedule(item)}
                    className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ${
                      item.isDelayed
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-black animate-pulse'
                        : 'bg-[#0f244a] text-amber-300 border-amber-600/70 hover:bg-amber-950'
                    }`}
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 ${item.isDelayed ? 'fill-slate-950' : 'text-amber-400'}`} />
                    <span>{item.isDelayed ? `Delay (+${item.delayMinutes ?? 0}m)` : 'Atur Delay'}</span>
                  </button>

                  {onOpenSimulate && (
                    <button
                      type="button"
                      onClick={() => onOpenSimulate(item.id)}
                      className="py-2 px-3 rounded-xl text-xs font-bold bg-[#071d3d] text-emerald-300 border border-emerald-700/80 hover:bg-emerald-900 hover:text-white transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Radio className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Live Track</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingSchedule(item);
                      setIsAddModalOpen(true);
                    }}
                    className="p-2 rounded-xl bg-blue-950 hover:bg-blue-800 border border-blue-800 text-blue-300 hover:text-white transition-colors cursor-pointer"
                    title="Ubah Jadwal"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id, item.whooshTrainNo)}
                    className="p-2 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white transition-colors cursor-pointer"
                    title="Hapus Jadwal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 2. Desktop Management Table (Tampilan Khusus Layar Laptop / Desktop - hidden lg:block) */}
      <div className="hidden lg:block bg-[#071329] border-2 border-blue-700/80 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#0b1c3e] border-b-2 border-blue-700 text-[11px] font-bold tracking-wider text-blue-200 uppercase">
                <th className="py-3.5 px-4 text-center w-12">No</th>
                <th className="py-3.5 px-4">No. Kereta</th>
                <th className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>Berangkat Bandung</span>
                  </div>
                </th>
                <th className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Berangkat Whoosh</span>
                  </div>
                </th>
                <th className="py-3.5 px-4">Tiba Padalarang</th>
                <th className="py-3.5 px-4 text-center">Status Display</th>
                <th className="py-3.5 px-4">Audio Pengumuman (+ Bell Stasiun)</th>
                <th className="py-3.5 px-4 text-center">Aksi</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-blue-900/50 text-sm">
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 bg-[#071329]">
                    <AlertCircle className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-60" />
                    <p className="font-semibold text-white">Tidak ada jadwal ditemukan</p>
                    <p className="text-xs text-blue-300/70 mt-0.5">
                      Coba kata kunci pencarian lain atau tambahkan jadwal baru.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSchedules.map((item, index) => {
                  const { scheduleOptions, fileOptions } = getSchedulePlaybackOptions(item);
                  const filterMode = audioFilterMode[item.id] || 'all';
                  const currentSelectedKey = selectedAnnounceType[item.id] || scheduleOptions[0]?.key || 'slot_pre_open';
                  const selectedOptionObj =
                    [...scheduleOptions, ...fileOptions].find((o) => o.key === currentSelectedKey) ||
                    scheduleOptions[0];

                  const hasPreOpen = Boolean(item.audioPreOpenUrl || item.audioPreOpenFileName);
                  const hasGateOpen = Boolean(item.audioGateOpenUrl || item.audioGateOpenFileName);
                  const hasClosing = Boolean(item.audioClosingUrl || item.audioClosingFileName || item.audioUrl);
                  const customAlerts = item.customAudioAlerts || [];
                  const totalAudioCount = fileOptions.length;
                  const isThisPlaying = playingAudioId === item.id;
                  const isManualPlayingThis = manualPlayingScheduleId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-[#0c1e40]/70 transition-colors ${
                        item.isActive === false ? 'opacity-50 bg-[#050b18]' : ''
                      }`}
                    >
                      {/* No */}
                      <td className="py-3 px-4 text-center font-mono text-xs text-slate-400">
                        {index + 1}
                      </td>

                      {/* No. Kereta */}
                      <td className="py-3 px-4">
                        <div className="font-black text-white tracking-wide text-sm flex items-center gap-1.5">
                          <span>{item.whooshTrainNo}</span>
                          {item.isDelayed && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black uppercase flex items-center gap-0.5 shadow-sm">
                              <AlertTriangle className="w-2.5 h-2.5 fill-slate-950" />
                              +{item.delayMinutes ?? 0}m
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-blue-300 font-mono">
                          {item.feederTrainNo}
                        </div>
                        {item.isDelayed && item.delayReason && (
                          <div className="text-[10px] text-amber-300/80 italic mt-0.5 truncate max-w-[150px]">
                            {item.delayReason}
                          </div>
                        )}
                      </td>

                      {/* Berangkat Bandung */}
                      <td className="py-3 px-4">
                        {item.isDelayed && item.delayedDepartureTime ? (
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-1">
                              <span className="font-mono text-xs text-slate-500 line-through">
                                {item.departureTime}
                              </span>
                              <span className="font-mono font-black text-amber-400 text-base">
                                {item.delayedDepartureTime}
                              </span>
                              <span className="text-[10px] text-amber-400 ml-0.5 font-semibold">WIB</span>
                            </div>
                            <span className="text-[9px] text-amber-300/80 font-bold uppercase tracking-wide">
                              Terlambat (+{item.delayMinutes ?? 0}m)
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-mono font-black text-white text-base">
                              {item.departureTime}
                            </span>
                            <span className="text-[10px] text-blue-400 ml-1 font-semibold">WIB</span>
                          </div>
                        )}
                      </td>

                      {/* Berangkat Whoosh (Padalarang) */}
                      <td className="py-3 px-4">
                        {item.isDelayed && item.delayedWhooshDepartureTime ? (
                          <div className="flex flex-col">
                            <div className="flex items-baseline gap-1">
                              <span className="font-mono text-xs text-slate-500 line-through">
                                {item.whooshDepartureTime}
                              </span>
                              <span className="font-mono font-black text-amber-300 text-base">
                                {item.delayedWhooshDepartureTime}
                              </span>
                              <span className="text-[10px] text-amber-300 ml-0.5 font-semibold">WIB</span>
                            </div>
                            <span className="text-[9px] text-amber-300/80 font-bold uppercase tracking-wide">
                              Terlambat (+{item.delayMinutes ?? 0}m)
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-mono font-black text-cyan-300 text-base">
                              {item.whooshDepartureTime}
                            </span>
                            <span className="text-[10px] text-cyan-500 ml-1 font-semibold">WIB</span>
                          </div>
                        )}
                      </td>

                      {/* Tiba Padalarang */}
                      <td className="py-3 px-4 font-mono text-xs text-blue-200">
                        {item.isDelayed && item.delayedFeederArrivalTime ? (
                          <span className="text-amber-200 font-bold">
                            {item.delayedFeederArrivalTime} WIB
                          </span>
                        ) : (
                          <span>{item.feederArrivalTime} WIB</span>
                        )}
                      </td>

                      {/* Toggle Aktif / Non-Aktif */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`text-xs px-2.5 py-1 rounded-full font-bold border transition-colors ${
                            item.isActive !== false
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-600 hover:bg-emerald-900'
                              : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                          }`}
                          title="Klik untuk ubah status tampil di layar publik"
                        >
                          {item.isActive !== false ? 'Aktif' : 'Non-Aktif'}
                        </button>
                      </td>

                      {/* Audio MP3 Column (3 Event Slots + Custom MP3 Times + Pilihan Jadwal / Nama File) */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-2 min-w-[280px]">
                          {/* Slot Status Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Slot 1: 2 Mnt Sebelum Buka */}
                            <button
                              onClick={() => {
                                setAudioTargetSlot('pre_open');
                                setAudioTargetSchedule(item);
                              }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${
                                hasPreOpen
                                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500/80 hover:bg-cyan-900'
                                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                              }`}
                              title={hasPreOpen ? 'File MP3 2 mnt sebelum buka aktif (Klik untuk kelola)' : 'Klik untuk upload/rekam slot 2m Buka'}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${hasPreOpen ? 'bg-cyan-400' : 'bg-slate-600'}`}></span>
                              2m Buka
                            </button>

                            {/* Slot 2: Saat Gate In Dibuka */}
                            <button
                              onClick={() => {
                                setAudioTargetSlot('gate_open');
                                setAudioTargetSchedule(item);
                              }}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${
                                hasGateOpen
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-500/80 hover:bg-emerald-900'
                                  : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300'
                              }`}
                              title={hasGateOpen ? 'File MP3 saat gate dibuka aktif (Klik untuk kelola)' : 'Klik untuk upload/rekam slot Gate Buka'}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${hasGateOpen ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                              Gate Buka
                            </button>

                            {/* Custom MP3 Slots (misal 5 menit sebelum keberangkatan) */}
                            {customAlerts.map((ca) => {
                              const hasCaAudio = Boolean(ca.audioUrl);
                              return (
                                <button
                                  key={ca.id}
                                  onClick={() => {
                                    setAudioTargetSlot(`custom_${ca.id}`);
                                    setAudioTargetSchedule(item);
                                  }}
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 ${
                                    hasCaAudio
                                      ? 'bg-purple-950 text-purple-300 border-purple-500/80 hover:bg-purple-900'
                                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                                  }`}
                                  title={`MP3 Kustom: ${ca.label} (Klik untuk kelola/ganti)`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${hasCaAudio ? 'bg-purple-400' : 'bg-amber-500'}`}></span>
                                  {ca.offsetMinutes}m {ca.relativeTo === 'departure' ? 'Berangkat' : 'Tutup'}
                                </button>
                              );
                            })}

                            {/* Quick button to add new MP3 time */}
                            <button
                              onClick={() => {
                                setAudioTargetSlot('new_custom');
                                setAudioTargetSchedule(item);
                              }}
                              className="text-[10px] text-cyan-400 hover:text-white px-1.5 py-0.5 rounded border border-dashed border-cyan-700/80 hover:border-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
                              title="Tambah waktu pemicu MP3 baru untuk kereta ini (misal 5 mnt sblm berangkat)"
                            >
                              <Plus className="w-2.5 h-2.5" />
                              <span>+ Waktu</span>
                            </button>
                          </div>

                          {/* Filter Mode Selector: Jadwal Pemutaran vs Nama File vs Semua */}
                          <div className="flex items-center gap-1.5 text-[10px] bg-slate-950/60 p-1 rounded-lg border border-blue-900/40">
                            <span className="text-slate-400 font-semibold px-1">Pilihan:</span>
                            <button
                              type="button"
                              onClick={() => setAudioFilterMode((prev) => ({ ...prev, [item.id]: 'all' }))}
                              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-bold ${
                                filterMode === 'all'
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                              }`}
                              title="Tampilkan semua pilihan jadwal dan nama file"
                            >
                              Semua
                            </button>
                            <button
                              type="button"
                              onClick={() => setAudioFilterMode((prev) => ({ ...prev, [item.id]: 'schedule' }))}
                              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-bold flex items-center gap-1 ${
                                filterMode === 'schedule'
                                  ? 'bg-cyan-600 text-white shadow-sm'
                                  : 'text-cyan-400/80 hover:text-cyan-200 hover:bg-cyan-950/50'
                              }`}
                              title="Pilihan disesuaikan dengan Jadwal Pemutaran (Waktu Pemicu: 2m sblm buka, saat buka, closing)"
                            >
                              <Clock className="w-2.5 h-2.5" />
                              <span>Waktu Jadwal</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setAudioFilterMode((prev) => ({ ...prev, [item.id]: 'file' }))}
                              className={`px-2 py-0.5 rounded transition-all cursor-pointer font-bold flex items-center gap-1 ${
                                filterMode === 'file'
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'text-purple-400/80 hover:text-purple-200 hover:bg-purple-950/50'
                              }`}
                              title="Pilihan berdasarkan Nama File MP3 yang tersimpan di server"
                            >
                              <FileAudio className="w-2.5 h-2.5" />
                              <span>Nama File ({fileOptions.length})</span>
                            </button>
                          </div>

                          {/* Control Controls Row: Play (+Bell), Dropdown, Preview Play, Upload Modal */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Tombol Utama Putar Audio Pengumuman Manual dengan Bell Pembuka & Penutup */}
                            <button
                              type="button"
                              onClick={() => handlePlayManualAnnouncement(item)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                                isManualPlayingThis
                                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-2 border-rose-400 shadow-rose-900/50 animate-pulse font-black'
                                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black border border-emerald-300 hover:scale-105'
                              }`}
                              title={
                                isManualPlayingThis
                                  ? 'Klik untuk Hentikan Siaran Suara Sekarang'
                                  : `Putar Pengumuman Suara KA ${item.feederTrainNo} (dengan Bell Pembuka & Penutup)`
                              }
                            >
                              {isManualPlayingThis ? (
                                <>
                                  <VolumeX className="w-3.5 h-3.5" />
                                  <span>
                                    {manualPlayingPhase === 'chime_start' && '🔔 Bell Buka...'}
                                    {manualPlayingPhase === 'announcing' && '📢 Siaran...'}
                                    {manualPlayingPhase === 'chime_end' && '🔔 Bell Tutup...'}
                                    {manualPlayingPhase === 'idle' && 'Stop Siaran'}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Bell className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                                  <span>Putar (+Bell)</span>
                                </>
                              )}
                            </button>

                            {/* Dropdown Pilihan: Berdasarkan Jadwal Pemutaran ATAU Nama File */}
                            <select
                              value={currentSelectedKey}
                              onChange={(e) =>
                                setSelectedAnnounceType((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value as ManualAnnouncementType,
                                }))
                              }
                              className="bg-[#050e24] border border-blue-700 hover:border-cyan-400 text-blue-100 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer max-w-[210px] font-mono"
                              title="Pilih pemicu pengumuman berdasarkan jadwal pemutaran atau nama file rekaman MP3"
                            >
                              {(filterMode === 'all' || filterMode === 'schedule') && (
                                <optgroup label="⏰ BERDASARKAN JADWAL PEMUTARAN">
                                  {scheduleOptions.map((opt) => (
                                    <option key={opt.key} value={opt.key}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </optgroup>
                              )}

                              {(filterMode === 'all' || filterMode === 'file') && (
                                <optgroup label={`📁 BERDASARKAN NAMA FILE MP3 (${fileOptions.length})`}>
                                  {fileOptions.length === 0 ? (
                                    <option disabled value="">
                                      Belum ada file MP3 diunggah
                                    </option>
                                  ) : (
                                    fileOptions.map((fOpt) => (
                                      <option key={fOpt.key} value={fOpt.key}>
                                        {fOpt.label}
                                      </option>
                                    ))
                                  )}
                                </optgroup>
                              )}
                            </select>

                            {/* Tombol Raw MP3 Preview jika ada file */}
                            {totalAudioCount > 0 && (
                              <button
                                type="button"
                                onClick={() => handlePlayPreview(item)}
                                className="p-1.5 rounded-lg bg-cyan-900/80 hover:bg-cyan-700 text-cyan-200 border border-cyan-600/50 shadow transition-colors cursor-pointer"
                                title={isThisPlaying ? 'Jeda Audio MP3 Mentah' : 'Preview Cepat Audio MP3 Mentah (Tanpa Bell)'}
                              >
                                {isThisPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                              </button>
                            )}

                            {/* Tombol Kelola / Upload MP3 */}
                            <button
                              onClick={() => {
                                setAudioTargetSlot('pre_open');
                                setAudioTargetSchedule(item);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#06183a] hover:bg-blue-800 border border-blue-700/80 text-blue-200 text-xs font-semibold transition-colors cursor-pointer"
                              title="Kelola atau upload rekaman MP3"
                            >
                              <Upload className="w-3 h-3 text-cyan-400" />
                              <span>{totalAudioCount > 0 ? `Kelola (${totalAudioCount})` : 'Upload'}</span>
                            </button>
                          </div>

                          {/* Selected Announcement Info Ribbon */}
                          {selectedOptionObj && (
                            <div className="flex items-center gap-1.5 text-[10px] bg-slate-950/80 border border-slate-800/80 rounded-md px-2 py-1 text-slate-300">
                              <span className="text-cyan-400 font-bold flex items-center gap-1">
                                {selectedOptionObj.category === 'schedule' ? (
                                  <>
                                    <Clock className="w-2.5 h-2.5" />
                                    <span>{selectedOptionObj.timeStr} WIB</span>
                                  </>
                                ) : (
                                  <>
                                    <FileAudio className="w-2.5 h-2.5 text-purple-400" />
                                    <span className="text-purple-300">File MP3</span>
                                  </>
                                )}
                              </span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-300 truncate max-w-[170px]" title={selectedOptionObj.sublabel}>
                                {selectedOptionObj.sublabel}
                              </span>
                              {selectedOptionObj.lang === 'bilingual' && (
                                <span className="ml-auto text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 rounded px-1 font-extrabold whitespace-nowrap">
                                  🇮🇩 ➔ 1.5s ➔ 🇬🇧
                                </span>
                              )}
                              {selectedOptionObj.lang === 'id' && (
                                <span className="ml-auto text-[9px] bg-blue-950 text-blue-300 border border-blue-800 rounded px-1 font-bold whitespace-nowrap">
                                  Bahasa ID
                                </span>
                              )}
                              {selectedOptionObj.lang === 'en' && (
                                <span className="ml-auto text-[9px] bg-purple-950 text-purple-300 border border-purple-800 rounded px-1 font-bold whitespace-nowrap">
                                  English
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* Tombol Cepat Putar Pengumuman Manual (+ Bell) */}
                          <button
                            type="button"
                            onClick={() => handlePlayManualAnnouncement(item)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer shadow-sm ${
                              isManualPlayingThis
                                ? 'bg-rose-600 hover:bg-rose-500 border-rose-400 text-white animate-pulse font-black'
                                : 'bg-[#06241a] text-emerald-300 border-emerald-700/80 hover:bg-emerald-900 hover:border-emerald-400 hover:text-white'
                            }`}
                            title={
                              isManualPlayingThis
                                ? 'Sedang siaran! Klik untuk hentikan audio.'
                                : `Putar Audio Pengumuman KA ${item.feederTrainNo} (dengan Bell Pembuka & Penutup)`
                            }
                          >
                            {isManualPlayingThis ? (
                              <>
                                <VolumeX className="w-3.5 h-3.5" />
                                <span>Stop</span>
                              </>
                            ) : (
                              <>
                                <Bell className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />
                                <span className="hidden xl:inline">Putar Suara</span>
                              </>
                            )}
                          </button>

                          {/* Tombol Live Track untuk baris ini */}
                          {onOpenSimulate && (
                            <button
                              type="button"
                              onClick={() => onOpenSimulate(item.id)}
                              className="px-2 py-1.5 rounded-lg text-xs font-bold bg-[#071d3d] text-emerald-300 border border-emerald-700/80 hover:bg-emerald-900 hover:border-emerald-400 hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                              title={`Buka live tracking pergerakan perjalanan (${item.departureTime} WIB)`}
                            >
                              <Radio className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="hidden xl:inline">Live</span>
                            </button>
                          )}

                          {/* Tombol Opsi Keterlambatan Kereta */}
                          <button
                            type="button"
                            onClick={() => setDelayTargetSchedule(item)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 cursor-pointer shadow-sm ${
                              item.isDelayed
                                ? 'bg-amber-500 text-slate-950 border-amber-400 hover:bg-amber-400 font-black animate-pulse'
                                : 'bg-[#0f244a] text-amber-300 border-amber-600/70 hover:bg-amber-950 hover:border-amber-400 hover:text-white'
                            }`}
                            title={
                              item.isDelayed
                                ? `Kereta ini berstatus TERLAMBAT (+${item.delayMinutes ?? 0} mnt). Klik untuk edit/reset!`
                                : 'Klik untuk mengatur status keterlambatan kereta ini'
                            }
                          >
                            <AlertTriangle className={`w-3.5 h-3.5 ${item.isDelayed ? 'fill-slate-950' : 'text-amber-400'}`} />
                            <span>{item.isDelayed ? `Delay (+${item.delayMinutes ?? 0}m)` : 'Delay'}</span>
                          </button>

                          <button
                            onClick={() => {
                              setEditingSchedule(item);
                              setIsAddModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-blue-950 hover:bg-blue-800 border border-blue-800 text-blue-300 hover:text-white transition-colors cursor-pointer"
                            title="Ubah Jadwal"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(item.id, item.whooshTrainNo)}
                            className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white transition-colors cursor-pointer"
                            title="Hapus Jadwal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Upload/Record MP3 */}
      {audioTargetSchedule && (
        <AudioUploadModal
          schedule={audioTargetSchedule}
          initialSlot={audioTargetSlot}
          onClose={() => setAudioTargetSchedule(null)}
          onSaved={(updated) => {
            if (updated) {
              setInternalSchedules((prev) =>
                prev.map((s) => (s.id === updated.id ? updated : s))
              );
            }
            setAudioTargetSchedule(null);
            onRefresh?.();
          }}
        />
      )}

      {/* Modal Add/Edit Schedule */}
      {isAddModalOpen && (
        <ScheduleFormModal
          initialData={editingSchedule}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingSchedule(null);
          }}
          onSaved={() => {
            setIsAddModalOpen(false);
            setEditingSchedule(null);
          }}
        />
      )}

      {/* Modal Kelola Keterlambatan Kereta (Delay) */}
      {delayTargetSchedule && (
        <DelayModal
          schedule={delayTargetSchedule}
          isOpen={Boolean(delayTargetSchedule)}
          onClose={() => setDelayTargetSchedule(null)}
          onSave={handleSaveDelay}
        />
      )}

      {/* Modal Audio Universal (2 Menit Sebelum Gate In Dibuka) */}
      {isUniversalModalOpen && (
        <UniversalAudioModal
          appSettings={appSettings}
          onClose={() => setIsUniversalModalOpen(false)}
          onSaved={() => {
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
