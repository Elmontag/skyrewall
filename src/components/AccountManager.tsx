'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, Check, RefreshCw, Trash2, KeyRound, AtSign, LogOut, LogIn, ArrowLeft, ArrowRight, RefreshCcw } from 'lucide-react';
import type { Translations } from '@/i18n/en';

interface Props {
  t: Translations;
  onLogin?: () => void;
  onLogout?: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type AuthStep = 'identity' | 'password' | 'dashboard';
type AuthMode = 'login' | 'register';

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

export default function AccountManager({ t, onLogin, onLogout }: Props) {
  const [authStep, setAuthStep] = useState<AuthStep>('identity');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [isOAuthUser, setIsOAuthUser] = useState(false);
  const [oauthErrorSince, setOauthErrorSince] = useState<string | null>(null);
  const [loginHandle, setLoginHandle] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [loading, setLoading] = useState(true);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleField = useUpdateField('handle');
  const passwordField = useUpdateField('password');

  useEffect(() => {
    fetch('/api/auth/login', { method: 'GET' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setCurrentHandle(data.user?.handle ?? null);
          setIsOAuthUser(data.user?.isOAuth ?? false);
          setOauthErrorSince(data.user?.oauthErrorSince ?? null);
          setAuthStep('dashboard');
        } else {
          setAuthStep('identity');
        }
      })
      .catch(() => setAuthStep('identity'))
      .finally(() => setLoading(false));

    // Detect OAuth callback errors redirected back with ?oauth_error=…
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const oauthErr = params.get('oauth_error');
      if (oauthErr) {
        if (oauthErr === 'wrong_account') {
          setAuthError(t.oauthErrorWrongAccount);
        } else if (oauthErr !== 'consent') {
          setAuthError(t.oauthErrorDesc);
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('oauth_error');
        window.history.replaceState({}, '', url.toString());
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async () => {
    if (!loginHandle.trim() || !loginPassword.trim()) {
      setAuthError(t.errorInvalidCreds);
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: loginHandle, password: loginPassword }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setCurrentHandle(data.user?.handle ?? loginHandle);
        setAuthStep('dashboard');
        setLoginHandle('');
        setLoginPassword('');
        onLogin?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setAuthError(data.error || t.errorInvalidCreds);
      }
    } catch {
      setAuthError(t.errorNetwork);
    }
    setAuthLoading(false);
  };

  const handleRegister = async () => {
    if (!loginHandle.trim() || !loginPassword.trim()) {
      setAuthError(t.errorInvalidCreds);
      return;
    }
    if (!privacyAccepted) {
      setAuthError(t.errorPrivacyRequired);
      return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: loginHandle, password: loginPassword, privacyAccepted: true }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setCurrentHandle(data.user?.handle ?? loginHandle);
        setAuthStep('dashboard');
        setLoginHandle('');
        setLoginPassword('');
        onLogin?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setAuthError(data.error || t.errorGeneral);
      }
    } catch {
      setAuthError(t.errorNetwork);
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' });
    setAuthStep('identity');
    setCurrentHandle(null);
    onLogout?.();
  };

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    setAuthError('');
    try {
      // If the user is already logged in (re-auth / reconnect flow), bind the OAuth
      // request to the current user's DID so a different account cannot be substituted.
      const isReauth = authStep === 'dashboard';
      const res = await fetch('/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isReauth
          ? JSON.stringify({ isReauth: true })
          : JSON.stringify({ handle: currentHandle || loginHandle.trim() || undefined, privacyAccepted: authMode === 'register' }),
      });
      if (res.ok) {
        const { redirectUrl } = await res.json();
        window.location.href = redirectUrl;
      } else {
        const data = await res.json().catch(() => ({}));
        setAuthError(data.error || t.oauthErrorDesc);
        setOauthLoading(false);
      }
    } catch {
      setAuthError(t.errorNetwork);
      setOauthLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm(t.deleteAccountConfirm)) return;
    setDeleteError('');
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (res.ok) {
        setAuthStep('identity');
        setCurrentHandle(null);
        onLogout?.();
      } else {
        setDeleteError('Delete failed');
      }
    } catch {
      setDeleteError('Network error');
    }
  };

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const inputStyle = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (authStep === 'identity' || authStep === 'password') {
    const isRegister = authMode === 'register';
    const stepIndex = authStep === 'identity' ? 0 : 1;
    const stepLabels = [t.authStep1Label, t.authStep2Label];

    return (
      <div className="flex flex-col gap-5 max-w-sm mx-auto w-full">
        {/* Step indicator */}
        <div className="flex items-center gap-0">
          {stepLabels.map((label, i) => {
            const active = stepIndex === i;
            const done = stepIndex > i;
            return (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-all"
                    style={{
                      backgroundColor: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-border)',
                      color: done || active ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </div>
                  <span className="text-xs hidden sm:block" style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {label}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className="flex-1 h-px mx-3" style={{ backgroundColor: done ? 'var(--success)' : 'var(--bg-border)' }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl p-6 flex flex-col gap-5" style={card}>
          {/* Mode toggle — only on step 1 */}
          {authStep === 'identity' && (
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--bg-border)' }}>
              {(['login', 'register'] as AuthMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => { setAuthMode(mode); setAuthError(''); setPrivacyAccepted(false); }}
                  className="flex-1 py-2 text-sm font-semibold transition-all"
                  style={{
                    backgroundColor: authMode === mode ? 'var(--accent)' : 'transparent',
                    color: authMode === mode ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {mode === 'login' ? t.login : t.register}
                </button>
              ))}
            </div>
          )}

          {/* Title */}
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {authStep === 'identity'
                ? (isRegister ? t.registerTitle : t.loginTitle)
                : (isRegister ? t.registerStep2Title : t.loginStep2Title)}
            </h2>
          </div>

          {/* Error */}
          {authError && (
            <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
              style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}>
              <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0" /> {authError}
            </div>
          )}

          {/* Step 1: Identity */}
          {authStep === 'identity' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
                <input
                  type="text" value={loginHandle} onChange={(e) => setLoginHandle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isRegister && handleOAuthLogin()}
                  placeholder={t.handlePlaceholder}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
                  style={inputStyle}
                />
              </div>

              {/* Privacy checkbox — register only, before buttons */}
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
                    <a href="/datenschutz"
                      style={{ color: 'var(--accent)', textDecoration: 'underline' }} onClick={(e) => e.stopPropagation()}>
                      {t.privacyPolicyLink}
                    </a>
                    {t.privacyPolicyAcceptSuffix}
                  </span>
                </label>
              )}

              {/* OAuth button */}
              <button
                onClick={() => {
                  if (isRegister && !privacyAccepted) {
                    setAuthError(t.errorPrivacyRequired);
                    return;
                  }
                  setAuthError('');
                  handleOAuthLogin();
                }}
                disabled={oauthLoading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
              >
                {oauthLoading
                  ? <><RefreshCw size={14} className="animate-spin" /> {t.oauthConnecting}</>
                  : (isRegister ? t.registerWithBluesky : t.loginWithBluesky)
                }
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--bg-border)' }} />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.orDivider}</span>
                <div className="flex-1 h-px" style={{ backgroundColor: 'var(--bg-border)' }} />
              </div>

              {/* Continue with app password */}
              <button
                onClick={() => {
                  if (isRegister && !privacyAccepted) {
                    setAuthError(t.errorPrivacyRequired);
                    return;
                  }
                  setAuthError('');
                  setAuthStep('password');
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)' }}
              >
                {t.continueWithPassword} <ArrowRight size={14} />
              </button>
            </>
          )}

          {/* Step 2: App Password */}
          {authStep === 'password' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.appPassword}</label>
                <input
                  type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (isRegister ? handleRegister() : handleLogin())}
                  placeholder={t.appPasswordPlaceholder}
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
                  style={inputStyle}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setAuthStep('identity'); setAuthError(''); setLoginPassword(''); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex-shrink-0"
                  style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={14} /> {t.back}
                </button>
                <button
                  onClick={isRegister ? handleRegister : handleLogin}
                  disabled={authLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
                >
                  {authLoading && <RefreshCw size={14} className="animate-spin" />}
                  {authLoading ? t.loading : (isRegister ? t.register : t.login)}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      {/* OAuth session expired warning */}
      {isOAuthUser && oauthErrorSince && (
        <div className="px-4 py-3 rounded-xl flex items-start gap-3"
          style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 10%, var(--bg-card))', border: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)' }}>
          <RefreshCcw size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <div className="flex flex-col gap-2 min-w-0">
            <div>
              <span className="text-sm font-semibold" style={{ color: '#f59e0b' }}>{t.oauthSessionExpiredTitle}</span>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t.oauthSessionExpiredDesc}</p>
            </div>
            <button
              onClick={handleOAuthLogin}
              disabled={oauthLoading}
              className="self-start flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-semibold transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
            >
              {oauthLoading ? <RefreshCw size={12} className="animate-spin" /> : <LogIn size={12} />}
              {oauthLoading ? t.oauthConnecting : t.oauthSessionReauthorize}
            </button>
          </div>
        </div>
      )}

      {/* Current account */}
      {currentHandle && (
        <div className="px-4 py-3 rounded-xl flex items-center justify-between gap-3"
          style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid rgba(0,133,255,0.2)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <AtSign size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span className="text-sm font-mono font-medium truncate" style={{ color: 'var(--accent)' }}>
              {currentHandle}
            </span>
            <span className="px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
              style={{ backgroundColor: isOAuthUser ? 'rgba(0,133,255,0.12)' : 'rgba(120,120,120,0.12)', color: isOAuthUser ? 'var(--accent)' : 'var(--text-secondary)' }}>
              {isOAuthUser ? t.authMethodOAuth : t.authMethodPassword}
            </span>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors flex-shrink-0"
            style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
            <LogOut size={12} /> {t.logout}
          </button>
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
        inputStyle={inputStyle}
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
        inputStyle={inputStyle}
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
  inputStyle: React.CSSProperties;
}

function UpdateCard({ icon, title, desc, inputType, placeholder, field, t, inputStyle }: UpdateCardProps) {
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

      <div className="flex gap-2">
        <input
          type={inputType}
          value={field.value}
          onChange={(e) => field.setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
          style={inputStyle}
        />
        <button
          onClick={field.save}
          disabled={field.state === 'saving' || !field.value.trim()}
          className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
          style={{ backgroundColor: field.state === 'saved' ? 'var(--success-muted)' : 'var(--accent)', color: field.state === 'saved' ? 'var(--success)' : '#fff' }}>
          {field.state === 'saving' && <RefreshCw size={13} className="animate-spin" />}
          {field.state === 'saved' && <Check size={13} />}
          {field.state === 'saved' ? t.saveChanges : t.saveChanges}
        </button>
      </div>
      {field.state === 'saved' && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--success)' }}>
          <Check size={12} /> {t.changesSaved}
        </div>
      )}
    </div>
  );
}
