'use client';
import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldX, VolumeX, Info, Bell } from 'lucide-react';
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

export default function ReblockTool({ t }: Props) {
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [blockers, setBlockers] = useState<Follower[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>('block');
  const [reblockMode, setReblockMode] = useState<'scan' | 'subscribe'>('scan');
  const [step, setStep] = useState<'credentials' | 'ready' | 'loading' | 'list' | 'processing' | 'done'>('credentials');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [subscriptionSaved, setSubscriptionSaved] = useState(false);
  const [actionedDids, setActionedDids] = useState<{ blocked: Set<string>; muted: Set<string> }>({ blocked: new Set(), muted: new Set() });
  const [hideActioned, setHideActioned] = useState(true);
  const [streamProgress, setStreamProgress] = useState<{ done: number; total: number; succeeded: number; failed: number } | null>(null);

  const [fetchCount, setFetchCount] = useState(0);

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

  const handleScan = async () => {
    if (!prefilled && (!handle.trim() || !password.trim())) {
      setError(t.errorHandleRequired); return;
    }
    setError('');
    setFetchCount(0);
    setStep('loading');

    const credFields = prefilled ? {} : { handle, password };

    try {
      const res = await fetch('/api/bluesky/check-blockedby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credFields),
      });
      if (!res.body) {
        setError(t.errorGeneral);
        setStep(prefilled ? 'ready' : 'credentials');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fetched: import('@/types').Follower[] = [];

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.error) {
              setError(event.error);
              setStep(prefilled ? 'ready' : 'credentials');
              return;
            }
            if (typeof event.count === 'number') setFetchCount(event.count);
            if (event.complete) {
              fetched = event.blockers ?? [];
              break outer;
            }
          } catch { /* ignore */ }
        }
      }

      setBlockers(fetched);
      setSelected(new Set(fetched.map((f) => f.did)));

      // Check already-actioned
      if (prefilled && fetched.length > 0) {
        fetch('/api/bluesky/check-actioned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dids: fetched.map((f) => f.did) }),
        }).then(async (aRes) => {
          if (aRes.ok) {
            const aData = await aRes.json();
            setActionedDids({ blocked: new Set<string>(aData.blocked ?? []), muted: new Set<string>(aData.muted ?? []) });
          }
        }).catch(() => {});
      }

      setStep('list');
    } catch {
      setError(t.errorNetwork);
      setStep(prefilled ? 'ready' : 'credentials');
    }
  };

  const handleConfirm = async () => {
    setStep('processing');
    setStreamProgress(null);
    const dids = [...selected];
    const credFields = prefilled ? {} : { handle, password };
    const streamEndpoint = mode === 'block' ? '/api/bluesky/block-stream' : '/api/bluesky/mute-stream';

    try {
      const res = await fetch(streamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, dids, source: 'reblock' }),
      });
      if (!res.body) throw new Error('No stream body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              if (event.error) throw new Error(event.error);
              setStreamProgress({ done: event.done ?? 0, total: event.total ?? dids.length, succeeded: event.succeeded ?? 0, failed: event.failed ?? 0 });
              if (event.complete) {
                setResult({ succeeded: event.succeeded ?? 0, failed: event.failed ?? 0 });
                setStep('done');
                return;
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'JSON') throw parseErr;
            }
          }
        }
      }
      setStep('done');
    } catch {
      setResult({ succeeded: 0, failed: dids.length });
      setStep('done');
    }
  };

  const handleSaveSubscription = async () => {
    setSavingSubscription(true);
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_handle: handle, mode, sub_type: 'reblock', include_followers: false }),
      });
      if (res.ok) setSubscriptionSaved(true);
      else setError(t.errorGeneral);
    } catch {
      setError(t.errorNetwork);
    } finally {
      setSavingSubscription(false);
    }
  };

  const handleToggle = useCallback((did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }, []);

  const reset = () => {
    setBlockers([]); setSelected(new Set());
    setResult(null); setError('');
    setSubscriptionSaved(false);
    setStreamProgress(null);
    setActionedDids({ blocked: new Set(), muted: new Set() });
    setStep(prefilled ? 'ready' : 'credentials');
  };

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const input = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}>
          <AlertTriangle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Credentials (non-prefilled) */}
      {step === 'credentials' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.step1Title}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t.step1Desc}</p>
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.handle}</label>
              <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)}
                placeholder={t.handlePlaceholder} className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all" style={input} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.appPassword}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={t.appPasswordPlaceholder} className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono focus-ring transition-all" style={input} />
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
            <Info size={12} className="flex-shrink-0 mt-0.5" />
            <span>{t.reblockClearSkyNote} <a href="https://clearsky.app" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>clearsky.app</a></span>
          </div>
          <button onClick={handleScan}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
            <RefreshCw size={15} /> {t.reblockScan}
          </button>
        </div>
      )}

      {/* Ready (prefilled) */}
      {step === 'ready' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid rgba(0,133,255,0.2)', color: 'var(--accent)' }}>
            <Info size={13} className="flex-shrink-0" />
            <span>{t.usingSubscriptionAccount} <span className="font-mono font-semibold">@{handle}</span></span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.reblockDesc}</p>

          {/* ClearSky API notice */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
            <Info size={12} className="flex-shrink-0 mt-0.5" />
            <span>{t.reblockClearSkyNote} <a href="https://clearsky.app" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>clearsky.app</a></span>
          </div>
          <div className="flex gap-2">
            {(['scan', 'subscribe'] as const).map((m) => (
              <button key={m} onClick={() => setReblockMode(m)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                style={{
                  backgroundColor: reblockMode === m ? 'var(--accent-muted)' : 'var(--bg-dark)',
                  color: reblockMode === m ? 'var(--accent)' : 'var(--text-secondary)',
                  border: `1px solid ${reblockMode === m ? 'rgba(0,133,255,0.2)' : 'var(--bg-border)'}`,
                }}>
                {m === 'scan' ? t.reblockOnce : t.reblockSubscribe}
              </button>
            ))}
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

          {reblockMode === 'scan' ? (
            <button onClick={handleScan}
              className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
              <RefreshCw size={15} /> {t.reblockScan}
            </button>
          ) : (
            subscriptionSaved
              ? <span className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl justify-center"
                  style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
                  <CheckCircle2 size={14} /> {t.reblockSubscriptionSaved}
                </span>
              : <button onClick={handleSaveSubscription} disabled={savingSubscription}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#8b5cf6', border: '1px solid rgba(139,92,246,0.3)' }}>
                  {savingSubscription ? <RefreshCw size={14} className="animate-spin" /> : <Bell size={14} />}
                  {t.reblockCreateSub}
                </button>
          )}
        </div>
      )}

      {/* Loading */}
      {step === 'loading' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-8 flex flex-col gap-4 items-center" style={card}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            <RefreshCw size={26} strokeWidth={1.5} className="pulse animate-spin" />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.reblockScanning}</p>
          {fetchCount > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t.fetchingCount.replace('{count}', String(fetchCount))}
            </p>
          )}
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
            <div className="h-full progress-bar" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {/* List */}
      {step === 'list' && (
        <div className="rounded-2xl p-6 flex flex-col gap-4" style={card}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.reblockListTitle}</h2>
            <span className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)' }}>
              {blockers.length} {t.reblockFound}
            </span>
          </div>
          {blockers.length === 0
            ? <p className="text-sm py-4 text-center" style={{ color: 'var(--text-secondary)' }}>{t.reblockNoneFound}</p>
            : <>
                {!prefilled && (
                  <div className="flex gap-2 mb-1">
                    {(['block', 'mute'] as Mode[]).map((m) => (
                      <button key={m} onClick={() => setMode(m)}
                        className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                        style={{
                          backgroundColor: mode === m ? 'var(--accent-muted)' : 'var(--bg-dark)',
                          color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
                          border: `1px solid ${mode === m ? 'rgba(0,133,255,0.2)' : 'var(--bg-border)'}`,
                        }}>
                        {m === 'block' ? t.blockTool : t.muteTool}
                      </button>
                    ))}
                  </div>
                )}
                <FollowerList followers={blockers} selected={selected}
                  onToggle={handleToggle}
                  onSelectAll={() => setSelected(new Set(blockers.map((f) => f.did)))}
                  onDeselectAll={() => setSelected(new Set())}
                  t={t}
                  actionedDids={actionedDids}
                  hideActioned={hideActioned}
                  onHideActionedChange={setHideActioned} />
                <div className="flex gap-3 pt-1 flex-wrap">
                  <button onClick={reset}
                    className="px-4 py-2.5 rounded-xl text-sm transition-colors"
                    style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
                    {t.back}
                  </button>
                  {prefilled && !subscriptionSaved && (
                    <button onClick={handleSaveSubscription} disabled={savingSubscription}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
                      style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)', border: '1px solid rgba(0,133,255,0.2)' }}>
                      <Bell size={14} /> {savingSubscription ? t.loading : t.reblockSaveSubscription}
                    </button>
                  )}
                  {subscriptionSaved && (
                    <span className="flex items-center gap-1.5 text-xs px-3 py-2.5 rounded-xl"
                      style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: 'var(--success)' }}>
                      <CheckCircle2 size={13} /> {t.reblockSubscriptionSaved}
                    </span>
                  )}
                  <button onClick={handleConfirm} disabled={selected.size === 0}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: mode === 'block' ? 'var(--accent)' : '#a78bfa', color: '#fff' }}>
                    {mode === 'block' ? t.confirmBlock : t.confirmMute}
                    {selected.size > 0 && <span className="ml-1.5 opacity-80">({selected.size})</span>}
                  </button>
                </div>
                {selected.size > 500 && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-xs"
                    style={{ backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.35)', color: '#ca8a04' }}>
                    <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {t.rateLimitWarning}
                      {' '}
                      {t.rateLimitEstimate.replace('{time}', String(Math.ceil(selected.size / 10 * 0.6)))}
                    </span>
                  </div>
                )}
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
          {streamProgress ? (
            <>
              <div className="w-full flex flex-col gap-1.5">
                <div className="flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span>{t.streamingProgress.replace('{done}', String(streamProgress.done)).replace('{total}', String(streamProgress.total))}</span>
                  <span>{Math.round((streamProgress.done / streamProgress.total) * 100)}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${(streamProgress.done / streamProgress.total) * 100}%`, backgroundColor: 'var(--accent)' }} />
                </div>
                {streamProgress.done < streamProgress.total && (
                  <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                    {t.streamingEta.replace('{secs}', String(Math.ceil((streamProgress.total - streamProgress.done) * 0.06)))}
                  </p>
                )}
              </div>
              <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--success)' }}>✓ {streamProgress.succeeded}</span>
                {streamProgress.failed > 0 && <span style={{ color: 'var(--danger)' }}>✗ {streamProgress.failed}</span>}
              </div>
            </>
          ) : (
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
              <div className="h-full progress-bar" style={{ width: '100%' }} />
            </div>
          )}
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
