// src/app/api/schedule/route.ts
//
// Returns the computed timeline for a single day: recurring occurrences
// (resolved against Exceptions) merged with manual todos, ordered and
// flagged according to the conflict priority order — Exception override >
// Pinned manual todo > Standard manual todo > Unmodified recurring
// instance — with overlaps flagged, never auto-resolved. The actual merge
// lives in src/lib/schedule.ts (shared with /api/schedule-range, which
// runs the same logic across a date range in one pass).

import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/get-current-user-id';
import { buildScheduleForDate } from '@/lib/schedule';
import { dateStringSchema } from '@/lib/validation/common';

// GET /api/schedule?date=YYYY-MM-DD
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

  const items = await buildScheduleForDate(userId, date);

  return NextResponse.json({ date, items }, { status: 200 });
}
