import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app/AppShell';

export const metadata: Metadata = {
  title: { default: 'Nivomi AI', template: '%s | Nivomi AI' },
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
