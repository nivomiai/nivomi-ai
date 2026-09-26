export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nivomi-theme';

/** The brand default is dark; anything other than a valid stored value falls back to it. */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === 'light' || stored === 'dark' ? stored : 'dark';
}

/**
 * Runs before first paint (inlined in <head>) so the page never flashes the wrong theme.
 * Mirrors `resolveTheme`.
 */
export const themeBootstrapScript = `(function(){var t;try{t=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}if(t!=='light'&&t!=='dark'){t='dark'}document.documentElement.setAttribute('data-theme',t)})();`;
