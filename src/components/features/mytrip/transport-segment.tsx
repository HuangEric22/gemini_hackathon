'use client'

import { useState } from 'react';
import { Footprints, Bus, Car, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LegTransport, TransportOption } from '@/shared';

interface TransportSegmentProps {
  leg: LegTransport;
  isLoading?: boolean;
  routeColor?: string; // matches the polyline color on the map
}

const MODE_CONFIG = {
  walking: { icon: Footprints, label: 'Walk', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', activeBg: 'bg-emerald-100' },
  transit: { icon: Bus, label: 'Transit', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', activeBg: 'bg-blue-100' },
  driving: { icon: Car, label: 'Drive', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', activeBg: 'bg-orange-100' },
} as const;

function ModeButton({
  option,
  isFastest,
  isExpanded,
  onClick,
}: {
  option: TransportOption | undefined;
  isFastest: boolean;
  isExpanded: boolean;
  onClick: () => void;
}) {
  if (!option) return null;

  const config = MODE_CONFIG[option.mode];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
        isExpanded
          ? `${config.activeBg} ${config.border} ${config.color}`
          : isFastest
            ? `${config.bg} ${config.border} ${config.color}`
            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{option.duration}</span>
      {isFastest && !isExpanded && (
        <span className="text-[9px] uppercase tracking-wider opacity-60">fastest</span>
      )}
    </button>
  );
}

export function TransportSegment({ leg, isLoading, routeColor }: TransportSegmentProps) {
  const [expandedMode, setExpandedMode] = useState<TransportOption['mode'] | null>(null);

  const options = [leg.walking, leg.transit, leg.driving].filter(Boolean) as TransportOption[];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-2 px-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Computing routes...</span>
        </div>
      </div>
    );
  }

  if (options.length === 0) return null;

  // Find the fastest option
  const fastest = options.reduce((a, b) => a.durationSeconds < b.durationSeconds ? a : b);

  return (
    <div className="my-1 mx-4">
      {/* Mode buttons row */}
      <div className="flex items-center gap-2 py-1.5">
        <div className="flex-1 h-px" style={{ backgroundColor: routeColor ?? '#e2e8f0' }} />
        {options.map(option => (
          <ModeButton
            key={option.mode}
            option={option}
            isFastest={option.mode === fastest.mode}
            isExpanded={expandedMode === option.mode}
            onClick={() => setExpandedMode(
              expandedMode === option.mode ? null : option.mode,
            )}
          />
        ))}
        <div className="flex-1 h-px" style={{ backgroundColor: routeColor ?? '#e2e8f0' }} />
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expandedMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {(() => {
              const opt = options.find(o => o.mode === expandedMode);
              if (!opt) return null;
              const config = MODE_CONFIG[opt.mode];
              return (
                <div className={`mx-auto max-w-xs rounded-lg p-3 text-xs space-y-1 ${config.bg} border ${config.border}`}>
                  <div className="flex justify-between font-semibold">
                    <span className={config.color}>{config.label}</span>
                    <span className="text-slate-600">{opt.distance}</span>
                  </div>
                  <div className="text-slate-500">
                    {opt.duration} — {leg.originTitle} to {leg.destinationTitle}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
