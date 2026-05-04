'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, LogOut, Trash2, Check, Plus, RefreshCw } from 'lucide-react';
import type { Subscription, Mode } from '@/types';
import type { Translations } from '@/i18n/en';

interface Props {
  t: Translations;
}

type AuthStep = 'login' | 'register' | 'dashboard';

export default function SubscriptionManager({ t }: Props) {
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [newTarget, setNewTarget] = useState('');
  const [newMode, setNewMode] = useState<Mode>('block');
  const [newIncludeFollowers, setNewIncludeFollowers] = useState(true);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    fetch('/api/auth/login', { method: 'GET' })
      .then((r) => {
        if (r.ok) {
          setAuthStep('dashboard');
          loadSubscriptions();
        }
      })
      .catch(() => {});
  }, []);

  const loadSubscriptions = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch {
      // ignore
    }
  };

  const handleLogin = async () => {
    if (!handle.trim() || !password.trim()) {
      setError(t.errorInvalidCreds);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password }),
      });
      if (res.ok) {
        setAuthStep('dashboard');
        await loadSubscriptions();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.errorInvalidCreds);
      }
    } catch {
      setError(t.errorNetwork);
    }
    setLoading(false);
  };

  const handleRegister = async () => {
    if (!handle.trim() || !password.trim()) {
      setError(t.errorInvalidCreds);
      return;
    }
    if (!privacyAccepted) {
      setError(t.errorPrivacyRequired);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password }),
      });
      if (res.ok) {
        setAuthStep('dashboard');
        await loadSubscriptions();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.errorGeneral);
      }
    } catch {
      setError(t.errorNetwork);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' });
    setAuthStep('login');
    setHandle('');
    setPassword('');
    setSubscriptions([]);
  };

  const handleAddSubscription = async () => {
    if (!newTarget.trim()) return;
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_handle: newTarget,
          mode: newMode,
          include_followers: newIncludeFollowers,
        }),
      });
      if (res.ok) {
        setNewTarget('');
        await loadSubscriptions();
      }
    } catch {
      setError(t.errorGeneral);
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      await loadSubscriptions();
    } catch {
      setError(t.errorGeneral);
    }
  };

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const input = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  const renderAuthForm = (isRegister: boolean) => (
    <div className="rounded-2xl p-6 flex flex-col gap-5 max-w-sm mx-auto" style={card}>
      <div>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {isRegister ? t.registerTitle : t.loginTitle}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {t.subscribeDesc}
        </p>
      </div>
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}>
          <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0" /> {error}
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
          <input
            type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
            placeholder={t.handlePlaceholder}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
            style={input}
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.appPassword}</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t.appPasswordPlaceholder}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
            style={input}
          />
        </div>
      </div>
      {isRegister && (
        <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl transition-all"
          style={{ backgroundColor: privacyAccepted ? 'var(--accent-muted)' : 'var(--bg-dark)', border: `1px solid ${privacyAccepted ? 'var(--accent)' : 'var(--bg-border)'}` }}>
          <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="sr-only" />
          <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
            style={{ borderColor: privacyAccepted ? 'var(--accent)' : 'var(--bg-border)', backgroundColor: privacyAccepted ? 'var(--accent)' : 'transparent' }}>
            {privacyAccepted && <Check size={10} strokeWidth={3} color="#fff" />}
          </div>
          <span className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t.privacyPolicyAccept}{' '}
            <a href="/datenschutz.template.md" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>
              {t.privacyPolicyLink}
            </a>
            {t.privacyPolicyAcceptSuffix}
          </span>
        </label>
      )}
      <button
        onClick={isRegister ? handleRegister : handleLogin}
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
      >
        {loading && <RefreshCw size={14} className="animate-spin" />}
        {loading ? t.loading : (isRegister ? t.register : t.login)}
      </button>
      <button onClick={() => { setAuthStep(isRegister ? 'login' : 'register'); setError(''); }}
        className="text-sm text-center transition-colors"
        style={{ color: 'var(--text-secondary)' }}>
        {isRegister ? t.login : t.register} →
      </button>
    </div>
  );

  if (authStep === 'login') return renderAuthForm(false);
  if (authStep === 'register') return renderAuthForm(true);

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.subscribeTitle}</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{t.subscribeDesc}</p>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors"
          style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
          <LogOut size={13} /> {t.logout}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}>
          <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Add subscription */}
      <div className="p-5 rounded-2xl flex flex-col gap-4" style={card}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.addSubscription}</h3>
        <div className="flex gap-2">
          <input
            type="text" value={newTarget} onChange={(e) => setNewTarget(e.target.value)}
            placeholder={t.targetHandlePlaceholder}
            className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
            style={input}
          />
          <select value={newMode} onChange={(e) => setNewMode(e.target.value as Mode)}
            className="px-3.5 py-2.5 rounded-xl text-sm font-medium focus-ring"
            style={input}>
            <option value="block">{t.blockTool}</option>
            <option value="mute">{t.muteTool}</option>
          </select>
        </div>
        <label className="flex items-center gap-3 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
          <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
            style={{ borderColor: newIncludeFollowers ? 'var(--accent)' : 'var(--bg-border)', backgroundColor: newIncludeFollowers ? 'var(--accent)' : 'transparent' }}
            onClick={() => setNewIncludeFollowers(!newIncludeFollowers)}>
            {newIncludeFollowers && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
          <input type="checkbox" checked={newIncludeFollowers} onChange={(e) => setNewIncludeFollowers(e.target.checked)} className="sr-only" />
          {t.includeFollowers}
        </label>
        <button onClick={handleAddSubscription}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
          <Plus size={15} /> {t.subscribeBtn}
        </button>
      </div>

      {/* Subscription list */}
      <div className="flex flex-col gap-2">
        {subscriptions.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>{t.noSubscriptions}</p>
        ) : subscriptions.map((sub) => (
          <div key={sub.id} className="p-4 rounded-2xl flex items-center justify-between gap-4 transition-all"
            style={{ ...card, backgroundColor: 'var(--bg-card)' }}>
            <div className="min-w-0">
              <div className="text-sm font-medium font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                @{sub.target_handle}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
                  {sub.mode}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {sub.include_followers ? t.includeFollowers : t.withoutFollowers}
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {t.lastUpdated}: {sub.last_updated ? new Date(sub.last_updated).toLocaleDateString() : t.never}
              </div>
            </div>
            <button onClick={() => handleDeleteSubscription(sub.id)}
              className="p-2 rounded-lg flex-shrink-0 transition-colors"
              style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-muted)' }}
              title={t.deleteSubscription}>
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
