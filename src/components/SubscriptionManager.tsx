'use client';
import { useState, useEffect } from 'react';
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

  const handleDeleteAccount = async () => {
    if (!confirm(t.deleteAccountConfirm)) return;
    try {
      await fetch('/api/account', { method: 'DELETE' });
      setAuthStep('login');
      setSubscriptions([]);
    } catch {
      setError(t.errorGeneral);
    }
  };

  const cardStyle = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
  };

  const inputStyle = {
    backgroundColor: 'var(--bg-dark)',
    border: '1px solid var(--bg-border)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
  };

  const renderAuthForm = (isRegister: boolean) => (
    <div className="p-6 rounded-lg flex flex-col gap-4 max-w-md mx-auto" style={cardStyle}>
      <h2 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>
        &gt; {isRegister ? t.registerTitle : t.loginTitle}
      </h2>
      {error && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', color: '#ff5050' }}>
          {error}
        </div>
      )}
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder={t.handlePlaceholder}
          className="w-full px-3 py-2 rounded text-sm"
          style={inputStyle}
        />
      </div>
      <div>
        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.appPassword}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.appPasswordPlaceholder}
          className="w-full px-3 py-2 rounded text-sm"
          style={inputStyle}
        />
      </div>
      <button
        onClick={isRegister ? handleRegister : handleLogin}
        disabled={loading}
        className="px-4 py-2 rounded text-sm font-semibold"
        style={{ backgroundColor: 'var(--accent)', color: '#000', opacity: loading ? 0.7 : 1 }}
      >
        {loading ? t.loading : (isRegister ? t.register : t.login)}
      </button>
      <button
        onClick={() => { setAuthStep(isRegister ? 'login' : 'register'); setError(''); }}
        className="text-xs"
        style={{ color: 'var(--text-secondary)' }}
      >
        {isRegister ? t.login : t.register} →
      </button>
    </div>
  );

  if (authStep === 'login') return renderAuthForm(false);
  if (authStep === 'register') return renderAuthForm(true);

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>
          &gt; {t.subscribeTitle}
        </h2>
        <button
          onClick={handleLogout}
          className="px-3 py-1 text-xs rounded border"
          style={{ borderColor: 'var(--bg-border)', color: 'var(--text-secondary)' }}
        >
          {t.logout}
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.subscribeDesc}</p>

      {error && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', color: '#ff5050' }}>
          {error}
        </div>
      )}

      {/* Add subscription */}
      <div className="p-4 rounded-lg flex flex-col gap-3" style={cardStyle}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.addSubscription}</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            placeholder={t.targetHandlePlaceholder}
            className="flex-1 px-3 py-2 rounded text-sm"
            style={inputStyle}
          />
          <select
            value={newMode}
            onChange={(e) => setNewMode(e.target.value as Mode)}
            className="px-3 py-2 rounded text-sm"
            style={inputStyle}
          >
            <option value="block">{t.blockTool}</option>
            <option value="mute">{t.muteTool}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            checked={newIncludeFollowers}
            onChange={(e) => setNewIncludeFollowers(e.target.checked)}
          />
          {t.includeFollowers}
        </label>
        <button
          onClick={handleAddSubscription}
          className="px-4 py-2 rounded text-sm font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: '#000' }}
        >
          {t.subscribeBtn}
        </button>
      </div>

      {/* Subscription list */}
      <div className="flex flex-col gap-2">
        {subscriptions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.noSubscriptions}</p>
        ) : (
          subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="p-4 rounded-lg flex items-center justify-between gap-4"
              style={cardStyle}
            >
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  @{sub.target_handle}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {sub.mode} • {sub.include_followers ? t.includeFollowers : t.withoutFollowers}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {t.lastUpdated}: {sub.last_updated ? new Date(sub.last_updated).toLocaleDateString() : t.never}
                </div>
              </div>
              <button
                onClick={() => handleDeleteSubscription(sub.id)}
                className="px-3 py-1 text-xs rounded border"
                style={{ borderColor: 'rgba(255,80,80,0.4)', color: '#ff5050' }}
              >
                {t.deleteSubscription}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Danger zone */}
      <div className="p-4 rounded-lg" style={{ border: '1px solid rgba(255,80,80,0.2)', backgroundColor: 'rgba(255,80,80,0.03)' }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: '#ff5050' }}>Danger Zone</h3>
        <button
          onClick={handleDeleteAccount}
          className="px-4 py-2 rounded text-sm"
          style={{ border: '1px solid rgba(255,80,80,0.4)', color: '#ff5050' }}
        >
          {t.deleteAccount}
        </button>
      </div>
    </div>
  );
}
