'use client';
import { useState } from 'react';
import { Check, Search, Shield, Lock, UserCheck } from 'lucide-react';
import type { Follower } from '@/types';
import type { Translations } from '@/i18n/en';

interface Props {
  followers: Follower[];
  selected: Set<string>;
  onToggle: (did: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  t: Translations;
  mutualDids?: Set<string>;
  protectMutuals?: boolean;
  onProtectMutualsChange?: (v: boolean) => void;
  followingDids?: Set<string>;
  protectFollowings?: boolean;
  onProtectFollowingsChange?: (v: boolean) => void;
  actionedDids?: { blocked: Set<string>; muted: Set<string> };
  hideActioned?: boolean;
  onHideActionedChange?: (v: boolean) => void;
}

export default function FollowerList({
  followers,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  t,
  mutualDids,
  protectMutuals = true,
  onProtectMutualsChange,
  followingDids,
  protectFollowings = true,
  onProtectFollowingsChange,
  actionedDids,
  hideActioned = false,
  onHideActionedChange,
}: Props) {
  const [search, setSearch] = useState('');

  const hasActioned = actionedDids && (actionedDids.blocked.size > 0 || actionedDids.muted.size > 0);
  const hasMutuals = mutualDids && mutualDids.size > 0;
  const hasFollowings = followingDids && followingDids.size > 0;

  const isActioned = (did: string) =>
    (actionedDids?.blocked.has(did) ?? false) || (actionedDids?.muted.has(did) ?? false);

  const filtered = followers.filter((f) => {
    if (hideActioned && isActioned(f.did)) return false;
    if (!search.trim()) return true;
    return (
      f.handle.toLowerCase().includes(search.toLowerCase()) ||
      (f.displayName ?? '').toLowerCase().includes(search.toLowerCase())
    );
  });

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {selected.size} / {followers.length} {t.selected}
          </span>
          <div className="flex gap-2 flex-wrap">
            {hasActioned && onHideActionedChange && (
              <button
                onClick={() => onHideActionedChange(!hideActioned)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: hideActioned ? 'rgba(249,115,22,0.12)' : 'var(--bg-dark)',
                  color: hideActioned ? 'rgb(249,115,22)' : 'var(--text-secondary)',
                  border: `1px solid ${hideActioned ? 'rgba(249,115,22,0.4)' : 'var(--bg-border)'}`,
                }}
              >
                <Lock size={11} />
                {hideActioned ? t.showActioned : t.hideActioned}
              </button>
            )}
            {hasMutuals && onProtectMutualsChange && (
              <button
                onClick={() => onProtectMutualsChange(!protectMutuals)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: protectMutuals ? 'rgba(34,197,94,0.15)' : 'var(--accent-muted)',
                  color: protectMutuals ? 'rgb(34,197,94)' : 'var(--accent)',
                  border: `1px solid ${protectMutuals ? 'rgba(34,197,94,0.4)' : 'rgba(0,133,255,0.2)'}`,
                }}
              >
                <Shield size={11} />
                {t.protectMutuals}
              </button>
            )}
            {hasFollowings && onProtectFollowingsChange && (
              <button
                onClick={() => onProtectFollowingsChange(!protectFollowings)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-colors"
                style={{
                  backgroundColor: protectFollowings ? 'rgba(245,158,11,0.15)' : 'var(--accent-muted)',
                  color: protectFollowings ? 'rgb(245,158,11)' : 'var(--accent)',
                  border: `1px solid ${protectFollowings ? 'rgba(245,158,11,0.4)' : 'rgba(0,133,255,0.2)'}`,
                }}
              >
                <UserCheck size={11} />
                {t.protectFollowings}
              </button>
            )}
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
            const isMutual = mutualDids?.has(follower.did) ?? false;
            const isFollowing = followingDids?.has(follower.did) ?? false;
            const isProtected = (isMutual && protectMutuals) || (isFollowing && protectFollowings);
            const isSelected = selected.has(follower.did);
            const wasActioned = isActioned(follower.did);
            const isBlocked = actionedDids?.blocked.has(follower.did) ?? false;
            const isMuted = actionedDids?.muted.has(follower.did) ?? false;
            return (
              <label
                key={follower.did}
                className={`relative flex items-center gap-2.5 p-2.5 rounded-xl transition-all ${isProtected ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${wasActioned && !hideActioned ? 'opacity-60' : ''}`}
                style={{
                  backgroundColor: isSelected ? 'var(--accent-muted)' : isMutual ? 'rgba(34,197,94,0.08)' : isFollowing ? 'rgba(245,158,11,0.08)' : wasActioned ? 'rgba(120,120,120,0.08)' : 'var(--bg-dark)',
                  border: `1px solid ${isSelected ? 'var(--accent)' : isMutual ? 'rgba(34,197,94,0.25)' : isFollowing ? 'rgba(245,158,11,0.25)' : wasActioned ? 'rgba(120,120,120,0.2)' : 'transparent'}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => !isProtected && onToggle(follower.did)}
                  disabled={isProtected}
                  className="sr-only"
                />
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
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {follower.displayName || follower.handle}
                    </div>
                    {isMutual && <Shield size={10} style={{ color: 'rgb(34,197,94)', flexShrink: 0 }} />}
                    {!isMutual && isFollowing && <UserCheck size={10} style={{ color: 'rgb(245,158,11)', flexShrink: 0 }} />}
                    {wasActioned && <Lock size={10} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                      @{follower.handle}
                    </div>
                    {isBlocked && (
                      <span className="shrink-0 px-1 rounded" style={{ backgroundColor: 'rgba(240,71,71,0.1)', color: 'var(--danger)', fontSize: '10px' }}>
                        {t.alreadyBlocked}
                      </span>
                    )}
                    {!isBlocked && isMuted && (
                      <span className="shrink-0 px-1 rounded" style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#f97316', fontSize: '10px' }}>
                        {t.alreadyMuted}
                      </span>
                    )}
                  </div>
                </div>
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