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
  Sparkles,
  Globe,
  Radio,
  Loader2,
} from 'lucide-react';
import {
  AppSettings,
  saveUniversalPreOpenAudio,
  deleteUniversalPreOpenAudio,
} from '../services/scheduleService';

interface UniversalAudioModalProps {
  appSettings: AppSettings | null;
  onClose: () => void;
  onSaved?: () => void;
}

export const UniversalAudioModal: React.FC<UniversalAudioModalProps> = ({
  appSettings,
  onClose,
  onSaved,
}) => {
  const [selectedLang, setSelectedLang] = useState<'id' | 'en'>('id');
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStepText, setUploadStepText] = useState<string>('');
  const [isReadingFile, setIsReadingFile] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Sync preview audio URL when language changes
  useEffect(() => {
    setIsPlaying(false);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const currentUrl =
      selectedLang === 'id'
        ? appSettings?.universalPreOpenUrl || ''
        : appSettings?.universalPreOpenEnUrl || '';

    setPreviewAudioUrl(currentUrl);
    setErrorMessage('');
    setSuccessMessage('');
  }, [selectedLang, appSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  const currentFileName =
    selectedLang === 'id'
      ? appSettings?.universalPreOpenFileName || (appSettings?.universalPreOpenUrl ? 'universal_2min_sebelum_buka_id.mp3' : '')
      : appSettings?.universalPreOpenEnFileName || (appSettings?.universalPreOpenEnUrl ? 'universal_2min_sebelum_buka_en.mp3' : '');

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
      const audio = new Audio(previewAudioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setIsPlaying(false);
        setErrorMessage('Gagal memutar audio preview.');
      };
      audioPlayerRef.current = audio;
    } else {
      audioPlayerRef.current.src = previewAudioUrl;
    }

    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          setIsPlaying(false);
          setErrorMessage('Peramban memblokir pemutaran otomatis.');
        });
    }
  };

  const handleSaveAudio = async () => {
    if (!previewAudioUrl) {
      setErrorMessage('Pilih atau rekam file audio terlebih dahulu.');
      return;
    }

    setSaving(true);
    setUploadProgress(10);
    setUploadStepText('Menyiapkan file audio...');
    setErrorMessage('');
    setSuccessMessage('');

    const langSuffix = selectedLang === 'en' ? '_en' : '_id';
    const targetFileName = `universal_2min_sebelum_buka${langSuffix}.mp3`;
    const langLabel = selectedLang === 'en' ? 'Bahasa Inggris (EN)' : 'Bahasa Indonesia (ID)';

    try {
      await saveUniversalPreOpenAudio(
        previewAudioUrl,
        targetFileName,
        selectedLang,
        (percent, stepText) => {
          setUploadProgress(percent);
          setUploadStepText(stepText);
        }
      );
      setUploadProgress(100);
      setUploadStepText('Selesai disimpan!');
      setSuccessMessage(`Berhasil menyimpan Audio Universal ${langLabel}! File ini otomatis aktif di SELURUH 31 jadwal KA Feeder.`);
      onSaved?.();
    } catch (err: any) {
      console.error('Error saving universal audio:', err);
      setErrorMessage('Gagal menyimpan audio ke database: ' + err.message);
    } finally {
      setTimeout(() => {
        setSaving(false);
        setUploadProgress(0);
        setUploadStepText('');
      }, 300);
    }
  };

  const handleDeleteAudio = async () => {
    const langLabel = selectedLang === 'en' ? 'Bahasa Inggris (EN)' : 'Bahasa Indonesia (ID)';
    if (!confirm(`Hapus Audio Universal ${langLabel} (2 Menit Sebelum Dibuka)? File akan terhapus dari seluruh 31 jadwal KA Feeder.`)) return;

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await deleteUniversalPreOpenAudio(selectedLang);
      setPreviewAudioUrl('');
      setSuccessMessage(`Audio Universal ${langLabel} berhasil dihapus.`);
      onSaved?.();
    } catch (err: any) {
      setErrorMessage('Gagal menghapus audio universal: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-[#0b1b3a] border-2 border-indigo-500/80 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(99,102,241,0.25)] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0d234d] via-[#091b3b] to-[#122852] border-b border-indigo-500/40 p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-slate-950 flex items-center justify-center font-black shadow-lg">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white">
                  Audio Universal: 2 Menit Sebelum Gate In Dibuka
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400 text-indigo-300 font-black text-[10px] uppercase tracking-wider shadow-sm">
                  Universal 31 KA
                </span>
              </div>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Pengumuman Prioritas Boarding yang berlaku sama untuk <strong>seluruh jadwal kereta</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 p-2 rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Universal Banner Notice */}
          <div className="bg-gradient-to-r from-indigo-950/70 via-blue-950/60 to-cyan-950/70 border border-indigo-500/40 rounded-xl p-3 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-200/90 leading-relaxed">
              <strong>Satu File Untuk Semua Kereta:</strong> File MP3 yang Anda simpan di sini akan otomatis dipakai oleh <strong>seluruh 31 jadwal KA Feeder</strong> tepat pada 2 menit sebelum pemeriksaan tiket dibuka. Anda tidak perlu mengupload per kereta satu per satu.
            </div>
          </div>

          {/* Language Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              <span>Pilih Bahasa Pengumuman Universal:</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedLang('id')}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  selectedLang === 'id'
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-cyan-400 text-white shadow-md'
                    : 'bg-[#061226] border-blue-900/60 text-slate-300 hover:bg-blue-950/40'
                }`}
              >
                <span>🇮🇩 Bahasa Indonesia (ID)</span>
                {appSettings?.universalPreOpenFileName && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedLang('en')}
                className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  selectedLang === 'en'
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-cyan-400 text-white shadow-md'
                    : 'bg-[#061226] border-blue-900/60 text-slate-300 hover:bg-blue-950/40'
                }`}
              >
                <span>🇬🇧 English (EN - Opsional)</span>
                {appSettings?.universalPreOpenEnFileName && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                )}
              </button>
            </div>
          </div>

          {/* Status Current File */}
          <div className="bg-[#061329] border border-blue-900/80 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-900/60 border border-blue-700/60 flex items-center justify-center text-cyan-300 flex-shrink-0">
                <FileAudio className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  File Audio Aktif Saat Ini ({selectedLang.toUpperCase()})
                </div>
                <div className="text-xs font-black text-white truncate font-mono">
                  {currentFileName || 'Belum diunggah (Memakai Suara Sistem Stasiun)'}
                </div>
              </div>
            </div>

            {currentFileName && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 text-[10px] font-black flex items-center gap-1 flex-shrink-0">
                <CheckCircle className="w-3 h-3" />
                <span>AKTIF UNIVERSAL</span>
              </span>
            )}
          </div>

          {/* Upload & Record Area */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
              Unggah File MP3 / Rekam Suara Universal ({selectedLang.toUpperCase()}):
            </label>

            {/* Drag & Drop File */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileSelect(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-indigo-400/50 hover:border-cyan-400 rounded-2xl p-6 text-center bg-[#07152f]/60 hover:bg-[#0a1e3f]/60 transition-all cursor-pointer relative group"
            >
              <input
                type="file"
                accept="audio/mp3,audio/wav,audio/m4a,audio/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/30 text-cyan-300 flex items-center justify-center border border-indigo-500/40 group-hover:scale-110 transition-transform shadow-md">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-xs sm:text-sm font-bold text-white">
                  Klik untuk memilih file MP3 atau seret ke sini
                </div>
                <div className="text-[11px] text-blue-200/70">
                  Format audio .mp3, .wav, .m4a (Maksimal 8MB)
                </div>
              </div>
            </div>

            {/* Microphone Record Alternative */}
            <div className="flex items-center gap-2">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-full text-xs font-bold text-amber-200 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-600/60 p-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Mic className="w-4 h-4 text-amber-400" />
                  <span>Rekam Suara Langsung Melalui Mikrofon</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-full text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 p-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer animate-pulse"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Hentikan Rekaman ({recordingSeconds} detik)</span>
                </button>
              )}
            </div>
          </div>

          {/* Audio Preview Player */}
          {previewAudioUrl && (
            <div className="bg-[#050f21] border border-cyan-500/50 rounded-xl p-3.5 space-y-2.5 shadow-md">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></div>
                  <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                    Audio Siap Disimpan:
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewAudioUrl('')}
                  className="text-slate-400 hover:text-rose-400 text-xs font-semibold cursor-pointer"
                >
                  Batal / Ganti
                </button>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlayPreview}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 flex items-center justify-center font-black shadow-md cursor-pointer transition-transform active:scale-95 flex-shrink-0"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950 ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono font-bold text-white truncate">
                    {currentFileName || `universal_2min_sebelum_buka_${selectedLang}.mp3`}
                  </div>
                  <div className="text-[10px] text-blue-300">
                    {isPlaying ? 'Sedang diputar...' : 'Klik tombol play untuk mendengarkan pratinjau suara'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upload & Processing Progress Bar Card */}
          {(saving || isReadingFile) && (
            <div className="bg-[#040f26] border-2 border-cyan-400 rounded-2xl p-4 shadow-[0_0_35px_rgba(6,182,212,0.35)] animate-in fade-in zoom-in-95 duration-200">
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
                <span>Otomatis aktif di seluruh 31 KA Feeder</span>
                <span className="font-semibold text-amber-300">Mohon tunggu sebentar...</span>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="bg-rose-950/60 border border-rose-500/70 text-rose-200 text-xs p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-950/60 border border-emerald-500/70 text-emerald-200 text-xs p-3 rounded-xl flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-[#08152e] border-t border-indigo-500/30 p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div>
            {(currentFileName || previewAudioUrl) && (
              <button
                type="button"
                onClick={handleDeleteAudio}
                disabled={saving || isReadingFile}
                className="w-full sm:w-auto text-xs font-bold text-rose-300 hover:text-white bg-rose-950/40 hover:bg-rose-900 border border-rose-800/80 px-3.5 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Audio Universal ({selectedLang.toUpperCase()})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || isReadingFile}
              className="w-full sm:w-auto text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2.5 rounded-xl border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handleSaveAudio}
              disabled={saving || isReadingFile || !previewAudioUrl}
              className="w-full sm:w-auto text-xs font-black text-slate-950 bg-gradient-to-r from-cyan-400 to-teal-300 hover:from-cyan-300 hover:to-teal-200 border border-cyan-200 px-5 py-2.5 rounded-xl shadow-lg shadow-cyan-950 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Mengunggah ({uploadProgress}%)...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 fill-slate-950" />
                  <span>Simpan Sebagai Audio Universal</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
