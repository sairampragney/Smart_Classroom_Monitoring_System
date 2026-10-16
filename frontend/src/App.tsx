import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const LandingPage = lazy(() => import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })))
const MonitoringPage = lazy(() => import('@/pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })))
const ResultPage = lazy(() => import('@/pages/ResultPage').then((m) => ({ default: m.ResultPage })))

function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-white">
      <div className="flex flex-col items-center gap-3 font-mono text-xs">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-black" />
        <p className="text-neutral-500">LOADING CV MODULE...</p>
      </div>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={<RouteFallback />}>
            <LandingPage />
          </Suspense>
        }
      />
      <Route
        path="/home"
        element={
          <Suspense fallback={<RouteFallback />}>
            <MonitoringPage />
          </Suspense>
        }
      />
      <Route
        path="/result"
        element={
          <Suspense fallback={<RouteFallback />}>
            <ResultPage />
          </Suspense>
        }
      />
      {/* Fallback & Conveniences */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
