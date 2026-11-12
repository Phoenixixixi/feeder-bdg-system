import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  Volume2,
  FileAudio,
  Clock,
  DoorOpen,
  Plus,
  Sparkles,
  Check,
  RotateCcw,
  Globe,
  Loader2,
} from 'lucide-react';
import { FeederSchedule, CustomAudioAlert } from '../data/scheduleData';
import { evaluateTrainStatus, getCustomAlertTriggerTime } from '../utils/scheduleRules';
import {
  saveScheduleAudio,
  deleteScheduleAudio,
  getOrFetchAudioUrl,
  saveScheduleCustomAudioAlert,
  deleteScheduleCustomAudioAlert,
  applyCustomAlertToAllSchedules,
  saveUniversalPreOpenAudio,
  deleteUniversalPreOpenAudio,
  AudioSlot,
  AudioLanguage,
} from '../services/scheduleService';

export type AudioEventSlot = 'pre_open' | 'gate_open' | 'closing' | 'new_custom' | string;

interface AudioUploadModalProps {
  schedule: FeederSchedule;
  initialSlot?: string;
  onClose: () => void;
  onSaved: (updatedSchedule?: FeederSchedule) => void;
}

interface CustomPreset {
  label: string;
  offsetMinutes: number;
  relativeTo: 'departure' | 'gate_open' | 'close_gate';
  description: string;
}

const CUSTOM_PRESETS: CustomPreset[] = [
  {
    label: '5 Menit Sebelum Keberangkatan',
    offsetMinutes: 5,
    relativeTo: 'departure',
    description: 'Diputar tepat 5 menit sebelum kereta feeder berangkat dari peron Bandung',
  },
  {
    label: '10 Menit Sebelum Keberangkatan',
    offsetMinutes: 10,
    relativeTo: 'departure',
    description: 'Peringatan awal 10 menit sebelum jam keberangkatan',
  },
  {
    label: '15 Menit Sebelum Keberangkatan',
    offsetMinutes: 15,
    relativeTo: 'departure',
    description: 'Pemberitahuan awal 15 menit sebelum kereta berangkat',
  },
  {
    label: '3 Menit Sebelum Gate Ditutup',
    offsetMinutes: 3,
    relativeTo: 'close_gate',
    description: 'Peringatan mendesak 3 menit sebelum batas gate ditutup',
  },
];

