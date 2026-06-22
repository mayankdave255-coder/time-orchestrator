// src/lib/recurrence/generator.ts

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  getDaysInMonth,
  isAfter,
  isBefore,
  setDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { Occurrence, RecurrenceRule } from './types';

const DATE_FORMAT = 'yyyy-MM-dd';

// Safety backstop applied unconditionally, even when endDate/maxOccurrences
// are set. The spec only requires it when *neither* is defined, but we
// apply it as a defense-in-depth guard against a malformed rule (e.g. a
// typo'd endDate centuries in the future) ever causing a runaway loop.
// In the common case where endDate/maxOccurrences are sane, this never
// actually triggers — endDate/maxOccurrences will always win first.
const SAFETY_MAX_OCCURRENCES = 1000;
const SAFETY_MAX_YEARS = 5;

// ---------------------------------------------------------------------------
// Timezone helpers
// ---------------------------------------------------------------------------

/**
 * Converts a "YYYY-MM-DD" calendar date string into a "zoned pointer": a
 * Date object whose UTC-getter fields equal the wall-clock fields of
 * midnight on that date, *in the rule's timezone*.
 *
 * This is the pattern date-fns-tz recommends for doing calendar arithmetic
 * (addDays/addWeeks/startOfWeek/etc. from plain date-fns) without DST
 * drift: round-trip through fromZonedTime -> toZonedTime once, then treat
 * the result as a normal Date for calendar math. We never hand-roll
 * millisecond/offset math ourselves.
 */
function toZonedPointer(dateStr: string, timezone: string): Date {
  const utcInstant = fromZonedTime(`${dateStr}T00:00:00`, timezone);
  return toZonedTime(utcInstant, timezone);
}

/** Formats a zoned pointer (see toZonedPointer) back to "YYYY-MM-DD". */
function pointerToDateStr(pointer: Date): string {
  return format(pointer, DATE_FORMAT);
}

/**
 * Resolves the real UTC instant for `time` ("HH:mm") on calendar date
 * `dateStr`, in `timezone`. This is the only place a true wall-clock ->
 * UTC conversion happens, so DST transitions (spring-forward/fall-back)
 * are handled correctly by date-fns-tz instead of by us.
 */
function resolveInstant(dateStr: string, time: string, timezone: string): Date {
  return fromZonedTime(`${dateStr}T${time}:00`, timezone);
}

// ---------------------------------------------------------------------------
// Per-recurrence-type date generators
//
// Each yields successive *candidate* occurrence dates (as zoned pointers,
// see above) in chronological order, starting at the rule's startDate, and
// never terminates on its own — termination is the caller's job, handled
// uniformly by iterateSeries() below.
// ---------------------------------------------------------------------------

function* dailyDates(rule: RecurrenceRule): Generator<Date> {
  let pointer = toZonedPointer(rule.startDate, rule.timezone);
  while (true) {
    yield pointer;
    pointer = addDays(pointer, rule.interval);
  }
}

function* weeklyDates(rule: RecurrenceRule): Generator<Date> {
  // daysOfWeek presence/non-emptiness is validated by the caller before
  // this generator is ever constructed.
  const sortedDays = [...rule.daysOfWeek!].sort((a, b) => a - b);
  const startPointer = toZonedPointer(rule.startDate, rule.timezone);

  // Anchor on the Sunday (weekStartsOn: 0) on/before startDate, so every
  // subsequent "week" is just anchorWeekStart + N*7 days. daysOfWeek values
  // (0 = Sunday ... 6 = Saturday) line up directly with offsets from this
  // anchor.
  const anchorWeekStart = startOfWeek(startPointer, { weekStartsOn: 0 });

  let weekIndex = 0;
  while (true) {
    // interval = "every N weeks" — only every Nth week from the anchor is
    // active. e.g. interval=2 -> weekIndex 0, 2, 4, ... are active.
    if (weekIndex % rule.interval === 0) {
      const weekStart = addWeeks(anchorWeekStart, weekIndex);
      for (const day of sortedDays) {
        const candidate = addDays(weekStart, day);
        // The anchor week may contain days-of-week that fall *before*
        // startDate (e.g. startDate is a Wednesday but Monday is also in
        // daysOfWeek) — the series must not start before startDate.
        if (!isBefore(candidate, startPointer)) {
          yield candidate;
        }
      }
    }
    weekIndex += 1;
  }
}

function* biweeklyDates(rule: RecurrenceRule): Generator<Date> {
  // Biweekly is always a fixed 2-week step on startDate's weekday.
  // Per spec this ignores both rule.interval and rule.daysOfWeek entirely.
  let pointer = toZonedPointer(rule.startDate, rule.timezone);
  while (true) {
    yield pointer;
    pointer = addWeeks(pointer, 2);
  }
}

