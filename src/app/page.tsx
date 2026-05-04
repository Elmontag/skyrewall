'use client';
import { useState } from 'react';
import type { Language } from '@/types';
import en from '@/i18n/en';
import de from '@/i18n/de';
import BlockMuteTool from '@/components/BlockMuteTool';
import SubscriptionManager from '@/components/SubscriptionManager';
import ThemeToggle from '@/components/ThemeToggle';
import LanguageSwitcher from '@/components/LanguageSwitcher';

type Tab = 'tool' | 'subscriptions';

export default function Home() {
  const [lang, setLang] = useState<Language>('en');
  const [tab, setTab] = useState<Tab>('tool');
  const t = lang === 'en' ? en : de;

  const toggleLang = () => setLang(lang === 'en' ? 'de' : 'en');

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-dark)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 px-6 py-3 flex items-center justify-between"
        style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--bg-border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
            {t.appName}
          </span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(0,255,136,0.1)', color: 'var(--accent)' }}>
            v0.1
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher lang={lang} onToggle={toggleLang} />
        </div>
      </header>

      {/* Nav tabs */}
      <nav
        className="px-6 flex gap-0"
        style={{ borderBottom: '1px solid var(--bg-border)' }}
      >
        {([
          { id: 'tool', label: t.mainTool },
          { id: 'subscriptions', label: t.subscriptions },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="px-4 py-3 text-sm font-medium transition-colors"
            style={{
              color: tab === id ? 'var(--accent)' : 'var(--text-secondary)',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
        {tab === 'tool' && <BlockMuteTool t={t} />}
        {tab === 'subscriptions' && <SubscriptionManager t={t} />}
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs" style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--bg-border)' }}>
        SkyRewall — open source BlueSky moderation tool
      </footer>
    </div>
  );
}
