import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SkyRewall - BlueSky Moderation Tool',
  description: 'Block and mute BlueSky accounts and their followers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
        {children}
      </body>
    </html>
  );
}
