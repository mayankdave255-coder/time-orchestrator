// src/app/api/schedule-range/route.ts
//
// Range version of /api/schedule: the calendar's month view needs to know
// which days have anything scheduled across a whole visible month at
// once, not one request per day. Backed by the same merge logic in
// src/lib/schedule.ts (buildScheduleRange loads rules/exceptions/todos/
// completions once for the whole window and generates occurrences across
// it in one pass, rather than looping a per-day query).

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { buildScheduleRange } from '@/lib/schedule';
import { dateStringSchema } from '@/lib/validation/common';

// GET /api/schedule-range?from=YYYY-MM-DD&to=YYYY-MM-DD
// -> { [date: string]: TimelineItem[] } — every date in [from, to] that
// has at least one item is a key; dates with nothing scheduled are simply
// absent (not present as an empty array).
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Query params "from" and "to" are required (YYYY-MM-DD)' },
      { status: 400 },
    );
  }

  const fromCheck = dateStringSchema.safeParse(from);
  if (!fromCheck.success) {
    return NextResponse.json({ error: 'Query param "from" must be YYYY-MM-DD' }, { status: 400 });
  }
  const toCheck = dateStringSchema.safeParse(to);
  if (!toCheck.success) {
    return NextResponse.json({ error: 'Query param "to" must be YYYY-MM-DD' }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: '"from" must not be after "to"' }, { status: 400 });
  }

  const schedule = await buildScheduleRange(userId, from, to);

  return NextResponse.json(schedule, { status: 200 });
}
