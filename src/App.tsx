/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from './firebase';
import { FeederSchedule, INITIAL_SCHEDULES } from './data/scheduleData';
import {
  subscribeSchedules,
  getOrFetchAudioUrl,
  subscribeAppSettings,
  updateAppSetting,
  AppSettings,
} from './services/scheduleService';
import {
  evaluateTrainStatus,
  ComputedTrainInfo,
  getCustomAlertTriggerTime,
} from './utils/scheduleRules';
import {
  triggerGateOpeningSoonAlert,
  triggerGateOpenedAlert,
  triggerApproachingDeadlineAlert,
  triggerCustomMp3Alert,
  unlockAudio,
} from './utils/audioAlert';
import { ScheduleTable } from './components/ScheduleTable';
import { GateAnimationPayload } from './components/GateRowAnimationOverlay';
import { AdminScheduleDashboard } from './components/AdminScheduleDashboard';
import { TrainSimulationView } from './components/TrainSimulationView';
import { LoginPage } from './components/LoginPage';
import { AudioNotificationToast, ActiveAlertInfo } from './components/AudioNotificationToast';
import {
  Monitor,
  Settings,
  UserCheck,
  LogOut,
  Shield,
  Train,
  Database,
  Volume2,
  Navigation,
  Radio,
} from 'lucide-react';

export interface StationStaffUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  isAnonymous?: boolean;
  isStaffPin?: boolean;
}

// Check if current URL path is /admin or hash #admin
const checkIsAdminPath = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  const hash = window.location.hash;
  return (
    path === '/admin' ||
    path.startsWith('/admin') ||
    hash === '#admin' ||
    hash === '#/admin' ||
    hash === '#simulate' ||
    hash === '#admin/simulate' ||
    hash === '#/admin/simulate'
  );
};

// Check if current URL path is /admin/simulate or hash #admin/simulate
const checkIsSimulatePath = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  const hash = window.location.hash;
  return (
    path === '/admin/simulate' ||
    path.startsWith('/admin/simulate') ||
    hash === '#admin/simulate' ||
    hash === '#/admin/simulate' ||
    hash === '#simulate'
  );
};

