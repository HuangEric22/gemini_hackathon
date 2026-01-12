import { MapPin } from 'lucide-react';

export function MapArea() {
  return (
    <aside className="w-[400px] bg-zinc-50 border-l border-zinc-100 hidden lg:flex flex-col items-center justify-center p-10 text-center h-screen">
      <div className="space-y-3">
        <div className="bg-white p-5 rounded-full shadow-xl inline-block">
          <MapPin className="text-zinc-200" size={32} />
        </div>
        <p className="text-zinc-400 font-medium leading-relaxed">
          Map around the area <br /> + Pin location
        </p>
      </div>
    </aside>
  );
}