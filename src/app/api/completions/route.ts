// src/app/api/completions/route.ts
//
// Marks or unmarks a single source (a RecurrenceRule occurrence, or a
// ManualTodo) complete for one date. Per the locked design decision,
// completing a recurring task only ever writes/removes a DayCompletion
// row — it never touches the RecurrenceRule itself.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { dateStringSchema } from '@/lib/validation/common';

const completionSchema = z.object({
  date: dateStringSchema,
  sourceType: z.enum(['recurrence', 'manual']),
  sourceId: z.string().min(1),
  // true = mark complete (upsert), false = unmark (delete if present).
  // DayCompletion has no other state to update, so a single POST with
  // this flag covers both directions instead of needing a separate
  // DELETE route.
  completed: z.boolean(),
});

// POST /api/completions — mark or unmark complete for a source+date.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = completionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { date, sourceType, sourceId, completed } = parsed.data;

  // Ownership check: confirm the referenced rule/todo actually belongs to
  // this user before recording a completion against it.
  const owns =
    sourceType === 'recurrence'
      ? await db.recurrenceRule.findUnique({ where: { id: sourceId } })
      : await db.manualTodo.findUnique({ where: { id: sourceId } });

  if (!owns || owns.userId !== userId) {
    return NextResponse.json({ error: `${sourceType === 'recurrence' ? 'Rule' : 'Todo'} not found` }, { status: 404 });
  }

  const uniqueKey = { userId_date_sourceType_sourceId: { userId, date, sourceType, sourceId } };

  if (completed) {
    const completion = await db.dayCompletion.upsert({
      where: uniqueKey,
      create: { userId, date, sourceType, sourceId },
      update: {}, // already complete — nothing to change, completedAt stays as first-marked.
    });
    return NextResponse.json({ completion }, { status: 200 });
  }

  // Unmark: deleting a row that doesn't exist would throw, so check first
  // and treat "already not complete" as a successful no-op.
  const existing = await db.dayCompletion.findUnique({ where: uniqueKey });
  if (existing) {
    await db.dayCompletion.delete({ where: uniqueKey });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
