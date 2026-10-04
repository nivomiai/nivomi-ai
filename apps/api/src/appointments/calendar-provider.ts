/**
 * Calendar sync seam (ADR-025, Phase 6). Business logic depends on this interface; the Google /
 * Microsoft 365 adapters replace the simulated one once their OAuth apps are provisioned
 * (TECH_DEBT, on hold list).
 */

export interface CalendarEvent {
  readonly appointmentId: string;
  readonly starts: Date;
  readonly durationMinutes: number;
  readonly title: string;
  readonly description: string;
  readonly invitees: readonly string[];
}

export interface CalendarProvider {
  readonly name: string;
  createEvent(event: CalendarEvent): Promise<{ externalId: string }>;
  updateEvent(externalId: string, event: CalendarEvent): Promise<void>;
  cancelEvent(externalId: string): Promise<void>;
  /** Free/busy for a set of user ids (platform ids, not calendar ids) in a time window. */
  freeBusy(
    userIds: readonly string[],
    from: Date,
    to: Date,
  ): Promise<Map<string, Array<{ from: Date; to: Date }>>>;
}

export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');

export class CalendarProviderError extends Error {
  override readonly name = 'CalendarProviderError';
}

/**
 * Development and test stand-in: records every call in memory, assumes everyone is free so the
 * agent can always book. Refused in production (env validation).
 */
export class SimulatedCalendarProvider implements CalendarProvider {
  readonly name = 'simulated';
  readonly created: CalendarEvent[] = [];
  readonly updated: Array<{ externalId: string; event: CalendarEvent }> = [];
  readonly cancelled: string[] = [];
  /** The next N `createEvent` calls fail. */
  failNext = 0;

  createEvent(event: CalendarEvent): Promise<{ externalId: string }> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new CalendarProviderError('Simulated calendar failure'));
    }
    this.created.push(event);
    return Promise.resolve({ externalId: `sim-cal-${event.appointmentId}` });
  }

  updateEvent(externalId: string, event: CalendarEvent): Promise<void> {
    this.updated.push({ externalId, event });
    return Promise.resolve();
  }

  cancelEvent(externalId: string): Promise<void> {
    this.cancelled.push(externalId);
    return Promise.resolve();
  }

  freeBusy(): Promise<Map<string, Array<{ from: Date; to: Date }>>> {
    return Promise.resolve(new Map<string, Array<{ from: Date; to: Date }>>());
  }
}