/**
 * Computes the first occurrence of `weekday` (0 = Sunday ... 6 = Saturday)
 * on or after `monthStart`.
 *
 * date-fns `setDay` with `weekStartsOn: 0` places `weekday` within the same
 * Sun-Sat week as `monthStart`, which can land *before* monthStart if the
 * target weekday occurs earlier in that week than the 1st does (e.g. month
 * starts on a Wednesday, target weekday is Monday). In that case the real
 * first occurrence is one week later, hence the +7 day correction.
 */
function firstWeekdayOfMonth(monthStart: Date, weekday: number): Date {
  const candidate = setDay(monthStart, weekday, { weekStartsOn: 0 });
  return isBefore(candidate, monthStart) ? addDays(candidate, 7) : candidate;
}

function* monthlyDates(rule: RecurrenceRule): Generator<Date> {
  if (rule.interval < 1) {
    throw new Error('Monthly recurrence requires interval >= 1.');
  }
  if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
    throw new Error('Monthly recurrence requires at least one entry in daysOfWeek.');
  }

  // Sorting daysOfWeek doesn't guarantee chronological output by itself —
  // e.g. if the month starts on a Friday, the first Sunday (day 0) falls
  // *after* the first Friday (day 5) despite 0 < 5. We compute every
  // requested weekday's first occurrence for the month, then sort those
  // resulting dates directly, so the series stays chronological regardless
  // of how daysOfWeek values relate to the month's starting weekday.
  const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);
  const startPointer = toZonedPointer(rule.startDate, rule.timezone);
  let monthStart = startOfMonth(startPointer);

  while (true) {
    const candidatesThisMonth = sortedDays
      .map((day) => firstWeekdayOfMonth(monthStart, day))
      .sort((a, b) => a.getTime() - b.getTime());

    for (const candidate of candidatesThisMonth) {
      // Mirrors weeklyDates: the first month may contain a matching
      // weekday that falls before startDate (e.g. startDate is the 15th,
      // but daysOfWeek's first Sunday of that month was the 3rd) — the
      // series must not start before startDate.
      if (!isBefore(candidate, startPointer)) {
        yield candidate;
      }
    }

    // interval is applied as a direct month jump (every Nth month from
    // the start month), not a modulo-filtered scan — unlike weekly, there's
    // no need to visit skipped months at all since nothing in a skipped
    // month could ever be a candidate.
    monthStart = addMonths(monthStart, rule.interval);
  }
}

/**
 * Custom recurrence, intervalType === 'months': fires on `dayOfMonth` every
 * `interval` months. Falls back to the last day of the month when
 * dayOfMonth doesn't exist in that month (e.g. 31 in February).
 */
function* customMonthlyDates(rule: RecurrenceRule): Generator<Date> {
  if (rule.dayOfMonth === undefined) {
    throw new Error("Custom recurrence with intervalType 'months' requires dayOfMonth.");
  }
  if (rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
    throw new Error('dayOfMonth must be between 1 and 31.');
  }

  const startPointer = toZonedPointer(rule.startDate, rule.timezone);
  let monthStart = startOfMonth(startPointer);

  while (true) {
    const daysInMonth = getDaysInMonth(monthStart);
    // Fall back to the last day of the month when dayOfMonth overshoots
    // (e.g. requesting the 31st of a 30-day or 28/29-day month).
    const effectiveDay = Math.min(rule.dayOfMonth, daysInMonth);
    const candidate = addDays(monthStart, effectiveDay - 1);

    if (!isBefore(candidate, startPointer)) {
      yield candidate;
    }

    monthStart = addMonths(monthStart, rule.interval);
  }
}

function* customDates(rule: RecurrenceRule): Generator<Date> {
  if (rule.interval < 1) {
    throw new Error('Custom recurrence requires interval >= 1.');
  }

  switch (rule.intervalType) {
    case 'days':
      // Identical mechanics to plain daily — every `interval` days from
      // startDate. Reusing dailyDates keeps the two code paths from ever
      // silently drifting apart.
      yield* dailyDates(rule);
      return;

    case 'weeks':
      if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
        throw new Error("Custom recurrence with intervalType 'weeks' requires at least one entry in daysOfWeek.");
      }
      // Identical mechanics to plain weekly — every `interval` weeks, on
      // daysOfWeek.
      yield* weeklyDates(rule);
      return;

    case 'months':
      yield* customMonthlyDates(rule);
      return;

    default:
      throw new Error("Custom recurrence requires a valid intervalType ('days' | 'weeks' | 'months').");
  }
}

// ---------------------------------------------------------------------------
// Shared series engine
// ---------------------------------------------------------------------------

interface SeriesItem {
  dateStr: string;
  calculatedStart: Date;
  calculatedEnd: Date;
  /** Position in the *whole* series, counting from 0 at startDate. */
  index: number;
}

/**
 * Walks a per-type date generator and applies the series-level stop
 * conditions (maxOccurrences, endDate, and the safety backstop) uniformly,
 * regardless of recurrence type. Yields one SeriesItem per occurrence that
 * is actually part of the series; stops (without yielding further) once
 * any stop condition is hit.
 */
