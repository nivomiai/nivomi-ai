import type { ReactNode } from 'react';
import { Footer } from './Footer';
import { Navbar } from './Navbar';

/** Public-site chrome: skip link, navigation, main landmark and footer. */
export function SiteShell({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-card px-4 py-2 font-semibold text-ink shadow-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      <Footer />
    </>
  );
}
