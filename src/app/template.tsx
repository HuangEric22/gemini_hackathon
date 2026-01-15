'use client'

import React from 'react'
import { Sidebar } from "@/components/layout/sidebar";
import { useState } from 'react'

const template = ({ children }: {children:React.ReactNode}) => {

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [newTripOpen, setNewTripOpen] = useState(false)
  
  return (
    <div className="flex h-screen w-full overflow-hidden">
        <Sidebar 
        open={sidebarOpen} 
        toggle={() => setSidebarOpen(o => !o)}
        onNewTrip={() => setNewTripOpen(true)}
        />

        <main>
            {children}
        </main>
    </div>
  )
}

export default template