export const AudioUploadModal: React.FC<AudioUploadModalProps> = ({
  schedule: initialSchedule,
  initialSlot = 'pre_open',
  onClose,
  onSaved,
}) => {
  const [schedule, setSchedule] = useState<FeederSchedule>(initialSchedule);
  const [selectedSlot, setSelectedSlot] = useState<AudioEventSlot>(
    initialSlot === 'closing' ? 'gate_open' : initialSlot
  );
  const [selectedLang, setSelectedLang] = useState<AudioLanguage>('id');
  const [activeTab, setActiveTab] = useState<'upload' | 'record'>('upload');
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStepText, setUploadStepText] = useState<string>('');
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form state for creating a NEW custom MP3 time
  const [customOffsetMinutes, setCustomOffsetMinutes] = useState<number>(5);
  const [customRelativeTo, setCustomRelativeTo] = useState<'departure' | 'gate_open' | 'close_gate'>('departure');
  const [customLabel, setCustomLabel] = useState<string>('5 Menit Sebelum Keberangkatan');
  const [applyToAllTrains, setApplyToAllTrains] = useState<boolean>(false);
  const [selectedPresetIdx, setSelectedPresetIdx] = useState<number | 'custom'>(0);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  const cleanNo = schedule.whooshTrainNo.replace(/[^a-zA-Z0-9]/g, '_');
  const trainInfo = evaluateTrainStatus(schedule, new Date());

  // Keep internal schedule in sync if parent prop updates
  useEffect(() => {
    setSchedule(initialSchedule);
  }, [initialSchedule]);

  // Find currently selected custom alert (if any)
  const currentCustomAlert = (schedule.customAudioAlerts || []).find(
    (a) => `custom_${a.id}` === selectedSlot || a.id === selectedSlot
  );

  // Load existing audio based on chosen event slot and chosen language
  useEffect(() => {
    setIsPlaying(false);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    let isMounted = true;
    async function loadSlotAudio() {
      let url = '';

      if (selectedLang === 'id') {
        if (selectedSlot === 'pre_open') {
          url = schedule.audioPreOpenUrl || '';
        } else if (selectedSlot === 'gate_open') {
          url = schedule.audioGateOpenUrl || '';
        } else if (selectedSlot === 'closing') {
          url = schedule.audioClosingUrl || schedule.audioUrl || '';
        } else if (selectedSlot === 'new_custom') {
          url = '';
        } else if (currentCustomAlert) {
          url = currentCustomAlert.audioUrl || '';
        }
      } else {
        // English
        if (selectedSlot === 'pre_open') {
          url = schedule.audioPreOpenEnUrl || '';
        } else if (selectedSlot === 'gate_open') {
          url = schedule.audioGateOpenEnUrl || '';
        } else if (selectedSlot === 'closing') {
          url = schedule.audioClosingEnUrl || schedule.audioEnUrl || '';
        } else if (selectedSlot === 'new_custom') {
          url = '';
        } else if (currentCustomAlert) {
          url = currentCustomAlert.audioEnUrl || '';
        }
      }

      if (!url && selectedSlot !== 'new_custom') {
        const fetched = await getOrFetchAudioUrl(schedule, selectedSlot as AudioSlot, selectedLang);
        if (fetched && isMounted) {
          url = fetched;
        }
      }

      if (isMounted) {
        setPreviewAudioUrl(url);
      }
    }

    loadSlotAudio();
    setErrorMessage('');
    setSuccessMessage('');

    return () => {
      isMounted = false;
    };
  }, [selectedSlot, selectedLang, schedule, currentCustomAlert]);

  // Derive file name and slot details based on chosen slot and language
  const langSuffix = selectedLang === 'en' ? '_en' : '_id';
  let targetFileName = `${cleanNo}_announcement${langSuffix}.mp3`;
  let slotTitle = 'Panggilan Terakhir';
  let slotDescription = 'Diputar saat mendekati batas akhir penutupan gate.';

  if (selectedSlot === 'pre_open') {
    targetFileName = `universal_2min_sebelum_buka${langSuffix}.mp3`;
    slotTitle = selectedLang === 'en' ? 'Audio Universal: 2 Min Before Gate Opens (EN)' : 'Audio Universal: 2 Menit Sebelum Gate Dibuka (ID)';
    slotDescription = selectedLang === 'en'
      ? '✨ Universal: Diputar untuk SELURUH 31 jadwal KA Feeder tepat 2 menit sebelum gate dibuka (English)'
      : '✨ Universal: Diputar untuk SELURUH 31 jadwal KA Feeder tepat 2 menit sebelum gate dibuka (Bahasa Indonesia)';
  } else if (selectedSlot === 'gate_open') {
    targetFileName = `${cleanNo}_gate_in_dibuka${langSuffix}.mp3`;
    slotTitle = selectedLang === 'en' ? 'Gate In Officially Opened (EN)' : 'Saat Gate In Resmi Dibuka (ID)';
    slotDescription = selectedLang === 'en' ? 'Diputar saat gate boarding dibuka (EN)' : 'Diputar saat gate boarding dibuka (ID)';
  } else if (selectedSlot === 'closing') {
    targetFileName = `${cleanNo}_panggilan_terakhir${langSuffix}.mp3`;
    slotTitle = selectedLang === 'en' ? 'Final Call / Closing Soon (EN)' : 'Panggilan Terakhir (Batas Akhir) (ID)';
    slotDescription = selectedLang === 'en' ? 'Diputar saat batas akhir penutupan gate (EN)' : 'Diputar saat batas akhir penutupan gate (ID)';
  } else if (selectedSlot === 'new_custom') {
    const relText =
      customRelativeTo === 'departure'
        ? 'sebelum_berangkat'
        : customRelativeTo === 'gate_open'
        ? 'sebelum_gate_buka'
        : 'sebelum_gate_tutup';
    targetFileName = `${cleanNo}_${customOffsetMinutes}m_${relText}${langSuffix}.mp3`;
    slotTitle = customLabel || `${customOffsetMinutes} Menit Sebelum ${customRelativeTo}`;
    slotDescription = `Diputar ${customOffsetMinutes} menit sebelum ${customRelativeTo === 'departure' ? 'berangkat' : customRelativeTo === 'gate_open' ? 'gate buka' : 'gate tutup'} (${selectedLang.toUpperCase()})`;
  } else if (currentCustomAlert) {
    const relText =
      currentCustomAlert.relativeTo === 'departure'
        ? 'sebelum_berangkat'
        : currentCustomAlert.relativeTo === 'gate_open'
        ? 'sebelum_gate_buka'
        : 'sebelum_gate_tutup';
    targetFileName =
      selectedLang === 'en'
        ? currentCustomAlert.audioEnFileName || `${cleanNo}_${currentCustomAlert.offsetMinutes}m_${relText}_en.mp3`
        : currentCustomAlert.audioFileName || `${cleanNo}_${currentCustomAlert.offsetMinutes}m_${relText}_id.mp3`;
    slotTitle = currentCustomAlert.label;
    slotDescription = `Diputar ${currentCustomAlert.offsetMinutes} menit sebelum ${currentCustomAlert.relativeTo === 'departure' ? 'berangkat' : currentCustomAlert.relativeTo === 'gate_open' ? 'gate buka' : 'gate tutup'} (${selectedLang.toUpperCase()})`;
  }

  // Calculate live preview trigger time for the new custom alert form
  const newAlertCalc = getCustomAlertTriggerTime(schedule.departureTime, {
    id: 'temp',
    label: customLabel,
    offsetMinutes: customOffsetMinutes,
    relativeTo: customRelativeTo,
  });

  // Handler when selecting a preset
  const handleSelectPreset = (idx: number) => {
    setSelectedPresetIdx(idx);
    const preset = CUSTOM_PRESETS[idx];
    setCustomOffsetMinutes(preset.offsetMinutes);
    setCustomRelativeTo(preset.relativeTo);
    setCustomLabel(preset.label);
  };

  // File Upload Handler
  const handleFileSelect = (file: File) => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!file.type.startsWith('audio/') && !file.name.endsWith('.mp3')) {
      setErrorMessage('Harap unggah file berformat audio MP3 (.mp3, .wav, .m4a).');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setErrorMessage('Ukuran file maksimal 8MB.');
      return;
    }

    setIsReadingFile(true);
    setUploadProgress(10);
    setUploadStepText(`Membaca ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`);

    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
        setUploadProgress(pct);
        setUploadStepText(`Membaca file audio: ${pct}%`);
      }
    };
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreviewAudioUrl(dataUrl);
      setIsReadingFile(false);
      setUploadProgress(0);
      setUploadStepText('');
    };
    reader.onerror = () => {
      setIsReadingFile(false);
      setUploadProgress(0);
      setUploadStepText('');
      setErrorMessage('Gagal membaca file audio.');
    };
    reader.readAsDataURL(file);
  };

  // Live Microphone Recording
  const startRecording = async () => {
    try {
      setErrorMessage('');
      setSuccessMessage('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'audio/mp3' });
        const reader = new FileReader();
        reader.onload = () => {
          setPreviewAudioUrl(reader.result as string);
        };
        reader.readAsDataURL(blob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      setErrorMessage('Izin mikrofon diperlukan untuk merekam suara langsung.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const togglePlayPreview = () => {
    if (!previewAudioUrl) return;

    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio(previewAudioUrl);
      audioPlayerRef.current.onended = () => setIsPlaying(false);
    } else {
      audioPlayerRef.current.src = previewAudioUrl;
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play().then(() => setIsPlaying(true)).catch((e) => {
        console.warn('Playback error:', e);
        setIsPlaying(false);
      });
    }
  };

  // Save Audio Handler (Supports standard slots & new/existing custom slots with ID / EN languages)
  const handleSaveAudio = async () => {
    if (!previewAudioUrl) {
      setErrorMessage('Harap unggah file MP3 atau rekam suara terlebih dahulu.');
      return;
    }

    setSaving(true);
    setUploadProgress(10);
    setUploadStepText('Menyiapkan file audio...');
    setErrorMessage('');
    setSuccessMessage('');

    const progressCallback = (percent: number, stepText: string) => {
      setUploadProgress(percent);
      setUploadStepText(stepText);
    };

    try {
      const langLabel = selectedLang === 'en' ? 'Bahasa Inggris (EN)' : 'Bahasa Indonesia (ID)';

      if (selectedSlot === 'new_custom') {
        // Saving a newly created Custom MP3 Time
        const newAlert: CustomAudioAlert = {
          id: `custom_${customRelativeTo}_${customOffsetMinutes}m_${Date.now()}`,
          label: customLabel.trim() || `${customOffsetMinutes} Menit Sebelum ${customRelativeTo}`,
          offsetMinutes: Number(customOffsetMinutes),
          relativeTo: customRelativeTo,
          audioUrl: selectedLang === 'id' ? previewAudioUrl : undefined,
          audioFileName: selectedLang === 'id' ? targetFileName : undefined,
          audioEnUrl: selectedLang === 'en' ? previewAudioUrl : undefined,
          audioEnFileName: selectedLang === 'en' ? targetFileName : undefined,
          enabled: true,
          createdAt: new Date().toISOString(),
        };

        if (applyToAllTrains) {
          await applyCustomAlertToAllSchedules(
            {
              label: newAlert.label,
              offsetMinutes: newAlert.offsetMinutes,
              relativeTo: newAlert.relativeTo,
            },
            previewAudioUrl,
            selectedLang,
            progressCallback
          );
          setSuccessMessage(`Berhasil menyimpan audio ${langLabel} "${newAlert.label}" untuk SEMUA 31 KA Feeder!`);
        } else {
          const updated = await saveScheduleCustomAudioAlert(
            schedule.id,
            newAlert,
            schedule.whooshTrainNo,
            selectedLang,
            progressCallback
          );
          if (updated) {
            setSchedule(updated);
          }
          setSuccessMessage(`Berhasil menyimpan audio ${langLabel} "${newAlert.label}" untuk ${schedule.whooshTrainNo}!`);
        }

        setUploadProgress(100);
        setUploadStepText('Selesai disimpan!');
        setSelectedSlot(`custom_${newAlert.id}`);
        onSaved();
      } else if (currentCustomAlert) {
        // Updating existing Custom MP3 Time audio for chosen language
        const updatedAlert: CustomAudioAlert = {
          ...currentCustomAlert,
          audioUrl: selectedLang === 'id' ? previewAudioUrl : currentCustomAlert.audioUrl,
          audioFileName: selectedLang === 'id' ? targetFileName : currentCustomAlert.audioFileName,
          audioEnUrl: selectedLang === 'en' ? previewAudioUrl : currentCustomAlert.audioEnUrl,
          audioEnFileName: selectedLang === 'en' ? targetFileName : currentCustomAlert.audioEnFileName,
        };

        const updated = await saveScheduleCustomAudioAlert(
          schedule.id,
          updatedAlert,
          schedule.whooshTrainNo,
          selectedLang,
          progressCallback
        );
        if (updated) {
          setSchedule(updated);
        }
        setUploadProgress(100);
        setUploadStepText('Selesai disimpan!');
        setSuccessMessage(`Berhasil memperbarui audio ${langLabel} untuk "${currentCustomAlert.label}"!`);
        onSaved(updated || undefined);
      } else if (selectedSlot === 'pre_open') {
        // Universal Slot (2 Menit Sebelum Gate In Dibuka - berlaku untuk seluruh jadwal)
        await saveUniversalPreOpenAudio(previewAudioUrl, targetFileName, selectedLang, progressCallback);
        setUploadProgress(100);
        setUploadStepText('Selesai disimpan!');
        setSuccessMessage(`Berhasil menyimpan Audio Universal ${langLabel}! File ini otomatis aktif di SELURUH 31 jadwal KA Feeder.`);
        onSaved();
      } else {
        // Standard Slot (gate_open, closing)
        const updated = await saveScheduleAudio(
          schedule.id,
          schedule.whooshTrainNo,
          previewAudioUrl,
          selectedSlot as AudioSlot,
          undefined,
          selectedLang,
          progressCallback
        );
        if (updated) {
          setSchedule(updated);
        }
        setUploadProgress(100);
        setUploadStepText('Selesai disimpan!');
        setSuccessMessage(`Berhasil menyimpan audio ${langLabel} "${targetFileName}" untuk ${slotTitle}!`);
        onSaved(updated || undefined);
      }
    } catch (err: any) {
      console.error('Error saving audio:', err);
      setErrorMessage('Gagal menyimpan audio ke database: ' + err.message);
    } finally {
      setTimeout(() => {
        setSaving(false);
        setUploadProgress(0);
        setUploadStepText('');
      }, 300);
    }
  };

  // Delete Audio Handler
  const handleDeleteAudio = async () => {
    const langLabel = selectedLang === 'en' ? 'Bahasa Inggris (EN)' : 'Bahasa Indonesia (ID)';

    if (currentCustomAlert) {
      // Check if both exist or just one
      const hasBothLangs = Boolean(
        (currentCustomAlert.audioUrl || currentCustomAlert.audioFileName) &&
        (currentCustomAlert.audioEnUrl || currentCustomAlert.audioEnFileName)
      );

      if (hasBothLangs) {
        if (!confirm(`Hapus audio ${langLabel} untuk waktu MP3 "${currentCustomAlert.label}"?`)) return;
        setSaving(true);
        setErrorMessage('');
        try {
          const updatedAlert: CustomAudioAlert = {
            ...currentCustomAlert,
            audioUrl: selectedLang === 'id' ? undefined : currentCustomAlert.audioUrl,
            audioFileName: selectedLang === 'id' ? undefined : currentCustomAlert.audioFileName,
            audioEnUrl: selectedLang === 'en' ? undefined : currentCustomAlert.audioEnUrl,
            audioEnFileName: selectedLang === 'en' ? undefined : currentCustomAlert.audioEnFileName,
          };
          const updated = await saveScheduleCustomAudioAlert(
            schedule.id,
            updatedAlert,
            schedule.whooshTrainNo,
            selectedLang
          );
          if (updated) {
            setSchedule(updated);
          }
          setPreviewAudioUrl('');
          setSuccessMessage(`Audio ${langLabel} untuk "${currentCustomAlert.label}" berhasil dihapus.`);
          onSaved(updated || undefined);
        } catch (err: any) {
          setErrorMessage('Gagal menghapus: ' + err.message);
        } finally {
          setSaving(false);
        }
        return;
      }

      // If only one language or user deletes the trigger entirely
      if (!confirm(`Hapus seluruh waktu pemicu MP3 "${currentCustomAlert.label}"?`)) return;
      setSaving(true);
      setErrorMessage('');
      try {
        const updated = await deleteScheduleCustomAudioAlert(
          schedule.id,
          currentCustomAlert.id,
          schedule.whooshTrainNo
        );
        if (updated) {
          setSchedule(updated);
        }
        setPreviewAudioUrl('');
        setSelectedSlot('pre_open');
        setSuccessMessage(`Waktu MP3 "${currentCustomAlert.label}" berhasil dihapus.`);
        onSaved(updated || undefined);
      } catch (err: any) {
        setErrorMessage('Gagal menghapus: ' + err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Standard slot deletion for chosen language
    if (selectedSlot === 'pre_open') {
      if (!confirm(`Hapus Audio Universal ${langLabel} (2 Menit Sebelum Dibuka)? File akan terhapus dari seluruh 31 jadwal KA Feeder.`)) return;
      setSaving(true);
      setErrorMessage('');
      setSuccessMessage('');
      try {
        await deleteUniversalPreOpenAudio(selectedLang);
        setPreviewAudioUrl('');
        setSuccessMessage(`Audio Universal ${langLabel} berhasil dihapus.`);
        onSaved();
      } catch (err: any) {
        setErrorMessage('Gagal menghapus audio universal: ' + err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!confirm(`Hapus file audio ${langLabel} untuk event "${slotTitle}"?`)) return;
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const updated = await deleteScheduleAudio(
        schedule.id,
        selectedSlot as AudioSlot,
        schedule.whooshTrainNo,
        selectedLang
      );
      if (updated) {
        setSchedule(updated);
      } else {
        setSchedule((prev) => {
          if (selectedLang === 'en') {
            return {
              ...prev,
              ...(selectedSlot === 'pre_open'
                ? { audioPreOpenEnUrl: '', audioPreOpenEnFileName: undefined }
                : selectedSlot === 'gate_open'
                ? { audioGateOpenEnUrl: '', audioGateOpenEnFileName: undefined }
                : { audioClosingEnUrl: '', audioClosingEnFileName: undefined, audioEnUrl: '', audioEnFileName: undefined }),
            };
          }
          return {
            ...prev,
            ...(selectedSlot === 'pre_open'
              ? { audioPreOpenUrl: '', audioPreOpenFileName: undefined }
              : selectedSlot === 'gate_open'
              ? { audioGateOpenUrl: '', audioGateOpenFileName: undefined }
              : { audioClosingUrl: '', audioClosingFileName: undefined, audioUrl: '', audioFileName: undefined }),
          };
        });
      }
      setPreviewAudioUrl('');
      setSuccessMessage(`Audio ${langLabel} untuk "${slotTitle}" berhasil dihapus.`);
      onSaved(updated || undefined);
    } catch (err: any) {
      console.error('Error deleting audio:', err);
      setErrorMessage('Gagal menghapus audio: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Status badges for each slot to see which slots have recordings for ID & EN
  const hasPreOpenAudioId = Boolean(schedule.audioPreOpenUrl || schedule.audioPreOpenFileName);
  const hasPreOpenAudioEn = Boolean(schedule.audioPreOpenEnUrl || schedule.audioPreOpenEnFileName);

  const hasGateOpenAudioId = Boolean(schedule.audioGateOpenUrl || schedule.audioGateOpenFileName);
  const hasGateOpenAudioEn = Boolean(schedule.audioGateOpenEnUrl || schedule.audioGateOpenEnFileName);

  const hasClosingAudioId = Boolean(schedule.audioClosingUrl || schedule.audioClosingFileName || schedule.audioUrl);
  const hasClosingAudioEn = Boolean(schedule.audioClosingEnUrl || schedule.audioClosingEnFileName || schedule.audioEnUrl);

  const customAlertsList = schedule.customAudioAlerts || [];

  const currentSlotHasIdAudio =
    selectedSlot === 'pre_open'
      ? hasPreOpenAudioId
      : selectedSlot === 'gate_open'
      ? hasGateOpenAudioId
      : selectedSlot === 'closing'
      ? hasClosingAudioId
      : Boolean(currentCustomAlert?.audioUrl || currentCustomAlert?.audioFileName);

  const currentSlotHasEnAudio =
    selectedSlot === 'pre_open'
      ? hasPreOpenAudioEn
      : selectedSlot === 'gate_open'
      ? hasGateOpenAudioEn
      : selectedSlot === 'closing'
      ? hasClosingAudioEn
      : Boolean(currentCustomAlert?.audioEnUrl || currentCustomAlert?.audioEnFileName);

  const hasAudioInSelectedSlot =
    Boolean(previewAudioUrl) || (selectedLang === 'en' ? currentSlotHasEnAudio : currentSlotHasIdAudio);

  return (
    <div className="fixed inset-0 z-50 bg-[#060c1c]/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-[#0e2247] to-[#071329] border-t-2 sm:border-2 border-blue-500/90 rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92dvh] sm:max-h-[90vh] flex flex-col shadow-2xl relative text-white my-0 sm:my-8 overflow-hidden">
        
        {/* Mobile Drag Indicator Handle */}
        <div className="pt-2.5 pb-1 flex justify-center sm:hidden flex-shrink-0 bg-[#0e2247]">
          <div className="w-12 h-1.5 bg-blue-400/40 rounded-full" />
        </div>

        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-blue-800/80 px-3.5 py-2.5 sm:px-6 sm:py-4 bg-[#0e2247]/95 backdrop-blur-md flex-shrink-0 z-10">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-blue-600 flex items-center justify-center border border-blue-400/40 shadow-md flex-shrink-0">
              <FileAudio className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] sm:text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.2 rounded uppercase">
                  AUDIO MP3 STASIUN
                </span>
                <span className="text-[10px] sm:text-xs text-blue-200 font-mono">
                  Berangkat: {schedule.departureTime} WIB
                </span>
              </div>
              <h3 className="text-sm sm:text-lg font-black text-white truncate mt-0.5">
                {schedule.whooshTrainNo} • {schedule.feederTrainNo}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-blue-900/80 transition-colors cursor-pointer flex-shrink-0"
            title="Tutup Modal"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 sm:px-6 sm:py-4 space-y-3.5 sm:space-y-4">
          
          {/* Slot Selector: Standard 3 Slots + Custom Slots + Add Button */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-xs font-bold text-blue-200 truncate">
                Pilih Waktu Pengumuman MP3:
              </label>
              <button
                type="button"
                onClick={() => {
                  setSelectedSlot('new_custom');
                  setSelectedPresetIdx(0);
                  setCustomOffsetMinutes(5);
                  setCustomRelativeTo('departure');
                  setCustomLabel('5 Menit Sebelum Keberangkatan');
                  setPreviewAudioUrl('');
                }}
                className="text-[11px] sm:text-xs font-bold text-cyan-300 hover:text-white bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/80 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all shadow-sm flex-shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">+ Tambah Waktu MP3 Baru</span>
                <span className="sm:hidden">+ Waktu Baru</span>
              </button>
            </div>

            {/* Grid of Slots: 2 Columns on both Mobile & Desktop */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5 mb-2">
              {/* Slot 1: 2 Mnt Sebelum Buka */}
              <button
                type="button"
                onClick={() => setSelectedSlot('pre_open')}
                className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                  selectedSlot === 'pre_open'
                    ? 'bg-cyan-950/90 border-cyan-400 ring-2 ring-cyan-500/60 shadow-lg'
                    : 'bg-[#06142e] border-blue-900/80 hover:border-blue-700 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 flex-shrink-0" />
                  <div className="flex items-center gap-0.5">
                    <span
                      className={`text-[8px] sm:text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                        hasPreOpenAudioId
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/80'
                          : 'bg-slate-900 text-slate-500 border border-slate-700'
                      }`}
                      title={hasPreOpenAudioId ? 'Audio Indonesia Tersedia' : 'Audio Indonesia Belum Ada'}
                    >
                      ID
                    </span>
                    <span
                      className={`text-[8px] sm:text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                        hasPreOpenAudioEn
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/80'
                          : 'bg-slate-900 text-slate-500 border border-slate-700'
                      }`}
                      title={hasPreOpenAudioEn ? 'English Audio Ready' : 'English Audio Not Set'}
                    >
                      EN
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-black text-[11px] sm:text-xs text-white leading-tight">
                    <span className="sm:hidden">2m Buka</span>
                    <span className="hidden sm:inline">2 Mnt Sblm Buka</span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-cyan-300/90 font-mono mt-0.5 truncate">
                    {trainInfo.checkingStartTime} (-2m)
                  </div>
                </div>
              </button>

              {/* Slot 2: Saat Gate Buka */}
              <button
                type="button"
                onClick={() => setSelectedSlot('gate_open')}
                className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                  selectedSlot === 'gate_open'
                    ? 'bg-emerald-950/90 border-emerald-400 ring-2 ring-emerald-500/60 shadow-lg'
                    : 'bg-[#06142e] border-blue-900/80 hover:border-blue-700 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <DoorOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" />
                  <div className="flex items-center gap-0.5">
                    <span
                      className={`text-[8px] sm:text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                        hasGateOpenAudioId
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/80'
                          : 'bg-slate-900 text-slate-500 border border-slate-700'
                      }`}
                      title={hasGateOpenAudioId ? 'Audio Indonesia Tersedia' : 'Audio Indonesia Belum Ada'}
                    >
                      ID
                    </span>
                    <span
                      className={`text-[8px] sm:text-[9px] px-1 py-0.2 rounded font-mono font-bold ${
                        hasGateOpenAudioEn
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/80'
                          : 'bg-slate-900 text-slate-500 border border-slate-700'
                      }`}
                      title={hasGateOpenAudioEn ? 'English Audio Ready' : 'English Audio Not Set'}
                    >
                      EN
                    </span>
                  </div>
                </div>
                <div>
                  <div className="font-black text-[11px] sm:text-xs text-white leading-tight">
                    <span className="sm:hidden">Gate Buka</span>
                    <span className="hidden sm:inline">Saat Gate Dibuka</span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-emerald-300/90 font-mono mt-0.5 truncate">
                    {trainInfo.checkingStartTime} WIB
                  </div>
                </div>
              </button>
            </div>

            {/* Custom MP3 Slots List (If any exist) */}
            {customAlertsList.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-blue-900/60">
                <div className="text-[11px] font-bold text-blue-300 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                  <span>Waktu Pemicu MP3 Kustom Terpasang:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {customAlertsList.map((alert) => {
                    const isSelected = selectedSlot === `custom_${alert.id}` || selectedSlot === alert.id;
                    const triggerInfo = getCustomAlertTriggerTime(schedule.departureTime, alert);
                    const hasMp3Id = Boolean(alert.audioUrl || alert.audioFileName);
                    const hasMp3En = Boolean(alert.audioEnUrl || alert.audioEnFileName);

                    return (
                      <button
                        key={alert.id}
                        type="button"
                        onClick={() => setSelectedSlot(`custom_${alert.id}`)}
                        className={`text-xs px-2.5 py-1.5 rounded-xl border font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-900 text-white border-cyan-400 ring-2 ring-cyan-500/50 shadow'
                            : 'bg-[#06142e] text-blue-200 border-blue-800 hover:border-cyan-500'
                        }`}
                      >
                        <div className="flex items-center gap-0.5">
                          <span
                            className={`text-[8px] px-1 py-0.2 rounded font-mono font-bold ${
                              hasMp3Id ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : 'bg-slate-900 text-slate-500 border border-slate-700'
                            }`}
                          >
                            ID
                          </span>
                          <span
                            className={`text-[8px] px-1 py-0.2 rounded font-mono font-bold ${
                              hasMp3En ? 'bg-cyan-950 text-cyan-300 border border-cyan-500' : 'bg-slate-900 text-slate-500 border border-slate-700'
                            }`}
                          >
                            EN
                          </span>
                        </div>
                        <span className="truncate max-w-[120px] sm:max-w-none">{alert.label}</span>
                        <span className="font-mono text-[10px] bg-black/40 px-1 py-0.5 rounded text-cyan-300">
                          {triggerInfo.triggerTimeStr} WIB
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* SECTION A: FORM TO ADD NEW CUSTOM MP3 TIME */}
          {selectedSlot === 'new_custom' ? (
            <div className="bg-[#050f24] border-2 border-cyan-500/80 rounded-2xl p-3 sm:p-4 shadow-xl">
              <div className="flex items-center justify-between mb-2.5 border-b border-blue-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Konfigurasi Waktu MP3 Baru
                  </h4>
                </div>
                <span className="text-[9px] sm:text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-600 px-1.5 py-0.5 rounded">
                  Pemicu Otomatis
                </span>
              </div>

              {/* Presets */}
              <div className="mb-3">
                <label className="text-xs font-bold text-blue-200 block mb-1.5">
                  Pilih Preset Waktu:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                  {CUSTOM_PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectPreset(idx)}
                      className={`p-2 rounded-xl border text-left transition-all text-xs cursor-pointer ${
                        selectedPresetIdx === idx
                          ? 'bg-cyan-950 border-cyan-400 text-white font-bold ring-1 ring-cyan-400'
                          : 'bg-[#06142e] border-blue-900/80 text-blue-200 hover:border-blue-700'
                      }`}
                    >
                      <div className="font-black text-cyan-300">{preset.offsetMinutes} Mnt</div>
                      <div className="text-[9px] sm:text-[10px] text-slate-300 leading-tight mt-0.5 truncate">
                        {preset.relativeTo === 'departure' ? 'Sblm Berangkat' : 'Sblm Gate Tutup'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Input Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 mb-3">
                <div>
                  <label className="text-xs font-bold text-blue-200 block mb-1">
                    Waktu Menit Pemicu:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={customOffsetMinutes}
                      onChange={(e) => {
                        const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                        setCustomOffsetMinutes(val);
                        setSelectedPresetIdx('custom');
                        setCustomLabel(`${val} Menit Sebelum ${customRelativeTo === 'departure' ? 'Keberangkatan' : customRelativeTo === 'gate_open' ? 'Gate Dibuka' : 'Gate Ditutup'}`);
                      }}
                      className="w-16 sm:w-20 bg-[#071329] border border-blue-800 rounded-xl px-2.5 py-2 text-white font-mono font-bold text-sm focus:outline-none focus:border-cyan-400 text-center"
                    />
                    <select
                      value={customRelativeTo}
                      onChange={(e) => {
                        const rel = e.target.value as any;
                        setCustomRelativeTo(rel);
                        setSelectedPresetIdx('custom');
                        setCustomLabel(`${customOffsetMinutes} Menit Sebelum ${rel === 'departure' ? 'Keberangkatan' : rel === 'gate_open' ? 'Gate Dibuka' : 'Gate Ditutup'}`);
                      }}
                      className="flex-1 bg-[#071329] border border-blue-800 rounded-xl px-2.5 py-2 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
                    >
                      <option value="departure">Menit Sebelum Berangkat</option>
                      <option value="gate_open">Menit Sebelum Gate Buka</option>
                      <option value="close_gate">Menit Sebelum Gate Tutup</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-blue-200 block mb-1">
                    Label Pengumuman:
                  </label>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Contoh: 5 Menit Sebelum Keberangkatan"
                    className="w-full bg-[#071329] border border-blue-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Calculated Timing Banner */}
              <div className="bg-[#030919] border border-cyan-500/40 rounded-xl p-2 sm:p-2.5 flex items-center justify-between gap-2 text-xs mb-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Clock className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="text-blue-200 truncate">
                    Target: <strong>{schedule.whooshTrainNo}</strong> ({schedule.departureTime} WIB)
                  </span>
                </div>
                <div className="font-mono font-black text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-lg border border-cyan-500/60 flex-shrink-0 text-xs">
                  {newAlertCalc.triggerTimeStr} WIB
                </div>
              </div>

              {/* Option to apply to all trains */}
              <label className="flex items-center gap-2 text-xs text-blue-200 cursor-pointer p-1">
                <input
                  type="checkbox"
                  checked={applyToAllTrains}
                  onChange={(e) => setApplyToAllTrains(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-[#071329] border-blue-700"
                />
                <span className="font-semibold text-white text-[11px] sm:text-xs">
                  Terapkan waktu MP3 & audio ini ke semua 31 jadwal KA Feeder
                </span>
              </label>
            </div>
          ) : (
            /* SECTION B: ACTIVE SLOT SUMMARY */
            <div className="bg-[#050f24] border border-blue-800/80 rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 overflow-hidden">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] sm:text-[10px] uppercase font-bold text-blue-300 tracking-wider">
                  Target Audio ({slotTitle}):
                </div>
                <div className="font-mono text-cyan-300 font-bold text-xs sm:text-sm mt-0.5 flex items-center gap-1.5 truncate">
                  <span className={previewAudioUrl ? 'text-emerald-400' : 'text-slate-500'}>●</span>
                  <span className="truncate">{targetFileName}</span>
                </div>
              </div>
              <div className="text-[10px] sm:text-[11px] bg-blue-900/60 text-blue-200 border border-blue-700 px-2.5 py-1 rounded-lg break-words leading-tight max-w-full self-start sm:self-center">
                {slotDescription}
              </div>
            </div>
          )}

          {/* Upload Progress Bar Card */}
          {(saving || isReadingFile) && (
            <div className="bg-[#040f26] border-2 border-cyan-400 rounded-2xl p-3.5 sm:p-4 shadow-[0_0_35px_rgba(6,182,212,0.35)] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Loader2 className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white flex items-center gap-2">
                      <span>{isReadingFile ? 'Membaca File Audio...' : 'Mengunggah & Menyinkronkan Audio...'}</span>
                    </div>
                    <p className="text-[11px] text-cyan-300 font-medium truncate mt-0.5">
                      {uploadStepText || 'Memproses chunk data audio ke cloud...'}
                    </p>
                  </div>
                </div>
                <div className="font-mono text-base font-black text-cyan-300 bg-cyan-950 border border-cyan-500/60 px-3 py-1 rounded-xl shadow-inner flex-shrink-0">
                  {uploadProgress}%
                </div>
              </div>

              {/* Progress Track & Animated Bar */}
              <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-cyan-500/40 relative">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(6,182,212,0.8)] relative overflow-hidden"
                  style={{ width: `${Math.max(6, Math.min(100, uploadProgress))}%` }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.3)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.3)_75%,transparent_75%,transparent)] bg-[length:24px_24px] animate-[pulse_1.5s_infinite]" />
                </div>
              </div>

              <div className="flex items-center justify-between mt-2 text-[10px] text-blue-300/80">
                <span>Sinkronisasi otomatis ke cloud & database stasiun</span>
                <span className="font-semibold text-amber-300">Mohon tunggu sebentar...</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-200 text-xs flex items-start gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Language Selector: Bahasa Indonesia (ID) & Bahasa Inggris (EN) */}
          <div className="bg-[#050f24] border border-blue-800/80 rounded-2xl p-3 sm:p-3.5 shadow-md">
            <div className="flex items-center justify-between gap-1.5 mb-2">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-400 flex-shrink-0" />
                <span className="text-xs font-bold text-white">
                  Bahasa Audio MP3:
                </span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-cyan-300/80 font-medium truncate">
                🇮🇩 ID ➔ Jeda 1.5s ➔ 🇬🇧 EN
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedLang('id')}
                className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                  selectedLang === 'id'
                    ? 'bg-gradient-to-r from-blue-900 to-indigo-950 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg'
                    : 'bg-[#06142e] border-blue-900/80 text-slate-300 hover:text-white hover:border-blue-700'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-lg">🇮🇩</span>
                    <span className="text-xs font-bold text-white">Indonesia</span>
                  </div>
                  <span
                    className={`text-[8px] sm:text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      currentSlotHasIdAudio
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {currentSlotHasIdAudio ? '● Ada' : 'Kosong'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 pl-6 sm:pl-7 truncate">
                  Pengumuman utama
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLang('en')}
                className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all relative cursor-pointer ${
                  selectedLang === 'en'
                    ? 'bg-gradient-to-r from-blue-900 to-indigo-950 border-cyan-400 ring-2 ring-cyan-500/50 shadow-lg'
                    : 'bg-[#06142e] border-blue-900/80 text-slate-300 hover:text-white hover:border-blue-700'
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base sm:text-lg">🇬🇧</span>
                    <span className="text-xs font-bold text-white">English</span>
                  </div>
                  <span
                    className={`text-[8px] sm:text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      currentSlotHasEnAudio
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {currentSlotHasEnAudio ? '● Ready' : 'Empty'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 pl-6 sm:pl-7 truncate">
                  Secondary broadcast
                </div>
              </button>
            </div>
          </div>

          {/* Tabs: Upload vs Live Record */}
          <div className="flex rounded-xl bg-[#050f24] p-1 border border-blue-900/80">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'upload'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Upload MP3 ({selectedLang.toUpperCase()})</span>
            </button>
            <button
              onClick={() => setActiveTab('record')}
              className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'record'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Rekam Mic ({selectedLang.toUpperCase()})</span>
            </button>
          </div>

          {/* Tab 1: File Upload (Touch-optimized for Mobile) */}
          {activeTab === 'upload' && (
            <div>
              <label className="border-2 border-dashed border-blue-700/80 hover:border-cyan-400 bg-[#061129]/60 hover:bg-[#071633] rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center cursor-pointer transition-colors group text-center active:scale-[0.99]">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-blue-900/60 border border-blue-700 flex items-center justify-center text-cyan-400 mb-2 group-hover:scale-110 transition-transform">
                  <Upload className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <span className="text-xs sm:text-sm font-bold text-white">
                  Ketuk untuk Pilih File MP3 dari HP / Komputer
                </span>
                <span className="text-[10px] sm:text-[11px] text-blue-300/80 mt-0.5">
                  Format Audio: .mp3, .wav, .m4a (Maks. 8MB)
                </span>
                <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold border border-blue-400/40 shadow-sm flex items-center gap-1.5">
                  <FileAudio className="w-3.5 h-3.5" />
                  <span>Jelajahi File Suara</span>
                </div>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </label>
            </div>
          )}

          {/* Tab 2: Live Recording */}
          {activeTab === 'record' && (
            <div className="bg-[#061129]/70 border border-blue-800 rounded-2xl p-3.5 sm:p-4 text-center">
              <div className="mb-3">
                <div className="text-2xl font-mono font-black text-cyan-300">
                  {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
                  {String(recordingSeconds % 60).padStart(2, '0')}
                </div>
                <div className="text-xs text-blue-300 mt-0.5">
                  {recording ? `Merekam suara pengumuman "${slotTitle}" (${selectedLang.toUpperCase()})...` : 'Tekan tombol di bawah untuk mulai merekam melalui mikrofon'}
                </div>
              </div>

              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="py-2.5 px-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 mx-auto shadow-lg shadow-rose-950 transition-all cursor-pointer"
                >
                  <Mic className="w-4 h-4 animate-pulse" />
                  <span>Mulai Rekam Suara Petugas</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="py-2.5 px-5 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-2 mx-auto shadow-lg shadow-amber-950 transition-all animate-bounce cursor-pointer"
                >
                  <Square className="w-4 h-4 fill-black" />
                  <span>Selesai & Gunakan Rekaman</span>
                </button>
              )}
            </div>
          )}

          {/* Audio Player Preview */}
          {previewAudioUrl && (
            <div className="bg-[#050f24] border border-blue-700/80 rounded-2xl p-3 sm:p-3.5 shadow-md">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 min-w-0">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">Audio Siap ({targetFileName})</span>
                </div>
                <button
                  type="button"
                  onClick={togglePlayPreview}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow flex-shrink-0 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Jeda</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Dengarkan Preview</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-[11px] text-blue-200 leading-snug break-words mt-1 pt-1.5 border-t border-blue-800/50">
                {selectedSlot === 'new_custom' ? (
                  <span>Audio MP3 ini diputar otomatis pada <strong>pukul {newAlertCalc.triggerTimeStr} WIB</strong> ({customLabel}).</span>
                ) : (
                  <span>Audio MP3 ini diputar saat fase <strong>{slotTitle}</strong>.</span>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Sticky Bottom Action Bar (Easy thumb-reach on mobile) */}
        <div className="sticky bottom-0 bg-[#071329]/95 backdrop-blur-md border-t border-blue-800/80 px-3.5 py-2.5 sm:px-6 sm:py-3.5 flex items-center justify-between gap-2 z-10 flex-shrink-0">
          <div>
            {(hasAudioInSelectedSlot || currentCustomAlert) && selectedSlot !== 'new_custom' ? (
              <button
                type="button"
                onClick={handleDeleteAudio}
                disabled={saving || isReadingFile}
                className="flex items-center gap-1.5 text-xs text-rose-300 hover:text-white px-2.5 sm:px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 transition-all disabled:opacity-50 font-semibold shadow-sm cursor-pointer"
                title="Hapus file audio"
              >
                <Trash2 className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span className="hidden sm:inline">
                  {currentCustomAlert
                    ? currentSlotHasIdAudio && currentSlotHasEnAudio
                      ? `Hapus Audio ${selectedLang.toUpperCase()}`
                      : 'Hapus Waktu MP3 Ini'
                    : `Hapus Audio ${selectedLang.toUpperCase()}`}
                </span>
                <span className="sm:hidden">Hapus</span>
              </button>
            ) : (
              <div />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || isReadingFile}
              className="px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white border border-blue-800 hover:bg-blue-900/60 transition-colors cursor-pointer disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSaveAudio}
              disabled={saving || isReadingFile || !previewAudioUrl}
              className="px-4 sm:px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg disabled:opacity-50 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mengunggah ({uploadProgress}%)...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {selectedSlot === 'new_custom'
                      ? 'Simpan Waktu'
                      : `Simpan MP3`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
