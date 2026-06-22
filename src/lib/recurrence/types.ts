// src/lib/recurrence/types.ts

/**
 * How a RecurrenceRule repeats. 'custom' unlocks the `intervalType` /
 * `dayOfMonth` fields below for patterns the other types can't express.
 */
export type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

/**
 * Unit that `interval` counts in when recurrenceType === 'custom'.
 * e.g. interval: 3, intervalType: 'weeks' => every 3 weeks.
 */
export type CustomIntervalType = 'days' | 'weeks' | 'months';

export interface NotificationConfig {
  type: string;
  offsetMinutes: number;
}

/**
 * The repeat pattern for a task. Completing an instance of this rule on a
 * given date must never mutate this model — see DayCompletion elsewhere.
 */
export interface RecurrenceRule {
  id: string;
  userId: string;
  title: string;
  description?: string;

  /** 24-hour "HH:mm", local to `timezone`. */
  startTime: string;
  /** 24-hour "HH:mm", local to `timezone`. */
  endTime: string;
  /** IANA timezone identifier, e.g. "America/New_York". */
  timezone: string;

  recurrenceType: RecurrenceType;
  /** Step size between occurrences (e.g. every N days/weeks/months). */
  interval: number;

  /** Days of week this rule applies to, 0 = Sunday ... 6 = Saturday. */
  daysOfWeek?: number[];
  /** Day of month (1-31). Only used when recurrenceType === 'custom'. */
  dayOfMonth?: number;
  /** Unit for `interval`. Only used when recurrenceType === 'custom'. */
  intervalType?: CustomIntervalType;

  /** "YYYY-MM-DD" — first possible date for this rule. */
  startDate: string;
  /** "YYYY-MM-DD" — last possible date for this rule, inclusive. */
  endDate?: string;
  /** Hard cap on number of generated occurrences, if set. */
  maxOccurrences?: number;

  tags: string[];
  notifications: NotificationConfig[];
}

/**
 * A single date's instance of a RecurrenceRule, before any Exception is
 * applied.
 */
export interface Occurrence {
  ruleId: string;
  date: Date;
  /** 0-based position of this occurrence within its rule's series. */
  indexInSeries: number;
  /** Absolute start instant, with timezone already resolved. */
  calculatedStart: Date;
  /** Absolute end instant, with timezone already resolved. */
  calculatedEnd: Date;
}

/**
 * A per-date override for a RecurrenceRule. Outranks manual todos and
 * unmodified recurring instances in the conflict priority order.
 */
export interface Exception {
  id: string;
  ruleId: string;
  /** "YYYY-MM-DD" — the occurrence date this exception applies to. */
  originalDate: string;
  overrides?: {
    title?: string;
    startTime?: string;
    endTime?: string;
  };
  cancelled: boolean;
}

/**
 * An Occurrence after Exceptions have been applied — what actually gets
 * rendered/scheduled for a given date.
 */
export interface ResolvedOccurrence extends Occurrence {
  /**
   * 'regular'  — unmodified recurring instance
   * 'modified' — an Exception overrode title/startTime/endTime
   * 'cancelled'— an Exception cancelled this date entirely
   */
  type: 'regular' | 'modified' | 'cancelled';
  title: string;
  startTime: string;
  endTime: string;
  tags: string[];
}
