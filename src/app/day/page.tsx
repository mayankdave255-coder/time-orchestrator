// src/app/day/page.tsx

"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { DayTimeline, type TimelineItem } from "@/components/calendar/DayTimeline";
import { TodoInput } from "@/components/forms/TodoInput";
import { fetchSchedule } from "@/lib/api-utils";

type LoadState = "loading" | "loaded" | "error";

// GET /api/schedule?date=... currently always responds with `items: []`
// (it's a documented placeholder — see src/app/api/schedule/route.ts —
// until schedule computation is implemented server-side). This page is
// wired up for the real response shape it should eventually return.
interface ScheduleResponse {
  date: string;
  items: TimelineItem[];
}

function DayPageContent() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState("loading");
      try {
        const data = (await fetchSchedule(date)) as ScheduleResponse;
        if (!cancelled) {
          setItems(data.items ?? []);
          setState("loaded");
        }
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  // DayTimeline's drag-and-drop and completion toggle both funnel through
  // this single sync point. Per DayTimeline's own comments, reordering is
  // local-only for now (no batch position-persistence endpoint exists
  // yet), so this just mirrors the updated list into state.
  const handleItemUpdate = useCallback((updatedItems: TimelineItem[]) => {
    setItems(updatedItems);
  }, []);

  const handleOptimisticAdd = useCallback((item: TimelineItem) => {
    setItems((current) => [...current, item]);
  }, []);

  const handleCreated = useCallback((tempSourceId: string, createdItem: TimelineItem) => {
    setItems((current) => current.map((item) => (item.sourceId === tempSourceId ? createdItem : item)));
  }, []);

  const handleCreateFailed = useCallback((tempSourceId: string) => {
    setItems((current) => current.filter((item) => item.sourceId !== tempSourceId));
  }, []);

  let displayDate = date;
  try {
    displayDate = format(new Date(`${date}T00:00:00`), "EEEE, MMMM d, yyyy");
  } catch {
    // Malformed ?date= param — fall back to showing the raw string rather
    // than crashing the page.
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">{displayDate}</h1>

      <div className="mt-6">
        {state === "loading" && <p className="text-sm text-slate-400">Loading…</p>}

        {state === "error" && (
          <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn&apos;t load this day&apos;s schedule. Try refreshing.
          </p>
        )}

        {state === "loaded" && items.length === 0 && (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
            Nothing scheduled yet — add something below.
          </p>
        )}

        {state === "loaded" && items.length > 0 && (
          <DayTimeline items={items} date={date} onItemUpdate={handleItemUpdate} />
        )}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-6">
        <TodoInput
          date={date}
          onOptimisticAdd={handleOptimisticAdd}
          onCreated={handleCreated}
          onCreateFailed={handleCreateFailed}
        />
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the App Router (Next.js
// bails out to client-side rendering for this subtree without one), so
// the actual page content lives in DayPageContent above.
export default function DayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
      <DayPageContent />
    </Suspense>
  );
}