function* iterateSeries(rule: RecurrenceRule, dateGenerator: Generator<Date>): Generator<SeriesItem> {
  const { timezone } = rule;

  const seriesEndPointer = rule.endDate ? toZonedPointer(rule.endDate, timezone) : null;
  const startPointer = toZonedPointer(rule.startDate, timezone);
  const safetyEndPointer = addYears(startPointer, SAFETY_MAX_YEARS);

  let index = 0;
  for (const pointer of dateGenerator) {
    // --- Stop conditions: whichever is triggered first ends the series. ---
    if (rule.maxOccurrences !== undefined && index >= rule.maxOccurrences) {
      return;
    }
    if (seriesEndPointer !== null && isAfter(pointer, seriesEndPointer)) {
      return;
    }
    if (index >= SAFETY_MAX_OCCURRENCES) {
      return;
    }
    if (isAfter(pointer, safetyEndPointer)) {
      return;
    }

    const dateStr = pointerToDateStr(pointer);
    yield {
      dateStr,
      calculatedStart: resolveInstant(dateStr, rule.startTime, timezone),
      calculatedEnd: resolveInstant(dateStr, rule.endTime, timezone),
      index,
    };

    index += 1;
  }
}

/**
 * Builds the raw date generator for a rule's recurrenceType, including
 * input validation. This is the single place that decides "how a rule's
 * type turns into a sequence of candidate dates" — shared by both
 * generateOccurrences and getNextOccurrence so they can never disagree
 * about what a rule's series looks like.
 */
function getDateGenerator(rule: RecurrenceRule): Generator<Date> {
  switch (rule.recurrenceType) {
    case 'daily': {
      if (rule.interval < 1) {
        throw new Error('Daily recurrence requires interval >= 1.');
      }
      return dailyDates(rule);
    }

    case 'weekly': {
      if (rule.interval < 1) {
        throw new Error('Weekly recurrence requires interval >= 1.');
      }
      if (!rule.daysOfWeek || rule.daysOfWeek.length === 0) {
        throw new Error('Weekly recurrence requires at least one entry in daysOfWeek.');
      }
      return weeklyDates(rule);
    }

    case 'biweekly': {
      return biweeklyDates(rule);
    }

    case 'monthly': {
      return monthlyDates(rule);
    }

    case 'custom': {
      return customDates(rule);
    }

    default: {
      // Exhaustiveness guard: if RecurrenceType ever gains a new member
      // without a case being added above, this line fails to typecheck.
      const _exhaustive: never = rule.recurrenceType;
      throw new Error(`Unknown recurrence type: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates all occurrences of `rule` whose calculatedStart falls within
 * [fromDate, toDate] (inclusive on both ends).
 *
 * indexInSeries always reflects the occurrence's position in the rule's
 * *entire* series starting from startDate (index 0) — it keeps counting
 * through occurrences before fromDate, even though those aren't returned.
 *
 * The series itself stops at the first of: maxOccurrences reached, endDate
 * passed, or the safety backstop (1000 occurrences / 5 years from
 * startDate) — see iterateSeries. Occurrences after toDate are simply not
 * collected; we stop scanning as soon as we pass toDate since dates only
 * move forward.
 */
export function generateOccurrences(rule: RecurrenceRule, fromDate: Date, toDate: Date): Occurrence[] {
  const results: Occurrence[] = [];

  for (const item of iterateSeries(rule, getDateGenerator(rule))) {
    if (isAfter(item.calculatedStart, toDate)) {
      // Dates are monotonically increasing, so nothing further can ever
      // fall inside the window — safe to stop scanning entirely.
      break;
    }

    if (!isBefore(item.calculatedStart, fromDate)) {
      results.push({
        ruleId: rule.id,
        // Real UTC instant for local midnight on this occurrence's date —
        // not the internal "zoned pointer" representation, which is only
        // valid for internal calendar arithmetic, not as a public Date.
        date: resolveInstant(item.dateStr, '00:00', rule.timezone),
        indexInSeries: item.index,
        calculatedStart: item.calculatedStart,
        calculatedEnd: item.calculatedEnd,
      });
    }
  }

  return results;
}

/**
 * Returns the first occurrence of `rule` whose calculatedStart is strictly
 * after `afterDate`, or null if the series ends (via maxOccurrences,
 * endDate, or the safety backstop) before producing one.
 */
export function getNextOccurrence(rule: RecurrenceRule, afterDate: Date): Occurrence | null {
  for (const item of iterateSeries(rule, getDateGenerator(rule))) {
    if (isAfter(item.calculatedStart, afterDate)) {
      return {
        ruleId: rule.id,
        date: resolveInstant(item.dateStr, '00:00', rule.timezone),
        indexInSeries: item.index,
        calculatedStart: item.calculatedStart,
        calculatedEnd: item.calculatedEnd,
      };
    }
  }

  return null;
}
