// src/lib/recurrence/__tests__/generator.test.ts

import { describe, it, expect } from 'vitest';
import { differenceInCalendarDays } from 'date-fns';
import { format, toZonedTime } from 'date-fns-tz';
import { generateOccurrences, applyExceptions } from '../index';
import type { RecurrenceRule, Exception, Occurrence } from '../index';

/** Builds a minimal valid RecurrenceRule, overridable per test. */
function buildRule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return {
    id: 'rule-1',
    userId: 'user-1',
    title: 'Test Task',
    startTime: '09:00',
    endTime: '10:00',
    timezone: 'UTC', // Most tests use UTC to avoid offset complications;
    // the DST-specific tests below override this to 'America/New_York'.
    recurrenceType: 'daily',
    interval: 1,
    startDate: '2024-01-01',
    tags: [],
    notifications: [],
    ...overrides,
  };
}

/** Deterministic "YYYY-MM-DD" extraction, independent of host TZ. */
function dateStrOf(date: Date): string {
  return format(date, 'yyyy-MM-dd', { timeZone: 'UTC' });
}

describe('generateOccurrences', () => {
  describe('daily', () => {
    it('generates 7 occurrences for every 1 day across 7 days', () => {
      const rule = buildRule({ recurrenceType: 'daily', interval: 1, startDate: '2024-01-01' });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-07T23:59:59Z'),
      );

      expect(occurrences).toHaveLength(7);
      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04',
        '2024-01-05', '2024-01-06', '2024-01-07',
      ]);
      expect(occurrences.map((o) => o.indexInSeries)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('spaces occurrences correctly for every 3 days', () => {
      const rule = buildRule({ recurrenceType: 'daily', interval: 3, startDate: '2024-01-01' });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-01', '2024-01-04', '2024-01-07', '2024-01-10', '2024-01-13',
      ]);
      expect(occurrences.map((o) => o.indexInSeries)).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe('weekly', () => {
    it('generates Mon/Wed/Fri each week for interval=1, daysOfWeek=[1,3,5]', () => {
      const rule = buildRule({
        recurrenceType: 'weekly',
        interval: 1,
        daysOfWeek: [1, 3, 5],
        startDate: '2024-01-01', // a Monday
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-14T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-01', '2024-01-03', '2024-01-05',
        '2024-01-08', '2024-01-10', '2024-01-12',
      ]);
    });
  });

  describe('biweekly', () => {
    it('generates occurrences 14 days apart, starting on a Monday', () => {
      const rule = buildRule({ recurrenceType: 'biweekly', startDate: '2024-01-01' }); // Monday
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-03-01T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-01', '2024-01-15', '2024-01-29', '2024-02-12', '2024-02-26',
      ]);
      for (let i = 1; i < occurrences.length; i++) {
        expect(differenceInCalendarDays(occurrences[i].date, occurrences[i - 1].date)).toBe(14);
      }
    });
  });

  describe('monthly', () => {
    it('generates the first Sunday of each month for interval=1, daysOfWeek=[0]', () => {
      const rule = buildRule({
        recurrenceType: 'monthly',
        interval: 1,
        daysOfWeek: [0],
        startDate: '2024-01-01',
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-06-30T23:59:59Z'),
      );

      // Verified by hand against a calendar: Jan 1 2024 is a Monday.
      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-07', '2024-02-04', '2024-03-03',
        '2024-04-07', '2024-05-05', '2024-06-02',
      ]);
    });

    it('generates the first Sunday every 3rd month for interval=3, daysOfWeek=[0]', () => {
      const rule = buildRule({
        recurrenceType: 'monthly',
        interval: 3,
        daysOfWeek: [0],
        startDate: '2024-01-01',
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-09-30T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-07', '2024-04-07', '2024-07-07',
      ]);
    });
  });

  describe('custom', () => {
    it('generates every 2 weeks on Tue/Thu for intervalType="weeks"', () => {
      const rule = buildRule({
        recurrenceType: 'custom',
        intervalType: 'weeks',
        interval: 2,
        daysOfWeek: [2, 4],
        startDate: '2024-01-02', // a Tuesday
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-01-20T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-02', '2024-01-04', '2024-01-16', '2024-01-18',
      ]);
    });

    it('falls back to the last day of the month, including Feb 29 in a leap year', () => {
      const rule = buildRule({
        recurrenceType: 'custom',
        intervalType: 'months',
        interval: 1,
        dayOfMonth: 31,
        startDate: '2024-01-31', // 2024 is a leap year
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-04-30T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30',
      ]);
    });

    it('falls back to Feb 28 in a non-leap year', () => {
      const rule = buildRule({
        recurrenceType: 'custom',
        intervalType: 'months',
        interval: 1,
        dayOfMonth: 31,
        startDate: '2025-01-31', // 2025 is not a leap year
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-04-30T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30',
      ]);
    });

    it('uses dayOfMonth directly when no fallback is needed', () => {
      const rule = buildRule({
        recurrenceType: 'custom',
        intervalType: 'months',
        interval: 1,
        dayOfMonth: 15,
        startDate: '2024-01-15',
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-04-30T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15',
      ]);
    });
  });

  describe('stop conditions', () => {
    it('stops at exactly maxOccurrences', () => {
      const rule = buildRule({
        recurrenceType: 'daily',
        interval: 1,
        startDate: '2024-01-01',
        maxOccurrences: 5,
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-02-01T23:59:59Z'),
      );

      expect(occurrences).toHaveLength(5);
      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05',
      ]);
    });

    it('stops correctly when endDate falls in the middle of a weekly cycle', () => {
      const rule = buildRule({
        recurrenceType: 'weekly',
        interval: 1,
        daysOfWeek: [1, 3, 5],
        startDate: '2024-01-01',
        endDate: '2024-01-10', // a Wednesday — that week's Friday occurrence must be excluded
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-01T00:00:00Z'),
        new Date('2024-02-01T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-01', '2024-01-03', '2024-01-05', '2024-01-08', '2024-01-10',
      ]);
    });
  });

  describe('DST handling (America/New_York)', () => {
    it('keeps 9:00 AM local time across the spring-forward transition (Mar 10, 2024)', () => {
      const rule = buildRule({
        recurrenceType: 'daily',
        interval: 1,
        startDate: '2024-03-09',
        startTime: '09:00',
        endTime: '10:00',
        timezone: 'America/New_York',
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-03-09T00:00:00Z'),
        new Date('2024-03-11T23:59:59Z'),
      );

      expect(occurrences).toHaveLength(3);
      for (const occurrence of occurrences) {
        const localStart = toZonedTime(occurrence.calculatedStart, 'America/New_York');
        expect(format(localStart, 'HH:mm')).toBe('09:00');
      }

      // Confirm the UTC offset genuinely shifted (EST UTC-5 -> EDT UTC-4),
      // so this test would actually fail without correct DST handling.
      const utcHours = occurrences.map((o) => o.calculatedStart.getUTCHours());
      expect(utcHours).toEqual([14, 13, 13]);
    });

    it('keeps 9:00 AM local time across the fall-back transition (Nov 3, 2024)', () => {
      const rule = buildRule({
        recurrenceType: 'daily',
        interval: 1,
        startDate: '2024-11-02',
        startTime: '09:00',
        endTime: '10:00',
        timezone: 'America/New_York',
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-11-02T00:00:00Z'),
        new Date('2024-11-04T23:59:59Z'),
      );

      expect(occurrences).toHaveLength(3);
      for (const occurrence of occurrences) {
        const localStart = toZonedTime(occurrence.calculatedStart, 'America/New_York');
        expect(format(localStart, 'HH:mm')).toBe('09:00');
      }

      // EDT (UTC-4) before the fall-back, EST (UTC-5) on/after it.
      const utcHours = occurrences.map((o) => o.calculatedStart.getUTCHours());
      expect(utcHours).toEqual([13, 14, 14]);
    });
  });

  describe('edge cases', () => {
    it('still generates in-range occurrences when startDate is before fromDate', () => {
      const rule = buildRule({ recurrenceType: 'daily', interval: 1, startDate: '2024-01-01' });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-01-10T00:00:00Z'),
        new Date('2024-01-15T23:59:59Z'),
      );

      expect(occurrences.map((o) => dateStrOf(o.date))).toEqual([
        '2024-01-10', '2024-01-11', '2024-01-12', '2024-01-13', '2024-01-14', '2024-01-15',
      ]);
      // indexInSeries keeps counting from startDate (index 0 = Jan 1),
      // even though occurrences before fromDate are never returned.
      expect(occurrences.map((o) => o.indexInSeries)).toEqual([9, 10, 11, 12, 13, 14]);
    });

    it('returns an empty array when the rule ends before the query range starts', () => {
      const rule = buildRule({
        recurrenceType: 'daily',
        interval: 1,
        startDate: '2024-01-01',
        endDate: '2024-01-05',
      });
      const occurrences = generateOccurrences(
        rule,
        new Date('2024-02-01T00:00:00Z'),
        new Date('2024-02-10T23:59:59Z'),
      );

      expect(occurrences).toEqual([]);
    });

    it('caps at the 1000-occurrence safety limit instead of hanging', () => {
      const rule = buildRule({ recurrenceType: 'daily', interval: 1, startDate: '2000-01-01' });

      const start = Date.now();
      const occurrences = generateOccurrences(
        rule,
        new Date('2000-01-01T00:00:00Z'),
        new Date('2030-01-01T23:59:59Z'), // far beyond both safety caps
      );
      const elapsedMs = Date.now() - start;

      // 5 years of daily occurrences (~1826) exceeds 1000, so the
      // occurrence-count cap triggers before the 5-year cap would.
      expect(occurrences).toHaveLength(1000);
      expect(elapsedMs).toBeLessThan(2000);
    });
  });
});

