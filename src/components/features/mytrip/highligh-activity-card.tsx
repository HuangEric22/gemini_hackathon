import { Star, MapPin, Check, Plus } from 'lucide-react';
import Image from 'next/image';
import { type Activity } from '@/db/schema'

// ─── Photo card (used in discovery horizontal scroll) ─────────────────────────
interface DiscoveryActivityCardProps {
    activity: Activity;
    isAdded: boolean;
    onToggle: () => void;
}

export function HighlightActivityCard({ activity, isAdded, onToggle }: DiscoveryActivityCardProps) {
    return (
        <div className="min-w-[240px] group cursor-pointer snap-start shrink-0">
            <div className="relative w-80 h-60 bg-slate-100 rounded-3xl mb-3 overflow-hidden shadow-sm transition-transform duration-300 group-hover:scale-[0.98]">
                {activity.imageUrl ? (
                    <Image
                        src={activity.imageUrl}
                        fill
                        sizes="320px"
                        className="object-cover"
                        alt={activity.name}
                        unoptimized
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <MapPin size={32} />
                    </div>
                )}
                {activity.rating && (
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-xs font-bold shadow-sm text-gray-500">
                        <Star size={12} className="fill-yellow-400 stroke-yellow-400" />
                        {activity.rating}
                    </div>
                )}
                <button
                    onClick={e => { e.stopPropagation(); onToggle(); }}
                    className={`absolute top-3 right-3 p-1.5 rounded-full shadow-sm transition-all border ${
                        isAdded
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white/90 border-white text-slate-600 opacity-0 group-hover:opacity-100 hover:text-indigo-600'
                    }`}
                >
                    {isAdded ? <Check size={14} /> : <Plus size={14} />}
                </button>
            </div>
            <h4 className="font-bold text-slate-900 px-1 truncate">{activity.name}</h4>
            <p className="text-xs text-slate-500 px-1 capitalize">{activity.category?.replace(/_/g, ' ')}</p>
        </div>
    );
}

// ─── Skeleton placeholders for discovery sections ─────────────────────────────
export function HighlightSkeletons() {
    return (
        <>
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="min-w-[240px] h-60 bg-slate-100 animate-pulse rounded-3xl shrink-0" />
            ))}
        </>
    );
}
