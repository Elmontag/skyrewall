'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Plus, RefreshCw, Settings, List, ChevronDown, ChevronUp } from 'lucide-react';
import type { Subscription, Mode } from '@/types';
import type { Translations } from '@/i18n/en';
import ListPicker from './ListPicker';

interface Props {
  t: Translations;
  onNeedLogin?: () => void;
}

export default function SubscriptionManager({ t, onNeedLogin }: Props) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ intervalMinutes: number; nextRunAt: string | null; lastRunAt: string | null } | null>(null);
  const [newTarget, setNewTarget] = useState('');
  const [newMode, setNewMode] = useState<Mode>('block');
  const [newIncludeFollowers, setNewIncludeFollowers] = useState(true);
  const [newSubType, setNewSubType] = useState<'follower' | 'reblock' | 'postinteraction' | 'list'>('follower');
  const [newListUri, setNewListUri] = useState('');
  const [newExcludeListUri, setNewExcludeListUri] = useState('');
  const [showNewExclude, setShowNewExclude] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/login', { method: 'GET' })
      .then((r) => {
        if (r.ok) { setLoggedIn(true); loadSubscriptions(); loadSyncStatus(); }
        else setLoggedIn(false);
      })
      .catch(() => setLoggedIn(false));
  }, []);

  const loadSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync/status');
      if (res.ok) setSyncStatus(await res.json());
    } catch { /* ignore */ }
  };

  const loadSubscriptions = async () => {
    try {
      const res = await fetch('/api/subscriptions');
      if (res.status === 401) { setLoggedIn(false); return; }
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions || []);
      }
    } catch { /* ignore */ }
  };

  const handleAddSubscription = async () => {
    if (newSubType === 'list' && !newListUri.trim().startsWith('at://')) {
      setError(t.listPickerUrlInvalid);
      return;
    }
    if (newSubType !== 'list' && !newTarget.trim()) return;
    try {
      const config: Record<string, string> = {};
      if (newSubType === 'list') config.list_uri = newListUri;
      if (newExcludeListUri.trim().startsWith('at://')) config.exclude_list_uri = newExcludeListUri;

      const body = newSubType === 'list'
        ? { target_handle: newListUri, mode: newMode, sub_type: 'list', include_followers: false, config }
        : { target_handle: newTarget, mode: newMode, include_followers: newIncludeFollowers, sub_type: newSubType, config };

      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { setLoggedIn(false); return; }
      if (res.ok) {
        setNewTarget('');
        setNewListUri('');
        setNewExcludeListUri('');
        setShowNewExclude(false);
        await loadSubscriptions();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t.errorGeneral);
      }
    } catch {
      setError(t.errorGeneral);
    }
  };

  const handleDeleteSubscription = async (id: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      if (res.status === 401) { setLoggedIn(false); return; }
      await loadSubscriptions();
    } catch {
      setError(t.errorGeneral);
    }
  };

  const handleRetrySubscription = async (id: string) => {
    try {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused_reason: null }),
      });
      if (res.status === 401) { setLoggedIn(false); return; }
      await loadSubscriptions();
    } catch {
      setError(t.errorGeneral);
    }
  };

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const input = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  if (loggedIn === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="rounded-2xl p-6 flex flex-col items-center gap-4 text-center" style={card}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
          <Settings size={22} strokeWidth={1.5} />
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.needLoginDesc}</p>
        {onNeedLogin && (
          <button onClick={onNeedLogin}
            className="px-5 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
            {t.goToSettings}
          </button>
        )}
      </div>
    );
  }

  const subTypeBadge = (sub_type: string) => {
    const styles: Record<string, React.CSSProperties> = {
      follower:        { backgroundColor: 'rgba(0,133,255,0.1)',  color: '#0085ff' },
      reblock:         { backgroundColor: 'rgba(139,92,246,0.1)', color: '#8b5cf6' },
      postinteraction: { backgroundColor: 'rgba(249,115,22,0.1)', color: '#f97316' },
      list:            { backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' },
    };
    const labels: Record<string, string> = {
      follower: 'follower', reblock: 'reblock', postinteraction: 'post', list: 'list',
    };
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={styles[sub_type] ?? styles.follower}>
        {labels[sub_type] ?? sub_type}
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-5 max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.subscribeTitle}</h2>
        {syncStatus?.nextRunAt && (
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
            {t.nextRunAt}: <span style={{ color: 'var(--text-primary)' }}>{new Date(syncStatus.nextRunAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</span>
          </span>
        )}
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

        {/* Sub type selector */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.listSource}</label>
          <select value={newSubType} onChange={(e) => setNewSubType(e.target.value as typeof newSubType)}
            className="w-full px-3.5 py-2.5 rounded-xl text-sm font-medium focus-ring"
            style={input}>
            <option value="follower">{t.listSourceFollowers}</option>
            <option value="list">{t.listSourceList}</option>
            <option value="reblock">Reblock</option>
            <option value="postinteraction">Post Interaction</option>
          </select>
        </div>

        {/* Target: handle (non-list types) */}
        {newSubType !== 'list' && (
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
        )}

        {/* Include followers (follower type only) */}
        {newSubType === 'follower' && (
          <label className="flex items-center gap-3 cursor-pointer text-sm" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-4 h-4 rounded border-2 flex items-center justify-center transition-all"
              style={{ borderColor: newIncludeFollowers ? 'var(--accent)' : 'var(--bg-border)', backgroundColor: newIncludeFollowers ? 'var(--accent)' : 'transparent' }}
              onClick={() => setNewIncludeFollowers(!newIncludeFollowers)}>
              {newIncludeFollowers && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </div>
            <input type="checkbox" checked={newIncludeFollowers} onChange={(e) => setNewIncludeFollowers(e.target.checked)} className="sr-only" />
            {t.includeFollowers}
          </label>
        )}

        {/* Target: list picker (list type) */}
        {newSubType === 'list' && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.listPickerTitle}</label>
              <ListPicker t={t} selectedUri={newListUri} onSelect={setNewListUri} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{t.blockTool} / {t.muteTool}</label>
              <select value={newMode} onChange={(e) => setNewMode(e.target.value as Mode)}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-medium focus-ring"
                style={input}>
                <option value="block">{t.blockTool}</option>
                <option value="mute">{t.muteTool}</option>
              </select>
            </div>
          </>
        )}

        {/* Exclusion list (all types) */}
        <div>
          <button type="button" onClick={() => setShowNewExclude((v) => !v)}
            className="flex items-center gap-2 text-xs font-medium transition-colors"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: showNewExclude ? 'var(--accent)' : 'var(--text-secondary)', padding: 0 }}>
            {showNewExclude ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {t.listExcludeToggle}
          </button>
          {showNewExclude && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{t.listExcludeHint}</p>
              <ListPicker t={t} selectedUri={newExcludeListUri} onSelect={setNewExcludeListUri} />
            </div>
          )}
        </div>

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
          <div key={sub.id} className="rounded-2xl overflow-hidden transition-all"
            style={{ ...card, border: sub.paused_reason ? '1px solid rgba(245,158,11,0.4)' : card.border }}>
            {sub.paused_reason && (
              <div className="px-4 py-2.5 flex items-start gap-2 text-xs"
                style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderBottom: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" strokeWidth={2} />
                <div className="min-w-0">
                  <span className="font-semibold">{t.subscriptionPausedTitle}. </span>
                  <span>{t.subscriptionPausedHint}</span>
                </div>
              </div>
            )}
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium font-mono truncate flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  {sub.sub_type === 'list'
                    ? <><List size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                        <span className="truncate text-xs" title={String(sub.config?.list_uri ?? sub.target_handle)}>
                          {String(sub.config?.list_uri ?? sub.target_handle).replace(/^at:\/\//, '').slice(0, 40)}…
                        </span>
                      </>
                    : `@${sub.target_handle}`
                  }
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {subTypeBadge(sub.sub_type ?? 'follower')}
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
                    {sub.mode}
                  </span>
                  {sub.sub_type !== 'list' && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {sub.include_followers ? t.includeFollowers : t.withoutFollowers}
                    </span>
                  )}
                  {!!(sub.config as Record<string, unknown>)?.exclude_list_uri && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                      +{t.listExcludeLabel}
                    </span>
                  )}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {t.lastUpdated}: {sub.last_updated
                    ? new Date(sub.last_updated).toLocaleString(undefined, {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                        timeZoneName: 'short',
                      })
                    : t.never}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sub.paused_reason && (
                  <button onClick={() => handleRetrySubscription(sub.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                    title={t.subscriptionPausedRetry}>
                    <RefreshCw size={12} strokeWidth={2} />
                  </button>
                )}
                <button onClick={() => handleDeleteSubscription(sub.id)}
                  className="p-2 rounded-lg flex-shrink-0 transition-colors"
                  style={{ color: 'var(--danger)', backgroundColor: 'var(--danger-muted)' }}
                  title={t.deleteSubscription}>
                  <Trash2 size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
