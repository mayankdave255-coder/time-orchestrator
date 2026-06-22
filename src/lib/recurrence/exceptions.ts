// src/lib/recurrence/exceptions.ts

import { format } from 'date-fns-tz';
import type { Exception, Occurrence, ResolvedOccurrence } from './types';

/**
 * Extracts the "YYYY-MM-DD" calendar-date string for an Occurrence, for
 * matching against Exception.originalDate.
 *
 * This module is intentionally timezone-agnostic: Occurrence carries only
 * a resolved `date` (a UTC instant), not the originating rule's timezone.
 * To keep applyExceptions a true pure function — same inputs always
 * produce the same output, regardless of the host machine's local TZ — we
 * read the calendar date using date-fns-tz's `format` pinned to 'UTC',
 * rather than plain date-fns `format` (which would silently depend on
 * process.env.TZ). This matches how the generator builds `date` (UTC
 * instant of local midnight), so for the generator's current output this
 * is exact; a caller constructing Occurrences another way should keep
 * that pairing in mind.
 */
function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd', { timeZone: 'UTC' });
}

/** Same determinism rationale as toDateKey, for HH:mm extraction. */
function toTimeKey(date: Date): string {
  return format(date, 'HH:mm', { timeZone: 'UTC' });
}

/**
 * Resolves a list of raw Occurrences against a list of Exceptions,
 * producing ResolvedOccurrences ready for display/scheduling.
 *
 * NOTE on base values: Occurrence (see ./types) does not carry title or
 * tags — those live on RecurrenceRule, which this function never
 * receives. So for the 'regular'/'cancelled' cases, and for any field an
 * 'modified' exception's overrides doesn't specify, `title` and `tags`
 * fall back to empty placeholders rather than the rule's real values.
 * `startTime`/`endTime` *can* be derived from calculatedStart/
 * calculatedEnd (which Occurrence does carry), so those base values are
 * real. Once a rule-lookup step exists upstream, this function should be
 * extended to accept rule data so title/tags can be filled in properly.
 *
 * Pure: never mutates `occurrences` or `exceptions`, always returns a new
 * array.
 */
export function applyExceptions(occurrences: Occurrence[], exceptions: Exception[]): ResolvedOccurrence[] {
  return occurrences.map((occurrence) => {
    const dateKey = toDateKey(occurrence.date);

    // An occurrence can have more than one matching Exception in the
    // input array (e.g. a superseding edit). Per spec, the LAST matching
    // exception wins — so we scan the full array and keep overwriting
    // `matched` rather than stopping at the first hit.
    let matched: Exception | undefined;
    for (const exception of exceptions) {
      if (exception.ruleId === occurrence.ruleId && exception.originalDate === dateKey) {
        matched = exception;
      }
    }

    const base = {
      title: '',
      startTime: toTimeKey(occurrence.calculatedStart),
      endTime: toTimeKey(occurrence.calculatedEnd),
      tags: [] as string[],
    };

    if (!matched) {
      return {
        ...occurrence,
        type: 'regular' as const,
        ...base,
      };
    }

    if (matched.cancelled) {
      // Cancelled occurrences keep their original title/times — per
      // spec, cancellation doesn't apply an override, it just flags the
      // occurrence as not happening.
      return {
        ...occurrence,
        type: 'cancelled' as const,
        ...base,
      };
    }

    // Modified: apply only the fields overrides actually specifies;
    // anything absent falls back to the base value, never to undefined.
    return {
      ...occurrence,
      type: 'modified' as const,
      title: matched.overrides?.title ?? base.title,
      startTime: matched.overrides?.startTime ?? base.startTime,
      endTime: matched.overrides?.endTime ?? base.endTime,
      tags: base.tags,
    };
  });
}
