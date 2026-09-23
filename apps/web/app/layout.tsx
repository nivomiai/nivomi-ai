import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nivomi AI',
  description: 'AI voice agents and business automation',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-surface text-ink font-sans antialiased">{children}</body>
    </html>
  );
}
