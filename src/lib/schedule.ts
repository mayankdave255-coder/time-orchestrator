// src/lib/schedule.ts
//
// The actual merge logic that src/app/api/schedule/route.ts documented as
// a TODO: load a user's RecurrenceRules + Exceptions + ManualTodos for a
// date range, run rules through the recurrence engine, merge everything
// per-date under the conflict priority order (Exception override > Pinned
// manual todo > Standard manual todo > Unmodified recurring instance),
// and flag overlapping time blocks (flagged only — never auto-resolved,
// per the locked design decision in README.md).
//
// Built range-first (buildScheduleRange) so the month-view calendar can
// fetch its whole visible window in one pass instead of one request per
// day; buildScheduleForDate is a thin single-day wrapper around it for
// /api/schedule.

import { format } from 'date-fns-tz';
import { db } from '@/lib/db';
import { decodeJsonField } from '@/lib/json-fields';
import {
  applyExceptions,
  generateOccurrences,
  type Exception as RecurrenceException,
  type NotificationConfig,
  type RecurrenceRule as RecurrenceRuleShape,
} from '@/lib/recurrence';

/** Mirrors the TimelineItem shape consumed by DayTimeline/MonthGrid
 * (see src/components/calendar/DayTimeline.tsx). Kept as a separate type
 * here (rather than importing the component's type into server-side
 * code) the same way api-utils.ts mirrors route-level Zod shapes. */
export interface ScheduleItem {
  sourceType: 'recurrence' | 'manual';
  sourceId: string;
  date: string;
  title: string;
  startTime: string;
  endTime: string;
  type: 'recurring' | 'modified' | 'manual' | 'cancelled';
  isPinned: boolean;
  isCompleted: boolean;
  conflict: boolean;
  position: number;
  tags: string[];
}

/** "YYYY-MM-DD" key for a UTC instant, formatted the same way
 * src/lib/recurrence/exceptions.ts does internally, so date keys line up
 * exactly with how the recurrence engine itself buckets occurrences. */
function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd', { timeZone: 'UTC' });
}

/** Lower number = higher priority. Matches README's locked conflict
 * priority order: Exception override > Pinned manual todo > Standard
 * manual todo > Unmodified recurring instance. This only affects sort
 * order within a date — overlaps are flagged regardless of rank, never
 * auto-resolved. */
function priorityRank(item: Pick<ScheduleItem, 'sourceType' | 'type' | 'isPinned'>): number {
  if (item.sourceType === 'recurrence' && item.type === 'modified') return 0;
  if (item.sourceType === 'manual' && item.isPinned) return 1;
  if (item.sourceType === 'manual') return 2;
  return 3; // unmodified recurring instance (regular or cancelled)
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

type RuleRow = Awaited<ReturnType<typeof db.recurrenceRule.findMany>>[number];
type ExceptionRow = Awaited<ReturnType<typeof db.exception.findMany>>[number];

function toRecurrenceRuleShape(row: RuleRow): RecurrenceRuleShape {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    description: row.description ?? undefined,
    startTime: row.startTime,
    endTime: row.endTime,
    timezone: row.timezone,
    recurrenceType: row.recurrenceType as RecurrenceRuleShape['recurrenceType'],
    interval: row.interval,
    daysOfWeek: decodeJsonField<number[]>(row.daysOfWeek),
    dayOfMonth: row.dayOfMonth ?? undefined,
    intervalType: (row.intervalType as RecurrenceRuleShape['intervalType']) ?? undefined,
    startDate: row.startDate,
    endDate: row.endDate ?? undefined,
    maxOccurrences: row.maxOccurrences ?? undefined,
    tags: decodeJsonField<string[]>(row.tags) ?? [],
    notifications: decodeJsonField<NotificationConfig[]>(row.notifications) ?? [],
  };
}

/**
 * Builds the merged, conflict-flagged timeline for every date in
 * [from, to] (inclusive), for one user. Loads rules/exceptions/todos/
 * completions once for the whole window rather than re-querying per day.
 */
