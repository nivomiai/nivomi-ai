import { describe, expect, it } from 'vitest';
import { SimulatedCalendarProvider } from './calendar-provider.js';

describe('SimulatedCalendarProvider', () => {
  const event = {
    appointmentId: 'appt-1',
    starts: new Date('2026-10-10T10:00:00Z'),
    durationMinutes: 30,
    title: 'Chat',
    description: 'Follow-up',
    invitees: ['bob@example.com'],
  };

  it('records events and returns a predictable externalId', async () => {
    const cal = new SimulatedCalendarProvider();
    const { externalId } = await cal.createEvent(event);
    expect(externalId).toBe('sim-cal-appt-1');
    expect(cal.created).toHaveLength(1);
  });

  it('fails on createEvent when failNext > 0, then succeeds', async () => {
    const cal = new SimulatedCalendarProvider();
    cal.failNext = 1;
    await expect(cal.createEvent(event)).rejects.toThrow(/Simulated calendar failure/);
    const { externalId } = await cal.createEvent(event);
    expect(externalId).toBe('sim-cal-appt-1');
  });

  it('returns empty free/busy so the agent always sees availability', async () => {
    const cal = new SimulatedCalendarProvider();
    const busy = await cal.freeBusy();
    expect(busy.size).toBe(0);
  });
});
