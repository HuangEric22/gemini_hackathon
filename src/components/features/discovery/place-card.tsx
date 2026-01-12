// components/PlaceCard.tsx
import { Heart, Plus } from 'lucide-react';

export function PlaceCard({ title }: { title: string }) {
  return (
    <div className="min-w-[180px] h-[220px] bg-zinc-100 rounded-xl p-4 flex flex-col justify-between relative group cursor-pointer hover:bg-zinc-200 transition-colors">
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="p-1 bg-white rounded-full shadow-sm hover:text-red-500"><Heart size={14} /></button>
        <button className="p-1 bg-white rounded-full shadow-sm hover:text-indigo-500"><Plus size={14} /></button>
      </div>
      <div className="mt-auto">
        <p className="font-bold text-sm text-zinc-800">{title}</p>
      </div>
    </div>
  );
}