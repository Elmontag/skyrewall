'use client';
import { useState, useEffect } from 'react';
import { List, Link, RefreshCw, AlertTriangle, Shield } from 'lucide-react';
import type { BlueskyList } from '@/types';
import type { Translations } from '@/i18n/en';

interface Credentials {
  handle: string;
  password: string;
}

interface Props {
  t: Translations;
  /** If provided, used for stateless list fetch. Omit when session is active. */
  credentials?: Credentials;
  /** Currently selected list URI */
  selectedUri?: string;
  onSelect: (uri: string) => void;
  /** When true, shows a separate tab for self-created moderation lists (add-to-list contexts). Default: false. */
  showModLists?: boolean;
  /** When true, shows a tab for subscribed (foreign) moderation lists (exclude contexts). Default: false. */
  showSubscribedModLists?: boolean;
}

type Tab = 'curate' | 'modlist' | 'subscribed' | 'url';

const CURATE_PURPOSE = 'app.bsky.graph.defs#curatelist';
const MODLIST_PURPOSE = 'app.bsky.graph.defs#modlist';

export default function ListPicker({ t, credentials, selectedUri, onSelect, showModLists = false, showSubscribedModLists = false }: Props) {
  const [tab, setTab] = useState<Tab>('curate');
  const [lists, setLists] = useState<BlueskyList[]>([]);
  const [subscribedLists, setSubscribedLists] = useState<BlueskyList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState(selectedUri?.startsWith('at://') ? selectedUri : '');
  const [urlError, setUrlError] = useState('');

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };
  const input = { backgroundColor: 'var(--bg-dark)', border: '1px solid var(--bg-border)', color: 'var(--text-primary)' };

  useEffect(() => {
    if (tab === 'url') return;
    fetchLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fetchLists = async () => {
    setLoading(true);
    setError('');
    try {
      const base = credentials
        ? { handle: credentials.handle, password: credentials.password, stateless: true }
        : {};
      const body = showSubscribedModLists ? { ...base, include_subscribed: true } : base;
      const res = await fetch('/api/bluesky/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(t.errorGeneral);
        return;
      }
      const data = await res.json();
      setLists(data.lists ?? []);
      setSubscribedLists(data.subscribedModLists ?? []);
    } catch {
      setError(t.errorNetwork);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlConfirm = () => {
    const uri = urlInput.trim();
    if (!uri.startsWith('at://')) {
      setUrlError(t.listPickerUrlInvalid);
      return;
    }
    setUrlError('');
    onSelect(uri);
  };

  const tabStyle = (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '0.82rem',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
  });

  const filteredCurate = lists.filter((l) => l.purpose === CURATE_PURPOSE);
  const filteredModList = lists.filter((l) => l.purpose === MODLIST_PURPOSE);

  const activeList =
    tab === 'modlist' ? filteredModList :
    tab === 'subscribed' ? subscribedLists :
    filteredCurate;

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      {/* Tabs */}
      <div className="flex gap-1 p-2 flex-wrap" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <button style={tabStyle(tab === 'curate')} onClick={() => setTab('curate')}>
          {t.listPickerMyLists}
        </button>
        {showModLists && (
          <button style={tabStyle(tab === 'modlist')} onClick={() => setTab('modlist')}>
            <Shield size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {t.listPickerModLists}
          </button>
        )}
        {showSubscribedModLists && (
          <button style={tabStyle(tab === 'subscribed')} onClick={() => setTab('subscribed')}>
            <Shield size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {t.listPickerSubscribed}
          </button>
        )}
        <button style={tabStyle(tab === 'url')} onClick={() => setTab('url')}>
          <Link size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
          {t.listPickerEnterUrl}
        </button>
      </div>

      {/* URL input tab */}
      {tab === 'url' && (
        <div className="p-3 flex flex-col gap-2">
          <input
            type="text"
            className="rounded-lg px-3 py-2 text-sm w-full"
            style={input}
            placeholder={t.listPickerUrlPlaceholder}
            value={urlInput}
            onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlConfirm()}
          />
          {urlError && (
            <span className="text-xs flex items-center gap-1" style={{ color: 'var(--accent-danger)' }}>
              <AlertTriangle size={12} />{urlError}
            </span>
          )}
          <button
            onClick={handleUrlConfirm}
            className="rounded-lg px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            {t.listPickerTitle}
          </button>
        </div>
      )}

      {/* List tabs */}
      {tab !== 'url' && (
        <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw size={18} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
              <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{t.listPickerLoading}</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2 p-4 text-sm" style={{ color: 'var(--accent-danger)' }}>
              <AlertTriangle size={14} />{error}
            </div>
          )}
          {!loading && !error && activeList.length === 0 && (
            <div className="p-4 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              {t.listPickerEmpty}
            </div>
          )}
          {!loading && !error && activeList.map((list) => {
            const isSelected = selectedUri === list.uri;
            const isModList = list.purpose === MODLIST_PURPOSE;
            return (
              <button
                key={list.uri}
                onClick={() => onSelect(list.uri)}
                className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors"
                style={{
                  background: isSelected ? 'var(--accent-muted)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--bg-border)',
                }}
              >
                {list.avatar
                  ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={list.avatar} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                  )
                  : <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: isModList ? 'rgba(139,92,246,0.15)' : 'var(--accent-muted)' }}>
                      {isModList
                        ? <Shield size={14} style={{ color: '#8b5cf6' }} />
                        : <List size={14} style={{ color: 'var(--accent)' }} />
                      }
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {list.name}
                  </div>
                  {list.description && (
                    <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {list.description}
                    </div>
                  )}
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  {list.itemCount} {t.listPickerMembers}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
