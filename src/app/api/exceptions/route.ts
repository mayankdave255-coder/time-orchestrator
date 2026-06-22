// src/app/api/exceptions/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { encodeJsonField } from '@/lib/json-fields';
import { serializeException } from '@/lib/serializers';
import { dateStringSchema, timeStringSchema } from '@/lib/validation/common';

const upsertExceptionSchema = z.object({
  ruleId: z.string().min(1),
  originalDate: dateStringSchema,
  cancelled: z.boolean().default(false),
  overrides: z
    .object({
      title: z.string().min(1).optional(),
      startTime: timeStringSchema.optional(),
      endTime: timeStringSchema.optional(),
    })
    .optional(),
  position: z.number().int().optional(),
});

// GET /api/exceptions?ruleId=...&date=YYYY-MM-DD
// `ruleId` is required; `date` narrows to a single exception for that date.
// Omitting `date` returns every exception for the rule.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ruleId = searchParams.get('ruleId');
  const date = searchParams.get('date');

  if (!ruleId) {
    return NextResponse.json({ error: 'Query param "ruleId" is required' }, { status: 400 });
  }
  if (date) {
    const dateCheck = dateStringSchema.safeParse(date);
    if (!dateCheck.success) {
      return NextResponse.json({ error: 'Query param "date" must be YYYY-MM-DD' }, { status: 400 });
    }
  }

  // Ownership check: only return exceptions for rules the current user owns.
  const rule = await db.recurrenceRule.findUnique({ where: { id: ruleId } });
  if (!rule || rule.userId !== userId) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const exceptions = await db.exception.findMany({
    where: { ruleId, ...(date ? { originalDate: date } : {}) },
    orderBy: { originalDate: 'asc' },
  });

  return NextResponse.json({ exceptions: exceptions.map(serializeException) }, { status: 200 });
}

// POST /api/exceptions — create or update the exception for a rule+date.
//
// Exception has a @@unique([ruleId, originalDate]) constraint (a rule can
// have at most one exception per date), so "create or update" maps
// directly to an upsert keyed on that pair.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = upsertExceptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const rule = await db.recurrenceRule.findUnique({ where: { id: data.ruleId } });
  if (!rule || rule.userId !== userId) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const exception = await db.exception.upsert({
    where: { ruleId_originalDate: { ruleId: data.ruleId, originalDate: data.originalDate } },
    create: {
      ruleId: data.ruleId,
      originalDate: data.originalDate,
      cancelled: data.cancelled,
      overrides: encodeJsonField(data.overrides),
      position: data.position,
    },
    update: {
      cancelled: data.cancelled,
      overrides: encodeJsonField(data.overrides),
      position: data.position,
    },
  });

  return NextResponse.json({ exception: serializeException(exception) }, { status: 200 });
}
