'use client';

import { useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY, type Theme, resolveTheme } from '@/lib/site/theme';
import { Icon } from './primitives';

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => resolveTheme(document.documentElement.getAttribute('data-theme'));
const serverTheme = (): Theme | null => null;

export function ThemeToggle({ className }: { readonly className?: string }) {
  const theme = useSyncExternalStore<Theme | null>(subscribe, readTheme, serverTheme);

  const toggle = () => {
    const next: Theme = readTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this page only.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === null
          ? 'Toggle colour theme'
          : theme === 'dark'
            ? 'Switch to light theme'
            : 'Switch to dark theme'
      }
      className={
        className ??
        'inline-grid size-10 place-items-center rounded-[10px] border border-line bg-card text-ink-2 transition-colors hover:border-line-hover hover:text-accent'
      }
    >
      <Icon name="i-sun" className="hidden size-[18px] dark:block" />
      <Icon name="i-moon" className="size-[18px] dark:hidden" />
    </button>
  );
}
