// src/lib/json-fields.ts
//
// RecurrenceRule/Exception/ManualTodo store array/object fields (daysOfWeek,
// tags, notifications, overrides) as JSON-encoded strings, since SQLite has
// no native array/JSON column type and this schema needs to stay portable
// to PostgreSQL without depending on Postgres-only types (see comments in
// prisma/schema.prisma). These helpers centralize the encode/decode step
// so every route handles it the same way.

/** Encodes a value for storage, or null if it wasn't provided. */
export function encodeJsonField<T>(value: T | undefined): string | null {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

/** Decodes a stored JSON string back into a value, or undefined if null. */
export function decodeJsonField<T>(stored: string | null): T | undefined {
  if (stored === null) return undefined;
  return JSON.parse(stored) as T;
}
