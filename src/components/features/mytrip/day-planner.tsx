'use client'

import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Activity } from '@/db/schema';
import { ItineraryGenerationResponse } from '@/shared';
import { X, GripVertical, MapPin, Sparkles, Star } from 'lucide-react';

export type DayAssignments = Record<string, Activity[]>;

interface DayPlannerProps {
  isOpen: boolean;
  onClose: () => void;
  activities: Activity[];
  dayCount: number;
  onRemove: (id: number) => void;
  onGenerate: (activities: Activity[], dayAssignments?: DayAssignments) => void;
  currentItinerary?: ItineraryGenerationResponse | null;
}

// Draggable activity card
function SortableActivityCard({
  activity,
  onRemove,
}: {
  activity: Activity;
  onRemove: (id: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 shadow-sm group hover:border-indigo-200 transition-colors"
    >
      <button
        className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      {activity.imageUrl ? (
        <img
          src={activity.imageUrl}
          alt={activity.name}
          className="w-10 h-10 rounded-lg object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-slate-300" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{activity.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium capitalize">
            {activity.category}
          </span>
          {activity.rating != null && (
            <span className="flex items-center gap-0.5 text-[10px] text-yellow-600 font-medium">
              <Star className="w-2.5 h-2.5 fill-yellow-400 stroke-yellow-400" />
              {activity.rating}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onRemove(activity.id)}
        className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Overlay card shown while dragging
function DragOverlayCard({ activity }: { activity: Activity }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-indigo-400 shadow-xl">
      <GripVertical className="w-4 h-4 text-indigo-400 shrink-0" />
      {activity.imageUrl ? (
        <img src={activity.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-slate-300" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-800 truncate">{activity.name}</p>
    </div>
  );
}

// Droppable day column
function DayColumn({
  columnId,
  title,
  subtitle,
  activities,
  onRemove,
}: {
  columnId: string;
  title: string;
  subtitle?: string;
  activities: Activity[];
  onRemove: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div>
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">{title}</h4>
          {subtitle && <p className="text-[10px] text-slate-400">{subtitle}</p>}
        </div>
        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
          {activities.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-[60px] rounded-xl border-2 border-dashed p-2 space-y-2 transition-colors ${
          isOver
            ? 'border-indigo-400 bg-indigo-50/50'
            : activities.length === 0
              ? 'border-slate-200 bg-slate-50/50'
              : 'border-slate-200 bg-white/50'
        }`}
      >
        <SortableContext
          items={activities.map(a => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {activities.map(activity => (
            <SortableActivityCard
              key={activity.id}
              activity={activity}
              onRemove={onRemove}
            />
          ))}
        </SortableContext>

        {activities.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4 italic">
            Drag activities here
          </p>
        )}
      </div>
    </div>
  );
}

export function DayPlanner({
  isOpen,
  onClose,
  activities,
  dayCount,
  onRemove,
  onGenerate,
  currentItinerary,
}: DayPlannerProps) {
  // Build columns seeded from saved itinerary (if available)
  const buildColumns = useCallback((): DayAssignments => {
    const cols: DayAssignments = { unassigned: [] };
    for (let i = 1; i <= dayCount; i++) {
      cols[`day-${i}`] = [];
    }

    if (currentItinerary) {
      const assigned = new Set<number>();
      for (const day of currentItinerary.days) {
        const dayKey = `day-${day.day_number}`;
        if (!cols[dayKey]) continue;
        for (const item of day.items) {
          if (item.type === 'commute' || item.type === 'alternative') continue;
          const match =
            activities.find(a => a.name === item.title) ??
            activities.find(a => a.name.toLowerCase() === item.title.toLowerCase());
          if (match && !assigned.has(match.id)) {
            cols[dayKey].push(match);
            assigned.add(match.id);
          }
        }
      }
      cols.unassigned = activities.filter(a => !assigned.has(a.id));
    } else {
      cols.unassigned = [...activities];
    }

    return cols;
  }, [activities, dayCount, currentItinerary]);

  const [columns, setColumns] = useState<DayAssignments>(() => buildColumns());
  const [activeId, setActiveId] = useState<number | null>(null);

  // Sync when activities change (new additions/removals)
  const syncActivities = useCallback(() => {
    setColumns(prev => {
      const allAssigned = new Set(
        Object.values(prev).flat().map(a => a.id)
      );
      const newActivities = activities.filter(a => !allAssigned.has(a.id));
      const validIds = new Set(activities.map(a => a.id));

      const updated: DayAssignments = {};
      for (const [key, col] of Object.entries(prev)) {
        updated[key] = col.filter(a => validIds.has(a.id));
      }
      if (!updated.unassigned) updated.unassigned = [];
      updated.unassigned = [...updated.unassigned, ...newActivities];

      // Ensure day columns exist
      for (let i = 1; i <= dayCount; i++) {
        if (!updated[`day-${i}`]) updated[`day-${i}`] = [];
      }
      return updated;
    });
  }, [activities, dayCount]);

  // Sync whenever activities prop changes
  useEffect(() => { syncActivities(); }, [syncActivities]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const findColumn = (id: number): string | null => {
    for (const [key, items] of Object.entries(columns)) {
      if (items.some(a => a.id === id)) return key;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeColumn = findColumn(active.id as number);
    // over.id could be a column ID or an item ID
    let overColumn = Object.keys(columns).includes(over.id as string)
      ? (over.id as string)
      : findColumn(over.id as number);

    if (!activeColumn || !overColumn || activeColumn === overColumn) return;

    setColumns(prev => {
      const sourceItems = [...prev[activeColumn]];
      const destItems = [...prev[overColumn]];
      const activeIndex = sourceItems.findIndex(a => a.id === active.id);
      if (activeIndex === -1) return prev;

      const [moved] = sourceItems.splice(activeIndex, 1);
      destItems.push(moved);

      return {
        ...prev,
        [activeColumn]: sourceItems,
        [overColumn]: destItems,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeColumn = findColumn(active.id as number);
    const overColumn = Object.keys(columns).includes(over.id as string)
      ? (over.id as string)
      : findColumn(over.id as number);

    if (!activeColumn || !overColumn) return;

    if (activeColumn === overColumn) {
      // Reorder within same column
      setColumns(prev => {
        const items = [...prev[activeColumn]];
        const oldIndex = items.findIndex(a => a.id === active.id);
        const newIndex = items.findIndex(a => a.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return {
          ...prev,
          [activeColumn]: arrayMove(items, oldIndex, newIndex),
        };
      });
    }
  };

  const handleRemove = (activityId: number) => {
    setColumns(prev => {
      const updated: DayAssignments = {};
      for (const [key, items] of Object.entries(prev)) {
        updated[key] = items.filter(a => a.id !== activityId);
      }
      return updated;
    });
    onRemove(activityId);
  };

  const handleGenerate = () => {
    const allActivities = Object.values(columns).flat();
    onGenerate(allActivities, columns);
  };

  const activeActivity = activeId
    ? Object.values(columns).flat().find(a => a.id === activeId)
    : null;

  const totalCount = Object.values(columns).flat().length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[100] flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative ml-auto w-[min(420px,85vw)] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="shrink-0 p-5 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">My Plan</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {totalCount} {totalCount === 1 ? 'place' : 'places'} — drag to assign days
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm text-slate-500 font-medium">No places added yet</p>
              <p className="text-xs text-slate-400 mt-1">Browse and add places to get started</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {/* Unassigned column */}
              <DayColumn
                columnId="unassigned"
                title="Unassigned"
                subtitle="AI will decide the best day"
                activities={columns.unassigned || []}
                onRemove={handleRemove}
              />

              {/* Day columns */}
              {Array.from({ length: dayCount }, (_, i) => i + 1).map(dayNum => (
                <DayColumn
                  key={dayNum}
                  columnId={`day-${dayNum}`}
                  title={`Day ${dayNum}`}
                  activities={columns[`day-${dayNum}`] || []}
                  onRemove={handleRemove}
                />
              ))}

              <DragOverlay>
                {activeActivity ? (
                  <DragOverlayCard activity={activeActivity} />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* Footer — Generate button */}
        <div className="shrink-0 p-5 border-t border-slate-200 bg-white space-y-3">
          <div className="flex items-start gap-2 p-3 bg-indigo-50 rounded-lg">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700">
              Our AI will organize your spots into an optimized schedule. Unassigned activities will be placed on the best day.
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={totalCount === 0}
            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all active:scale-[0.98] shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate Itinerary
          </button>
        </div>
      </div>
    </div>
  );
}
