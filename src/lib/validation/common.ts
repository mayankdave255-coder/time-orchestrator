// src/lib/validation/common.ts
//
// Shared Zod primitives for API route bodies. Keeping these in one place
// means every route agrees on what a valid "HH:mm" or "YYYY-MM-DD" string
// looks like, instead of each route file re-deriving its own regex.

import { z } from 'zod';

/** 24-hour "HH:mm", e.g. "09:00" or "23:45". */
export const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected time in HH:mm 24-hour format');

/** Calendar date "YYYY-MM-DD", e.g. "2024-01-31". Does not validate that
 * the date actually exists in the calendar (e.g. "2024-02-31" passes this
 * regex) — callers needing that should parse with date-fns and check. */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date in YYYY-MM-DD format');

export const dayOfWeekSchema = z.number().int().min(0).max(6);

export const notificationSchema = z.object({
  type: z.string().min(1),
  offsetMinutes: z.number().int(),
});

export const tagsSchema = z.array(z.string().min(1));
