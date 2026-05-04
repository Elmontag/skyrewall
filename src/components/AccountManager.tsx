'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, Check, RefreshCw, Trash2, KeyRound, AtSign, Info } from 'lucide-react';
import type { Translations } from '@/i18n/en';

interface Props {
  t: Translations;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useUpdateField(field: 'handle' | 'password') {
  const [value, setValue] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState('');

  const save = async () => {
    if (!value.trim()) return;
    setState('saving');
    setError('');
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value.trim() }),
      });
      if (res.ok) {
        setState('saved');
        setValue('');
        setTimeout(() => setState('idle'), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Update failed');
        setState('error');
      }
    } catch {
      setError('Network error');
      setState('error');
    }
  };

  return { value, setValue, state, error, save };
}

export default function AccountManager({ t }: Props) {
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const handleField = useUpdateField('handle');
  const passwordField = useUpdateField('password');

  useEffect(() => {
    fetch('/api/auth/login', { method: 'GET' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setCurrentHandle(data.user?.handle ?? null);
          setLoggedIn(true);
        } else {
          setLoggedIn(false);
        }
      })
      .catch(() => setLoggedIn(false));
  }, [handleField.state]);

  const handleDeleteAccount = async () => {
    if (!confirm(t.deleteAccountConfirm)) return;
    setDeleteError('');
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (res.ok) {
        setLoggedIn(false);
        setCurrentHandle(null);
      } else {
        setDeleteError('Delete failed');
      }
    } catch {
      setDeleteError('Network error');
    }
  };

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const input = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  if (loggedIn === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="rounded-2xl p-6 flex items-start gap-4" style={card}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)' }}>
          <Info size={17} />
        </div>
        <p className="text-sm pt-1.5" style={{ color: 'var(--text-secondary)' }}>
          {t.accountNotLoggedIn}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      {/* Current account */}
      {currentHandle && (
        <div className="px-4 py-3 rounded-xl flex items-center gap-3"
          style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid rgba(0,133,255,0.2)' }}>
          <AtSign size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span className="text-sm font-mono font-medium" style={{ color: 'var(--accent)' }}>
            {currentHandle}
          </span>
        </div>
      )}

      {/* Update Handle */}
      <UpdateCard
        icon={<AtSign size={16} strokeWidth={2} />}
        title={t.changeHandle}
        desc={t.changeHandleDesc}
        inputType="text"
        placeholder={t.handlePlaceholder}
        field={handleField}
        t={t}
        input={input}
      />

      {/* Update Password */}
      <UpdateCard
        icon={<KeyRound size={16} strokeWidth={2} />}
        title={t.changePassword}
        desc={t.changePasswordDesc}
        inputType="password"
        placeholder={t.appPasswordPlaceholder}
        field={passwordField}
        t={t}
        input={input}
      />

      {/* Danger Zone */}
      <div className="p-5 rounded-2xl flex flex-col gap-3"
        style={{ border: '1px solid rgba(240,71,71,0.25)', backgroundColor: 'rgba(240,71,71,0.03)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--danger)' }}>
          Danger Zone
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {t.deleteAccountConfirm}
        </p>
        {deleteError && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={13} /> {deleteError}
          </div>
        )}
        <button onClick={handleDeleteAccount}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors self-start"
          style={{ border: '1px solid var(--danger-muted)', color: 'var(--danger)' }}>
          <Trash2 size={14} /> {t.deleteAccount}
        </button>
      </div>
    </div>
  );
}

interface UpdateCardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  inputType: string;
  placeholder: string;
  field: ReturnType<typeof useUpdateField>;
  t: Translations;
  input: React.CSSProperties;
}

function UpdateCard({ icon, title, desc, inputType, placeholder, field, t, input }: UpdateCardProps) {
  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={card}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--accent)' }}>
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{desc}</div>
        </div>
      </div>

      {field.error && field.state === 'error' && (
        <div className="px-3 py-2 rounded-xl text-xs flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}>
          <AlertTriangle size={13} className="flex-shrink-0" /> {field.error}
        </div>
      )}

      {field.state === 'saved' && (
        <div className="px-3 py-2 rounded-xl text-xs flex items-center gap-2"
          style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--success)' }}>
          <Check size={13} /> {t.changesSaved}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type={inputType}
          value={field.value}
          onChange={(e) => field.setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
          style={input}
          onKeyDown={(e) => e.key === 'Enter' && field.save()}
        />
        <button
          onClick={field.save}
          disabled={field.state === 'saving' || !field.value.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 flex items-center gap-2 flex-shrink-0"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {field.state === 'saving'
            ? <RefreshCw size={14} className="animate-spin" />
            : <Check size={14} />}
          {field.state === 'saving' ? t.saving : t.saveChanges}
        </button>
      </div>
    </div>
  );
}
