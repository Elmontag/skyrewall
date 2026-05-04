'use client';
import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquareX, ShieldX, VolumeX, Info } from 'lucide-react';
import type { Follower, Mode } from '@/types';
import type { Translations } from '@/i18n/en';
import FollowerList from './FollowerList';

interface Props {
  t: Translations;
}

interface Result {
  succeeded: number;
  failed: number;
}

type InteractionType = 'likes' | 'reposts' | 'quotes';

export default function PostInteractionTool({ t }: Props) {
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [types, setTypes] = useState<Set<InteractionType>>(new Set(['likes', 'reposts', 'quotes']));
  const [interactors, setInteractors] = useState<Follower[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('block');
  const [step, setStep] = useState<'credentials' | 'ready' | 'loading' | 'list' | 'processing' | 'done'>('credentials');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    fetch('/api/account', { method: 'GET' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (data.handle) {
            setHandle(data.handle);
            setPrefilled(true);
            setStep('ready');
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleLoad = async () => {
    if (!postUrl.trim()) { setError(t.errorTargetRequired); return; }
    if (types.size === 0) { setError(t.postInteractionSelectType); return; }
    if (!prefilled && (!handle.trim() || !password.trim())) { setError(t.errorHandleRequired); return; }
    setError('');
    setStep('loading');

    const credFields = prefilled ? {} : { handle, password };

    try {
      const res = await fetch('/api/bluesky/post-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, postUrl, types: [...types] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t.errorGeneral);
        setStep(prefilled ? 'ready' : 'credentials');
        return;
      }
      const data = await res.json();
      const fetched: Follower[] = data.interactors ?? [];
      setInteractors(fetched);
      setSelected(new Set(fetched.map((f) => f.did)));
      setStep('list');
    } catch {
      setError(t.errorNetwork);
      setStep(prefilled ? 'ready' : 'credentials');
    }
  };

  const handleConfirm = async () => {
    setStep('processing');
    const dids = [...selected];
    const credFields = prefilled ? {} : { handle, password };
    const endpoint = mode === 'block' ? '/api/bluesky/block' : '/api/bluesky/mute';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, dids, source: 'interaction' }),
      });
      const data = await res.json();
      setResult({ succeeded: data.succeeded || 0, failed: data.failed || 0 });
    } catch {
      setResult({ succeeded: 0, failed: dids.length });
    }
    setStep('done');
  };

  const handleToggle = useCallback((did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }, []);

  const toggleType = (type: InteractionType) => {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  };

  const reset = () => {
    setInteractors([]); setSelected(new Set());
    setResult(null); setError('');
    setPostUrl('');
    setStep(prefilled ? 'ready' : 'credentials');
  };

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const input = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  const interactionTypes: { key: InteractionType; label: string }[] = [
    { key: 'likes', label: t.postTypeLikes },
    { key: 'reposts', label: t.postTypeReposts },
    { key: 'quotes', label: t.postTypeQuotes },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}>
          <AlertTriangle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Credentials + URL form (non-prefilled: credentials first) */}
      {(step === 'credentials' || step === 'ready') && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.postBlockTool}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t.postBlockDesc}</p>
          </div>

          {prefilled ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
              style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid rgba(0,133,255,0.2)', color: 'var(--accent)' }}>
              <Info size={13} className="flex-shrink-0" />
              <span>{t.usingSubscriptionAccount} <span className="font-mono font-semibold">@{handle}</span></span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
                <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
                  placeholder={t.handlePlaceholder} className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring" style={input} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.appPassword}</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.appPasswordPlaceholder} className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring" style={input} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.postUrlLabel}</label>
            <input type="text" value={postUrl} onChange={(e) => setPostUrl(e.target.value)}
              placeholder="https://bsky.app/profile/user.bsky.social/post/..."
              className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring" style={input}
              onKeyDown={(e) => e.key === 'Enter' && handleLoad()} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t.postInteractionTypes}</label>
            <div className="flex gap-2 flex-wrap">
              {interactionTypes.map(({ key, label }) => (
                <button key={key} onClick={() => toggleType(key)}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: types.has(key) ? 'var(--accent-muted)' : 'var(--bg-dark)',
                    color: types.has(key) ? 'var(--accent)' : 'var(--text-secondary)',
                    border: `1px solid ${types.has(key) ? 'rgba(0,133,255,0.3)' : 'var(--bg-border)'}`,
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            {(['block', 'mute'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  backgroundColor: mode === m ? (m === 'block' ? 'var(--accent-muted)' : 'rgba(167,139,250,0.15)') : 'var(--bg-dark)',
                  color: mode === m ? (m === 'block' ? 'var(--accent)' : '#a78bfa') : 'var(--text-secondary)',
                  border: `1px solid ${mode === m ? (m === 'block' ? 'rgba(0,133,255,0.2)' : 'rgba(167,139,250,0.2)') : 'var(--bg-border)'}`,
                }}>
                {m === 'block' ? t.blockTool : t.muteTool}
              </button>
            ))}
          </div>

          <button onClick={handleLoad}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
            <MessageSquareX size={15} /> {t.postLoadInteractors}
          </button>
        </div>
      )}

      {/* Loading */}
      {step === 'loading' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-8 flex flex-col gap-4 items-center" style={card}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            <MessageSquareX size={26} strokeWidth={1.5} className="pulse" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.postLoadingInteractors}</p>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
            <div className="h-full progress-bar" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* List */}
      {step === 'list' && (
        <div className="rounded-2xl p-6 flex flex-col gap-4" style={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.postInteractorListTitle}</h2>
            <span className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)' }}>
              {interactors.length} {t.followers}
            </span>
          </div>
          {interactors.length === 0
            ? <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>{t.postNoInteractors}</p>
            : <>
                <FollowerList followers={interactors} selected={selected}
                  onToggle={handleToggle}
                  onSelectAll={() => setSelected(new Set(interactors.map((f) => f.did)))}
                  onDeselectAll={() => setSelected(new Set())}
                  t={t} />
                <div className="flex gap-3 pt-1">
                  <button onClick={reset}
                    className="px-4 py-2.5 rounded-xl text-sm"
                    style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
                    {t.back}
                  </button>
                  <button onClick={handleConfirm} disabled={selected.size === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: mode === 'block' ? 'var(--accent)' : '#a78bfa', color: '#fff' }}>
                    {mode === 'block' ? t.confirmBlock : t.confirmMute}
                    {selected.size > 0 && <span className="ml-1.5 opacity-80">({selected.size})</span>}
                  </button>
                </div>
              </>
          }
        </div>
      )}

      {/* Processing */}
      {step === 'processing' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-8 flex flex-col gap-4 items-center" style={card}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            {mode === 'mute'
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
          <div className="rounded-xl p-4 flex flex-col gap-2"
            style={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)' }}>
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
          <button onClick={reset} className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>{t.startOver}</button>
        </div>
      )}
    </div>
  );
}
