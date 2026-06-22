// src/app/api/rules/route.ts

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

const createRuleSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startTime: timeStringSchema,
  endTime: timeStringSchema,
  timezone: z.string().min(1),
  recurrenceType: z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'custom']),
  interval: z.number().int().min(1).default(1),
  daysOfWeek: z.array(dayOfWeekSchema).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  intervalType: z.enum(['days', 'weeks', 'months']).optional(),
  startDate: dateStringSchema,
  endDate: dateStringSchema.optional(),
  maxOccurrences: z.number().int().min(1).optional(),
  tags: tagsSchema.optional(),
  notifications: z.array(notificationSchema).optional(),
});

// GET /api/rules — list the current user's recurrence rules.
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rules = await db.recurrenceRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ rules: rules.map(serializeRule) }, { status: 200 });
}

// POST /api/rules — create a new recurrence rule.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createRuleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const rule = await db.recurrenceRule.create({
    data: {
      userId,
      title: data.title,
      description: data.description,
      startTime: data.startTime,
      endTime: data.endTime,
      timezone: data.timezone,
      recurrenceType: data.recurrenceType,
      interval: data.interval,
      daysOfWeek: encodeJsonField(data.daysOfWeek),
      dayOfMonth: data.dayOfMonth,
      intervalType: data.intervalType,
      startDate: data.startDate,
      endDate: data.endDate,
      maxOccurrences: data.maxOccurrences,
      tags: encodeJsonField(data.tags),
      notifications: encodeJsonField(data.notifications),
    },
  });

  return NextResponse.json({ rule: serializeRule(rule) }, { status: 201 });
}
