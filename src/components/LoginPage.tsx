import React, { useState } from 'react';
import {
  Lock,
  Train,
  ArrowLeft,
  AlertCircle,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
  onCancel: () => void;
}

// Master PIN petugas stasiun
const VALID_PIN = '121234';

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess, onCancel }) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanPin = pin.trim();

    if (!cleanPin) {
      setErrorMsg('Silakan masukkan PIN petugas.');
      return;
    }

    if (cleanPin === VALID_PIN) {
      setIsSuccess(true);
      const staffUser = {
        uid: `staff-${Date.now()}`,
        email: 'petugas@stasiunbandung.id',
        displayName: 'Petugas Stasiun (PIN: 121234)',
        role: 'staff' as const,
        isOwner: true,
        isAnonymous: false,
        isStaffPin: true,
      };
      localStorage.setItem('feeder_staff_auth', JSON.stringify(staffUser));

      setTimeout(() => {
        onSuccess();
      }, 400);
    } else {
      setErrorMsg('PIN salah. Masukkan PIN petugas yang benar.');
      setPin('');
    }
  };

  const handleQuickKey = (num: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + num);
      setErrorMsg('');
    }
  };

  const handleClear = () => {
    setPin('');
    setErrorMsg('');
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg('');
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#060c1c]/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-gradient-to-b from-[#0c1e3f] to-[#071329] border-2 border-blue-600/80 rounded-2xl max-w-md w-full p-6 sm:p-7 shadow-[0_0_50px_rgba(37,99,235,0.3)] relative text-white my-6">
        
        {/* Close/Back Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg bg-blue-950/50 hover:bg-blue-900 border border-blue-800/60 transition-colors cursor-pointer"
          title="Kembali ke Layar Display PIDS"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-blue-700 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-900/60 border border-blue-400/40 mb-3 p-3">
            <Train className="w-8 h-8 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-950 border border-blue-800 text-[11px] font-bold text-cyan-300 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            PORTAL PETUGAS OPERASIONAL
          </div>
          <h2 className="text-xl font-black text-white">
            Akses Masuk PIN Petugas
          </h2>
          <p className="text-xs text-blue-200/80 mt-1">
            Masukkan PIN 6 digit untuk mengelola jadwal dan file audio
          </p>
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-600/80 text-rose-200 text-xs flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
        )}

        {/* Success Notification */}
        {isSuccess && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="font-bold">PIN Terverifikasi! Membuka panel...</span>
          </div>
        )}

        {/* PIN Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-blue-200 mb-2 flex items-center justify-between">
              <span>Kode PIN Petugas</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {pin.length}/6 Digit
              </span>
            </label>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-cyan-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                autoFocus
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val);
                  setErrorMsg('');
                }}
                placeholder="Masukkan PIN (6 Digit)"
                className="w-full bg-[#040a1b] border-2 border-blue-700/80 rounded-xl pl-10 pr-11 py-3 text-center text-xl font-mono tracking-[0.35em] text-white placeholder:text-slate-500 placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white cursor-pointer"
                title={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Quick On-Screen Number Keypad for Touchscreens */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleQuickKey(digit)}
                className="py-2.5 rounded-xl bg-blue-950/70 hover:bg-blue-900/90 border border-blue-800/80 active:scale-95 text-lg font-bold font-mono text-white transition-all shadow-sm cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 active:scale-95 text-xs font-bold text-slate-300 transition-all cursor-pointer"
            >
              Hapus
            </button>
            <button
              type="button"
              onClick={() => handleQuickKey('0')}
              className="py-2.5 rounded-xl bg-blue-950/70 hover:bg-blue-900/90 border border-blue-800/80 active:scale-95 text-lg font-bold font-mono text-white transition-all shadow-sm cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700 active:scale-95 text-xs font-bold text-slate-300 transition-all cursor-pointer"
            >
              ⌫
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={pin.length === 0 || isSuccess}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm shadow-lg shadow-blue-900/60 border border-cyan-400/40 flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
          >
            <Lock className="w-4 h-4" />
            <span>Masuk Dashboard Admin</span>
          </button>
        </form>

        {/* Footer Actions */}
        <div className="mt-5 pt-3.5 border-t border-blue-900/70 flex items-center justify-between text-xs text-blue-300">
          <span className="text-[11px] text-slate-400">
            PIDS Stasiun Bandung • KA Feeder Whoosh
          </span>

          <button
            type="button"
            onClick={onCancel}
            className="hover:text-white font-semibold transition-colors cursor-pointer"
          >
            Batal / Kembali
          </button>
        </div>

      </div>
    </div>
  );
};