describe('applyExceptions', () => {
  function baseOccurrence(overrides: Partial<Occurrence> = {}): Occurrence {
    return {
      ruleId: 'rule-1',
      date: new Date('2024-01-01T00:00:00Z'),
      indexInSeries: 0,
      calculatedStart: new Date('2024-01-01T09:00:00Z'),
      calculatedEnd: new Date('2024-01-01T10:00:00Z'),
      ...overrides,
    };
  }

  it('marks a cancelled exception as type "cancelled"', () => {
    const occurrence = baseOccurrence();
    const exception: Exception = {
      id: 'ex-1',
      ruleId: 'rule-1',
      originalDate: '2024-01-01',
      cancelled: true,
    };

    const [resolved] = applyExceptions([occurrence], [exception]);
    expect(resolved.type).toBe('cancelled');
  });

  it('applies an override for title and startTime, leaving endTime unchanged', () => {
    const occurrence = baseOccurrence();
    const exception: Exception = {
      id: 'ex-2',
      ruleId: 'rule-1',
      originalDate: '2024-01-01',
      cancelled: false,
      overrides: { title: 'Rescheduled', startTime: '11:00' },
    };

    const [resolved] = applyExceptions([occurrence], [exception]);
    expect(resolved.type).toBe('modified');
    expect(resolved.title).toBe('Rescheduled');
    expect(resolved.startTime).toBe('11:00');
    expect(resolved.endTime).toBe('10:00'); // unchanged, derived from calculatedEnd
  });

  it('marks an occurrence with no matching exception as "regular"', () => {
    const occurrence = baseOccurrence();
    const [resolved] = applyExceptions([occurrence], []);
    expect(resolved.type).toBe('regular');
  });

  it('resolves a mixed array of cancelled, modified, and regular occurrences correctly', () => {
    const occurrences = [
      baseOccurrence({
        date: new Date('2024-01-01T00:00:00Z'),
        calculatedStart: new Date('2024-01-01T09:00:00Z'),
        calculatedEnd: new Date('2024-01-01T10:00:00Z'),
      }),
      baseOccurrence({
        date: new Date('2024-01-02T00:00:00Z'),
        calculatedStart: new Date('2024-01-02T09:00:00Z'),
        calculatedEnd: new Date('2024-01-02T10:00:00Z'),
      }),
      baseOccurrence({
        date: new Date('2024-01-03T00:00:00Z'),
        calculatedStart: new Date('2024-01-03T09:00:00Z'),
        calculatedEnd: new Date('2024-01-03T10:00:00Z'),
      }),
    ];
    const exceptions: Exception[] = [
      { id: 'ex-3', ruleId: 'rule-1', originalDate: '2024-01-01', cancelled: true },
      { id: 'ex-4', ruleId: 'rule-1', originalDate: '2024-01-02', cancelled: false, overrides: { title: 'Moved' } },
    ];

    const resolved = applyExceptions(occurrences, exceptions);
    expect(resolved.map((r) => r.type)).toEqual(['cancelled', 'modified', 'regular']);
  });

  it('lets the last matching exception win when multiple match the same occurrence', () => {
    const occurrence = baseOccurrence();
    const exceptions: Exception[] = [
      { id: 'ex-5', ruleId: 'rule-1', originalDate: '2024-01-01', cancelled: false, overrides: { title: 'First edit' } },
      { id: 'ex-6', ruleId: 'rule-1', originalDate: '2024-01-01', cancelled: false, overrides: { title: 'Final edit' } },
    ];

    const [resolved] = applyExceptions([occurrence], exceptions);
    expect(resolved.title).toBe('Final edit');
  });

  it('does not mutate its inputs', () => {
    const occurrence = baseOccurrence();
    const exception: Exception = { id: 'ex-7', ruleId: 'rule-1', originalDate: '2024-01-01', cancelled: true };
    const occurrencesCopy = [occurrence];
    const exceptionsCopy = [exception];

    applyExceptions(occurrencesCopy, exceptionsCopy);

    expect(occurrencesCopy[0]).toEqual(occurrence);
    expect(exceptionsCopy[0]).toEqual(exception);
  });
});
