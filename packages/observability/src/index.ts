/**
 * Observability wiring (ADR-029, Phase 10). This package is a thin facade over `console` /
 * no-op recorders in Phase 10; it carries the span/metric shapes so every provider adapter uses
 * them. Phase 11 swaps the recorders for OpenTelemetry SDK bindings (OTLP → Grafana Cloud,
 * India region).
 */

export interface SpanAttributes {
  readonly [key: string]: string | number | boolean;
}

export interface SpanContext {
  end(attributes?: SpanAttributes): void;
  recordError(error: unknown): void;
}

export interface Telemetry {
  readonly serviceName: string;
  readonly environment: string;
  startSpan(name: string, attributes?: SpanAttributes): SpanContext;
  recordCounter(name: string, value: number, attributes?: SpanAttributes): void;
  recordHistogram(name: string, value: number, attributes?: SpanAttributes): void;
}

export class RecordingTelemetry implements Telemetry {
  readonly serviceName: string;
  readonly environment: string;
  readonly spans: Array<{ name: string; attributes: SpanAttributes; durationMs: number; error?: string }> =
    [];
  readonly counters: Array<{ name: string; value: number; attributes?: SpanAttributes }> = [];
  readonly histograms: Array<{ name: string; value: number; attributes?: SpanAttributes }> = [];

  constructor(options: { serviceName: string; environment: string }) {
    this.serviceName = options.serviceName;
    this.environment = options.environment;
  }

  startSpan(name: string, attributes: SpanAttributes = {}): SpanContext {
    const started = Date.now();
    let error: string | undefined;
    return {
      recordError: (err: unknown) => {
        error = err instanceof Error ? err.message : String(err);
      },
      end: (extra: SpanAttributes = {}) => {
        const entry: { name: string; attributes: SpanAttributes; durationMs: number; error?: string } = {
          name,
          attributes: { ...attributes, ...extra },
          durationMs: Date.now() - started,
        };
        if (error !== undefined) entry.error = error;
        this.spans.push(entry);
      },
    };
  }

  recordCounter(name: string, value: number, attributes?: SpanAttributes): void {
    const entry: { name: string; value: number; attributes?: SpanAttributes } = { name, value };
    if (attributes !== undefined) entry.attributes = attributes;
    this.counters.push(entry);
  }

  recordHistogram(name: string, value: number, attributes?: SpanAttributes): void {
    const entry: { name: string; value: number; attributes?: SpanAttributes } = { name, value };
    if (attributes !== undefined) entry.attributes = attributes;
    this.histograms.push(entry);
  }
}

/**
 * Wraps a provider call so every adapter emits a span. The `providerCall` helper is the single
 * contract from ADR-029 §1.
 */
export async function providerCall<T>(
  telemetry: Telemetry,
  providerName: string,
  operation: string,
  attributes: SpanAttributes,
  work: () => Promise<T>,
): Promise<T> {
  const span = telemetry.startSpan(`provider.${providerName}.${operation}`, attributes);
  try {
    const result = await work();
    span.end();
    return result;
  } catch (error) {
    span.recordError(error);
    span.end();
    throw error;
  }
}

/**
 * Redaction config: paths whose values must never appear in a log, trace or stored transcript.
 * The pino logger's `REDACTED_PATHS` is derived from this to keep one source of truth.
 */
export const REDACTED_FIELD_NAMES: readonly string[] = [
  'password',
  'token',
  'refresh_token',
  'secret',
  'otp',
  'cardNumber',
  'card_number',
  'aadhaar',
  'cvv',
  'razorpayKey',
  'razorpay_key',
  'hubspotKey',
  'hubspot_key',
];
