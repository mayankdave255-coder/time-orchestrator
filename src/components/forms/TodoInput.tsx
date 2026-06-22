// src/components/forms/TodoInput.tsx

"use client";

import { useState, type FormEvent } from "react";
import type { TimelineItem } from "@/components/calendar/DayTimeline";
import { createTodo } from "@/lib/api-utils";

interface CreatedTodoResponse {
  todo: {
    id: string;
    title: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    isPinned: boolean;
    position: number | null;
    tags: string[];
  };
}

interface TodoInputProps {
  /** "YYYY-MM-DD" — the day this todo is being added to. */
  date: string;
  /** Called immediately with a temp item, before the API call resolves. */
  onOptimisticAdd: (item: TimelineItem) => void;
  /** Called once creation succeeds, to swap the temp item for the real one. */
  onCreated: (tempSourceId: string, createdItem: TimelineItem) => void;
  /** Called if creation fails, so the caller can remove the temp item. */
  onCreateFailed: (tempSourceId: string) => void;
}

export function TodoInput({ date, onOptimisticAdd, onCreated, onCreateFailed }: TodoInputProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setError(null);
    const tempId = `temp-${Date.now()}`;

    const optimisticItem: TimelineItem = {
      sourceType: "manual",
      sourceId: tempId,
      date,
      title: trimmedTitle,
      startTime,
      endTime,
      type: "manual",
      isPinned,
      isCompleted: false,
      conflict: false,
      // There's no full item list here to compute a real "next" position
      // from — Date.now() reliably sorts after anything added earlier
      // today, until the server assigns a real position.
      position: Date.now(),
      tags: [],
    };

    onOptimisticAdd(optimisticItem);

    // Clear the form right away — the optimistic item is already showing
    // in the timeline.
    setTitle("");
    setStartTime("");
    setEndTime("");
    setIsPinned(false);

    try {
      const result = (await createTodo({
        title: trimmedTitle,
        date,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        isPinned,
      })) as CreatedTodoResponse;

      const todo = result.todo;
      onCreated(tempId, {
        sourceType: "manual",
        sourceId: todo.id,
        date: todo.date,
        title: todo.title,
        startTime: todo.startTime ?? "",
        endTime: todo.endTime ?? "",
        type: "manual",
        isPinned: todo.isPinned,
        isCompleted: false,
        conflict: false,
        position: todo.position ?? optimisticItem.position,
        tags: todo.tags ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that — try again.");
      onCreateFailed(tempId);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
        Add a todo
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Start
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        End
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={isPinned}
          onChange={(e) => setIsPinned(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        Pin
      </label>
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Add
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
