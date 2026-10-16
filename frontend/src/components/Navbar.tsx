import React from 'react'
import { Link } from 'react-router-dom'

interface NavbarProps {
  activeTab?: 'home' | 'result' | 'about'
}

export const Navbar: React.FC<NavbarProps> = () => {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-neutral-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <span className="font-mono text-lg tracking-tight">
            <span className="font-light text-black">CLASSROOM</span>{' '}
            <span className="font-bold text-black">VISION AI</span>
          </span>
          <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded border border-neutral-200 font-mono">
            v1.0
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link
            to="/home"
            className="text-black hover:text-neutral-600 transition-colors"
          >
            Monitoring
          </Link>
          <Link
            to="/result"
            className="text-neutral-600 hover:text-black transition-colors"
          >
            Latest Result
          </Link>
          <a
            href="#about"
            className="text-neutral-500 hover:text-black transition-colors hidden sm:inline-block"
          >
            About CV Engine
          </a>
        </nav>
      </div>
    </header>
  )
}
