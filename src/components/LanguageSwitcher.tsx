'use client';
import { Language } from '@/types';

interface Props {
  lang: Language;
  onToggle: () => void;
}

export default function LanguageSwitcher({ lang, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="px-3 py-1 text-xs border rounded transition-colors"
      style={{
        borderColor: 'var(--bg-border)',
        color: 'var(--text-secondary)',
      }}
    >
      {lang === 'en' ? '🇩🇪 DE' : '🇬🇧 EN'}
    </button>
  );
}
