'use client'

import { useState } from "react";
import { Activity } from "@/db/schema";
import { Check, Clock, Heart, MapPin, Mountain, Plus, Star, Utensils, Landmark, Music, Sparkles } from "lucide-react";

// ─── Category tag config ───────────────────────────────────────────────────────
const CATEGORY_TAG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    attraction:  { label: 'Popular',    className: 'bg-amber-50 text-amber-700',   icon: <Sparkles size={10} /> },
    restaurant:  { label: 'Restaurant', className: 'bg-rose-50 text-rose-700',     icon: <Utensils size={10} /> },
    cafe:        { label: 'Café',       className: 'bg-orange-50 text-orange-700', icon: <Utensils size={10} /> },
    culture:     { label: 'Cultural',   className: 'bg-violet-50 text-violet-700', icon: <Landmark size={10} /> },
    outdoor:     { label: 'Outdoor',    className: 'bg-emerald-50 text-emerald-700', icon: <Mountain size={10} /> },
    nightlife:   { label: 'Nightlife',  className: 'bg-indigo-50 text-indigo-700', icon: <Music size={10} /> },
    activity:    { label: 'Experience', className: 'bg-sky-50 text-sky-700',       icon: <Sparkles size={10} /> },
};

const PRICE_LABEL: Record<string, string> = {
    FREE:           'Free',
    INEXPENSIVE:    '$',
    MODERATE:       '$$',
    EXPENSIVE:      '$$$',
    VERY_EXPENSIVE: '$$$$',
};

function formatDuration(minutes: number | null | undefined): string | null {
    if (!minutes) return null;
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} hr${h > 1 ? 's' : ''}` : `${h}.${Math.round(m / 6)} hrs`;
}

// ─── Card ──────────────────────────────────────────────────────────────────────
interface TripActivityCardProps {
    activity: Activity;
    isAdded: boolean;
    onToggle: () => void;
    onHover?: (id: number | null) => void;
    tripId?: number;
    onClick?: () => void;
}

export function TripActivityCard({ activity, isAdded, onToggle, onHover }: TripActivityCardProps) {
    const [saved, setSaved] = useState(false);

    const tag = CATEGORY_TAG[activity.category ?? 'activity'] ?? CATEGORY_TAG['activity'];
    const price = activity.priceLevel ? PRICE_LABEL[activity.priceLevel] : null;
    const duration = formatDuration(activity.averageDuration);

    return (
        <div
            className="group flex flex-col rounded-[14px] overflow-hidden border border-slate-100 bg-white shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
            onMouseEnter={() => onHover?.(activity.id)}
            onMouseLeave={() => onHover?.(null)}
        >
            {/* ── Image ── */}
            <div className="relative h-44 w-full bg-slate-100 overflow-hidden shrink-0">
                {activity.imageUrl ? (
                    <img
                        src={activity.imageUrl}
                        alt={activity.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-300 bg-slate-50">
                        <MapPin size={32} />
                        <span className="text-xs text-slate-300">No photo</span>
                    </div>
                )}

                {/* Rating — top-left */}
                {activity.rating && (
                    <div className="absolute top-2.5 left-2.5 bg-white/95 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold shadow-sm text-gray-500">
                        <Star size={11} className="fill-yellow-400 stroke-yellow-400" />
                        {activity.rating.toFixed(1)}
                    </div>
                )}

                {/* Save — top-right */}
                <button
                    onClick={e => { e.stopPropagation(); setSaved(s => !s); }}
                    className={`absolute top-2.5 right-2.5 p-1.5 rounded-full shadow-sm border transition-all ${
                        saved
                            ? 'bg-rose-500 border-rose-500 text-white'
                            : 'bg-white/95 border-white/50 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-rose-500'
                    }`}
                    aria-label="Save"
                >
                    <Heart size={13} className={saved ? 'fill-white' : ''} />
                </button>
            </div>

            {/* ── Body ── */}
            <div className="flex flex-col flex-1 px-3.5 pt-3 pb-3.5 gap-2">
                {/* Category tag */}
                <div className={`self-start flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${tag.className}`}>
                    {tag.icon}
                    {tag.label}
                </div>

                {/* Title */}
                <h4 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {activity.name}
                </h4>

                {/* Metadata row */}
                <div className="flex items-center gap-2.5 text-[11px] text-slate-500 flex-wrap">
                    {duration && (
                        <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {duration}
                        </span>
                    )}
                    {price && (
                        <span className="font-medium text-slate-600">{price}</span>
                    )}
                </div>

                {/* Location */}
                {activity.address && (
                    <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                        <MapPin size={10} className="shrink-0 text-slate-300" />
                        {activity.address}
                    </p>
                )}

                {/* CTA */}
                <button
                    onClick={e => { e.stopPropagation(); onToggle(); }}
                    className={`mt-auto w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${
                        isAdded
                            ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                            : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 hover:shadow-sm hover:shadow-indigo-200'
                    }`}
                >
                    {isAdded ? <><Check size={13} /> Added to Trip</> : <><Plus size={13} /> Add to Trip</>}
                </button>
            </div>
        </div>
    );
}
