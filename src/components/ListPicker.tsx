'use client';
import { useState, useEffect } from 'react';
import { List, Link, RefreshCw, AlertTriangle } from 'lucide-react';
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
}

type Tab = 'curate' | 'moderation' | 'url';

const CURATE_PURPOSE = 'app.bsky.graph.defs#curatelist';
const MOD_PURPOSE = 'app.bsky.graph.defs#modlist';

export default function ListPicker({ t, credentials, selectedUri, onSelect }: Props) {
  const [tab, setTab] = useState<Tab>('curate');
  const [lists, setLists] = useState<BlueskyList[]>([]);
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
      const body = credentials
        ? { handle: credentials.handle, password: credentials.password, stateless: true }
        : {};
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

  const filtered = lists.filter((l) =>
    tab === 'curate' ? l.purpose === CURATE_PURPOSE : l.purpose === MOD_PURPOSE
  );

  return (
    <div className="rounded-xl overflow-hidden" style={card}>
      {/* Tabs */}
      <div className="flex gap-1 p-2" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <button style={tabStyle(tab === 'curate')} onClick={() => setTab('curate')}>
          {t.listPickerMyLists}
        </button>
        <button style={tabStyle(tab === 'moderation')} onClick={() => setTab('moderation')}>
          {t.listPickerModLists}
        </button>
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
          {!loading && !error && filtered.length === 0 && (
            <div className="p-4 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              {t.listPickerEmpty}
            </div>
          )}
          {!loading && !error && filtered.map((list) => {
            const isSelected = selectedUri === list.uri;
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
                  : <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-muted)' }}>
                      <List size={14} style={{ color: 'var(--accent)' }} />
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
