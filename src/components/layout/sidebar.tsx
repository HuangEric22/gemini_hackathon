import { Plus, LayoutGrid, Heart } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-full border-r border-zinc-100 flex flex-col p-6 space-y-8 h-screen bg-white">
      <div className="text-xl font-black italic tracking-tighter">GEMINIGO</div>
      
      <nav className="flex-1 space-y-4">
        <button className="flex items-center gap-3 font-bold text-zinc-900 w-full">
          <Plus size={18}/> New trip
        </button>
        <button className="flex items-center gap-3 font-bold text-zinc-400 w-full">
          <LayoutGrid size={18}/> My trips
        </button>
        <button className="flex items-center gap-3 font-bold text-zinc-400 w-full">
          <Heart size={18}/> Saved
        </button>
      </nav>
    </aside>
  );
}