import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SkyreWall - BlueSky Moderation Tool',
  description: 'Block and mute BlueSky accounts and their followers',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
        {children}
      </body>
    </html>
  );
}
