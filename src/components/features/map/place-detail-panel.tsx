'use client'

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Star, MapPin, Globe, Clock, User, Sparkles } from 'lucide-react';
import { MapPlace } from '@/shared';
import { generatePlaceSummary } from '@/app/actions/generate-place-summary';
import { getTopMenuItems } from '@/app/actions/get-top-menu-items';

interface PlaceDetailPanelProps {
  place: MapPlace;
  onClose: () => void;
  variant?: 'panel' | 'card'; // panel = full-height slide-in, card = compact floating
}

export function PlaceDetailPanel({ place, onClose, variant = 'panel' }: PlaceDetailPanelProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward
  const [activeTab, setActiveTab] = useState<'overview' | 'reviews'>('overview');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [topItems, setTopItems] = useState<string[]>([]);
  const [topItemsLoading, setTopItemsLoading] = useState(false);
  const photos = place.images?.length ? place.images : place.imageUrl ? [place.imageUrl] : [];

  const isRestaurant = place.category === 'restaurant' ||
    ['restaurant', 'cafe', 'bakery', 'bar', 'food', 'meal_takeaway', 'meal_delivery'].includes(place.type ?? '');

  useEffect(() => {
    setActiveTab('overview');
    setPhotoIndex(0);
    setAiSummary(null);
    setTopItems([]);

    if (!place.description) {
      setSummaryLoading(true);
      generatePlaceSummary({
        name: place.name,
        type: place.type ?? null,
        address: place.address ?? null,
        reviews: place.reviews?.map(r => ({ author: r.author, rating: r.rating, text: r.text })) ?? [],
      })
        .then(text => setAiSummary(text || null))
        .catch(err => console.error('[PlaceDetailPanel] Summary error:', err))
        .finally(() => setSummaryLoading(false));
    }

    if (isRestaurant && place.reviews?.length) {
      setTopItemsLoading(true);
      getTopMenuItems({
        name: place.name,
        reviews: place.reviews.map(r => ({ author: r.author, rating: r.rating, text: r.text })),
      })
        .then(items => setTopItems(items))
        .catch(err => console.error('[PlaceDetailPanel] Menu items error:', err))
        .finally(() => setTopItemsLoading(false));
    }
  }, [place.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (next: number) => {
    setDirection(next > photoIndex ? 1 : -1);
    setPhotoIndex(next);
  };

  return (
    <div className={variant === 'panel'
      ? "h-full w-[560px] bg-white shadow-2xl overflow-hidden flex flex-col"
      : "w-80 max-h-[72vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
    }>

      {/* Photo carousel */}
      {photos.length > 0 ? (
        <div className={`relative bg-slate-100 shrink-0 overflow-hidden ${variant === 'panel' ? 'h-72' : 'h-44'}`}>
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.img
              key={photoIndex}
              src={photos[photoIndex]}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d * 80, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: d * -80, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="absolute inset-0 w-full h-full object-cover"
              alt=""
            />
          </AnimatePresence>

          {/* Prev / Next */}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => goTo(Math.max(0, photoIndex - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => goTo(Math.min(photos.length - 1, photoIndex + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 transition-colors z-10"
              >
                <ChevronRight size={16} />
              </button>
              {/* Dot indicators */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === photoIndex ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
              </div>
            </>
          )}

          {/* Close button over photo */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors z-10"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        /* Close button when no photo */
        <div className="flex justify-end p-3 pb-0">
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 transition-colors">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
      )}

      {/* Header: name + meta */}
      <div className="px-6 pt-5 pb-3 space-y-2 shrink-0">
        <h3 className="font-bold text-slate-900 text-xl leading-tight">{place.name}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {place.type && (
            <span className="text-xs text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full capitalize font-medium">
              {place.type.replace(/_/g, ' ')}
            </span>
          )}
          {place.rating != null && (
            <span className="flex items-center gap-1 text-sm font-bold text-yellow-600">
              <Star size={13} className="fill-yellow-400 stroke-yellow-400" />
              {place.rating}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200 px-6 shrink-0">
        {(['overview', 'reviews'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="overflow-y-auto p-6 space-y-4 flex-1">
        {activeTab === 'overview' ? (
          <>
            {/* Description */}
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-700">About</p>
              {summaryLoading ? (
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-full" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-5/6" />
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-4/6" />
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {place.description ?? aiSummary ?? 'No description available for this place.'}
                  </p>
                  {!place.description && aiSummary && (
                    <span className="inline-flex items-center gap-1 text-xs text-indigo-500 font-medium">
                      <Sparkles size={11} />
                      Generated by Gemini
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Top menu items (restaurants only) */}
            {isRestaurant && (topItemsLoading || topItems.length > 0) && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-indigo-400" />
                  Popular dishes
                </p>
                {topItemsLoading ? (
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-6 w-20 bg-slate-100 rounded-full animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {topItems.map(item => (
                      <span key={item} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Address */}
            {place.address && (
              <div className="flex items-start gap-2 text-sm text-slate-500">
                <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>{place.address}</span>
              </div>
            )}

            {/* Opening hours */}
            {place.openingHoursText?.length ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                  <Clock size={14} className="text-slate-400" />
                  Hours
                </div>
                <div className="text-xs text-slate-500 space-y-0.5 pl-5">
                  {place.openingHoursText.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Website */}
            {place.websiteUrl && (
              <a
                href={place.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                <Globe size={14} />
                Visit website
              </a>
            )}
          </>
        ) : (
          /* Reviews tab */
          place.reviews?.length ? (
            <div className="space-y-5">
              {place.reviews.map((review, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {review.authorPhoto ? (
                      <img src={review.authorPhoto} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" alt="" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <User size={14} className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{review.author}</p>
                      <p className="text-xs text-slate-400">{review.relativeTime}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star
                          key={j}
                          size={11}
                          className={j < review.rating ? 'fill-yellow-400 stroke-yellow-400' : 'fill-slate-200 stroke-slate-200'}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">{review.text}</p>
                  {i < place.reviews!.length - 1 && <div className="border-b border-slate-100 pt-1" />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No reviews available.</p>
          )
        )}
      </div>
    </div>
  );
}
