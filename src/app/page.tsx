'use client';
import { useState, useEffect } from 'react';
import { ShieldX, VolumeX, Bell, Shield, Sun, Moon, Globe, Home as HomeIcon, UserCircle, RefreshCcw, MessageSquareX, BarChart2, LogIn, LogOut, Coffee, RefreshCw, type LucideIcon } from 'lucide-react';
import type { Language, Mode } from '@/types';
import en from '@/i18n/en';
import de from '@/i18n/de';
import BlockMuteTool from '@/components/BlockMuteTool';
import SubscriptionManager from '@/components/SubscriptionManager';
import HomePage from '@/components/HomePage';
import AccountManager from '@/components/AccountManager';
import ReblockTool from '@/components/ReblockTool';
import PostInteractionTool from '@/components/PostInteractionTool';
import StatsPanel from '@/components/StatsPanel';

type Tab = 'home' | 'block' | 'mute' | 'subscriptions' | 'reblock' | 'postblock' | 'stats' | 'account';

interface TabMeta {
  id: Tab;
  label: string;
  description: string;
  Icon: LucideIcon;
}

export default function Home() {
  const [lang, setLang] = useState<Language>('en');
  const [tab, setTab] = useState<Tab>('home');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [oauthErrorSince, setOauthErrorSince] = useState<string | null>(null);
  const [isOAuthUser, setIsOAuthUser] = useState(false);
  const [oauthReauthLoading, setOauthReauthLoading] = useState(false);
  const t = lang === 'en' ? en : de;

  // Check auth state on mount
  useEffect(() => {
    fetch('/api/auth/login', { method: 'GET' })
      .then(async (r) => {
        setLoggedIn(r.ok);
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          setOauthErrorSince(data.user?.oauthErrorSince ?? null);
          setIsOAuthUser(data.user?.isOAuth ?? false);
        }
      })
      .catch(() => setLoggedIn(false));
  }, []);

  const handleGlobalReAuth = async () => {
    setOauthReauthLoading(true);
    try {
      const res = await fetch('/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isReauth: true }),
      });
      if (res.ok) {
        const { redirectUrl } = await res.json();
        window.location.href = redirectUrl;
      }
    } catch {
      // ignore — user can try again
    } finally {
      setOauthReauthLoading(false);
    }
  };

  const handleSidebarLogout = async () => {
    await fetch('/api/auth/login', { method: 'DELETE' });
    setLoggedIn(false);
    setNotice(t.loggedOut);
    setTimeout(() => setNotice(''), 2500);
    if (['account', 'subscriptions', 'stats'].includes(tab)) setTab('home');
  };

  // Sync <html lang> and dark class on mount and lang changes
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const cls = saved === 'light' ? 'light' : 'dark';
    document.documentElement.className = cls;
  }, []);

  const mainTabs: TabMeta[] = [
    { id: 'home',      label: t.home,          description: '',                 Icon: HomeIcon       },
    { id: 'block',     label: t.blockTool,     description: t.blockToolDesc,    Icon: ShieldX        },
    { id: 'mute',      label: t.muteTool,      description: t.muteToolDesc,     Icon: VolumeX        },
    { id: 'reblock',   label: t.reblockTool,   description: t.reblockToolDesc,  Icon: RefreshCcw     },
    { id: 'postblock', label: t.postBlockTool, description: t.postBlockDesc,    Icon: MessageSquareX },
  ];

  const accountTabs: TabMeta[] = [
    { id: 'account',       label: t.accountSettings, description: t.accountDesc,       Icon: UserCircle },
    { id: 'subscriptions', label: t.accountSubs,      description: '',                  Icon: Bell       },
    { id: 'stats',         label: t.accountStats,     description: t.statsLast30Days,   Icon: BarChart2  },
  ];

  const allTabs = [...mainTabs, ...accountTabs];
  const activeTab = allTabs.find((tb) => tb.id === tab)!;

  return (
    <div className="h-dvh flex overflow-hidden" style={{ backgroundColor: 'var(--bg-dark)' }}>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 md:hidden"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 z-30 h-dvh flex flex-col transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
        style={{
          width: '240px',
          minWidth: '240px',
          backgroundColor: 'var(--bg-card)',
          borderRight: '1px solid var(--bg-border)',
        }}
      >
        {/* Logo */}
        <div className="flex-shrink-0 flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid var(--bg-border)' }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
            <Shield size={16} strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {t.appName}
            </div>
            <div className="font-mono" style={{ color: 'var(--accent)', fontSize: '10px' }}>v0.5.1</div>
          </div>
        </div>

        {/* Scrollable middle: main nav + spacer + account nav */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {/* Nav - main tools */}
          <nav className="px-3 py-4 flex flex-col gap-1" style={{ borderBottom: '1px solid var(--bg-border)' }}>
            {mainTabs.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => { setTab(id); setSidebarOpen(false); }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full"
                  style={{
                    backgroundColor: active ? 'var(--accent-muted)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text-secondary)',
                    border: active ? '1px solid rgba(0,133,255,0.2)' : '1px solid transparent',
                  }}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Nav - account area */}
          <nav className="px-3 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--bg-border)' }}>
            <div className="px-3 pb-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>
                {t.account}
              </span>
            </div>
            {loggedIn === false ? (
              /* Not logged in: single login button */
              <button
                onClick={() => { setTab('account'); setSidebarOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full"
                style={{
                  backgroundColor: tab === 'account' ? 'var(--accent-muted)' : 'transparent',
                  color: tab === 'account' ? 'var(--accent)' : 'var(--text-secondary)',
                  border: tab === 'account' ? '1px solid rgba(0,133,255,0.2)' : '1px solid transparent',
                }}
              >
                <LogIn size={17} strokeWidth={2} />
                {t.login}
              </button>
            ) : (
              /* Logged in: all 3 account tabs + logout */
              <>
                {accountTabs.map(({ id, label, Icon }) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => { setTab(id); setSidebarOpen(false); }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full"
                      style={{
                        backgroundColor: active ? 'var(--accent-muted)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        border: active ? '1px solid rgba(0,133,255,0.2)' : '1px solid transparent',
                      }}
                    >
                      <Icon size={17} strokeWidth={active ? 2.5 : 2} />
                      {label}
                    </button>
                  );
                })}
                <button
                  onClick={handleSidebarLogout}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left w-full mt-1"
                  style={{ color: 'var(--danger)', border: '1px solid transparent' }}
                >
                  <LogOut size={15} strokeWidth={2} />
                  {t.logout}
                </button>
              </>
            )}
          </nav>
        </div>

        {/* Bottom controls - always visible */}
        <div className="flex-shrink-0 px-3 py-4 flex flex-col gap-2" style={{ borderTop: '1px solid var(--bg-border)' }}>
          {/* Ko-fi */}
          <a
            href="https://ko-fi.com/elmontag"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors"
            style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
            title={t.kofiSupport}
          >
            <Coffee size={13} /> {t.kofiSupport}
          </a>
          {/* Theme + Lang row */}
          <div className="flex gap-2">
            <ThemeBtn t={t} />
            <LangBtn lang={lang} onToggle={() => setLang(lang === 'en' ? 'de' : 'en')} />
          </div>
          {/* Legal links */}
          <div className="flex gap-3 px-1">
            <a href="/impressum"
              className="text-xs transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>
              {t.impressum}
            </a>
            <a href="/datenschutz"
              className="text-xs transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>
              {t.privacyPolicy}
            </a>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
        {/* Mobile top bar */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 sticky top-0 z-10"
          style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--bg-border)' }}>
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg"
            style={{ color: 'var(--text-secondary)' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <Shield size={15} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.appName}</span>
          </div>
          <div style={{ width: '30px' }} />
        </header>

        {/* Global OAuth reconnect banner — visible on all tabs */}
        {loggedIn && isOAuthUser && oauthErrorSince && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 sticky top-0 z-20 md:relative"
            style={{
              backgroundColor: 'color-mix(in srgb, #f59e0b 12%, var(--bg-card))',
              borderBottom: '1px solid color-mix(in srgb, #f59e0b 35%, transparent)',
            }}>
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCcw size={14} className="flex-shrink-0" style={{ color: '#f59e0b' }} />
              <span className="text-xs font-medium" style={{ color: '#f59e0b' }}>
                {t.oauthSessionExpiredTitle}
              </span>
              <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-secondary)' }}>
                — {t.oauthSessionExpiredDesc}
              </span>
            </div>
            <button
              onClick={handleGlobalReAuth}
              disabled={oauthReauthLoading}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#f59e0b', color: '#000' }}
            >
              {oauthReauthLoading
                ? <RefreshCw size={11} className="animate-spin" />
                : <LogIn size={11} />}
              {oauthReauthLoading ? t.oauthConnecting : t.oauthSessionReauthorize}
            </button>
          </div>
        )}

        {/* Tool header */}
        <div className="px-4 pt-4 pb-4 md:px-6 md:pt-8 md:pb-6" style={{ borderBottom: '1px solid var(--bg-border)' }}>
        <div className="flex items-center gap-3 md:gap-4 mx-auto"
            style={{ maxWidth: ['home', 'block', 'mute', 'reblock', 'postblock'].includes(tab) ? '1200px' : '672px' }}>
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-muted)', color: 'var(--accent)' }}>
              <activeTab.Icon size={20} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {activeTab.label}
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {activeTab.description}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="flex-1 px-4 py-4 md:px-6 md:py-7 w-full mx-auto"
          style={{ maxWidth: ['home', 'block', 'mute', 'reblock', 'postblock'].includes(tab) ? '1200px' : '672px' }}>
          {notice && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: 'var(--success-muted)', color: 'var(--success)' }}>
              {notice}
            </div>
          )}
          {tab === 'home' && <HomePage t={t} onNavigate={(dest) => setTab(dest)} />}
          {(tab === 'block' || tab === 'mute') && (
            <BlockMuteTool key={tab} mode={tab as Mode} t={t} />
          )}
          {tab === 'subscriptions' && <SubscriptionManager t={t} onNeedLogin={() => setTab('account')} />}
          {tab === 'reblock' && <ReblockTool t={t} />}
          {tab === 'postblock' && <PostInteractionTool t={t} />}
          {tab === 'stats' && <StatsPanel t={t} onNeedLogin={() => setTab('account')} />}
          {tab === 'account' && <AccountManager t={t} onLogin={() => setLoggedIn(true)} onLogout={() => { setLoggedIn(false); setTab('home'); }} />}
        </main>
      </div>
    </div>
  );
}

/* Inline mini-components to avoid extra files */
function ThemeBtn({ t }: { t: typeof en }) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.documentElement.classList.replace('dark', 'light');
      setDark(false);
    }
  }, []);

  const toggle = () => {
    if (dark) {
      document.documentElement.classList.replace('dark', 'light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.replace('light', 'dark');
      localStorage.setItem('theme', 'dark');
    }
    setDark(!dark);
  };
  return (
    <button onClick={toggle}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors"
      style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
      title={dark ? t.lightMode : t.darkMode}>
      {dark ? <Sun size={13} /> : <Moon size={13} />}
      <span>{dark ? t.lightMode : t.darkMode}</span>
    </button>
  );
}

function LangBtn({ lang, onToggle }: { lang: Language; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors"
      style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}>
      <Globe size={13} />
      <span>{lang === 'en' ? 'DE' : 'EN'}</span>
    </button>
  );
}
