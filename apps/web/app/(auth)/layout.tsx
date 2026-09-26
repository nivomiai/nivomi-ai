import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthFrame } from '@/components/app/ui';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AuthFrame>{children}</AuthFrame>;
}
