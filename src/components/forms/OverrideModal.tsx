"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { TimelineItem } from "@/components/calendar/DayTimeline";
import { splitRule, updateTodo, upsertException } from "@/lib/api-utils";

interface OverrideModalProps {
  item: TimelineItem;
  onClose: () => void;
  onUpdate: (updatedItem: TimelineItem) => void;
}

type RecurrenceTab = "this" | "following";

interface FormFieldsProps {
  title: string;
  setTitle: (value: string) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  endTime: string;
  setEndTime: (value: string) => void;
}

function FormFields({ title, setTitle, startTime, setStartTime, endTime, setEndTime }: FormFieldsProps) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm text-slate-700">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
          Start time
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-slate-700">
          End time
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </label>
      </div>
    </>
  );
}

export function OverrideModal({ item, onClose, onUpdate }: OverrideModalProps) {
  const [tab, setTab] = useState<RecurrenceTab>("this");
  const [title, setTitle] = useState(item.title);
  const [startTime, setStartTime] = useState(item.startTime);
  const [endTime, setEndTime] = useState(item.endTime);
  const [isPinned, setIsPinned] = useState(item.isPinned);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isRecurrence = item.sourceType === "recurrence";

  async function handleEditThisSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await upsertException({
        ruleId: item.sourceId,
        originalDate: item.date,
        cancelled: false,
        overrides: { title, startTime, endTime },
      });
      onUpdate({ ...item, title, startTime, endTime, type: "modified" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelOccurrence() {
    setIsSubmitting(true);
    setError(null);
    try {
      await upsertException({ ruleId: item.sourceId, originalDate: item.date, cancelled: true });
      onUpdate({ ...item, type: "cancelled" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel this occurrence");
    } finally {
      setIsSubmitting(false);
    }
  }

  // /api/rules/[id]/split is currently a documented placeholder (responds
  // 501 — see that route's comments for why), so this submit will surface
  // an error until rule splitting is actually implemented server-side.
  async function handleEditFollowingSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await splitRule(item.sourceId, item.date, { title, startTime, endTime });
      onUpdate({ ...item, title, startTime, endTime, type: "modified" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update following occurrences");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await updateTodo(item.sourceId, { title, startTime, endTime, isPinned });
      onUpdate({ ...item, title, startTime, endTime, isPinned });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit item"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Edit item</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isRecurrence ? (
          <>
            <div className="mt-4 flex gap-1 rounded-md border border-slate-300 p-0.5">
              <button
                type="button"
                onClick={() => setTab("this")}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                  tab === "this" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Edit This
              </button>
              <button
                type="button"
                onClick={() => setTab("following")}
                className={`flex-1 rounded px-3 py-1.5 text-sm font-medium ${
                  tab === "following" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Edit All Following
              </button>
            </div>

            <form
              onSubmit={tab === "this" ? handleEditThisSubmit : handleEditFollowingSubmit}
              className="mt-4 flex flex-col gap-3"
            >
              <FormFields
                title={title}
                setTitle={setTitle}
                startTime={startTime}
                setStartTime={setStartTime}
                endTime={endTime}
                setEndTime={setEndTime}
              />

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="mt-1 flex items-center justify-between gap-2">
                {tab === "this" ? (
                  <button
                    type="button"
                    onClick={handleCancelOccurrence}
                    disabled={isSubmitting}
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    Cancel this occurrence
                  </button>
                ) : (
                  <span className="max-w-[12rem] text-xs text-slate-400">
                    Applies from {item.date} onward.
                  </span>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col gap-3">
            <FormFields
              title={title}
              setTitle={setTitle}
              startTime={startTime}
              setStartTime={setStartTime}
              endTime={endTime}
              setEndTime={setEndTime}
            />

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              Pinned (outranks other manual todos in conflicts)
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="mt-1 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {isSubmitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
