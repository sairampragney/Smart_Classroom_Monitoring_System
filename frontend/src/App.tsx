import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { SystemStatusProvider } from '@/context/SystemStatusContext'
import { Dashboard } from '@/pages/Dashboard'
import { NotFound } from '@/pages/NotFound'

// Heavier analytical pages are split out of the initial bundle.
const LiveMonitoring = lazy(() => import('@/pages/LiveMonitoring'))
const ComputerVision = lazy(() => import('@/pages/ComputerVision'))
const MLAnalysis = lazy(() => import('@/pages/MLAnalysis'))
const History = lazy(() => import('@/pages/History'))
const System = lazy(() => import('@/pages/System'))

function RouteFallback() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-soft" />
        <p className="text-sm text-fg-muted">Loading view…</p>
      </div>
    </div>
  )
}

export function App() {
  return (
    <SystemStatusProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route
            path="live"
            element={
              <Suspense fallback={<RouteFallback />}>
                <LiveMonitoring />
              </Suspense>
            }
          />
          <Route
            path="vision"
            element={
              <Suspense fallback={<RouteFallback />}>
                <ComputerVision />
              </Suspense>
            }
          />
          <Route
            path="ml"
            element={
              <Suspense fallback={<RouteFallback />}>
                <MLAnalysis />
              </Suspense>
            }
          />
          <Route
            path="history"
            element={
              <Suspense fallback={<RouteFallback />}>
                <History />
              </Suspense>
            }
          />
          <Route
            path="system"
            element={
              <Suspense fallback={<RouteFallback />}>
                <System />
              </Suspense>
            }
          />
          {/* Convenience aliases */}
          <Route path="dashboard" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SystemStatusProvider>
  )
}