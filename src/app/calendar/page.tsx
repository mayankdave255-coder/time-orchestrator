"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { fetchScheduleRange } from "@/lib/api-utils";

type ViewMode = "month" | "week";

export default function CalendarPage() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // The visible grid spans full weeks (see MonthGrid), so it can include a
  // few days from the previous/next month — fetch that whole range, not
  // just the calendar month, so dots line up with the cells on screen.
  const rangeStart = useMemo(
    () => startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    [currentMonth],
  );
  const rangeEnd = useMemo(
    () => endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 }),
    [currentMonth],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRange() {
      setIsLoading(true);
      try {
        const from = format(rangeStart, "yyyy-MM-dd");
        const to = format(rangeEnd, "yyyy-MM-dd");
        // GET /api/schedule-range -> { [date: string]: TimelineItem[] };
        // a date is a key only if it has at least one item.
        const schedule = await fetchScheduleRange(from, to);
        if (!cancelled) {
          setEventDates(new Set(Object.keys(schedule).filter((date) => schedule[date]?.length > 0)));
        }
      } catch {
        if (!cancelled) {
          setEventDates(new Set());
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRange();
    return () => {
      cancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  function handleDayClick(date: Date) {
    router.push(`/day?date=${format(date, "yyyy-MM-dd")}`);
  }

  // Week view reuses currentMonth as its anchor and shows the week
  // containing the 1st of the visible month, rather than introducing a
  // second "selected day" state. Independent week-by-week navigation
  // (and syncing the selection back to month view) is out of scope here.
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      return day;
    });
  }, [currentMonth]);

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <h1 className="min-w-[10rem] text-center text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </h1>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div className="flex rounded-md border border-slate-300 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("month")}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              viewMode === "month" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Month
          </button>
          <button
            type="button"
            onClick={() => setViewMode("week")}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              viewMode === "week" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Week
          </button>
        </div>
      </div>

      <div className="mt-6">
        {viewMode === "month" ? (
          <MonthGrid currentDate={currentMonth} events={eventDates} onDayClick={handleDayClick} />
        ) : (
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200">
            {weekDays.map((day) => {
              const dateStr = format(day, "yyyy-MM-dd");
              const isToday = dateStr === todayStr;
              const hasEvents = eventDates.has(dateStr);
              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className="flex min-h-[6rem] flex-col items-center gap-1.5 bg-white p-3 text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="text-xs text-slate-500">{format(day, "EEE")}</span>
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full ${
                      isToday ? "bg-amber-500 font-semibold text-white" : "text-slate-900"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {hasEvents && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isLoading && <p className="mt-3 text-xs text-slate-400">Loading schedule…</p>}
    </div>
  );
}
