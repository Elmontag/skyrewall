'use client';
import { useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { Follower } from '@/types';
import type { Translations } from '@/i18n/en';

interface Props {
  followers: Follower[];
  selected: Set<string>;
  onToggle: (did: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  t: Translations;
}

export default function FollowerList({ followers, selected, onToggle, onSelectAll, onDeselectAll, t }: Props) {
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? followers.filter(
        (f) =>
          f.handle.toLowerCase().includes(search.toLowerCase()) ||
          (f.displayName ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : followers;

  return (
    <div className="flex flex-col gap-3">
      {/* Search + Controls */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-secondary)' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchFollowers}
            className="w-full pl-8 pr-3 py-2 rounded-xl text-sm font-mono focus-ring transition-all"
            style={{
              backgroundColor: 'var(--bg-dark)',
              border: '1px solid var(--bg-border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {selected.size} / {followers.length} {t.selected}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="px-3 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}
            >
              {t.selectAll}
            </button>
            <button
              onClick={onDeselectAll}
              className="px-3 py-1 text-xs rounded-lg font-medium transition-colors"
              style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
            >
              {t.deselectAll}
            </button>
          </div>
        </div>
      </div>

      {/* Responsive grid */}
      <div className="overflow-y-auto max-h-[60vh] -mx-1 px-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
          {filtered.map((follower) => {
            const isSelected = selected.has(follower.did);
            return (
              <label
                key={follower.did}
                className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all"
                style={{
                  backgroundColor: isSelected ? 'var(--accent-muted)' : 'var(--bg-dark)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                }}
              >
                <input type="checkbox" checked={isSelected} onChange={() => onToggle(follower.did)} className="sr-only" />
                {/* Avatar */}
                {follower.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={follower.avatar} alt="" className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
                ) : (
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold"
                    style={{ backgroundColor: 'var(--bg-border)', color: 'var(--accent)' }}
                  >
                    {(follower.displayName || follower.handle)[0].toUpperCase()}
                  </div>
                )}
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {follower.displayName || follower.handle}
                  </div>
                  <div className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                    @{follower.handle}
                  </div>
                </div>
                {/* Checkbox indicator */}
                <div
                  className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    borderColor: isSelected ? 'var(--accent)' : 'var(--bg-border)',
                    backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                  }}
                >
                  {isSelected && <Check size={10} strokeWidth={3} color="#fff" />}
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
