'use client';
import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, VolumeX, ShieldX, Check, RefreshCw, Info } from 'lucide-react';
import type { Follower, Mode } from '@/types';
import type { Translations } from '@/i18n/en';
import FollowerList from './FollowerList';

interface Props {
  mode: Mode;
  t: Translations;
}

type Step = 'credentials' | 'target' | 'followers' | 'processing' | 'done';

interface Result {
  succeeded: number;
  failed: number;
}

const STEPS: Step[] = ['credentials', 'target', 'followers'];
const STEP_LABELS = (t: Translations) => [t.step1Title, t.step2Title, t.followerListTitle];

export default function BlockMuteTool({ mode, t }: Props) {
  const [step, setStep] = useState<Step>('credentials');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [targetHandle, setTargetHandle] = useState('');
  const [includeFollowers, setIncludeFollowers] = useState(true);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [fetchProgress, setFetchProgress] = useState({ count: 0, loading: false });
  const [result, setResult] = useState<Result | null>(null);
  const [mutualDids, setMutualDids] = useState<Set<string>>(new Set());
  const [protectMutuals, setProtectMutuals] = useState(true);

  // Detect active subscription session — use server-stored credentials instead of asking user
  useEffect(() => {
    fetch('/api/account', { method: 'GET' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (data.handle) {
            setHandle(data.handle);
            // Do NOT fetch or store the password — session cookie is used server-side
            setPrefilled(true);
            setStep('target');
          }
        }
      })
      .catch(() => {});
  }, []);

  const stepIndex = STEPS.indexOf(step);

  const handleStep1 = () => {
    if (!handle.trim()) { setError(t.errorHandleRequired); return; }
    if (!password.trim()) { setError(t.errorPasswordRequired); return; }
    setError('');
    setStep('target');
  };

  const handleLoadFollowers = async () => {
    if (!targetHandle.trim()) { setError(t.errorTargetRequired); return; }
    setError('');
    setFetchProgress({ count: 0, loading: true });
    setStep('followers');

    if (!includeFollowers) {
      setFollowers([]);
      setSelected(new Set());
      setFetchProgress({ count: 0, loading: false });
      return;
    }

    // When prefilled (session active), omit credentials — backend reads from session cookie
    const credFields = prefilled ? {} : { handle, password };

    try {
      const res = await fetch('/api/bluesky/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, targetHandle }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.errorGeneral);
        setStep('target');
        setFetchProgress({ count: 0, loading: false });
        return;
      }

      const data = await res.json();
      const fetched: Follower[] = data.followers;
      setFollowers(fetched);

      // Check mutuals if session is active, then apply protection defaults
      if (prefilled && fetched.length > 0) {
        try {
          const mRes = await fetch('/api/bluesky/check-mutuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dids: fetched.map((f) => f.did) }),
          });
          if (mRes.ok) {
            const mData = await mRes.json();
            const mSet = new Set<string>(mData.mutualDids ?? []);
            setMutualDids(mSet);
            // Default: protect ON → deselect mutuals. Protect OFF → select all including mutuals.
            setSelected(new Set(fetched.filter((f) => !mSet.has(f.did)).map((f) => f.did)));
          } else {
            setSelected(new Set(fetched.map((f) => f.did)));
          }
        } catch {
          setSelected(new Set(fetched.map((f) => f.did)));
        }
      } else {
        setSelected(new Set(fetched.map((f) => f.did)));
      }

      setFetchProgress({ count: fetched.length, loading: false });
    } catch {
      setError(t.errorNetwork);
      setStep('target');
      setFetchProgress({ count: 0, loading: false });
    }
  };

  const handleToggle = useCallback((did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    // When protect is on, exclude protected mutuals from select-all
    setSelected(new Set(followers.filter((f) => !(protectMutuals && mutualDids.has(f.did))).map((f) => f.did)));
  }, [followers, protectMutuals, mutualDids]);

  const handleDeselectAll = useCallback(() => setSelected(new Set()), []);

  const handleProtectMutualsChange = (value: boolean) => {
    setProtectMutuals(value);
    if (!value) {
      // Toggling protection OFF → auto-select the mutuals
      setSelected((prev) => {
        const next = new Set(prev);
        for (const did of mutualDids) next.add(did);
        return next;
      });
    } else {
      // Toggling protection ON → deselect mutuals
      setSelected((prev) => {
        const next = new Set(prev);
        for (const did of mutualDids) next.delete(did);
        return next;
      });
    }
  };

  const handleConfirm = async () => {
    setStep('processing');
    const dids: string[] = [...selected];

    const credFields = prefilled ? {} : { handle, password };

    try {
      const resolveRes = await fetch('/api/bluesky/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, targetHandle, resolveOnly: true }),
      });
      if (resolveRes.ok) {
        const data = await resolveRes.json();
        if (data.targetDid && !dids.includes(data.targetDid)) dids.unshift(data.targetDid);
      }
    } catch { /* proceed */ }

    const endpoint = mode === 'block' ? '/api/bluesky/block' : '/api/bluesky/mute';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, dids }),
      });
      const data = await res.json();
      setResult({ succeeded: data.succeeded || 0, failed: data.failed || 0 });
    } catch {
      setResult({ succeeded: 0, failed: dids.length });
    }
    setStep('done');
  };

  const reset = () => {
    setTargetHandle('');
    setFollowers([]); setSelected(new Set());
    setMutualDids(new Set()); setProtectMutuals(true);
    setError(''); setResult(null);
    setFetchProgress({ count: 0, loading: false });
    // If session credentials were prefilled, go back to target; otherwise back to credentials
    if (prefilled) {
      setStep('target');
    } else {
      setStep('credentials');
      setHandle(''); setPassword('');
    }
  };

  const card = {
    backgroundColor: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
  };

  const input = {
    backgroundColor: 'var(--bg-dark)',
    border: '1px solid var(--bg-border)',
    color: 'var(--text-primary)',
  };

  const isMute = mode === 'mute';
  const modeColor = isMute ? '#a78bfa' : 'var(--accent)';

  return (
    <div className="flex flex-col gap-5">
      {/* Step indicator */}
      {step !== 'done' && step !== 'processing' && (
        <div className="flex items-center gap-0">
          {STEP_LABELS(t).map((label, i) => {
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
                {i < 2 && <div className="flex-1 h-px mx-3" style={{ backgroundColor: done ? 'var(--success)' : 'var(--bg-border)' }} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}
        >
          <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Step 1: Credentials */}
      {step === 'credentials' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.step1Title}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t.step1Desc}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t.handlePlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
                style={input}
                onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.appPassword}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.appPasswordPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
                style={input}
                onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
              />
            </div>
          </div>
          <button
            onClick={handleStep1}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            {t.next} <ArrowRight size={15} />
          </button>
        </div>
      )}

      {/* Step 2: Target */}
      {step === 'target' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.step2Title}</h2>
          {prefilled && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid rgba(0,133,255,0.2)', color: 'var(--accent)' }}>
              <Info size={13} className="flex-shrink-0" />
              <span>{t.usingSubscriptionAccount} <span className="font-mono font-semibold">@{handle}</span></span>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.targetHandle}</label>
            <input
              type="text"
              value={targetHandle}
              onChange={(e) => setTargetHandle(e.target.value)}
              placeholder={t.targetHandlePlaceholder}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all"
              style={input}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadFollowers()}
            />
          </div>
          <div className="flex flex-col gap-2">
            {[
              { value: true, label: t.includeFollowers },
              { value: false, label: t.withoutFollowers },
            ].map(({ value, label }) => (
              <label
                key={String(value)}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                style={{
                  backgroundColor: includeFollowers === value ? 'var(--accent-muted)' : 'var(--bg-dark)',
                  border: `1px solid ${includeFollowers === value ? 'var(--accent)' : 'var(--bg-border)'}`,
                }}
                onClick={() => setIncludeFollowers(value)}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: includeFollowers === value ? 'var(--accent)' : 'var(--bg-border)' }}
                >
                  {includeFollowers === value && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                  )}
                </div>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('credentials')}
              className="px-4 py-2.5 rounded-xl text-sm transition-colors"
              style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
            >
              {t.back}
            </button>
            <button
              onClick={handleLoadFollowers}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {includeFollowers ? t.loadFollowers : t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Followers */}
      {step === 'followers' && (
        <div className="rounded-2xl p-6 flex flex-col gap-4" style={card}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.followerListTitle}</h2>

          {fetchProgress.loading ? (
            <div className="flex flex-col gap-3 py-4">
              <p className="text-sm pulse" style={{ color: 'var(--text-secondary)' }}>
                {t.fetchingFollowers} ({fetchProgress.count} {t.followers})
              </p>
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
                <div className="h-full progress-bar" style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <>
              {followers.length === 0
                ? <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>{t.noFollowers}</p>
                : <FollowerList
                    followers={followers}
                    selected={selected}
                    onToggle={handleToggle}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                    t={t}
                    mutualDids={mutualDids}
                    protectMutuals={protectMutuals}
                    onProtectMutualsChange={handleProtectMutualsChange}
                  />
              }
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStep('target')}
                  className="px-4 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2"
                  style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={14} /> {t.back}
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{ backgroundColor: modeColor, color: '#fff' }}
                  disabled={selected.size === 0 && includeFollowers}
                >
                  {mode === 'block' ? t.confirmBlock : t.confirmMute}
                  {selected.size > 0 && <span className="ml-1.5 opacity-80">({selected.size + 1})</span>}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Processing */}
      {step === 'processing' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-8 flex flex-col gap-4 items-center" style={card}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            {isMute
              ? <VolumeX size={26} strokeWidth={1.5} className="pulse" />
              : <ShieldX size={26} strokeWidth={1.5} className="pulse" />}
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.processing}</p>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
            <div className="h-full progress-bar" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
              <CheckCircle2 size={22} strokeWidth={2} />
            </div>
            <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t.success}</h2>
          </div>
          <div
            className="rounded-xl p-4 flex flex-col gap-2"
            style={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)' }}
          >
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>{mode === 'block' ? t.blocked : t.muted}</span>
              <span className="font-semibold" style={{ color: 'var(--success)' }}>{result.succeeded}</span>
            </div>
            {result.failed > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{t.failed}</span>
                <span className="font-semibold" style={{ color: 'var(--danger)' }}>{result.failed}</span>
              </div>
            )}
          </div>
          <button
            onClick={reset}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            {t.startOver}
          </button>
        </div>
      )}
    </div>
  );
}
