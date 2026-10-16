import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SilverCubesScene } from '@/components/SilverCubesScene'

export const LandingPage: React.FC = () => {
  const [taglineIndex, setTaglineIndex] = useState(0)
  const fullTagline = 'Not everything you see is real.'

  // Fold text / typewriter effect
  useEffect(() => {
    if (taglineIndex < fullTagline.length) {
      const timer = setTimeout(() => {
        setTaglineIndex((prev) => prev + 1)
      }, 45)
      return () => clearTimeout(timer)
    }
  }, [taglineIndex])

  useEffect(() => {
    document.title = 'CLASSROOM VISION AI - Smart Classroom Monitoring'
  }, [])

  return (
    <div className="min-h-screen bg-white text-black flex flex-col justify-between p-6 sm:p-12 lg:p-16 relative overflow-hidden">
      {/* Top Header / Branding */}
      <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
        <div className="text-xl sm:text-2xl font-mono tracking-wider">
          <span className="font-light text-black">CLASSROOM</span>{' '}
          <span className="font-bold text-black">VISION AI</span>
        </div>
        <div className="text-xs font-mono uppercase tracking-widest text-neutral-400">
          Client-Side Vision ML
        </div>
      </div>

      {/* Main Hero Content Grid */}
      <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center my-auto py-12">
        <div className="lg:col-span-7 flex flex-col items-start gap-8 z-10">
          {/* Wordmark Title */}
          <div className="space-y-2">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-black uppercase leading-none font-mono">
              <span className="font-light">CLASSROOM</span>
              <br />
              <span className="font-extrabold">VISION AI</span>
            </h1>
          </div>

          {/* Tagline fold text animation */}
          <div className="h-8 flex items-center">
            <p className="text-xl sm:text-2xl font-mono text-neutral-800 tracking-tight">
              {fullTagline.slice(0, taglineIndex)}
              <span className="animate-pulse inline-block w-2 h-5 bg-black ml-1 align-middle" />
            </p>
          </div>

          {/* Description */}
          <p className="text-neutral-600 max-w-xl text-base sm:text-lg leading-relaxed font-sans">
            Edge computer vision and browser-executed machine learning for real-time occupancy counting, person detection, and motion monitoring in smart educational spaces. Zero cloud telemetry.
          </p>

          {/* Single prominent CTA as strictly required */}
          <div className="pt-2">
            <Link
              to="/home"
              className="inline-flex items-center justify-center px-10 py-4 text-base font-bold tracking-wider text-white bg-black hover:bg-neutral-800 transition-all rounded-none border border-black shadow-subtle group"
            >
              <span>GET STARTED</span>
              <svg
                className="w-5 h-5 ml-3 transform group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
          </div>
        </div>

        {/* 3D Decorative Scene with Exactly Two Silver Cubes */}
        <div className="lg:col-span-5 h-[320px] sm:h-[400px] w-full flex items-center justify-center relative">
          <SilverCubesScene />
        </div>
      </div>

      {/* Footer Minimal Notice */}
      <div className="max-w-7xl mx-auto w-full text-xs text-neutral-400 font-mono flex flex-col sm:flex-row justify-between items-center border-t border-neutral-100 pt-6">
        <span>© {new Date().getFullYear()} CLASSROOM VISION AI</span>
        <span>BROWSER-BASED INFERENCE • PRIVACY PRESERVING</span>
      </div>
    </div>
  )
}
