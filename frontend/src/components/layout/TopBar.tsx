import { useSystemStatus } from '@/context/SystemStatusContext'
import { StatusPill } from '@/components/ui/StatusPill'
import { toneForState } from '@/utils/status'

interface TopBarProps {
  onOpenMenu: () => void
  /** Current page title shown on mobile where the sidebar is hidden. */
  title: string
}

const WS_LABEL: Record<string, string> = {
  open: 'Connected',
  connecting: 'Connecting',
  closed: 'Disconnected',
  error: 'Error',
}

export function TopBar({ onOpenMenu, title }: TopBarProps) {
  const { health, healthError, wsState } = useSystemStatus()

  // Backend is "ok" only when a real health response came back.
  const backendTone = healthError || !health ? 'bad' : toneForState(health.status)
  const arduinoState = health?.services.arduino ?? 'DISCONNECTED'
  const demoMode = health?.demo_mode === true

  return (
    <header className="sticky top-0 z-20 border-b border-violet-500/10 bg-bg-deep/85 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-500/20 text-fg-muted transition-colors hover:bg-violet/10 hover:text-fg lg:hidden"
        >
          <span aria-hidden="true">☰</span>
        </button>

        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg sm:text-base">
          {title}
        </h2>

        <div className="flex shrink-0 items-center gap-2">
          {/* DEMO MODE must be loud and never silently hidden. */}
          {demoMode && (
            <StatusPill label="Demo Mode" tone="warn" />
          )}

          <StatusPill
            label={WS_LABEL[wsState] ?? wsState}
            tone={
              wsState === 'open'
                ? 'ok'
                : wsState === 'connecting'
                  ? 'warn'
                  : 'bad'
            }
            pulse={wsState === 'open'}
            className="hidden sm:inline-flex"
          />

          <StatusPill
            label={`Backend ${backendTone === 'ok' ? 'Online' : 'Offline'}`}
            tone={backendTone}
            pulse={backendTone === 'ok'}
          />

          <StatusPill
            label={arduinoState === 'CONNECTED' ? 'Arduino' : 'No Arduino'}
            tone={toneForState(arduinoState)}
            pulse={arduinoState === 'CONNECTED'}
            className="hidden md:inline-flex"
          />
        </div>
      </div>
    </header>
  )
}