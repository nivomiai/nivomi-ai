import type { PreferenceRegistration } from './rule-set.schema.js';

/**
 * The preference registry (NCPR / DND, PRD CR-5): a number's commercial-communication
 * preferences. The real lookup arrives with the telephony provider (Phase 4, VQ-8).
 */
export interface PreferenceEntry {
  readonly registration: PreferenceRegistration;
  /** Blocked content categories (1–8) when `registration` is CATEGORY. */
  readonly categories: readonly number[];
}

export interface PreferenceRegistry {
  readonly name: string;
  /** Throws {@link PreferenceRegistryUnavailableError} when the registry cannot answer. */
  lookup(phonesE164: readonly string[]): Promise<Map<string, PreferenceEntry>>;
}

export const PREFERENCE_REGISTRY = Symbol('PREFERENCE_REGISTRY');

export class PreferenceRegistryUnavailableError extends Error {
  override readonly name = 'PreferenceRegistryUnavailableError';
}

/** Fictitious numbers the simulated registry reports as registered (development and demos). */
export const SIMULATED_REGISTRATIONS: ReadonlyMap<string, PreferenceEntry> = new Map([
  // Pooja Das in the Nivomi Demo seed: an inquiry lead on the DND list.
  ['+919847000112', { registration: 'FULLY_BLOCK', categories: [] }],
  ['+919847000113', { registration: 'BLOCK_PROMO', categories: [] }],
  ['+919847000114', { registration: 'CATEGORY', categories: [2] }],
]);

/**
 * Development and test stand-in. Answers from a fixed list plus anything registered at runtime;
 * `outage` simulates the registry being unreachable. Refused in production (env validation).
 */
export class SimulatedPreferenceRegistry implements PreferenceRegistry {
  readonly name = 'simulated';
  private readonly entries = new Map(SIMULATED_REGISTRATIONS);
  outage = false;

  register(phoneE164: string, entry: PreferenceEntry | null): void {
    if (entry) this.entries.set(phoneE164, entry);
    else this.entries.delete(phoneE164);
  }

  lookup(phonesE164: readonly string[]): Promise<Map<string, PreferenceEntry>> {
    if (this.outage) {
      return Promise.reject(
        new PreferenceRegistryUnavailableError('Simulated preference registry outage'),
      );
    }
    const result = new Map<string, PreferenceEntry>();
    for (const phone of phonesE164) {
      result.set(phone, this.entries.get(phone) ?? { registration: 'NONE', categories: [] });
    }
    return Promise.resolve(result);
  }
}
