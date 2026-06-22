// src/lib/api-utils.ts
//
// Client-side helpers for calling the route handlers under src/app/api.
// Every function here returns parsed JSON and throws on a non-OK
// response, so callers can just `await` and catch.

type RecurrenceType = "daily" | "weekly" | "biweekly" | "monthly" | "custom";
type IntervalType = "days" | "weeks" | "months";

interface NotificationInput {
  type: string;
  offsetMinutes: number;
}

// Mirrors the createRuleSchema / updateRuleSchema bodies in
// src/app/api/rules/route.ts and src/app/api/rules/[id]/route.ts.
export interface RuleInput {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  recurrenceType: RecurrenceType;
  interval?: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  intervalType?: IntervalType;
  startDate: string;
  endDate?: string;
  maxOccurrences?: number;
  tags?: string[];
  notifications?: NotificationInput[];
}

// Mirrors upsertExceptionSchema in src/app/api/exceptions/route.ts.
export interface ExceptionInput {
  ruleId: string;
  originalDate: string;
  cancelled?: boolean;
  overrides?: {
    title?: string;
    startTime?: string;
    endTime?: string;
  };
  position?: number;
}

// Mirrors createTodoSchema / updateTodoSchema in src/app/api/todos/route.ts
// and src/app/api/todos/[id]/route.ts.
export interface TodoInput {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  isPinned?: boolean;
  position?: number;
  tags?: string[];
  notifications?: NotificationInput[];
}

/**
 * Shared fetch wrapper: always sends/expects JSON, parses the response
 * body, and throws an Error (using the route's `{ error }` message when
 * available) for any non-OK response.
 */
async function apiFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    let message = `Request to ${url} failed with status ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      }
    } catch {
      // Response body wasn't JSON — fall back to the generic message above.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// ---------- Schedule ----------

export function fetchSchedule(date: string) {
  return apiFetch(`/api/schedule?date=${encodeURIComponent(date)}`);
}

// Mirrors the response shape of GET /api/schedule-range in
// src/app/api/schedule-range/route.ts: a map keyed by "YYYY-MM-DD", with
// dates that have nothing scheduled simply absent as keys.
export function fetchScheduleRange(from: string, to: string) {
  return apiFetch<Record<string, unknown[]>>(
    `/api/schedule-range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

// ---------- Rules ----------

export function fetchRules() {
  return apiFetch("/api/rules");
}

export function createRule(data: RuleInput) {
  return apiFetch("/api/rules", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateRule(id: string, data: Partial<RuleInput>) {
  return apiFetch(`/api/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Splits a rule at `fromDate` so `data` only applies to occurrences from
 * that date forward — see src/app/api/rules/[id]/split/route.ts. That
 * route is currently a documented placeholder (responds 501), so this
 * call will throw until rule splitting is actually implemented
 * server-side.
 */
export function splitRule(id: string, fromDate: string, data: Partial<RuleInput>) {
  return apiFetch(`/api/rules/${id}/split`, {
    method: "PUT",
    body: JSON.stringify({ splitDate: fromDate, updates: data }),
  });
}

// ---------- Exceptions ----------

// Create-or-update: the backend upserts on the (ruleId, originalDate)
// pair, so this single call covers both cases.
export function upsertException(data: ExceptionInput) {
  return apiFetch("/api/exceptions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------- Todos ----------

export function createTodo(data: TodoInput) {
  return apiFetch("/api/todos", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTodo(id: string, data: Partial<TodoInput>) {
  return apiFetch(`/api/todos/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteTodo(id: string) {
  return apiFetch(`/api/todos/${id}`, { method: "DELETE" });
}

// ---------- Completions ----------

/**
 * Marks (or unmarks) a source complete for a date.
 *
 * The backend's /api/completions route takes an explicit `completed`
 * boolean rather than tracking toggle state itself (see that route's
 * comments) — there's no single-item "is this complete" endpoint to read
 * current state from before flipping it. So this defaults to marking
 * complete (`completed: true`); pass `false` explicitly to unmark. A
 * caller that needs true toggle behavior should track the current
 * completion state itself (e.g. from the /api/schedule response) and pass
 * the opposite value in.
 */
export function toggleCompletion(
  sourceType: "recurrence" | "manual",
  sourceId: string,
  date: string,
  completed: boolean = true,
) {
  return apiFetch("/api/completions", {
    method: "POST",
    body: JSON.stringify({ sourceType, sourceId, date, completed }),
  });
}
