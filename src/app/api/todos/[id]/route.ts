// src/app/api/todos/[id]/route.ts

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { encodeJsonField } from '@/lib/json-fields';
import { serializeTodo } from '@/lib/serializers';
import { dateStringSchema, notificationSchema, tagsSchema, timeStringSchema } from '@/lib/validation/common';

// All fields optional — PUT here is a partial update, not a full replace.
const updateTodoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  date: dateStringSchema.optional(),
  startTime: timeStringSchema.optional(),
  endTime: timeStringSchema.optional(),
  isPinned: z.boolean().optional(),
  position: z.number().int().optional(),
  tags: tagsSchema.optional(),
  notifications: z.array(notificationSchema).optional(),
});

interface RouteParams {
  params: { id: string };
}

// PUT /api/todos/[id] — partially update a manual todo.
export async function PUT(request: Request, { params }: RouteParams) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await db.manualTodo.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateTodoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  const todo = await db.manualTodo.update({
    where: { id: params.id },
    data: {
      ...data,
      // Only re-encode JSON-string fields when actually provided — see
      // the same pattern in rules/[id]/route.ts.
      tags: data.tags !== undefined ? encodeJsonField(data.tags) : undefined,
      notifications: data.notifications !== undefined ? encodeJsonField(data.notifications) : undefined,
    },
  });

  return NextResponse.json({ todo: serializeTodo(todo) }, { status: 200 });
}

// DELETE /api/todos/[id]
export async function DELETE(_request: Request, { params }: RouteParams) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await db.manualTodo.findUnique({ where: { id: params.id } });
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  await db.manualTodo.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true }, { status: 200 });
}