export async function buildScheduleRange(
  userId: string,
  from: string,
  to: string,
): Promise<Record<string, ScheduleItem[]>> {
  const [rules, todos, completions] = await Promise.all([
    db.recurrenceRule.findMany({ where: { userId } }),
    db.manualTodo.findMany({ where: { userId, date: { gte: from, lte: to } } }),
    db.dayCompletion.findMany({ where: { userId, date: { gte: from, lte: to } } }),
  ]);

  const ruleIds = rules.map((r: RuleRow) => r.id);
  const exceptions = ruleIds.length
    ? await db.exception.findMany({ where: { ruleId: { in: ruleIds } } })
    : [];

  const completedKeys = new Set(
    completions.map((c: { sourceType: string; sourceId: string; date: string }) =>
      `${c.sourceType}:${c.sourceId}:${c.date}`,
    ),
  );

  // Generous one-day UTC buffer on each side so a rule's own timezone
  // offset never pushes an in-range occurrence's calculatedStart outside
  // the window we ask generateOccurrences to scan; out-of-range results
  // are dropped again by pushItem below based on the real date key.
  const fromBound = new Date(`${from}T00:00:00.000Z`);
  fromBound.setUTCDate(fromBound.getUTCDate() - 1);
  const toBound = new Date(`${to}T23:59:59.999Z`);
  toBound.setUTCDate(toBound.getUTCDate() + 1);

  const byDate: Record<string, ScheduleItem[]> = {};
  function pushItem(dateKey: string, item: ScheduleItem) {
    if (dateKey < from || dateKey > to) return;
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(item);
  }

  for (const ruleRow of rules) {
    const rule = toRecurrenceRuleShape(ruleRow);
    const occurrences = generateOccurrences(rule, fromBound, toBound);

    const ruleExceptions: RecurrenceException[] = exceptions
      .filter((e: ExceptionRow) => e.ruleId === rule.id)
      .map((e: ExceptionRow) => ({
        id: e.id,
        ruleId: e.ruleId,
        originalDate: e.originalDate,
        overrides: decodeJsonField(e.overrides) ?? undefined,
        cancelled: e.cancelled,
      }));

    const resolved = applyExceptions(occurrences, ruleExceptions);

    for (const occ of resolved) {
      const dateKey = toDateKey(occ.date);
      const type = occ.type === 'modified' ? 'modified' : occ.type === 'cancelled' ? 'cancelled' : 'recurring';

      pushItem(dateKey, {
        sourceType: 'recurrence',
        sourceId: rule.id,
        date: dateKey,
        // applyExceptions never receives rule data, so its base title/tags
        // are placeholders ('' / []) for the 'regular'/'cancelled' cases —
        // fall back to the rule's own values whenever that's empty.
        title: occ.title || rule.title,
        startTime: occ.startTime,
        endTime: occ.endTime,
        type,
        isPinned: false,
        isCompleted: completedKeys.has(`recurrence:${rule.id}:${dateKey}`),
        conflict: false, // computed below, once every item for the date is known
        position: occ.indexInSeries,
        tags: occ.tags.length ? occ.tags : rule.tags,
      });
    }
  }

  for (const todo of todos) {
    pushItem(todo.date, {
      sourceType: 'manual',
      sourceId: todo.id,
      date: todo.date,
      title: todo.title,
      startTime: todo.startTime ?? '',
      endTime: todo.endTime ?? '',
      type: 'manual',
      isPinned: todo.isPinned,
      isCompleted: completedKeys.has(`manual:${todo.id}:${todo.date}`),
      conflict: false,
      position: todo.position ?? 0,
      tags: decodeJsonField<string[]>(todo.tags) ?? [],
    });
  }

  // Sort each day by conflict priority, then flag pairwise time overlaps.
  // Cancelled occurrences are kept (so they still render with a
  // "Cancelled" badge) but excluded from overlap checks — they aren't
  // actually happening, so they can't conflict with anything.
  for (const dateKey of Object.keys(byDate)) {
    const items = byDate[dateKey].sort((a, b) => priorityRank(a) - priorityRank(b));
    for (let i = 0; i < items.length; i++) {
      if (items[i].type === 'cancelled') continue;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].type === 'cancelled') continue;
        if (timesOverlap(items[i].startTime, items[i].endTime, items[j].startTime, items[j].endTime)) {
          items[i].conflict = true;
          items[j].conflict = true;
        }
      }
    }
    byDate[dateKey] = items;
  }

  return byDate;
}

/** Single-date convenience wrapper around buildScheduleRange, for
 * /api/schedule. */
export async function buildScheduleForDate(userId: string, date: string): Promise<ScheduleItem[]> {
  const range = await buildScheduleRange(userId, date, date);
  return range[date] ?? [];
}
