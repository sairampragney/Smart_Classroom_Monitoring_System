import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { NAV_ITEMS } from '@/components/layout/Sidebar'

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  const current = NAV_ITEMS.find((n) => n.to === pathname)

  return (
    <div className="bg-console relative min-h-screen">
      {/* Ambient background layers - decorative only. */}
      <div className="bg-grid-overlay pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
      <div className="bg-noise pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-64">
        <TopBar
          title={current?.label ?? 'Smart Classroom'}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
          {/* Route transitions - subtle, respects reduced-motion via CSS. */}
          <div key={pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}