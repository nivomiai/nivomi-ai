import type { z } from 'zod';
import { AppError } from './errors.js';

/**
 * Validates untrusted input against a zod schema. Failures become VALIDATION_ERROR with one detail
 * per issue ("path: message"); submitted values are never echoed back.
 */
export function validate<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  const details = result.error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  throw new AppError('VALIDATION_ERROR', 'Some fields are invalid.', { details });
}
