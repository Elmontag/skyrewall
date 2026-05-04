'use client';
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

export default function FollowerList({
  followers,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  t,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {selected.size} / {followers.length} {t.selected}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="px-3 py-1 text-xs border rounded hover:border-accent transition-colors"
            style={{ borderColor: 'var(--bg-border)', color: 'var(--accent)' }}
          >
            {t.selectAll}
          </button>
          <button
            onClick={onDeselectAll}
            className="px-3 py-1 text-xs border rounded transition-colors"
            style={{ borderColor: 'var(--bg-border)', color: 'var(--text-secondary)' }}
          >
            {t.deselectAll}
          </button>
        </div>
      </div>

      <div
        className="overflow-y-auto max-h-64 flex flex-col gap-1 pr-1"
        style={{ scrollbarGutter: 'stable' }}
      >
        {followers.map((follower) => {
          const isSelected = selected.has(follower.did);
          return (
            <label
              key={follower.did}
              className="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors"
              style={{
                backgroundColor: isSelected ? 'rgba(0,255,136,0.05)' : 'transparent',
                borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(follower.did)}
                className="sr-only"
              />
              <div
                className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                style={{
                  borderColor: isSelected ? 'var(--accent)' : 'var(--bg-border)',
                  backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                }}
              >
                {isSelected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              {follower.avatar && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={follower.avatar}
                  alt=""
                  className="w-7 h-7 rounded-full flex-shrink-0"
                />
              )}
              {!follower.avatar && (
                <div
                  className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs"
                  style={{ backgroundColor: 'var(--bg-border)', color: 'var(--accent)' }}
                >
                  {(follower.displayName || follower.handle)[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {follower.displayName || follower.handle}
                </div>
                <div className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                  @{follower.handle}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
