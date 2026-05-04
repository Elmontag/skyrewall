'use client';
import AccountManager from '@/components/AccountManager';
import en from '@/i18n/en';

export default function AccountPage() {
  return (
    <main className="min-h-screen px-6 py-10" style={{ backgroundColor: 'var(--bg-dark)' }}>
      <div className="mx-auto max-w-2xl">
        <AccountManager t={en} />
      </div>
    </main>
  );
}
