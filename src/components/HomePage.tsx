'use client';
import { ShieldX, VolumeX, Bell, ShieldCheck, KeyRound, RefreshCcw, MessageSquareX, BarChart2, Coffee, FlaskConical, type LucideIcon } from 'lucide-react';
import type { Translations } from '@/i18n/en';

interface Props {
  t: Translations;
  onNavigate: (tab: 'block' | 'mute' | 'subscriptions' | 'reblock' | 'postblock' | 'stats') => void;
}

export default function HomePage({ t, onNavigate }: Props) {
  const features = [
    { Icon: ShieldX,        title: t.homeFeature1Title, desc: t.homeFeature1Desc, tab: 'block'         as const, color: 'var(--accent)'   },
    { Icon: VolumeX,        title: t.homeFeature2Title, desc: t.homeFeature2Desc, tab: 'mute'          as const, color: '#a78bfa'          },
    { Icon: Bell,           title: t.homeFeature3Title, desc: t.homeFeature3Desc, tab: 'subscriptions' as const, color: 'var(--success)'   },
    { Icon: RefreshCcw,     title: t.homeFeature4Title, desc: t.homeFeature4Desc, tab: 'reblock'       as const, color: '#f97316'          },
    { Icon: MessageSquareX, title: t.homeFeature5Title, desc: t.homeFeature5Desc, tab: 'postblock'     as const, color: '#ec4899'          },
    { Icon: BarChart2,      title: t.homeFeature6Title, desc: t.homeFeature6Desc, tab: 'stats'         as const, color: '#14b8a6'          },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Beta notice */}
      <div className="rounded-xl px-4 py-3 flex gap-3 items-start text-xs"
        style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 10%, var(--bg-card))', border: '1px solid color-mix(in srgb, #f59e0b 30%, transparent)', color: 'var(--text-secondary)' }}>
        <FlaskConical size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
        <span><span className="font-semibold" style={{ color: '#f59e0b' }}>{t.betaNoticeLabel}:</span> {t.betaNoticeText}</span>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {features.map(({ Icon, title, desc, tab, color }) => (
          <button
            key={tab}
            onClick={() => onNavigate(tab)}
            className="p-5 rounded-2xl text-left flex flex-col gap-3 transition-all group"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
              style={{ backgroundColor: 'var(--bg-dark)', color }}>
              <Icon size={19} strokeWidth={1.75} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</div>
              <div className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Info cards */}
      <div className="flex flex-col gap-3">
        {/* Privacy by Design - two-panel */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--bg-border)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--bg-border)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--success)' }}>
              <ShieldCheck size={16} strokeWidth={1.75} />
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.homePrivacyHeading}</span>
          </div>
          {/* Two panels */}
          <div className="grid grid-cols-1 sm:grid-cols-2" style={{ backgroundColor: 'var(--bg-card)' }}>
            {/* Stateless panel */}
            <div className="p-5 flex flex-col gap-2.5" style={{ borderRight: '1px solid var(--bg-border)', borderBottom: '1px solid var(--bg-border)' }}>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)', color: 'var(--success)' }}>
                  ✓ {t.homePrivacyStatelessBadge}
                </span>
              </div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t.homePrivacyStatelessHeading}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t.homePrivacyStatelessText}</div>
            </div>
            {/* Registered panel */}
            <div className="p-5 flex flex-col gap-2.5" style={{ borderBottom: '1px solid var(--bg-border)' }}>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
                  style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
                  {t.homePrivacyRegisteredBadge}
                </span>
              </div>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{t.homePrivacyRegisteredHeading}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{t.homePrivacyRegisteredText}</div>
            </div>
          </div>
        </div>

        <InfoCard
          Icon={KeyRound}
          title={t.homeAppPassHeading}
          color="var(--accent)"
        >
          <span>{t.homeAppPassText}</span>
          <div className="mt-2 px-3 py-2 rounded-lg text-xs font-mono"
            style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-secondary)', border: '1px solid var(--bg-border)' }}>
            {t.homeAppPassLink}
          </div>
        </InfoCard>
      </div>
    </div>
  );
}

function InfoCard({ Icon, title, color, children }: {
  Icon: LucideIcon;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl p-5 flex gap-4"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: 'var(--bg-dark)', color }}>
        <Icon size={17} strokeWidth={1.75} />
      </div>
      <div className="flex flex-col gap-1.5 min-w-0">
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</div>
        <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{children}</div>
      </div>
    </div>
  );
}
