import { Home, Plus, LayoutGrid, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link'
import { usePathname } from 'next/navigation';

type SidebarProps = {
  open: boolean
  toggle: () => void
  onNewTrip: () => void
}

export function Sidebar({open, toggle, onNewTrip}: SidebarProps) {

  const pathname = usePathname()

  return (
    <aside className={`h-screen bg-white border-r border-zinc-100 flex flex-col space-y-8 h-screen transition-all duration-300
    ${open? 'w-56 px-4': 'w-14 px-2'}
    `}>
      <div className="h-12 flex items-center justify-between">
        {open && (
          <div className="text-xl font-black italic tracking-tighter">
            GEMINIGO
          </div>
        )}

        <button onClick={toggle} className="rounded p-1 hover:bg-siznc-100">
          {open? <ChevronLeft size={18}/>: <ChevronRight size={18}/>}
        </button>
      </div>
      
      <nav className="flex-1 space-y-2">
        {/* My trip */}
        <Link href="/">
          <SidebarItem
            icon={<Home size={18}/>}
            label="Home"
            open={open}
            active={pathname === '/'}
          />
        </Link>

        {/* New Trip (model) */}
        <SidebarItem
          icon={<Plus size={18}/>}
          label="New Trip"
          open={open}
          onClick={onNewTrip}
          active={false}
        />

        {/* My trip */}
        <Link href="/mytrip">
          <SidebarItem
            icon={<LayoutGrid size={18}/>}
            label="My Trips"
            open={open}
            active={pathname === '/mytrip'}
          />
        </Link>

        {/* Saved */}
        <Link href="/saved">
          <SidebarItem
            icon={<Heart size={18}/>}
            label="Saved"
            open={open}
            active={pathname === '/saved'}
          />
        </Link>
      </nav>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  open,
  onClick,
  active = false,
}: {
  icon: React.ReactNode
  label: string
  open: boolean
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center
        w-full
        rounded-md
        px-2 py-2
        gap-3
        font-semibold
        transition-colors
        ${open ? 'justify-start' : 'justify-center'}
        ${active ? 'text-zinc-900' : 'text-zinc-500'}
        hover:bg-zinc-100
      `}
    >
      {icon}
      {open && <span className="whitespace-nowrap">{label}</span>}
    </button>
  )
}
