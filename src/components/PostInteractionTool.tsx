'use client';
import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, MessageSquareX, ShieldX, VolumeX, Info, Bell, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { Follower, Mode } from '@/types';
import type { Translations } from '@/i18n/en';
import FollowerList from './FollowerList';
import ListPicker from './ListPicker';

interface Props {
  t: Translations;
}

interface Result {
  succeeded: number;
  failed: number;
  addedToList?: number;
  listAddFailed?: number;
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
  const [step, setStep] = useState<'credentials' | 'ready' | 'loading' | 'suboptions' | 'list' | 'processing' | 'done'>('credentials');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [actionedDids, setActionedDids] = useState<{ blocked: Set<string>; muted: Set<string> }>({ blocked: new Set(), muted: new Set() });
  const [hideActioned, setHideActioned] = useState(false);
  const [mutualDids, setMutualDids] = useState<Set<string>>(new Set());
  const [protectMutuals, setProtectMutuals] = useState(true);
  const [followingDids, setFollowingDids] = useState<Set<string>>(new Set());
  const [protectFollowings, setProtectFollowings] = useState(true);
  const [savingPostSub, setSavingPostSub] = useState(false);
  const [postSubSaved, setPostSubSaved] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{ done: number; total: number; succeeded: number; failed: number; startedAt: number } | null>(null);
  const [processError, setProcessError] = useState('');

  const [fetchCount, setFetchCount] = useState(0);
  const [loadingPhase, setLoadingPhase] = useState<'fetching' | 'filtering'>('fetching');
  const [addToListUri, setAddToListUri] = useState('');
  const [showAddToList, setShowAddToList] = useState(false);

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
    if (!postUrl.trim()) { setError(t.errorPostUrlRequired); return; }
    if (types.size === 0) { setError(t.postInteractionSelectType); return; }
    if (!prefilled && (!handle.trim() || !password.trim())) { setError(t.errorHandleRequired); return; }
    setError('');
    setFetchCount(0);
    setLoadingPhase('fetching');
    setStep('loading');

    const credFields = prefilled ? {} : { handle, password, stateless: true };

