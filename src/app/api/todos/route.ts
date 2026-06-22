// src/app/api/todos/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { encodeJsonField } from '@/lib/json-fields';
import { serializeTodo } from '@/lib/serializers';
import { dateStringSchema, notificationSchema, tagsSchema, timeStringSchema } from '@/lib/validation/common';

const createTodoSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  date: dateStringSchema,
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
  isPinned: z.boolean().default(false),
  position: z.number().int().optional(),
  tags: tagsSchema.optional(),
  notifications: z.array(notificationSchema).optional(),
});

// GET /api/todos?date=YYYY-MM-DD — list the current user's manual todos
// for a given date. `date` is required: todos are always viewed per-day.
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'Query param "date" is required (YYYY-MM-DD)' }, { status: 400 });
  }
  const dateCheck = dateStringSchema.safeParse(date);
  if (!dateCheck.success) {
    return NextResponse.json({ error: 'Query param "date" must be YYYY-MM-DD' }, { status: 400 });
  }

  const todos = await db.manualTodo.findMany({
    where: { userId, date },
    orderBy: [{ isPinned: 'desc' }, { position: 'asc' }],
  });

  return NextResponse.json({ todos: todos.map(serializeTodo) }, { status: 200 });
}

// POST /api/todos — create a manual todo.
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createTodoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const todo = await db.manualTodo.create({
    data: {
      userId,
      title: data.title,
      description: data.description,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      isPinned: data.isPinned,
      position: data.position,
      tags: encodeJsonField(data.tags),
      notifications: encodeJsonField(data.notifications),
    },
  });

  return NextResponse.json({ todo: serializeTodo(todo) }, { status: 201 });
}
