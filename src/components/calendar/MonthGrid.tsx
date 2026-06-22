"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

interface MonthGridProps {
  /** Any date within the month to display. */
  currentDate: Date;
  /** "YYYY-MM-DD" strings for every date that has at least one event. */
  events: Set<string>;
  onDayClick: (date: Date) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthGrid({ currentDate, events, onDayClick }: MonthGridProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  // The grid always shows full weeks, so it includes a handful of days
  // from the previous/next month to pad out the first and last rows.
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const today = new Date();

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-medium text-slate-500">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {days.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const inCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const hasEvents = events.has(dateStr);

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onDayClick(day)}
              className="flex min-h-[5.5rem] flex-col items-start gap-1.5 bg-white p-2 text-left transition-colors hover:bg-slate-50"
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                  isToday
                    ? "bg-amber-500 font-semibold text-white"
                    : inCurrentMonth
                      ? "text-slate-900"
                      : "text-slate-300"
                }`}
              >
                {format(day, "d")}
              </span>
              {hasEvents && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
