// src/app/api/rules/[id]/split/route.ts
//
// Splits a rule at a given date so edits only apply to future occurrences,
// leaving past occurrences (and any Exceptions already attached to them)
// governed by the original rule unchanged.
//
// This is a genuine placeholder, not a thin CRUD wrapper like the routes
// in ../route.ts: the actual split algorithm depends on decisions that
// aren't locked yet — e.g. whether Exceptions on/after splitDate should be
// reassigned to the new rule or left attached to the old one, whether
// maxOccurrences should be recalculated for the truncated original rule,
// and how indexInSeries continuity should be communicated to the
// recurrence engine for the new rule. Implementing real logic here would
// mean guessing at those decisions, so this validates the request shape
// and returns 501 until that design is settled.
//
// Intended shape once implemented:
//   1. Validate splitDate falls within the rule's active range.
//   2. Set the original rule's endDate to the day before splitDate.
//   3. Create a new RecurrenceRule with the same recurrence config,
//      startDate = splitDate, carrying over the `updates` fields.
//   4. Leave Exceptions before splitDate attached to the original rule;
//      decide and apply the reassignment policy for the rest.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { db } from '@/lib/db';
import { dateStringSchema, dayOfWeekSchema, timeStringSchema } from '@/lib/validation/common';

const splitRuleSchema = z.object({
  /** The first date the new (split-off) rule should apply from. */
  splitDate: dateStringSchema,
  /** Fields to change on the new rule going forward; same shape as a
   * partial rule update. Unspecified fields carry over from the original
   * rule unchanged. */
  updates: z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      startTime: timeStringSchema.optional(),
      endTime: timeStringSchema.optional(),
      daysOfWeek: z.array(dayOfWeekSchema).optional(),
    })
    .optional(),
});

interface RouteParams {
  params: { id: string };
}

// PUT /api/rules/[id]/split — split a rule at a date (edit future only).
export async function PUT(request: Request, { params }: RouteParams) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await db.recurrenceRule.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = splitRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: 'Not implemented yet',
      message: 'Rule splitting is not implemented. See route comments for the intended design.',
    },
    { status: 501 },
  );
}