    try {
      const res = await fetch('/api/bluesky/post-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, postUrl, types: [...types] }),
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
              fetched = event.interactors ?? [];
              break outer;
            }
          } catch { /* ignore */ }
        }
      }

      setInteractors(fetched);
      setSelected(new Set(fetched.map((f) => f.did)));

      if (prefilled && fetched.length > 0) {
        const dids = fetched.map((f) => f.did);
        setLoadingPhase('filtering');
        const [mRes, fRes, aRes] = await Promise.all([
          fetch('/api/bluesky/check-mutuals', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dids }),
          }).catch(() => null),
          fetch('/api/bluesky/check-followings', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dids }),
          }).catch(() => null),
          fetch('/api/bluesky/check-actioned', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dids }),
          }).catch(() => null),
        ]);

        let mSet = new Set<string>();
        let fSet = new Set<string>();
        if (mRes?.ok) {
          const mData = await mRes.json();
          mSet = new Set<string>(mData.mutualDids ?? []);
          setMutualDids(mSet);
        }
        if (fRes?.ok) {
          const fData = await fRes.json();
          fSet = new Set<string>(fData.followingDids ?? []);
          setFollowingDids(fSet);
        }
        if (aRes?.ok) {
          const aData = await aRes.json();
          setActionedDids({ blocked: new Set<string>(aData.blocked ?? []), muted: new Set<string>(aData.muted ?? []) });
        }
        setSelected(new Set(fetched.filter((f) => !(protectMutuals && mSet.has(f.did)) && !(protectFollowings && fSet.has(f.did))).map((f) => f.did)));
      }

      setLoadingPhase('fetching');
      setStep(prefilled ? 'suboptions' : 'list');
    } catch {
      setError(t.errorNetwork);
      setStep(prefilled ? 'ready' : 'credentials');
    }
  };

  const handleConfirm = async () => {
    setStep('processing');
    setStreamProgress(null);
    setProcessError('');
    const dids = [...selected];
    const credFields = prefilled ? {} : { handle, password, stateless: true };
    const streamEndpoint = mode === 'block' ? '/api/bluesky/block-stream' : '/api/bluesky/mute-stream';
    try {
      const res = await fetch(streamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, dids, source: 'interaction', add_to_list_uri: addToListUri.trim().startsWith('at://') ? addToListUri : undefined }),
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
              setStreamProgress(prev => ({ done: event.done ?? 0, total: event.total ?? dids.length, succeeded: event.succeeded ?? 0, failed: event.failed ?? 0, startedAt: prev?.startedAt ?? Date.now() }));
              if (event.complete) {
                if (event.warning) setProcessError(event.warning);
                setResult({ succeeded: event.succeeded ?? 0, failed: event.failed ?? 0, addedToList: event.addedToList, listAddFailed: event.listAddFailed });
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
    } catch (err) {
      setProcessError(err instanceof Error ? err.message : t.errorNetwork);
      setResult({ succeeded: 0, failed: dids.length });
      setStep('done');
    }
  };

  const handleToggle = useCallback((did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }, []);

  const handleProtectMutualsChange = (value: boolean) => {
    setProtectMutuals(value);
    if (!value) {
      setSelected((prev) => { const next = new Set(prev); for (const did of mutualDids) next.add(did); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); for (const did of mutualDids) next.delete(did); return next; });
    }
  };

  const handleProtectFollowingsChange = (value: boolean) => {
    setProtectFollowings(value);
    if (!value) {
      setSelected((prev) => { const next = new Set(prev); for (const did of followingDids) next.add(did); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); for (const did of followingDids) next.delete(did); return next; });
    }
  };

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(interactors.filter((f) =>
      !(protectMutuals && mutualDids.has(f.did)) &&
      !(protectFollowings && followingDids.has(f.did))
    ).map((f) => f.did)));
  }, [interactors, protectMutuals, mutualDids, protectFollowings, followingDids]);

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
    setStreamProgress(null);
    setProcessError('');
    setActionedDids({ blocked: new Set(), muted: new Set() });
    setMutualDids(new Set()); setProtectMutuals(true);
    setFollowingDids(new Set()); setProtectFollowings(true);
    setLoadingPhase('fetching');
    setAddToListUri(''); setShowAddToList(false);
    setPostSubSaved(false);
    setStep(prefilled ? 'ready' : 'credentials');
  };

  const handleSavePostSub = async () => {
    setSavingPostSub(true);
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_handle: postUrl,
          mode,
          sub_type: 'postinteraction',
          config: {
            types: [...types],
            ...(protectMutuals ? { protect_mutuals: true } : {}),
            ...(protectFollowings ? { protect_followings: true } : {}),
            ...(addToListUri.trim().startsWith('at://') ? { add_to_list_uri: addToListUri } : {}),
          },
        }),
      });
      if (res.ok || res.status === 409) {
        setPostSubSaved(true);
      }
    } finally {
      setSavingPostSub(false);
    }
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
              placeholder={t.postUrlPlaceholder}
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
          {fetchCount > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {t.fetchingCount.replace('{count}', String(fetchCount))}
            </p>
          )}
          {loadingPhase === 'filtering' && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.postCheckingHistory}</p>
          )}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-border)' }}>
            <div className="h-full progress-bar" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {step === 'suboptions' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-6 flex flex-col gap-5" style={card}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.subOptionsTitle}</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t.subOptionsDesc}</p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                style={{ borderColor: protectMutuals ? 'var(--accent)' : 'var(--bg-border)', backgroundColor: protectMutuals ? 'var(--accent)' : 'transparent' }}
                onClick={() => handleProtectMutualsChange(!protectMutuals)}>
                {protectMutuals && <svg width="8" height="6" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <input type="checkbox" checked={protectMutuals} onChange={(e) => handleProtectMutualsChange(e.target.checked)} className="sr-only" />
              {t.subProtectMutuals}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                style={{ borderColor: protectFollowings ? 'rgba(245,158,11,0.8)' : 'var(--bg-border)', backgroundColor: protectFollowings ? 'rgba(245,158,11,0.8)' : 'transparent' }}
                onClick={() => handleProtectFollowingsChange(!protectFollowings)}>
                {protectFollowings && <svg width="8" height="6" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </div>
              <input type="checkbox" checked={protectFollowings} onChange={(e) => handleProtectFollowingsChange(e.target.checked)} className="sr-only" />
              {t.subProtectFollowings}
            </label>
          </div>

          <div>
            <button type="button" onClick={() => setShowAddToList((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showAddToList ? 'var(--accent)' : 'var(--text-secondary)', padding: 0 }}>
              {showAddToList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {t.addToListToggle}
            </button>
            {showAddToList && (
              <div className="mt-3">
                <ListPicker t={t} selectedUri={addToListUri} onSelect={setAddToListUri} />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('ready')}
              className="px-3 py-2.5 rounded-xl text-sm flex items-center justify-center"
              style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
              <ArrowLeft size={16} />
            </button>
            {postUrl.trim() && (
              postSubSaved
                ? <span className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium"
                    style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--success)' }}>
                    <CheckCircle2 size={14} /> {t.subSaved}
                  </span>
                : <button onClick={handleSavePostSub} disabled={savingPostSub}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ backgroundColor: 'rgba(249,115,22,0.08)', color: '#f97316', border: '1px solid rgba(249,115,22,0.25)' }}>
                    {savingPostSub ? <RefreshCw size={13} className="animate-spin" /> : <Bell size={13} />}
                    {t.saveAsSub}
                  </button>
            )}
            <button onClick={() => setStep('list')}
              className="px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
              <ArrowRight size={16} />
            </button>
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
                  onSelectAll={handleSelectAll}
                  onDeselectAll={() => setSelected(new Set())}
                  t={t}
                  mutualDids={mutualDids}
                  protectMutuals={protectMutuals}
                  onProtectMutualsChange={handleProtectMutualsChange}
                  followingDids={followingDids}
                  protectFollowings={protectFollowings}
                  onProtectFollowingsChange={handleProtectFollowingsChange}
                  actionedDids={actionedDids}
                  hideActioned={hideActioned}
                  onHideActionedChange={setHideActioned} />
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setStep(prefilled ? 'suboptions' : 'ready')}
                    className="px-3 py-2.5 rounded-xl text-sm flex items-center justify-center"
                    style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
                    <ArrowLeft size={16} />
                  </button>
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
                {streamProgress.done > 0 && streamProgress.done < streamProgress.total && (
                  <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                    {t.streamingEta.replace('{secs}', String(Math.ceil((streamProgress.total - streamProgress.done) * (Date.now() - streamProgress.startedAt) / streamProgress.done / 1000)))}
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
            {result.addedToList !== undefined && result.addedToList > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>{t.addToListResult}</span>
                <span className="font-semibold" style={{ color: 'var(--success)' }}>{result.addedToList}</span>
              </div>
            )}
            {processError && (
              <div className="text-xs pt-2" style={{ color: 'var(--danger)' }}>
                {processError}
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
