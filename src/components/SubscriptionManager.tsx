'use client';
import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw, Settings, List } from 'lucide-react';
import type { Subscription } from '@/types';
import type { Translations } from '@/i18n/en';

interface Props {
  t: Translations;
  onNeedLogin?: () => void;
}

export default function SubscriptionManager({ t, onNeedLogin }: Props) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [syncStatus, setSyncStatus] = useState<{ intervalMinutes: number; nextRunAt: string | null; lastRunAt: string | null } | null>(null);
  const [patchingSubId, setPatchingSubId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [listNames, setListNames] = useState<Record<string, string>>({});

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
        const subs: Subscription[] = data.subscriptions || [];
        setSubscriptions(subs);
        const uris = subs.flatMap((s) => {
          const cfg = s.config as Record<string, unknown> | null;
          return [cfg?.add_to_list_uri, cfg?.exclude_list_uri, cfg?.list_uri].filter((u): u is string => typeof u === 'string');
        });
        if (uris.length > 0) loadListNames();
      }
    } catch { /* ignore */ }
  };

  const loadListNames = async () => {
    try {
      const res = await fetch('/api/bluesky/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        for (const list of (data.lists ?? [])) map[list.uri] = list.name;
        setListNames(map);
      }
    } catch { /* ignore */ }
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

  const handleToggleProtect = async (subId: string, flag: 'protect_mutuals' | 'protect_followings', currentValue: boolean) => {
    setPatchingSubId(subId);
    try {
      const res = await fetch(`/api/subscriptions/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { [flag]: !currentValue } }),
      });
      if (res.status === 401) { setLoggedIn(false); return; }
      if (res.ok) {
        setSubscriptions((prev) => prev.map((s) =>
          s.id === subId
            ? { ...s, config: { ...(s.config as Record<string, unknown> ?? {}), [flag]: !currentValue } }
            : s
        ));
      }
    } catch { /* ignore */ }
    finally { setPatchingSubId(null); }
  };

  const handlePatchAddToList = async (subId: string, listUri: string | null) => {
    setPatchingSubId(subId);
    try {
      const res = await fetch(`/api/subscriptions/${subId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { add_to_list_uri: listUri } }),
      });
      if (res.status === 401) { setLoggedIn(false); return; }
      if (res.ok) {
        setSubscriptions((prev) => prev.map((s) =>
          s.id === subId
            ? { ...s, config: { ...(s.config as Record<string, unknown> ?? {}), add_to_list_uri: listUri } }
            : s
        ));
      }
    } catch { /* ignore */ }
    finally { setPatchingSubId(null); }
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
                  <p className="mt-1 opacity-60 break-all">{sub.paused_reason}</p>
                </div>
              </div>
            )}
            <div className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium font-mono truncate flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                  @{sub.target_handle}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {subTypeBadge(sub.sub_type ?? 'follower')}
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
                    {sub.mode}
                  </span>
                  {/* Follower-mode badge — single badge showing one of 3 modes */}
                  {(() => {
                    if (!sub.include_followers) {
                      return (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'var(--bg-border)', color: 'var(--text-secondary)' }}>
                          {t.withoutFollowers}
                        </span>
                      );
                    }
                    const cfg = sub.config as Record<string, unknown> | null;
                    if ((cfg?.followers_only) === false) {
                      // explicit false = withMain
                      return (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: 'rgba(0,133,255,0.1)', color: 'var(--accent)' }}>
                          {t.includeFollowers}
                        </span>
                      );
                    }
                    // undefined or true = followersOnly (default)
                    return (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                        {t.followersOnlyBadge}
                      </span>
                    );
                  })()}
                  {!!(sub.config as Record<string, unknown>)?.exclude_list_uri && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981' }}
                      title={String((sub.config as Record<string, unknown>).exclude_list_uri)}>
                      +{t.listExcludeLabel}{(() => {
                        const uri = String((sub.config as Record<string, unknown>).exclude_list_uri);
                        const name = listNames[uri];
                        return name ? `: ${name}` : '';
                      })()}
                    </span>
                  )}
                </div>
                {sub.sub_type === 'list' && !!(sub.config as Record<string, unknown>)?.list_uri && (
                  <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <List size={10} style={{ flexShrink: 0 }} />
                    <span className="truncate" title={String((sub.config as Record<string, unknown>).list_uri)}>
                      {(() => {
                        const uri = String((sub.config as Record<string, unknown>).list_uri);
                        return listNames[uri] ?? uri.replace(/^at:\/\/.*\/app\.bsky\.graph\.list\//, '').slice(0, 30);
                      })()}
                    </span>
                  </div>
                )}
                {sub.sub_type !== 'list' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    {(() => {
                      const cfg = sub.config as Record<string, unknown> | null;
                      const hasMutuals = !!cfg?.protect_mutuals;
                      const hasFollowings = !!cfg?.protect_followings;
                      const isPatching = patchingSubId === sub.id;
                      return <>
                        <button
                          onClick={() => handleToggleProtect(sub.id, 'protect_mutuals', hasMutuals)}
                          disabled={isPatching}
                          className="px-1.5 py-0.5 rounded text-xs transition-all disabled:opacity-50 cursor-pointer"
                          style={hasMutuals
                            ? { backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
                            : { backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}>
                          {t.subProtectMutuals} {hasMutuals ? '✓' : '–'}
                        </button>
                        <button
                          onClick={() => handleToggleProtect(sub.id, 'protect_followings', hasFollowings)}
                          disabled={isPatching}
                          className="px-1.5 py-0.5 rounded text-xs transition-all disabled:opacity-50 cursor-pointer"
                          style={hasFollowings
                            ? { backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }
                            : { backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}>
                          {t.subProtectFollowings} {hasFollowings ? '✓' : '–'}
                        </button>
                      </>;
                    })()}
                  </div>
                )}
                {!!(sub.config as Record<string, unknown>)?.add_to_list_uri && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      onClick={() => handlePatchAddToList(sub.id, null)}
                      disabled={patchingSubId === sub.id}
                      className="px-1.5 py-0.5 rounded text-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                      style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.3)' }}>
                      <List size={10} />
                      {(() => {
                        const uri = String(sub.config?.add_to_list_uri ?? '');
                        return listNames[uri] ?? uri.replace(/^at:\/\/.*\/app\.bsky\.graph\.list\//, '').slice(0, 20);
                      })()}
                    </button>
                  </div>
                )}
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