export default function App() {
  // Navigation & Authentication (Default is 'pids' TV display; '/admin' endpoint is protected)
  const [activeTab, setActiveTab] = useState<'pids' | 'admin'>(() => {
    return checkIsAdminPath() ? 'admin' : 'pids';
  });
  const [adminSubView, setAdminSubView] = useState<'schedules' | 'simulate'>(() => {
    return checkIsSimulatePath() ? 'simulate' : 'schedules';
  });
  const [simulateScheduleId, setSimulateScheduleId] = useState<string | undefined>(undefined);
  const [isTvCleanMode, setIsTvCleanMode] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<User | StationStaffUser | null>(() => {
    try {
      const saved = localStorage.getItem('feeder_staff_auth');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return null;
  });

  // Safe SPA Navigation between '/' (PIDS Display), '/admin' (Schedule & Audio), and '/admin/simulate' (Train Simulation)
  const navigateTo = (
    tab: 'pids' | 'admin',
    subView: 'schedules' | 'simulate' = 'schedules',
    scheduleId?: string
  ) => {
    setActiveTab(tab);
    if (scheduleId) {
      setSimulateScheduleId(scheduleId);
    }
    try {
      if (tab === 'admin') {
        setAdminSubView(subView);
        const targetPath = subView === 'simulate' ? '/admin/simulate' : '/admin';
        if (window.location.pathname !== targetPath) {
          window.history.pushState(null, '', targetPath);
        }
      } else {
        if (window.location.pathname !== '/') {
          window.history.pushState(null, '', '/');
        }
      }
    } catch (e) {
      if (tab === 'admin') {
        window.location.hash = subView === 'simulate' ? '#admin/simulate' : '#admin';
      } else {
        window.location.hash = '';
      }
    }
  };

  // Sync URL changes (back/forward button, manual address bar edit) with activeTab & adminSubView
  useEffect(() => {
    const handleLocationChange = () => {
      const isAdmin = checkIsAdminPath();
      setActiveTab(isAdmin ? 'admin' : 'pids');
      if (isAdmin) {
        setAdminSubView(checkIsSimulatePath() ? 'simulate' : 'schedules');
      }
    };
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  // Firestore schedules state
  const [schedules, setSchedules] = useState<FeederSchedule[]>(INITIAL_SCHEDULES);
  const [isDbConnected, setIsDbConnected] = useState<boolean>(false);

  // Theme state: 'dark' (Default navy) or 'light' (Merah & Putih)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('feeder_pids_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {
      // ignore
    }
    return 'dark';
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('feeder_pids_theme', next);
      } catch (e) {
        // ignore
      }
      return next;
    });
  };

  // Sync body class for background and scrollbars
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'light') {
        document.body.classList.add('theme-light');
        document.body.classList.remove('bg-[#0b1329]');
        document.body.classList.add('bg-slate-100');
      } else {
        document.body.classList.remove('theme-light');
        document.body.classList.remove('bg-slate-100');
        document.body.classList.add('bg-[#0b1329]');
      }
    }
  }, [theme]);

  // Current time state (Real-time by default)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isSimulated, setIsSimulated] = useState<boolean>(false);

  // Audio configuration
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [volume, setVolume] = useState<number>(0.8);
  const [activeToastAlert, setActiveToastAlert] = useState<ActiveAlertInfo | null>(null);

  // Active gate animation (KAI train sweep, row color pulse & letter wave overlay, 8s)
  const [activeGateAnimation, setActiveGateAnimation] = useState<GateAnimationPayload | null>(null);

  // Gate animation toggle (Controlled centrally from /admin, synchronized via Firestore across ALL PIDS screens. Default: OFF)
  const [gateAnimationEnabled, setGateAnimationEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pids_gate_animation_enabled');
      return saved === 'true'; // Default is OFF (false)
    } catch (e) {
      return false;
    }
  });

  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  // Listen to Firestore real-time app settings so changes at /admin immediately affect ALL connected PIDS screens
  useEffect(() => {
    const unsub = subscribeAppSettings((settings) => {
      setAppSettings(settings);
      setGateAnimationEnabled(settings.gateAnimationEnabled);
      try {
        localStorage.setItem('pids_gate_animation_enabled', String(settings.gateAnimationEnabled));
      } catch (e) {
        // ignore
      }
      if (!settings.gateAnimationEnabled) {
        setActiveGateAnimation(null);
      }
    });
    return () => unsub();
  }, []);

  const handleToggleGateAnimation = async (enabled: boolean) => {
    // 1. Instant optimistic update
    setGateAnimationEnabled(enabled);
    try {
      localStorage.setItem('pids_gate_animation_enabled', String(enabled));
    } catch (e) {
      // ignore
    }
    if (!enabled) {
      setActiveGateAnimation(null);
    }

    // 2. Real-time Firestore sync: updates all connected PIDS displays
    try {
      await updateAppSetting({ gateAnimationEnabled: enabled });
    } catch (err) {
      console.error('Failed to sync gateAnimationEnabled setting to Firestore:', err);
    }
  };

  // Safety timer: Pastikan activeGateAnimation di App.tsx selalu bersih setelah 8.2 detik
  useEffect(() => {
    if (!activeGateAnimation) return;
    const timer = setTimeout(() => {
      setActiveGateAnimation(null);
    }, 8200);
    return () => clearTimeout(timer);
  }, [activeGateAnimation?.id]);

  // Set to keep track of announced trains to prevent duplicate audio triggers
  const announcedTrainsRef = useRef<Set<string>>(new Set());

  // Listen to Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
      } else {
        try {
          const saved = localStorage.getItem('feeder_staff_auth');
          if (saved) {
            setCurrentUser(JSON.parse(saved));
          } else {
            setCurrentUser(null);
          }
        } catch (e) {
          setCurrentUser(null);
        }
      }
    });
    return () => unsub();
  }, []);


  // Listen to Firestore real-time schedule updates
  useEffect(() => {
    const unsub = subscribeSchedules(
      (data) => {
        if (data && data.length > 0) {
          setSchedules(data);
          setIsDbConnected(true);
        }
      },
      (err) => {
        console.warn('MongoDB schedules fetch error, continuing with cached/initial schedules:', err);
        setIsDbConnected(false);
      }
    );
    return () => unsub();
  }, []);

  // Timer loop: Ticks every 1 second
  useEffect(() => {
    const timer = setInterval(() => {
      if (isSimulated) {
        setCurrentTime((prev) => new Date(prev.getTime() + 1000));
      } else {
        setCurrentTime(new Date());
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isSimulated]);

  // Filter schedules that are active for the public display
  const activeDisplaySchedules = useMemo(() => {
    return schedules.filter((s) => s.isActive !== false);
  }, [schedules]);

  // Compute live status for active schedules based on current time
  const computedSchedules: ComputedTrainInfo[] = useMemo(() => {
    return activeDisplaySchedules.map((schedule) =>
      evaluateTrainStatus(schedule, currentTime)
    );
  }, [activeDisplaySchedules, currentTime]);

  // Helper to reliably resolve custom audio URL for any announcement phase
  // Strictly checks only the audio corresponding to each event phase & language
  const resolveScheduleAudioUrl = (
    schedule: FeederSchedule,
    phase: 'PRE_OPEN' | 'GATE_OPENED' | 'CLOSING_SOON',
    lang: 'id' | 'en' = 'id'
  ): string | undefined => {
    if (lang === 'en') {
      if (phase === 'PRE_OPEN') {
        return schedule.audioPreOpenEnUrl || undefined;
      }
      if (phase === 'GATE_OPENED') {
        return schedule.audioGateOpenEnUrl || undefined;
      }
      if (phase === 'CLOSING_SOON') {
        return schedule.audioClosingEnUrl || schedule.audioEnUrl || undefined;
      }
      return undefined;
    }
    if (phase === 'PRE_OPEN') {
      return schedule.audioPreOpenUrl || undefined;
    }
    if (phase === 'GATE_OPENED') {
      return schedule.audioGateOpenUrl || undefined;
    }
    if (phase === 'CLOSING_SOON') {
      return schedule.audioClosingUrl || schedule.audioUrl || undefined;
    }
    return undefined;
  };

  // Check for multi-stage audio alerts:
  // 1. 2 Menit Sebelum Gate In Dibuka (PRE_OPEN)
  // 2. Saat Gate In Resmi Dibuka (GATE_OPENED)
  // 3. Mendekati Batas Akhir Tutup Gate (CLOSING_SOON)
  // 4. Konfigurasi Waktu Pemicu MP3 Kustom (CUSTOM_MP3, misal 5 menit sebelum keberangkatan)
  useEffect(() => {
    computedSchedules.forEach((item) => {
      // Phase 1: Voice announcement saat 2 menit akan dibuka
      if (item.isGateOpeningSoon && item.status === 'GATE_OPENING_SOON') {
        const preOpenKey = `PRE_OPEN-${item.schedule.whooshTrainNo}-${item.checkingStartTime}`;

        if (!announcedTrainsRef.current.has(preOpenKey)) {
          announcedTrainsRef.current.add(preOpenKey);

          if (soundEnabled) {
            Promise.all([
              getOrFetchAudioUrl(item.schedule, 'pre_open', 'id'),
              getOrFetchAudioUrl(item.schedule, 'pre_open', 'en'),
            ]).then(([audioUrlId, audioUrlEn]) => {
              const urlToPlayId =
                audioUrlId ||
                resolveScheduleAudioUrl(item.schedule, 'PRE_OPEN', 'id') ||
                appSettings?.universalPreOpenUrl ||
                undefined;
              const urlToPlayEn =
                audioUrlEn ||
                resolveScheduleAudioUrl(item.schedule, 'PRE_OPEN', 'en') ||
                appSettings?.universalPreOpenEnUrl ||
                undefined;
              triggerGateOpeningSoonAlert(
                item.schedule.feederTrainNo,
                item.checkingStartTime,
                item.departureTime,
                volume,
                urlToPlayId,
                urlToPlayEn
              );
              setActiveToastAlert({
                train: item,
                type: 'PRE_OPEN',
                customAudioUrl: urlToPlayId,
                customAudioEnUrl: urlToPlayEn,
              });
            });
          }
        }
      }

      // Phase 2: Voice announcement saat gate in resmi dibuka
      if (item.isGateJustOpened && (item.status === 'CHECKING' || item.status === 'GATE_CLOSING_SOON')) {
        const gateOpenedKey = `GATE_OPENED-${item.schedule.whooshTrainNo}-${item.checkingStartTime}`;

        if (!announcedTrainsRef.current.has(gateOpenedKey)) {
          announcedTrainsRef.current.add(gateOpenedKey);

          // Trigger visual gate open row animation (train running RTL, green row glow, wave text, 8s)
          if (gateAnimationEnabled) {
            setActiveGateAnimation({
              trainNo: item.schedule.whooshTrainNo,
              whooshTrainNo: item.schedule.whooshTrainNo,
              feederTrainNo: item.schedule.feederTrainNo,
              type: 'GATE_OPEN',
              id: `gate-open-${item.schedule.whooshTrainNo}-${Date.now()}`,
            });
          }

          if (soundEnabled) {
            Promise.all([
              getOrFetchAudioUrl(item.schedule, 'gate_open', 'id'),
              getOrFetchAudioUrl(item.schedule, 'gate_open', 'en'),
            ]).then(([audioUrlId, audioUrlEn]) => {
              const urlToPlayId = audioUrlId || resolveScheduleAudioUrl(item.schedule, 'GATE_OPENED', 'id');
              const urlToPlayEn = audioUrlEn || resolveScheduleAudioUrl(item.schedule, 'GATE_OPENED', 'en');
              triggerGateOpenedAlert(
                item.schedule.feederTrainNo,
                item.departureTime,
                volume,
                urlToPlayId,
                urlToPlayEn
              );
              setActiveToastAlert({
                train: item,
                type: 'GATE_OPENED',
                customAudioUrl: urlToPlayId,
                customAudioEnUrl: urlToPlayEn,
              });
            });
          }
        }
      }

      // Phase 3: Voice announcement saat mendekati batas akhir tutup gate (Panggilan terakhir)
      const hasCustomCloseGate2mAudio = (item.schedule.customAudioAlerts || []).some(
        (ca) =>
          ca.enabled !== false &&
          ca.relativeTo === 'close_gate' &&
          ca.offsetMinutes === 2 &&
          Boolean(ca.audioUrl || ca.audioFileName || ca.audioEnUrl || ca.audioEnFileName)
      );
      if (
        item.isApproachingDeadline &&
        (item.status === 'GATE_CLOSING_SOON' || item.status === 'DELAYED') &&
        !hasCustomCloseGate2mAudio
      ) {
        const closingKey = `CLOSING-${item.schedule.whooshTrainNo}-${item.closeGateTime}`;

        if (!announcedTrainsRef.current.has(closingKey)) {
          announcedTrainsRef.current.add(closingKey);

          if (soundEnabled) {
            Promise.all([
              getOrFetchAudioUrl(item.schedule, 'closing', 'id'),
              getOrFetchAudioUrl(item.schedule, 'closing', 'en'),
            ]).then(([audioUrlId, audioUrlEn]) => {
              const urlToPlayId = audioUrlId || resolveScheduleAudioUrl(item.schedule, 'CLOSING_SOON', 'id');
              const urlToPlayEn = audioUrlEn || resolveScheduleAudioUrl(item.schedule, 'CLOSING_SOON', 'en');
              triggerApproachingDeadlineAlert(
                item.schedule.feederTrainNo,
                item.departureTime,
                item.minutesUntilCloseGate,
                volume,
                urlToPlayId,
                urlToPlayEn
              );
              setActiveToastAlert({
                train: item,
                type: 'CLOSING_SOON',
                customAudioUrl: urlToPlayId,
                customAudioEnUrl: urlToPlayEn,
              });
            });
          }
        }
      }

      // Phase 3b: Visual animation saat gate in resmi ditutup (5 menit sebelum berangkat, 8s)
      if (item.status === 'GATE_CLOSED') {
        const closedKey = `GATE_CLOSED-${item.schedule.whooshTrainNo}-${item.closeGateTime}`;
        if (!announcedTrainsRef.current.has(closedKey)) {
          announcedTrainsRef.current.add(closedKey);
          if (gateAnimationEnabled) {
            setActiveGateAnimation({
              trainNo: item.schedule.whooshTrainNo,
              whooshTrainNo: item.schedule.whooshTrainNo,
              feederTrainNo: item.schedule.feederTrainNo,
              type: 'GATE_CLOSED',
              id: `gate-closed-${item.schedule.whooshTrainNo}-${Date.now()}`,
            });
          }
        }
      }

      // Phase 4: Konfigurasi Waktu MP3 Baru (Pemicu Kustom, misal: 5 Menit Sebelum Keberangkatan)
      if (item.schedule.customAudioAlerts && item.schedule.customAudioAlerts.length > 0) {
        item.schedule.customAudioAlerts.forEach((customAlert) => {
          if (customAlert.enabled === false) return;

          // Prevent conflict if custom alert has the exact same trigger as standard pre_open slot (2 min before gate open)
          if (customAlert.relativeTo === 'gate_open' && customAlert.offsetMinutes === 2 && item.isGateOpeningSoon) {
            return;
          }

          const { triggerMinutes, triggerTimeStr } = getCustomAlertTriggerTime(
            item.effectiveDepartureTime,
            customAlert
          );

          const currentTotalSec =
            currentTime.getHours() * 3600 +
            currentTime.getMinutes() * 60 +
            currentTime.getSeconds();
          const triggerTotalSec = triggerMinutes * 60;
          const diffSec = currentTotalSec - triggerTotalSec;

          // Pemicu aktif ketika jam sistem memasuki menit yang dikonfigurasi (selang 0-59 detik)
          if (diffSec >= 0 && diffSec < 60) {
            const customKey = `CUSTOM-${customAlert.id}-${item.schedule.whooshTrainNo}-${triggerTimeStr}`;

            if (!announcedTrainsRef.current.has(customKey)) {
              announcedTrainsRef.current.add(customKey);

              if (soundEnabled) {
                Promise.all([
                  getOrFetchAudioUrl(item.schedule, `custom_${customAlert.id}` as any, 'id'),
                  getOrFetchAudioUrl(item.schedule, `custom_${customAlert.id}` as any, 'en'),
                ]).then(([audioUrlId, audioUrlEn]) => {
                  const urlToPlayId = audioUrlId || customAlert.audioUrl;
                  const urlToPlayEn = audioUrlEn || customAlert.audioEnUrl;
                  if (urlToPlayId || urlToPlayEn) {
                    triggerCustomMp3Alert(urlToPlayId || '', volume, urlToPlayEn);
                    setActiveToastAlert({
                      train: item,
                      type: 'CUSTOM_MP3',
                      customLabel: customAlert.label,
                      customAudioUrl: urlToPlayId,
                      customAudioEnUrl: urlToPlayEn,
                    });
                  }
                });
              }
            }
          }
        });
      }
    });
  }, [computedSchedules, currentTime, soundEnabled, volume]);

  const handleReplayToastAlert = () => {
    if (!activeToastAlert) return;
    const { train, type, customAudioUrl, customAudioEnUrl } = activeToastAlert;

    if (type === 'PRE_OPEN') {
      const urlId = customAudioUrl || resolveScheduleAudioUrl(train.schedule, 'PRE_OPEN', 'id');
      const urlEn = customAudioEnUrl || resolveScheduleAudioUrl(train.schedule, 'PRE_OPEN', 'en');
      triggerGateOpeningSoonAlert(
        train.schedule.feederTrainNo,
        train.checkingStartTime,
        train.departureTime,
        volume,
        urlId,
        urlEn
      );
    } else if (type === 'GATE_OPENED') {
      setActiveGateAnimation({
        trainNo: train.schedule.whooshTrainNo,
        whooshTrainNo: train.schedule.whooshTrainNo,
        feederTrainNo: train.schedule.feederTrainNo,
        type: 'GATE_OPEN',
        id: `gate-open-replay-${train.schedule.whooshTrainNo}-${Date.now()}`,
      });
      const urlId = customAudioUrl || resolveScheduleAudioUrl(train.schedule, 'GATE_OPENED', 'id');
      const urlEn = customAudioEnUrl || resolveScheduleAudioUrl(train.schedule, 'GATE_OPENED', 'en');
      triggerGateOpenedAlert(
        train.schedule.feederTrainNo,
        train.departureTime,
        volume,
        urlId,
        urlEn
      );
    } else if (type === 'CLOSING_SOON') {
      setActiveGateAnimation({
        trainNo: train.schedule.whooshTrainNo,
        whooshTrainNo: train.schedule.whooshTrainNo,
        feederTrainNo: train.schedule.feederTrainNo,
        type: 'GATE_CLOSED',
        id: `gate-closed-replay-${train.schedule.whooshTrainNo}-${Date.now()}`,
      });
      const urlId = customAudioUrl || resolveScheduleAudioUrl(train.schedule, 'CLOSING_SOON', 'id');
      const urlEn = customAudioEnUrl || resolveScheduleAudioUrl(train.schedule, 'CLOSING_SOON', 'en');
      triggerApproachingDeadlineAlert(
        train.schedule.feederTrainNo,
        train.departureTime,
        train.minutesUntilCloseGate,
        volume,
        urlId,
        urlEn
      );
    } else if (type === 'CUSTOM_MP3' && (customAudioUrl || customAudioEnUrl)) {
      triggerCustomMp3Alert(customAudioUrl || '', volume, customAudioEnUrl);
    }
  };

  // Handlers for Simulation
  const handleSetSimulatedTime = (hours: number, minutes: number, seconds = 0) => {
    unlockAudio();
    const simDate = new Date();
    simDate.setHours(hours, minutes, seconds, 0);
    setIsSimulated(true);
    setCurrentTime(simDate);
    announcedTrainsRef.current.clear();
  };

  const handleResetToRealTime = () => {
    unlockAudio();
    setIsSimulated(false);
    setCurrentTime(new Date());
    announcedTrainsRef.current.clear();
  };

  const handleLogout = async () => {
    localStorage.removeItem('feeder_staff_auth');
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    setCurrentUser(null);
    navigateTo('pids');
  };

  const handleOpenAdminTab = () => {
    navigateTo('admin');
  };

  const activeTrainCount = computedSchedules.filter((s) => !s.hasDeparted).length;

  return (
    <div className={`min-h-screen flex flex-col justify-start transition-colors duration-200 ${
      theme === 'light'
        ? 'bg-slate-100 text-slate-800 selection:bg-red-600 selection:text-white'
        : 'bg-[#070e1f] text-slate-100 selection:bg-blue-600 selection:text-white'
    }`}>
      
      {/* Top Application Bar (Only shown in /admin route) */}
      {activeTab === 'admin' ? (
        <header className="bg-[#050b18] border-b border-blue-900/80 px-3 sm:px-4 py-2.5 sm:py-3 sticky top-0 z-40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
            {/* Brand & System Tag */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-900 border border-blue-400/40 flex-shrink-0">
                <Train className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className="font-black text-xs sm:text-sm tracking-wide text-white truncate">
                    PIDS KA FEEDER
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-700 text-white uppercase flex-shrink-0">
                    Whoosh
                  </span>
                  {isDbConnected && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded font-mono">
                      <Database className="w-2.5 h-2.5 text-emerald-400" />
                      Live
                    </span>
                  )}
                </div>
                <div className="text-[10px] sm:text-[11px] text-blue-300/80 truncate">
                  Panel Admin & Audio MP3 (Petugas)
                </div>
              </div>
            </div>

            {/* Switch back to TV Display and Auth info */}
            <div className="flex items-center gap-1.5 sm:gap-3 justify-end flex-shrink-0">
              <button
                onClick={() => navigateTo('pids')}
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow transition-all cursor-pointer"
              >
                <Monitor className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kembali ke TV Display</span>
                <span className="sm:hidden">TV Display</span>
              </button>

              {currentUser && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="hidden lg:block text-right">
                    <div className="text-[11px] font-bold text-cyan-300 flex items-center justify-end gap-1">
                      <UserCheck className="w-3 h-3 text-emerald-400" />
                      <span>
                        {currentUser.displayName ||
                          (currentUser.isAnonymous ? 'Petugas Demo' : currentUser.email) ||
                          'Petugas nimble-plasma-xpqwl'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                    title="Keluar dari akun petugas"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Keluar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
      ) : null}

      {/* Main Content Area */}
      <main className={activeTab === 'pids' ? 'flex-1' : 'flex-1 p-2.5 sm:p-6 lg:p-8'}>
        <div className={activeTab === 'pids' ? 'w-full' : 'max-w-7xl w-full mx-auto'}>
          
          {activeTab === 'pids' ? (
            /* TAB 1: DISPLAY PIDS - full-bleed, font gede buat kebaca dari jauh */
            <div className="text-2xl sm:text-3xl lg:text-4xl">
              <ScheduleTable
                computedList={computedSchedules}
                currentTime={currentTime}
                onClockClick={handleOpenAdminTab}
                isDbConnected={isDbConnected}
                theme={theme}
                onToggleTheme={toggleTheme}
                externalGateAnimation={activeGateAnimation}
                onExternalGateAnimationComplete={() => setActiveGateAnimation(null)}
                gateAnimationEnabled={gateAnimationEnabled}
                onToggleGateAnimation={handleToggleGateAnimation}
              />
            </div>
          ) : (
            /* TAB 2: ADMIN - padding & max-width tetap kaya sekarang */
            !currentUser ? (
              <LoginPage
                onSuccess={() => {
                  try {
                    const saved = localStorage.getItem('feeder_staff_auth');
                    if (saved) setCurrentUser(JSON.parse(saved));
                  } catch (e) {
                    // handled by auth listener
                  }
                }}
                onCancel={() => navigateTo('pids')}
              />
            ) : (
              <div className="space-y-6">
                {/* Admin Sub Navigation Tab Switcher */}
                <div className="border-b border-blue-800/80 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-black text-white flex items-center gap-2">
                      {adminSubView === 'simulate' ? (
                        <>
                          <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
                          <span>Live Tracking Perjalanan KA Feeder & Node Stasiun</span>
                        </>
                      ) : (
                        <>
                          <Settings className="w-6 h-6 text-cyan-400" />
                          <span>Dashboard Pengatur Jadwal KA Feeder</span>
                        </>
                      )}
                    </h1>
                    <p className="text-xs text-blue-200/80 mt-1">
                      {adminSubView === 'simulate'
                        ? 'Monitoring live pergerakan kereta Bandung ➔ Cimahi (berhenti 2m) ➔ Padalarang beserta kereta lawan Padalarang ➔ Bandung secara real-time.'
                        : 'Atur jadwal keberangkatan KA Feeder & Whoosh, sinkronisasi real-time ke Firestore, dan unggah file audio MP3 pengumuman per nomor KA.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Switcher between Schedules & Live Tracking */}
                    <div className="flex items-center gap-1 bg-[#050e1f] p-1 rounded-xl border border-blue-800/80">
                      <button
                        onClick={() => navigateTo('admin', 'schedules')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          adminSubView === 'schedules'
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-blue-300 hover:text-white hover:bg-blue-900/50'
                        }`}
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span>Jadwal & Audio</span>
                      </button>
                      <button
                        onClick={() => navigateTo('admin', 'simulate')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          adminSubView === 'simulate'
                            ? 'bg-gradient-to-r from-emerald-400 to-teal-300 text-slate-950 font-black shadow-md'
                            : 'text-emerald-300 hover:text-white hover:bg-emerald-950/50'
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>Live Tracking (/admin/simulate)</span>
                      </button>
                    </div>

                    <button
                      onClick={() => navigateTo('pids')}
                      className="px-3.5 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 border border-blue-700 text-xs font-bold text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>Display Stasiun</span>
                    </button>
                  </div>
                </div>

                {/* Sub View Content: Schedule Dashboard or Train Simulation */}
                {adminSubView === 'simulate' ? (
                  <TrainSimulationView
                    schedules={schedules}
                    initialScheduleId={simulateScheduleId}
                    onBackToDashboard={() => navigateTo('admin', 'schedules')}
                  />
                ) : (
                  <AdminScheduleDashboard
                    schedules={schedules}
                    onOpenSimulate={(scheduleId) => navigateTo('admin', 'simulate', scheduleId)}
                    gateAnimationEnabled={gateAnimationEnabled}
                    onToggleGateAnimation={handleToggleGateAnimation}
                  />
                )}
              </div>
            )
          )}

        </div>
      </main>

      {/* Discrete Corner Toggle Button for Admin Access (TV Display Mode) */}
      {activeTab === 'pids' && (
        <div className="fixed bottom-3 right-3 z-30 opacity-40 hover:opacity-100 transition-opacity">
          <button
            onClick={handleOpenAdminTab}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold shadow-lg backdrop-blur-sm transition-all cursor-pointer ${
              theme === 'light'
                ? 'bg-white/90 hover:bg-red-50 border-red-300 text-red-700 hover:text-red-900'
                : 'bg-[#071329]/80 hover:bg-blue-900/90 border-blue-800/60 hover:border-cyan-400 text-blue-300 hover:text-white'
            }`}
            title="Akses Konfigurasi Petugas (Wajib Login)"
          >
            <Shield className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-red-600' : 'text-cyan-400'}`} />
            <span className="hidden sm:inline">Akses Petugas</span>
            {currentUser && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Terotentikasi"></span>
            )}
          </button>
        </div>
      )}

      {/* Floating Audio Announcement Toast with Replay & Info - Hanya ditampilkan di halaman Admin saja, tidak di layar tabel PIDS */}
      {activeTab === 'admin' && (
        <AudioNotificationToast
          alert={activeToastAlert}
          onDismiss={() => setActiveToastAlert(null)}
          onReplayAudio={handleReplayToastAlert}
        />
      )}
    </div>
  );
}
