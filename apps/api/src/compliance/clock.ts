import { Injectable } from '@nestjs/common';

/**
 * The time eligibility is evaluated at. Injected (not `new Date()` inline) so tests can move the
 * clock through calling windows, cooldowns and effective dates.
 */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
