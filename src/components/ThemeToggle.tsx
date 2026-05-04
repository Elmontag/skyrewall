'use client';
import { useState, useEffect } from 'react';
import type { Translations } from '@/i18n/en';

interface Props {
  t: Translations;
}

export default function ThemeToggle({ t }: Props) {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      setDark(false);
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, []);

  const toggle = () => {
    if (dark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
    setDark(!dark);
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
      style={{ border: '1px solid var(--bg-border)', color: 'var(--text-secondary)' }}
      title={dark ? t.lightMode : t.darkMode}
    >
      {dark ? '☀️' : '🌙'}
      <span className="hidden sm:inline">{dark ? t.lightMode : t.darkMode}</span>
    </button>
  );
}

