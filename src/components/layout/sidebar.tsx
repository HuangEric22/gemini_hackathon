'use client'

import { Home, Plus, LayoutGrid, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation';
import { UserButton, SignInButton, useUser, useClerk } from '@clerk/nextjs';

type SidebarProps = {
  open: boolean
  toggle: () => void
  onNewTrip: () => void
}

export function Sidebar({ open, toggle, onNewTrip }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { isSignedIn, user } = useUser()
  const { openSignIn } = useClerk()

  // Navigates if signed in, otherwise opens Clerk modal then redirects after sign-in
  const handleProtected = (href: string) => {
    if (isSignedIn) {
      router.push(href)
    } else {
      openSignIn({ forceRedirectUrl: href })
    }
  }

  const handleNewTrip = () => {
    if (isSignedIn) {
      onNewTrip()
    } else {
      openSignIn({ forceRedirectUrl: '/' })
    }
  }

  return (
    <aside className={`h-screen bg-white border-r border-zinc-100 flex flex-col space-y-8 transition-all duration-300
      ${open ? 'w-56 px-4' : 'w-14 px-2'}
    `}>
      <div className="h-12 flex items-center justify-between">
        {open && (
          <div className="text-xl font-black italic tracking-tighter">
            GEMINIGO
          </div>
        )}
        <button onClick={toggle} className="rounded p-1 hover:bg-zinc-100">
          {open ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      <nav className="flex-1 space-y-2">
        {/* Home — always public */}
        <Link href="/">
          <SidebarItem icon={<Home size={18} />} label="Home" open={open} active={pathname === '/'} />
        </Link>

        {/* New Trip — requires auth */}
        <SidebarItem
          icon={<Plus size={18} />}
          label="New Trip"
          open={open}
          active={false}
          onClick={handleNewTrip}
        />

        {/* My Trips — requires auth */}
        <SidebarItem
          icon={<LayoutGrid size={18} />}
          label="My Trips"
          open={open}
          active={pathname.startsWith('/mytrip')}
          onClick={() => handleProtected('/mytrip')}
        />

        {/* Saved — requires auth */}
        <SidebarItem
          icon={<Heart size={18} />}
          label="Saved"
          open={open}
          active={pathname === '/saved'}
          onClick={() => handleProtected('/saved')}
        />
      </nav>

      {/* User section at bottom */}
      <div className={`pb-4 flex items-center gap-3 ${open ? 'justify-start' : 'justify-center'}`}>
        {isSignedIn ? (
          <>
            <UserButton />
            {open && (
              <span className="text-sm font-semibold text-zinc-700 truncate">
                {user.firstName ?? user.emailAddresses[0]?.emailAddress}
              </span>
            )}
          </>
        ) : (
          <SignInButton mode="modal">
            <button className={`flex items-center gap-2 w-full rounded-md px-2 py-2 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 transition-colors ${open ? 'justify-start' : 'justify-center'}`}>
              <span className="text-base">👤</span>
              {open && <span>Sign In</span>}
            </button>
          </SignInButton>
        )}
      </div>
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
        flex items-center w-full rounded-md px-2 py-2 gap-3 font-semibold transition-colors
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
