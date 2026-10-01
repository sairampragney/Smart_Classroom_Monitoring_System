import { NavLink } from 'react-router-dom'
import { cn } from '@/utils/cn'

export interface NavItem {
  to: string
  label: string
  /** Short descriptor shown under the label on wide screens. */
  caption: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', caption: 'System overview', icon: '◈' },
  { to: '/live', label: 'Live Monitoring', caption: 'Arduino sensors', icon: '◉' },
  { to: '/vision', label: 'Computer Vision', caption: 'Face detection', icon: '◐' },
  { to: '/ml', label: 'ML Analysis', caption: 'Model evaluation', icon: '◇' },
  { to: '/history', label: 'History', caption: 'Past records', icon: '▤' },
  { to: '/system', label: 'System', caption: 'Component health', icon: '⚙' },
]

interface SidebarProps {
  /** Mobile drawer state, controlled by the layout. */
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Scrim for the mobile drawer */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-violet-500/10',
          'bg-bg-secondary/95 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* ---- Branding ---- */}
        <div className="flex items-center gap-3 border-b border-violet-500/10 px-5 py-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-glow">
            <span className="text-lg font-bold text-white">SC</span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-fg">
              Smart Classroom
            </p>
            <p className="truncate text-[11px] leading-tight text-violet-soft">
              Monitoring System
            </p>
          </div>
        </div>

        {/* ---- Navigation ---- */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                  isActive
                    ? 'bg-violet/15 text-fg shadow-[inset_0_0_0_1px_rgba(139,92,246,0.28)]'
                    : 'text-fg-muted hover:bg-violet/[0.07] hover:text-fg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm transition-colors',
                      isActive
                        ? 'bg-violet/20 text-violet-soft'
                        : 'bg-white/[0.03] text-fg-muted group-hover:text-violet-soft',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.label}
                    </span>
                    <span className="block truncate text-[11px] text-fg-muted">
                      {item.caption}
                    </span>
                  </span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft shadow-glow" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-violet-500/10 px-5 py-4">
          <p className="text-[11px] leading-relaxed text-fg-muted">
            Low-Cost Smart Classroom Occupancy Detection
            <br />
            <span className="text-violet-soft">Phase 1 · Frontend Foundation</span>
          </p>
        </div>
      </aside>
    </>
  )
}