// src/lib/serializers.ts
//
// Shared helpers for reshaping Prisma rows (which store array/object
// fields as JSON-encoded strings — see prisma/schema.prisma) back into
// real arrays/objects for API responses. Centralized here so every route
// that touches RecurrenceRule/Exception/ManualTodo decodes the same way.

import { decodeJsonField } from '@/lib/json-fields';

type NotificationConfig = { type: string; offsetMinutes: number };

export function serializeRule(rule: {
  daysOfWeek: string | null;
  tags: string | null;
  notifications: string | null;
  [key: string]: unknown;
}) {
  return {
    ...rule,
    daysOfWeek: decodeJsonField<number[]>(rule.daysOfWeek) ?? null,
    tags: decodeJsonField<string[]>(rule.tags) ?? [],
    notifications: decodeJsonField<NotificationConfig[]>(rule.notifications) ?? [],
  };
}

export function serializeException(exception: {
  overrides: string | null;
  [key: string]: unknown;
}) {
  return {
    ...exception,
    overrides:
      decodeJsonField<{ title?: string; startTime?: string; endTime?: string }>(exception.overrides) ?? null,
  };
}

export function serializeTodo(todo: {
  tags: string | null;
  notifications: string | null;
  [key: string]: unknown;
}) {
  return {
    ...todo,
    tags: decodeJsonField<string[]>(todo.tags) ?? [],
    notifications: decodeJsonField<NotificationConfig[]>(todo.notifications) ?? [],
  };
}
