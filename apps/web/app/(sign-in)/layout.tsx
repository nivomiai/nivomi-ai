import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Sign-in, sign-up and forgot-password share a split layout (headline + form); the other auth screens keep `AuthFrame`. */
export default function SignInLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
