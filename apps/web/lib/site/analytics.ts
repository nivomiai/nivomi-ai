/**
 * Analytics abstraction for the public site. No provider is chosen yet, so `track` is a no-op
 * until a sink is registered. Event properties must never contain personal data (names,
 * emails, phone numbers, message text) — only placement and product identifiers.
 */
export type AnalyticsEvent =
  | 'hero_cta_clicked'
  | 'demo_cta_clicked'
  | 'contact_form_started'
  | 'contact_form_submitted'
  | 'pricing_viewed'
  | 'coming_soon_viewed'
  | 'coming_soon_cta_clicked';

export type AnalyticsProps = Readonly<Record<string, string>>;

export type AnalyticsSink = (event: AnalyticsEvent, props: AnalyticsProps) => void;

let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}): void {
  try {
    sink?.(event, props);
  } catch {
    // Analytics must never break the page.
  }
}
