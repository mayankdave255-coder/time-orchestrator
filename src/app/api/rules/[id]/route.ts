// src/app/api/rules/[id]/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { encodeJsonField } from '@/lib/json-fields';
import { serializeRule } from '@/lib/serializers';
import {
  dateStringSchema,
  dayOfWeekSchema,
  notificationSchema,
  tagsSchema,
  timeStringSchema,
} from '@/lib/validation/common';

// All fields optional — PUT here is a partial update, not a full replace.
const updateRuleSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
  timezone: z.string().min(1).optional(),
  recurrenceType: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']).optional(),
  interval: z.number().int().min(1).optional(),
  daysOfWeek: z.array(dayOfWeekSchema).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  intervalType: z.enum(['days', 'weeks', 'months']).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  tags: tagsSchema.optional(),
  notifications: z.array(notificationSchema).optional(),
});

interface RouteParams {
  params: { id: string };
}

// GET /api/rules/[id] — fetch a single rule owned by the current user.
export async function GET(_request: Request, { params }: RouteParams) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rule = await db.recurrenceRule.findUnique({ where: { id: params.id } });
  if (!rule || rule.userId !== userId) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  return NextResponse.json({ rule: serializeRule(rule) }, { status: 200 });
}

// PUT /api/rules/[id] — partially update a rule.
//
// Note: this updates the RecurrenceRule row directly, affecting every past
// and future occurrence. "Edit future only" semantics (splitting the rule
// at a date so past occurrences keep their old config) is a distinct
// operation — see /api/rules/[id]/split.
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
  const parsed = updateRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const rule = await db.recurrenceRule.update({
    where: { id: params.id },
    data: {
      ...data,
      // Only re-encode JSON-string fields when actually provided —
      // spreading `data` above would otherwise overwrite them with raw
      // arrays/objects instead of the encoded string Prisma expects.
      daysOfWeek: data.daysOfWeek !== undefined ? encodeJsonField(data.daysOfWeek) : undefined,
      tags: data.tags !== undefined ? encodeJsonField(data.tags) : undefined,
      notifications: data.notifications !== undefined ? encodeJsonField(data.notifications) : undefined,
    },
  });

  return NextResponse.json({ rule: serializeRule(rule) }, { status: 200 });
}

// DELETE /api/rules/[id] — delete a rule (cascades to its Exceptions).
export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await db.recurrenceRule.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  await db.recurrenceRule.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true }, { status: 200 });
}
