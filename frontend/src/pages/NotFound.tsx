import { Link } from 'react-router-dom'

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="text-center">
        <p className="font-mono text-6xl font-bold text-gradient-violet">404</p>
        <h1 className="mt-4 text-lg font-semibold text-fg">Page not found</h1>
        <p className="mt-2 text-sm text-fg-muted">
          This route does not exist in the monitoring console.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-colors hover:bg-violet-500"
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  )
}