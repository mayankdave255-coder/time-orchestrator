"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toggleCompletion } from "@/lib/api-utils";
import { OverrideModal } from "@/components/forms/OverrideModal";

// Assumed shape for items returned by GET /api/schedule?date=... once that
// route is filled in (it's currently a placeholder — see
// src/app/api/schedule/route.ts — and always responds with `items: []`).
// `type` maps directly to the four badges this component renders.
export type TimelineItemType = "recurring" | "modified" | "manual" | "cancelled";

export interface TimelineItem {
  sourceType: "recurrence" | "manual";
  /** RecurrenceRule.id for recurrence items, ManualTodo.id for manual ones. */
  sourceId: string;
  /** "YYYY-MM-DD" — this occurrence/todo's own date. */
  date: string;
  title: string;
  /** "HH:mm", or "" if no time block is set (manual todos only). */
  startTime: string;
  endTime: string;
  type: TimelineItemType;
  isPinned: boolean;
  isCompleted: boolean;
  conflict: boolean;
  position: number;
  tags: string[];
}

interface DayTimelineProps {
  items: TimelineItem[];
  date: string;
  onItemUpdate: (items: TimelineItem[]) => void;
}

const TYPE_BADGE: Record<TimelineItemType, { label: string; className: string }> = {
  recurring: { label: "Recurring", className: "bg-blue-100 text-blue-700" },
  modified: { label: "Modified", className: "bg-amber-100 text-amber-700" },
  manual: { label: "Manual", className: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-700" },
};

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 text-amber-600" aria-hidden="true">
      <path d="M12 2a5 5 0 0 0-5 5c0 2.5 2 4.6 4 6.6L11 22l1-8.4c2-2 4-4.1 4-6.6a5 5 0 0 0-5-5Z" />
    </svg>
  );
}

function sortItems(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.startTime.localeCompare(b.startTime);
  });
}

interface SortableRowProps {
  item: TimelineItem;
  onToggleComplete: (item: TimelineItem) => void;
  onOpenModal: (item: TimelineItem) => void;
}

function SortableRow({ item, onToggleComplete, onOpenModal }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.sourceId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const badge = TYPE_BADGE[item.type];
  const hasTime = item.startTime !== "" && item.endTime !== "";

  return (
    <li
      ref={setNodeRef}
      style={style}
      onClick={() => onOpenModal(item)}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
        item.conflict ? "border-slate-200 border-l-4 border-l-red-500" : "border-slate-200"
      } ${isDragging ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="mt-1 cursor-grab touch-none select-none text-slate-300 hover:text-slate-500"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      <input
        type="checkbox"
        checked={item.isCompleted}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleComplete(item)}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        aria-label={`Mark "${item.title}" complete`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`truncate text-sm font-medium ${
              item.type === "cancelled" ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {item.title}
          </span>
          {item.isPinned && <PinIcon />}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.label}
          </span>
          {item.conflict && <span className="text-xs font-medium text-red-600">Conflict</span>}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          {hasTime ? `${item.startTime} – ${item.endTime}` : "No time set"}
        </p>
      </div>
    </li>
  );
}

export function DayTimeline({ items, date, onItemUpdate }: DayTimelineProps) {
  const [activeItem, setActiveItem] = useState<TimelineItem | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const sorted = sortItems(items);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sorted.findIndex((item) => item.sourceId === active.id);
    const newIndex = sorted.findIndex((item) => item.sourceId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex).map((item, index) => ({
      ...item,
      position: index,
    }));

    // Local-only for now: there's no batch position-persistence endpoint
    // yet (see /api/todos and /api/exceptions, which only persist one
    // item at a time), so this just updates client state via
    // onItemUpdate. Wire this up to a real persistence call once such an
    // endpoint exists.
    onItemUpdate(reordered);
  }

  async function handleToggleComplete(item: TimelineItem) {
    const nextCompleted = !item.isCompleted;
    const optimistic = items.map((i) =>
      i.sourceId === item.sourceId ? { ...i, isCompleted: nextCompleted } : i,
    );
    onItemUpdate(optimistic);

    try {
      await toggleCompletion(item.sourceType, item.sourceId, date, nextCompleted);
    } catch {
      onItemUpdate(items); // roll back to the pre-toggle state
    }
  }

  function handleModalUpdate(updatedItem: TimelineItem) {
    onItemUpdate(items.map((i) => (i.sourceId === updatedItem.sourceId ? updatedItem : i)));
    setActiveItem(null);
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map((i) => i.sourceId)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {sorted.map((item) => (
              <SortableRow
                key={item.sourceId}
                item={item}
                onToggleComplete={handleToggleComplete}
                onOpenModal={setActiveItem}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      {activeItem && (
        <OverrideModal item={activeItem} onClose={() => setActiveItem(null)} onUpdate={handleModalUpdate} />
      )}
    </>
  );
}
