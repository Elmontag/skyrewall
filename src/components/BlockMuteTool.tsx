'use client';
import { useState, useCallback } from 'react';
import type { Follower, Mode, Language } from '@/types';
import type { Translations } from '@/i18n/en';
import FollowerList from './FollowerList';

interface Props {
  t: Translations;
  lang: Language;
}

type Step = 'credentials' | 'target' | 'followers' | 'processing' | 'done';

interface Result {
  succeeded: number;
  failed: number;
}

export default function BlockMuteTool({ t }: Props) {
  const [step, setStep] = useState<Step>('credentials');
  const [mode, setMode] = useState<Mode>('block');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [targetHandle, setTargetHandle] = useState('');
  const [includeFollowers, setIncludeFollowers] = useState(true);
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [fetchProgress, setFetchProgress] = useState({ count: 0, page: 0, loading: false });
  const [result, setResult] = useState<Result | null>(null);

  const handleStep1 = () => {
    if (!handle.trim()) { setError(t.errorHandleRequired); return; }
    if (!password.trim()) { setError(t.errorPasswordRequired); return; }
    setError('');
    setStep('target');
  };

  const handleLoadFollowers = async () => {
    if (!targetHandle.trim()) { setError(t.errorTargetRequired); return; }
    setError('');
    setFetchProgress({ count: 0, page: 0, loading: true });
    setStep('followers');

    if (!includeFollowers) {
      setFollowers([]);
      setSelected(new Set());
      setFetchProgress({ count: 0, page: 0, loading: false });
      return;
    }

    try {
      const res = await fetch('/api/bluesky/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password, targetHandle }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.errorGeneral);
        setStep('target');
        setFetchProgress({ count: 0, page: 0, loading: false });
        return;
      }

      const data = await res.json();
      const fetchedFollowers: Follower[] = data.followers;
      setFollowers(fetchedFollowers);
      setSelected(new Set(fetchedFollowers.map((f: Follower) => f.did)));
      setFetchProgress({ count: fetchedFollowers.length, page: 0, loading: false });
    } catch {
      setError(t.errorNetwork);
      setStep('target');
      setFetchProgress({ count: 0, page: 0, loading: false });
    }
  };

  const handleToggle = useCallback((did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did);
      else next.add(did);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(followers.map((f) => f.did)));
  }, [followers]);

  const handleDeselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleConfirm = async () => {
    setStep('processing');

    const dids: string[] = [...selected];

    try {
      const resolveRes = await fetch('/api/bluesky/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password, targetHandle, resolveOnly: true }),
      });
      if (resolveRes.ok) {
        const data = await resolveRes.json();
        if (data.targetDid && !dids.includes(data.targetDid)) {
          dids.unshift(data.targetDid);
        }
      }
    } catch {
      // proceed without target DID resolve
    }

    const endpoint = mode === 'block' ? '/api/bluesky/block' : '/api/bluesky/mute';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, password, dids }),
      });

      const data = await res.json();
      setResult({ succeeded: data.succeeded || 0, failed: data.failed || 0 });
    } catch {
      setResult({ succeeded: 0, failed: dids.length });
    }

    setStep('done');
  };

  const reset = () => {
    setStep('credentials');
    setHandle('');
    setPassword('');
    setTargetHandle('');
    setFollowers([]);
    setSelected(new Set());
    setError('');
    setResult(null);
    setFetchProgress({ count: 0, page: 0, loading: false });
  };

  // suppress unused warning
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

  const inputFocusStyle = {
    outline: 'none',
    borderColor: 'var(--accent)',
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Mode tabs */}
      <div className="flex gap-0 rounded overflow-hidden" style={{ border: '1px solid var(--bg-border)' }}>
        {(['block', 'mute'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: mode === m ? 'var(--accent)' : 'var(--bg-card)',
              color: mode === m ? '#000' : 'var(--text-secondary)',
            }}
          >
            {m === 'block' ? t.blockTool : t.muteTool}
          </button>
        ))}
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {['credentials', 'target', 'followers'].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
              style={{
                backgroundColor:
                  step === s ? 'var(--accent)' : 'var(--bg-border)',
                color: step === s ? '#000' : 'var(--text-secondary)',
              }}
            >
              {i + 1}
            </span>
            {i < 2 && <span style={{ color: 'var(--bg-border)' }}>—</span>}
          </span>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded text-sm" style={{ backgroundColor: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', color: '#ff5050' }}>
          {error}
        </div>
      )}

      {/* Step 1: Credentials */}
      {step === 'credentials' && (
        <div className="p-6 rounded-lg flex flex-col gap-4" style={cardStyle}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>
              &gt; {t.step1Title}
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{t.step1Desc}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t.handlePlaceholder}
                className="w-full px-3 py-2 rounded text-sm"
                style={inputStyle}
                onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={(e) => (e.target.style.borderColor = 'var(--bg-border)')}
                onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
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
                onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
                onBlur={(e) => (e.target.style.borderColor = 'var(--bg-border)')}
                onKeyDown={(e) => e.key === 'Enter' && handleStep1()}
              />
            </div>
          </div>
          <button
            onClick={handleStep1}
            className="px-4 py-2 rounded text-sm font-semibold transition-all"
            style={{ backgroundColor: 'var(--accent)', color: '#000' }}
          >
            {t.next}
          </button>
        </div>
      )}

      {/* Step 2: Target */}
      {step === 'target' && (
        <div className="p-6 rounded-lg flex flex-col gap-4" style={cardStyle}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>
              &gt; {t.step2Title}
            </h2>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{t.targetHandle}</label>
            <input
              type="text"
              value={targetHandle}
              onChange={(e) => setTargetHandle(e.target.value)}
              placeholder={t.targetHandlePlaceholder}
              className="w-full px-3 py-2 rounded text-sm"
              style={inputStyle}
              onFocus={(e) => Object.assign(e.target.style, inputFocusStyle)}
              onBlur={(e) => (e.target.style.borderColor = 'var(--bg-border)')}
              onKeyDown={(e) => e.key === 'Enter' && handleLoadFollowers()}
            />
          </div>
          <div className="flex flex-col gap-2">
            {[
              { value: true, label: t.includeFollowers },
              { value: false, label: t.withoutFollowers },
            ].map(({ value, label }) => (
              <label key={String(value)} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-primary)' }}>
                <div
                  className="w-4 h-4 rounded-full border flex items-center justify-center"
                  style={{
                    borderColor: includeFollowers === value ? 'var(--accent)' : 'var(--bg-border)',
                    backgroundColor: includeFollowers === value ? 'var(--accent)' : 'transparent',
                  }}
                  onClick={() => setIncludeFollowers(value)}
                >
                  {includeFollowers === value && <div className="w-2 h-2 rounded-full bg-black" />}
                </div>
                {label}
              </label>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('credentials')}
              className="px-4 py-2 rounded text-sm transition-colors"
              style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
            >
              {t.back}
            </button>
            <button
              onClick={handleLoadFollowers}
              className="flex-1 px-4 py-2 rounded text-sm font-semibold transition-all"
              style={{ backgroundColor: 'var(--accent)', color: '#000' }}
            >
              {includeFollowers ? t.loadFollowers : t.next}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Followers */}
      {step === 'followers' && (
        <div className="p-6 rounded-lg flex flex-col gap-4" style={cardStyle}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>
            &gt; {t.followerListTitle}
          </h2>

          {fetchProgress.loading ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {t.fetchingFollowers} ({fetchProgress.count} {t.followers})
              </div>
              <div className="w-full h-1 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
                <div className="h-full progress-bar" style={{ width: '100%' }} />
              </div>
            </div>
          ) : (
            <>
              {followers.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.noFollowers}</p>
              ) : (
                <FollowerList
                  followers={followers}
                  selected={selected}
                  onToggle={handleToggle}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  t={t}
                />
              )}
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setStep('target')}
                  className="px-4 py-2 rounded text-sm transition-colors"
                  style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
                >
                  {t.back}
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-2 rounded text-sm font-semibold transition-all"
                  style={{ backgroundColor: 'var(--accent)', color: '#000' }}
                  disabled={selected.size === 0 && includeFollowers}
                >
                  {mode === 'block' ? t.confirmBlock : t.confirmMute}
                  {selected.size > 0 && ` (${selected.size + 1})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Processing */}
      {step === 'processing' && (
        <div className="p-6 rounded-lg flex flex-col gap-4 items-center" style={cardStyle}>
          <div className="text-lg font-semibold cursor" style={{ color: 'var(--accent)' }}>
            {t.processing}
          </div>
          <div className="w-full h-2 rounded overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
            <div className="h-full progress-bar" style={{ width: '100%' }} />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'block' ? t.confirmBlock : t.confirmMute}...
          </p>
        </div>
      )}

      {/* Done */}
      {step === 'done' && result && (
        <div className="p-6 rounded-lg flex flex-col gap-4" style={cardStyle}>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>
            ✓ {t.success}
          </h2>
          <div className="flex flex-col gap-2 text-sm">
            <div>
              <span style={{ color: 'var(--accent)' }}>{result.succeeded}</span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                {mode === 'block' ? t.blocked : t.muted}
              </span>
            </div>
            {result.failed > 0 && (
              <div>
                <span style={{ color: '#ff5050' }}>{result.failed}</span>{' '}
                <span style={{ color: 'var(--text-secondary)' }}>{t.failed}</span>
              </div>
            )}
          </div>
          <button
            onClick={reset}
            className="px-4 py-2 rounded text-sm font-semibold"
            style={{ backgroundColor: 'var(--accent)', color: '#000' }}
          >
            {t.startOver}
          </button>
        </div>
      )}
    </div>
  );
}
