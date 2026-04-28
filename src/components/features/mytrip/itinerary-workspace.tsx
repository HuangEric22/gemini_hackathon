import React, { useState, useEffect } from 'react';
import { Trip, Activity } from '@/db/schema';
import {
  ArrowLeft, Save, RefreshCw, Clock, Trash2, GripVertical,
  MapPin, Sparkles, ChevronDown, ChevronRight, X, Lightbulb, Check, ArrowRightLeft
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { ItineraryGenerationResponse, LegTransport } from '@/shared';
import { LEG_COLORS } from '@/shared/constants';
import { TransportSegment } from './transport-segment';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface ItineraryProps {
  trip: Trip;
  selections: Activity[];
  currentItinerary: ItineraryGenerationResponse | null;
  legTransports?: LegTransport[];
  isComputingRoutes?: boolean;
  onBack: () => void;
  onGenerate: (activities: Activity[], preference?: string) => void;
  onRefreshData: () => void;
  onRegenerateDay?: (dayNumber: number, preference?: string) => void;
  regeneratingDay?: number | null;
  onRemoveItem?: (dayNumber: number, itemIndex: number) => void;
  onSwapAlternative?: (dayNumber: number, altIndex: number, primaryIndex: number) => void;
  onSave?: () => void;
  isSaved?: boolean;
  onActivityClick?: (markerId: string) => void;
  onHoverActivity?: (legIndices: number[]) => void;
  onExpandedDaysChange?: (days: number[]) => void;
  isGenerating?: boolean;
  generatingStatus?: string;
  pace?: 'relaxed' | 'moderate' | 'packed';
  onPaceChange?: (v: 'relaxed' | 'moderate' | 'packed') => void;
  budget?: 'budget' | 'moderate' | 'luxury';
  onBudgetChange?: (v: 'budget' | 'moderate' | 'luxury') => void;
  startTime?: '7:00 AM' | '9:00 AM' | '11:00 AM';
  onStartTimeChange?: (v: '7:00 AM' | '9:00 AM' | '11:00 AM') => void;
  onReorder?: (updated: ItineraryGenerationResponse) => void;
}

// DnD item ID helpers
function itemDndId(dayNum: number, title: string) {
  return `${dayNum}::${title}`;
}

function parseItemDndId(id: string): { dayNum: number; title: string } | null {
  const sep = id.indexOf('::');
  if (sep === -1) return null;
  return { dayNum: parseInt(id.substring(0, sep), 10), title: id.substring(sep + 2) };
}

// Thin wrapper that makes an element sortable via dnd-kit
function SortableItemWrapper({
  id,
  children,
}: {
  id: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const dragHandle = (
    <button
      className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 touch-none"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {children(dragHandle)}
    </div>
  );
}

// Droppable zone for each day (allows drops into empty days)
function DroppableDay({ dayNum, children }: { dayNum: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayNum}` });
  return (
    <div
      ref={setNodeRef}
      className={`p-4 pt-0 space-y-0 min-h-[40px] transition-colors ${isOver ? 'bg-indigo-50/40' : ''}`}
    >
      {children}
    </div>
  );
}

// Simple overlay card shown while dragging
function DragOverlayCard({ title, imageUrl }: { title: string; imageUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 border-indigo-400 shadow-xl max-w-md">
      <GripVertical className="w-4 h-4 text-indigo-400 shrink-0" />
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-slate-300" />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-800 truncate">{title}</p>
    </div>
  );
}

export const ItineraryWorkspace = ({
  trip,
  selections,
  currentItinerary,
  legTransports = [],
  isComputingRoutes = false,
  onBack,
  onGenerate,
  onRefreshData,
  onRegenerateDay,
  regeneratingDay = null,
  onRemoveItem,
  onSwapAlternative,
  onSave,
  isSaved,
  onActivityClick,
  onHoverActivity,
  onExpandedDaysChange,
  isGenerating = false,
  generatingStatus = 'Building your itinerary...',
  pace = 'moderate',
  onPaceChange,
  budget = 'moderate',
  onBudgetChange,
  startTime = '9:00 AM',
  onStartTimeChange,
  onReorder,
}: ItineraryProps) => {
  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const [preference, setPreference] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [activeDrag, setActiveDrag] = useState<{ title: string; imageUrl: string | null } | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Notify parent of initial expanded days on mount
  useEffect(() => {
    onExpandedDaysChange?.(expandedDays);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = (dayNum: number) => {
    const next = expandedDays.includes(dayNum)
      ? expandedDays.filter(d => d !== dayNum)
      : [...expandedDays, dayNum];
    setExpandedDays(next);
    onExpandedDaysChange?.(next);
  };

  // Build lookup map: activity name → imageUrl (case-insensitive)
  const imageMap = new Map<string, string>();
  selections.forEach(a => {
    if (a.imageUrl) imageMap.set(a.name.toLowerCase(), a.imageUrl);
  });

  const findImage = (title: string): string | null => {
    const exact = imageMap.get(title.toLowerCase());
    if (exact) return exact;
    for (const [key, url] of imageMap) {
      if (key.includes(title.toLowerCase()) || title.toLowerCase().includes(key)) return url;
    }
    return null;
  };

  const dismissSuggestion = (dayNum: number, idx: number) => {
    setDismissedSuggestions(prev => new Set(prev).add(`${dayNum}-${idx}`));
  };

  // ─── DnD Handlers ───────────────────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    const parsed = parseItemDndId(event.active.id as string);
    if (!parsed || !currentItinerary) return;
    const day = currentItinerary.days.find(d => d.day_number === parsed.dayNum);
    const item = day?.items.find(i => i.title === parsed.title && i.type !== 'commute' && i.type !== 'alternative');
    if (item) setActiveDrag({ title: item.title, imageUrl: findImage(item.title) });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || !currentItinerary || !onReorder) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const activeParsed = parseItemDndId(activeId);
    if (!activeParsed) return;

    // Determine target day: either from a sortable item ID or a droppable day ID
    const overParsed = parseItemDndId(overId);
    const targetDayNum = overParsed
      ? overParsed.dayNum
      : overId.startsWith('day-')
        ? parseInt(overId.replace('day-', ''), 10)
        : null;

    if (targetDayNum === null) return;

    const sourceDayNum = activeParsed.dayNum;

    // Deep clone the itinerary
    const updated: ItineraryGenerationResponse = {
      days: currentItinerary.days.map(d => ({
        ...d,
        items: d.items.map(i => ({ ...i })),
      })),
    };

    const sourceDay = updated.days.find(d => d.day_number === sourceDayNum);
    const targetDay = updated.days.find(d => d.day_number === targetDayNum);
    if (!sourceDay || !targetDay) return;

    if (sourceDayNum === targetDayNum) {
      // Within-day reorder
      const filtered = sourceDay.items.filter(i => i.type !== 'commute' && i.type !== 'alternative');
      const oldIdx = filtered.findIndex(i => i.title === activeParsed.title);
      const newIdx = overParsed ? filtered.findIndex(i => i.title === overParsed.title) : filtered.length;
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;

      const reordered = arrayMove(filtered, oldIdx, newIdx);
      const alts = sourceDay.items.filter(i => i.type === 'alternative');
      // Strip commutes since order changed — they'll recompute
      sourceDay.items = [...reordered, ...alts];
    } else {
      // Cross-day move
      const filtered = sourceDay.items.filter(i => i.type !== 'commute' && i.type !== 'alternative');
      const itemIdx = filtered.findIndex(i => i.title === activeParsed.title);
      if (itemIdx === -1) return;

      const [movedItem] = filtered.splice(itemIdx, 1);
      const sourceAlts = sourceDay.items.filter(i => i.type === 'alternative');
      sourceDay.items = [...filtered, ...sourceAlts];

      // Add to target day
      const targetFiltered = targetDay.items.filter(i => i.type !== 'commute' && i.type !== 'alternative');
      const targetAlts = targetDay.items.filter(i => i.type === 'alternative');
      const insertIdx = overParsed
        ? targetFiltered.findIndex(i => i.title === overParsed.title)
        : targetFiltered.length;
      targetFiltered.splice(insertIdx === -1 ? targetFiltered.length : insertIdx, 0, movedItem);
      targetDay.items = [...targetFiltered, ...targetAlts];
    }

    onReorder(updated);
  };

  // EMPTY STATE
  if (!currentItinerary && selections.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-white">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Sparkles className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-xl font-bold text-slate-900">Nothing generated yet</h3>
        <p className="text-slate-500 mt-2 max-w-xs">Select places in the browsing view, then click Generate.</p>
        <button onClick={onBack} className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-full font-bold">Go to Browsing</button>
      </div>
    );
  }

  return (
    <main className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h2 className="font-bold text-slate-900">Itinerary Preview</h2>
            <p className="text-xs text-slate-500 font-medium italic">Adjusting route for {trip.destination}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-all active:scale-95 ${
              isSaved
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isSaved ? (
              <><Check className="w-4 h-4" /> Saved!</>
            ) : (
              <><Save className="w-4 h-4" /> Save Itinerary</>
            )}
          </button>
        </div>
      </header>

      {/* Regeneration Input Box + Settings */}
      <div className="px-6 pt-4 pb-5 bg-white border-b border-slate-200 space-y-3">
        {/* Settings row */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {/* Pace */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold uppercase tracking-wide">Pace</span>
            {(['relaxed', 'moderate', 'packed'] as const).map(p => (
              <button key={p} onClick={() => onPaceChange?.(p)}
                className={`px-2.5 py-1 rounded-full font-semibold capitalize transition-colors ${pace === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {p}
              </button>
            ))}
          </div>
          {/* Budget */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold uppercase tracking-wide">Budget</span>
            {(['budget', 'moderate', 'luxury'] as const).map(b => (
              <button key={b} onClick={() => onBudgetChange?.(b)}
                className={`px-2.5 py-1 rounded-full font-semibold capitalize transition-colors ${budget === b ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {b}
              </button>
            ))}
          </div>
          {/* Start Time */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold uppercase tracking-wide">Start</span>
            {(['7:00 AM', '9:00 AM', '11:00 AM'] as const).map(t => (
              <button key={t} onClick={() => onStartTimeChange?.(t)}
                className={`px-2.5 py-1 rounded-full font-semibold transition-colors ${startTime === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        {/* Preference input */}
        <div className="max-w-3xl relative">
          <input
            type="text"
            value={preference}
            onChange={(e) => setPreference(e.target.value)}
            placeholder="Change preference (e.g. 'Add more museums' or 'Start later')"
            className="w-full pl-4 pr-32 py-3 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
          <button
            onClick={() => onGenerate(selections, preference)}
            disabled={isGenerating}
            className="absolute right-2 top-1.5 bottom-1.5 px-4 bg-white text-indigo-600 border border-indigo-100 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} /> {isGenerating ? 'Generating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      {/* Multi-Day Accordion or Loading State */}
      {isGenerating ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
            <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-indigo-500" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">{generatingStatus}</h3>
          <p className="text-sm text-slate-500 mt-2 max-w-xs">
            Our AI is optimizing your schedule based on locations, travel times, and preferences.
          </p>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-8 space-y-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
        {(() => {
          let globalOrder = 0;   // matches map marker numbering
          let globalLegIdx = 0;  // matches polyline color index

          return currentItinerary?.days.map((day, dayIndex) => {
            const dayNum = day.day_number;
            const isExpanded = expandedDays.includes(dayNum);
            const filtered = day.items.filter(i => i.type !== 'commute' && i.type !== 'alternative');
            const alternatives = day.items.filter(i => i.type === 'alternative');

            // Cross-day leg: arriving from previous day's last item to this day's first
            const crossDayArrivingLegIdx = (dayIndex > 0 && filtered.length > 0) ? globalLegIdx++ : -1;

            // Pre-compute order numbers and per-day local order for marker IDs
            const dayItemOrders: number[] = [];
            const dayLocalOrders: number[] = [];
            let localOrder = 0;
            for (const item of filtered) {
              globalOrder++;
              localOrder++;
              dayItemOrders.push(globalOrder);
              dayLocalOrders.push(localOrder);
            }
            // Pre-compute leg indices for this day (within-day legs only)
            const dayLegIndices: number[] = [];
            for (let i = 0; i < filtered.length - 1; i++) {
              dayLegIndices.push(globalLegIdx);
              globalLegIdx++;
            }

            // DnD sortable IDs for this day
            const sortableIds = filtered.map(item => itemDndId(dayNum, item.title));

            return (
              <div key={dayNum} className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
                <div className="flex items-center">
                  <button
                    onClick={() => toggleDay(dayNum)}
                    className="flex-1 flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div>
                      <h3 className="font-black text-slate-800">Day {dayNum}</h3>
                      <p className="text-xs text-slate-400 font-medium italic">{day.brief_description}</p>
                    </div>
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400" /> : <ChevronRight className="w-5 h-5 text-slate-400" />}
                  </button>
                  {onRegenerateDay && (
                    <button
                      onClick={e => { e.stopPropagation(); onRegenerateDay(dayNum, preference || undefined); }}
                      disabled={regeneratingDay === dayNum || isGenerating}
                      title="Regenerate this day"
                      className="mr-3 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-4 h-4 ${regeneratingDay === dayNum ? 'animate-spin text-indigo-500' : ''}`} />
                    </button>
                  )}
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden bg-slate-50/30"
                    >
                      <DroppableDay dayNum={dayNum}>
                        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                        {filtered.map((item, idx) => {
                          const isSuggested = item.is_suggested === true;
                          const isDismissed = dismissedSuggestions.has(`${dayNum}-${idx}`);
                          if (isDismissed) return null;

                          const imageUrl = findImage(item.title);
                          const orderNum = dayItemOrders[idx];
                          const dndId = itemDndId(dayNum, item.title);

                          // Find matching transport leg between this item and the next
                          const nextItem = filtered[idx + 1];
                          const leg = nextItem
                            ? legTransports.find(
                                l => l.originTitle === item.title && l.destinationTitle === nextItem.title,
                              )
                            : undefined;
                          const legColor = idx < dayLegIndices.length
                            ? LEG_COLORS[dayLegIndices[idx] % LEG_COLORS.length]
                            : undefined;

                          const departingColor = legColor;

                          // Hover handler: highlight departing leg (to next destination) on map
                          const handleMouseEnter = () => {
                            if (idx < dayLegIndices.length) {
                              onHoverActivity?.([dayLegIndices[idx]]);
                            }
                          };

                          return (
                            <SortableItemWrapper key={dndId} id={dndId}>
                              {(dragHandle) => (
                                <div>
                                  {/* Activity Card */}
                                  <div
                                    className={`flex items-center gap-4 p-4 rounded-xl transition-all shadow-sm group cursor-pointer ${
                                      isSuggested
                                        ? 'bg-amber-50/60 border-2 border-dashed border-amber-200 hover:border-amber-300'
                                        : 'bg-white border border-slate-200 hover:border-indigo-200'
                                    }`}
                                    onClick={() => onActivityClick?.(`itin-${dayNum}-${dayLocalOrders[idx]}`)}
                                    onMouseEnter={handleMouseEnter}
                                    onMouseLeave={() => onHoverActivity?.([])}
                                  >
                                    {/* Drag handle */}
                                    {dragHandle}

                                    {/* Route color dot — matches departing polyline */}
                                    {departingColor && (
                                      <div
                                        className="w-2.5 h-2.5 rounded-full shrink-0 -ml-1 mr-1"
                                        style={{ backgroundColor: departingColor }}
                                      />
                                    )}

                                    {/* Order number badge — matches map marker */}
                                    <div
                                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                                      style={isSuggested
                                        ? { background: '#fef3c7', color: '#92400e', border: '2px dashed #f59e0b' }
                                        : { background: '#4f46e5', color: '#ffffff', border: '2px solid #3730a3' }
                                      }
                                    >
                                      {orderNum}
                                    </div>

                                    {/* Time Column */}
                                    <div className="flex flex-col items-center justify-center min-w-[70px] text-[10px] font-bold text-slate-500 bg-slate-50 py-2 rounded-lg border border-slate-100">
                                      <span>{item.start_time}</span>
                                      <div className="h-2 w-[1px] bg-slate-200 my-1"></div>
                                      <span>{item.end_time}</span>
                                    </div>

                                    {/* Thumbnail */}
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt={item.title}
                                        className="w-12 h-12 rounded-lg object-cover shrink-0"
                                      />
                                    ) : (
                                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
                                        isSuggested ? 'bg-amber-100' : 'bg-slate-100'
                                      }`}>
                                        {isSuggested ? (
                                          <Lightbulb className="w-5 h-5 text-amber-400" />
                                        ) : (
                                          <MapPin className="w-5 h-5 text-slate-300" />
                                        )}
                                      </div>
                                    )}

                                    {/* Content Column */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-slate-800 text-sm truncate">{item.title}</h4>
                                        {isSuggested ? (
                                          <span className="shrink-0 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter flex items-center gap-0.5">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            suggested
                                          </span>
                                        ) : (
                                          <span className="shrink-0 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                                            {item.type}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1 italic">
                                        {item.description || "No description provided."}
                                      </p>
                                    </div>

                                    {/* Action Column */}
                                    {isSuggested ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); dismissSuggestion(dayNum, idx); }}
                                        className="p-2 text-amber-300 hover:text-amber-600 transition-all"
                                        title="Dismiss suggestion"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); onRemoveItem?.(dayNum, idx); }}
                                        className="p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                        title="Remove from itinerary"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>

                                  {/* Alternative options for this slot */}
                                  {alternatives.length > 0 && (() => {
                                    const slotAlts = alternatives.filter(alt => {
                                      return alt.start_time === item.start_time || alt.end_time === item.end_time;
                                    });
                                    if (slotAlts.length === 0) return null;
                                    return (
                                      <div className="ml-10 mt-1 mb-1 space-y-1">
                                        {slotAlts.map((alt, altIdx) => (
                                          <div
                                            key={`alt-${dayNum}-${altIdx}`}
                                            className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-slate-500 group/alt"
                                          >
                                            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold truncate">{alt.title}</p>
                                              {alt.description && (
                                                <p className="text-[10px] text-slate-400 line-clamp-1 italic">{alt.description}</p>
                                              )}
                                            </div>
                                            <span className="shrink-0 text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">
                                              alt
                                            </span>
                                            <button
                                              onClick={() => {
                                                const altFullIdx = day.items.indexOf(alt);
                                                const primaryFullIdx = day.items.indexOf(item);
                                                if (altFullIdx !== -1 && primaryFullIdx !== -1) {
                                                  onSwapAlternative?.(dayNum, altFullIdx, primaryFullIdx);
                                                }
                                              }}
                                              className="shrink-0 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 opacity-0 group-hover/alt:opacity-100 transition-all px-2 py-1 rounded hover:bg-indigo-50"
                                            >
                                              Swap in
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}

                                  {/* Transport segment between consecutive activities */}
                                  {nextItem && !dismissedSuggestions.has(`${dayNum}-${filtered.indexOf(nextItem)}`) && (
                                    <TransportSegment
                                      leg={leg ?? { originTitle: item.title, destinationTitle: nextItem.title }}
                                      isLoading={isComputingRoutes && !leg}
                                      routeColor={legColor}
                                    />
                                  )}
                                </div>
                              )}
                            </SortableItemWrapper>
                          );
                        })}
                        </SortableContext>

                        {filtered.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-4 italic">
                            Drag activities here
                          </p>
                        )}
                      </DroppableDay>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          });
        })()}

        <DragOverlay>
          {activeDrag ? (
            <DragOverlayCard title={activeDrag.title} imageUrl={activeDrag.imageUrl} />
          ) : null}
        </DragOverlay>
        </DndContext>
      </div>
      )}
    </main>
  );
};
