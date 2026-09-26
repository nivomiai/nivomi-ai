import type { ReactNode } from 'react';
import { SiteShell } from '@/components/marketing/SiteShell';

export default function SiteLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
