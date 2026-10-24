import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAnalyticsSink, track } from './analytics';
import { THEME_STORAGE_KEY, resolveTheme, themeBootstrapScript } from './theme';

describe('resolveTheme', () => {
  it('defaults to light and honours valid stored values only', () => {
    expect(resolveTheme(null)).toBe('light');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('purple')).toBe('light');
  });

  it('bootstrap script reads the same storage key and falls back to light', () => {
    expect(themeBootstrapScript).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(themeBootstrapScript).toContain("t='light'");
  });
});

describe('track', () => {
  afterEach(() => setAnalyticsSink(null));

  it('is a no-op without a sink', () => {
    expect(() => track('pricing_viewed')).not.toThrow();
  });

  it('forwards events to the registered sink', () => {
    const sink = vi.fn();
    setAnalyticsSink(sink);
    track('coming_soon_viewed', { slug: 'whatsapp-ai' });
    expect(sink).toHaveBeenCalledWith('coming_soon_viewed', { slug: 'whatsapp-ai' });
  });

  it('never throws when the sink fails', () => {
    setAnalyticsSink(() => {
      throw new Error('provider down');
    });
    expect(() => track('hero_cta_clicked')).not.toThrow();
  });
});
