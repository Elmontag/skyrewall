'use client';
import { useEffect, useState } from 'react';
import { BarChart2, RefreshCw, Lock } from 'lucide-react';
import type { Translations } from '@/i18n/en';

interface DailyEntry {
  date: string;
  block: number;
  mute: number;
}

interface StatsData {
  total: number;
  totalBlock: number;
  totalMute: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  bySource: {
    manual: number;
    subscription: number;
    reblock: number;
    interaction: number;
  };
  daily: DailyEntry[];
}

interface Props {
  t: Translations;
}

export default function StatsPanel({ t }: Props) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/api/stats');
      if (r.status === 401) { setLoggedIn(false); return; }
      if (r.ok) { setLoggedIn(true); setData(await r.json()); }
    } catch { /* ignore */ } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const card = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={22} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl p-8 flex flex-col items-center gap-4 text-center" style={card}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
          <Lock size={26} strokeWidth={1.5} />
        </div>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.statsLoginRequired}</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t.statsLoginRequiredDesc}</p>
      </div>
    );
  }

  if (!data) return null;

  const maxDaily = Math.max(...data.daily.map((d) => d.block + d.mute), 1);

  const kpiCards = [
    { label: t.statsTotal, value: data.total, sub: `${data.totalBlock} ${t.statsBlocks} · ${data.totalMute} ${t.statsMutes}` },
    { label: t.statsMonth, value: data.monthCount },
    { label: t.statsWeek, value: data.weekCount },
    { label: t.statsToday, value: data.todayCount },
  ];

  const sourceRows: { key: keyof typeof data.bySource; label: string }[] = [
    { key: 'manual', label: t.statsManual },
    { key: 'subscription', label: t.statsSubscription },
    { key: 'reblock', label: t.statsReblock },
    { key: 'interaction', label: t.statsInteraction },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
            <BarChart2 size={20} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.statsTitle}</h2>
          </div>
        </div>
        <button onClick={load} disabled={refreshing}
          className="p-2 rounded-xl transition-colors disabled:opacity-50"
          style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpiCards.map(({ label, value, sub }) => (
          <div key={label} className="rounded-2xl p-4 flex flex-col gap-1" style={card}>
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value.toLocaleString()}</span>
            {sub && <span className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{sub}</span>}
          </div>
        ))}
      </div>

      {/* Source breakdown */}
      <div className="rounded-2xl p-5 flex flex-col gap-3" style={card}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.statsBySource}</h3>
        <div className="flex flex-col gap-2">
          {sourceRows.map(({ key, label }) => {
            const count = data.bySource[key];
            const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
            return (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ color: 'var(--text-primary)' }}>{count.toLocaleString()} <span style={{ color: 'var(--text-secondary)' }}>({pct}%)</span></span>
                </div>
                <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-dark)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 30-day bar chart */}
      <div className="rounded-2xl p-5 flex flex-col gap-4" style={card}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.statsLast30Days}</h3>
        {data.daily.length === 0
          ? <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>{t.statsNoData}</p>
          : (
            <div className="flex items-end gap-0.5" style={{ height: 80 }}>
              {data.daily.map((day) => {
                const total = day.block + day.mute;
                const heightPct = Math.round((total / maxDaily) * 100);
                const blockPct = total > 0 ? Math.round((day.block / total) * 100) : 0;
                return (
                  <div key={day.date} className="flex-1 flex flex-col justify-end group relative" title={`${day.date}: ${day.block} blocks, ${day.mute} mutes`} style={{ height: '100%' }}>
                    <div style={{ height: `${heightPct}%`, minHeight: total > 0 ? 2 : 0 }} className="w-full rounded-sm overflow-hidden flex flex-col-reverse">
                      <div style={{ height: `${blockPct}%`, backgroundColor: 'var(--accent)', opacity: 0.85 }} />
                      <div style={{ height: `${100 - blockPct}%`, backgroundColor: '#a78bfa', opacity: 0.7 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--accent)' }} /> {t.statsBlocks}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#a78bfa' }} /> {t.statsMutes}
          </span>
        </div>
      </div>
    </div>
  );
}
