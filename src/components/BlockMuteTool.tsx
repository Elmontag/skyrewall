'use client';
import { useState, useCallback, useEffect } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, VolumeX, ShieldX, Check, RefreshCw, Info, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import type { Follower, Mode } from '@/types';
import type { Translations } from '@/i18n/en';
import FollowerList from './FollowerList';
import ListPicker from './ListPicker';

interface Props {
  mode: Mode;
  t: Translations;
}

type Step = 'credentials' | 'target' | 'suboptions' | 'followers' | 'processing' | 'done';
type FollowerMode = 'withMain' | 'followersOnly' | 'noFollowers';

interface Result {
  succeeded: number;
  failed: number;
  addedToList?: number;
  listAddFailed?: number;
}



export default function BlockMuteTool({ mode, t }: Props) {
  const [step, setStep] = useState<Step>('credentials');
  const [handle, setHandle] = useState('');
  const [password, setPassword] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [targetHandle, setTargetHandle] = useState('');
  const [followerMode, setFollowerMode] = useState<FollowerMode>('followersOnly');
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [fetchProgress, setFetchProgress] = useState({ count: 0, loading: false });
  const [result, setResult] = useState<Result | null>(null);
  const [mutualDids, setMutualDids] = useState<Set<string>>(new Set());
  const [protectMutuals, setProtectMutuals] = useState(true);
  const [followingDids, setFollowingDids] = useState<Set<string>>(new Set());
  const [protectFollowings, setProtectFollowings] = useState(true);
  const [actionedDids, setActionedDids] = useState<{ blocked: Set<string>; muted: Set<string> }>({ blocked: new Set(), muted: new Set() });
  const [hideActioned, setHideActioned] = useState(false);
  const [streamProgress, setStreamProgress] = useState<{ done: number; total: number; succeeded: number; failed: number; startedAt: number } | null>(null);
  const [processError, setProcessError] = useState('');
  const [targetDid, setTargetDid] = useState('');

  const [inlineSubSaved, setInlineSubSaved] = useState(false);
  const [inlineSubSaving, setInlineSubSaving] = useState(false);

  // List source state
  const [source, setSource] = useState<'followers' | 'list'>('followers');
  const [, setListUri] = useState('');
  const [excludeListUri, setExcludeListUri] = useState('');
  const [showExclude, setShowExclude] = useState(false);
  const [addToListUri, setAddToListUri] = useState('');
  const [showAddToList, setShowAddToList] = useState(false);
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
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  const displayedSteps: Step[] = prefilled
    ? ['target', 'suboptions', 'followers']
    : ['credentials', 'target', 'followers'];
  const displayedStepLabels = prefilled
    ? [t.step2Title, t.subOptionsTitle, t.followerListTitle]
    : [t.step1Title, t.step2Title, t.followerListTitle];
  const stepIndex = displayedSteps.indexOf(step);

  // Derived values from followerMode
  const includeFollowers = followerMode !== 'noFollowers';
  const followersOnly = followerMode === 'followersOnly';

  const handleStep1 = () => {
    if (!handle.trim()) { setError(t.errorHandleRequired); return; }
    if (!password.trim()) { setError(t.errorPasswordRequired); return; }
    setError('');
    setStep('target');
  };

  const handleGoToSubOptions = () => {
    if (source === 'followers' && !targetHandle.trim()) { setError(t.errorTargetRequired); return; }
    setError('');
    if (prefilled) {
      setStep('suboptions');
      return;
    }
    void handleLoadFollowers();
  };

  const handleLoadFollowers = async () => {
    if (source === 'followers' && !targetHandle.trim()) { setError(t.errorTargetRequired); return; }
    setError('');
    setFetchProgress({ count: 0, loading: true });
    setStep('followers');

    if (source === 'followers' && !includeFollowers) {
      // noFollowers mode: still resolve the target DID so handleConfirm can action them
      const credFields = prefilled ? {} : { handle, password, stateless: true };
      try {
        const r = await fetch('/api/bluesky/followers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...credFields, targetHandle, resolveOnly: true }),
        });
        if (r.ok) {
          const data = await r.json() as { targetDid?: string };
          if (data.targetDid) setTargetDid(data.targetDid);
        }
      } catch { /* non-fatal — confirm will have empty dids */ }
      setFollowers([]);
      setSelected(new Set());
      setFetchProgress({ count: 0, loading: false });
      return;
    }

    // When prefilled (session active), omit credentials — backend reads from session cookie
    const credFields = prefilled ? {} : { handle, password, stateless: true };

    /** Reads an SSE stream and returns the fetched members + optional targetDid. */
    const readSseStream = async (res: Response): Promise<{ fetched: Follower[]; resolvedTargetDid: string } | null> => {
      if (!res.body) { setError(t.errorGeneral); setStep('target'); setFetchProgress({ count: 0, loading: false }); return null; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fetched: Follower[] = [];
      let resolvedTargetDid = '';
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
            if (event.error) { setError(event.error); setStep('target'); setFetchProgress({ count: 0, loading: false }); return null; }
            if (typeof event.count === 'number') setFetchProgress({ count: event.count, loading: true });
            if (event.complete) {
              fetched = event.followers ?? event.members ?? [];
              resolvedTargetDid = event.targetDid ?? '';
              break outer;
            }
          } catch { /* ignore parse errors */ }
        }
      }
      return { fetched, resolvedTargetDid };
    };

    try {
      const fetchEndpoint = '/api/bluesky/followers';
      const fetchBody: Record<string, unknown> = { ...credFields, targetHandle };

      const res = await fetch(fetchEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fetchBody),
      });

      const result = await readSseStream(res);
      if (!result) return;
      const { fetched, resolvedTargetDid } = result;

      setTargetDid(resolvedTargetDid);
      setFollowers(fetched);

      // Fetch exclusion list members (if set) and build a set of DIDs to auto-deselect
      let excludeSet = new Set<string>();
      if (excludeListUri.trim().startsWith('at://') && fetched.length > 0) {
        try {
          const exRes = await fetch('/api/bluesky/list-members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...credFields, list_uri: excludeListUri }),
          });
          const exResult = await readSseStream(exRes);
          if (exResult) excludeSet = new Set(exResult.fetched.map((m) => m.did));
        } catch { /* non-fatal — proceed without exclusion */ }
      }

      // Check mutuals + followings + actioned if session is active
      if (prefilled && fetched.length > 0) {
        const dids = fetched.map((f) => f.did);
        const [mRes, fRes, aRes] = await Promise.all([
          fetch('/api/bluesky/check-mutuals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dids }),
          }).catch(() => null),
          fetch('/api/bluesky/check-followings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dids }),
          }).catch(() => null),
          fetch('/api/bluesky/check-actioned', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        setSelected(new Set(fetched.filter((f) => !(protectMutuals && mSet.has(f.did)) && !(protectFollowings && fSet.has(f.did)) && !excludeSet.has(f.did)).map((f) => f.did)));
      } else {
        setSelected(new Set(fetched.filter((f) => !excludeSet.has(f.did)).map((f) => f.did)));
      }

      setFetchProgress({ count: fetched.length, loading: false });
    } catch {
      setError(t.errorNetwork);
      setStep('target');
      setFetchProgress({ count: 0, loading: false });
    }
  };

  const handleSaveInlineSub = async () => {
    setInlineSubSaving(true);
    try {
      const protectConfig = {
        ...(protectMutuals ? { protect_mutuals: true } : {}),
        ...(protectFollowings ? { protect_followings: true } : {}),
      };
      const subBody = { target_handle: targetHandle, mode, sub_type: 'follower', include_followers: includeFollowers, config: {
        ...(excludeListUri.trim().startsWith('at://') ? { exclude_list_uri: excludeListUri } : {}),
        ...protectConfig,
        ...(addToListUri.trim().startsWith('at://') ? { add_to_list_uri: addToListUri } : {}),
        followers_only: followersOnly,
      } };
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subBody),
      });
      if (res.ok) setInlineSubSaved(true);
    } catch { /* ignore */ }
    finally { setInlineSubSaving(false); }
  };

  const handleToggle = useCallback((did: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(followers.filter((f) =>
      !(protectMutuals && mutualDids.has(f.did)) &&
      !(protectFollowings && followingDids.has(f.did))
    ).map((f) => f.did)));
  }, [followers, protectMutuals, mutualDids, protectFollowings, followingDids]);

  const handleDeselectAll = useCallback(() => setSelected(new Set()), []);

  const handleProtectMutualsChange = (value: boolean) => {
    setProtectMutuals(value);
    if (!value) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const did of mutualDids) next.add(did);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const did of mutualDids) next.delete(did);
        return next;
      });
    }
  };

  const handleProtectFollowingsChange = (value: boolean) => {
    setProtectFollowings(value);
    if (!value) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const did of followingDids) next.add(did);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const did of followingDids) next.delete(did);
        return next;
      });
    }
  };

  const handleConfirm = async () => {
    setStep('processing');
    setStreamProgress(null);
    setProcessError('');
    const dids: string[] = [...selected];

    // Prepend target DID (cached from initial fetch) unless followers-only mode
    if (!followersOnly && targetDid && !dids.includes(targetDid)) dids.unshift(targetDid);

    const credFields = prefilled ? {} : { handle, password, stateless: true };

    // Always use SSE streaming — shows real progress even for small batches
    const streamEndpoint = mode === 'block' ? '/api/bluesky/block-stream' : '/api/bluesky/mute-stream';
    try {
      const res = await fetch(streamEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credFields, dids, add_to_list_uri: addToListUri.trim().startsWith('at://') ? addToListUri : undefined }),
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

  const reset = () => {
    setTargetHandle('');
    setFollowers([]); setSelected(new Set());
    setMutualDids(new Set()); setProtectMutuals(true);
    setFollowingDids(new Set()); setProtectFollowings(true);
    setActionedDids({ blocked: new Set(), muted: new Set() }); setHideActioned(false);
    setInlineSubSaved(false);
    setStreamProgress(null);
    setProcessError('');
    setTargetDid('');
    setError(''); setResult(null);
    setFetchProgress({ count: 0, loading: false });
    setSource('followers');
    setFollowerMode('followersOnly');
    setListUri('');
    setExcludeListUri('');
    setShowExclude(false);
    setAddToListUri('');
    setShowAddToList(false);
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
      {/* Auth check loading state — prevents flash of credentials form for logged-in users */}
      {!authChecked && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
        </div>
      )}

      {/* Step indicator */}
      {authChecked && step !== 'done' && step !== 'processing' && (
        <div className="flex items-center gap-0">
          {displayedStepLabels.map((label, i) => {
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
      {authChecked && error && (
        <div
          className="px-4 py-3 rounded-xl text-sm flex items-center gap-2"
          style={{ backgroundColor: 'var(--danger-muted)', border: '1px solid rgba(240,71,71,0.3)', color: 'var(--danger)' }}
        >
          <AlertTriangle size={14} strokeWidth={2} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Step 1: Credentials — only for non-logged-in users */}
      {authChecked && !prefilled && step === 'credentials' && (
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
      {authChecked && step === 'target' && (
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
              onKeyDown={(e) => e.key === 'Enter' && handleGoToSubOptions()}
            />
          </div>
          <div className="flex flex-col gap-2">
            {([
              { value: 'withMain' as FollowerMode, label: t.includeFollowers },
              { value: 'followersOnly' as FollowerMode, label: t.followersOnly },
              { value: 'noFollowers' as FollowerMode, label: t.withoutFollowers },
            ] as { value: FollowerMode; label: string }[]).map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                style={{
                  backgroundColor: followerMode === value ? 'var(--accent-muted)' : 'var(--bg-dark)',
                  border: `1px solid ${followerMode === value ? 'var(--accent)' : 'var(--bg-border)'}`,
                }}
                onClick={() => setFollowerMode(value)}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: followerMode === value ? 'var(--accent)' : 'var(--bg-border)' }}
                >
                  {followerMode === value && (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
                  )}
                </div>
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{label}</span>
              </label>
            ))}
          </div>

          {/* Exclusion list (collapsible, both sources) */}
          <div>
            <button
              type="button"
              onClick={() => setShowExclude((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showExclude ? 'var(--accent)' : 'var(--text-secondary)', padding: 0 }}
            >
              {showExclude ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {t.listExcludeToggle}
            </button>
            {showExclude && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.listExcludeHint}</p>
                <ListPicker
                  t={t}
                  credentials={prefilled ? undefined : (handle && password ? { handle, password } : undefined)}
                  selectedUri={excludeListUri}
                  onSelect={setExcludeListUri}
                  showModLists
                  showSubscribedModLists
                />
              </div>
            )}
          </div>

          {/* Add-to-list (collapsible, both sources) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAddToList((v) => !v)}
              className="flex items-center gap-2 text-xs font-medium transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: showAddToList ? 'var(--accent)' : 'var(--text-secondary)', padding: 0 }}
            >
              {showAddToList ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {t.addToListToggle}
            </button>
            {showAddToList && (
              <div className="mt-3">
                <ListPicker
                  t={t}
                  credentials={prefilled ? undefined : (handle && password ? { handle, password } : undefined)}
                  selectedUri={addToListUri}
                  onSelect={setAddToListUri}
                  showModLists
                />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {!prefilled && (
            <button
              onClick={() => setStep('credentials')}
              className="px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center"
              style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
            >
              <ArrowLeft size={16} />
            </button>
            )}
            <button
              onClick={handleGoToSubOptions}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {authChecked && step === 'suboptions' && (
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

          <div className="flex gap-3">
              <button
                onClick={() => setStep('target')}
                className="px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center"
                style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
              >
                <ArrowLeft size={16} />
              </button>
              {targetHandle.trim() && (
                inlineSubSaved
                  ? <span className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium"
                      style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: 'var(--success)' }}>
                      <CheckCircle2 size={14} /> {t.subSaved}
                    </span>
                  : <button onClick={handleSaveInlineSub} disabled={inlineSubSaving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ backgroundColor: 'rgba(249,115,22,0.08)', color: '#f97316', border: '1px solid rgba(249,115,22,0.25)' }}>
                      {inlineSubSaving ? <RefreshCw size={13} className="animate-spin" /> : <Bell size={13} />}
                      {t.saveAsSub}
                    </button>
              )}
              <button
                onClick={handleLoadFollowers}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
              >
                <ArrowRight size={16} />
              </button>
            </div>
        </div>
      )}

      {/* Step 3: Followers */}
      {authChecked && step === 'followers' && (
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
                    followingDids={followingDids}
                    protectFollowings={protectFollowings}
                    onProtectFollowingsChange={handleProtectFollowingsChange}
                    actionedDids={actionedDids}
                    hideActioned={hideActioned}
                    onHideActionedChange={setHideActioned}
                  />
              }
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStep(prefilled ? 'suboptions' : 'target')}
                  className="px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center"
                  style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
                >
                  <ArrowLeft size={16} />
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
          )}
        </div>
      )}

      {/* Processing */}
      {authChecked && step === 'processing' && (
        <div className="max-w-lg mx-auto w-full rounded-2xl p-8 flex flex-col gap-4 items-center" style={card}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            {isMute
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
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(streamProgress.done / streamProgress.total) * 100}%`, backgroundColor: 'var(--accent)' }}
                  />
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
      {authChecked && step === 'done' && result && (
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

