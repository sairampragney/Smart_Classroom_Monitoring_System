import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Navbar } from '@/components/Navbar'
import type { AnalysisResult } from '@/types/vision'
import { getLastAnalysisResult } from '@/utils/storage'
import { ArrowLeft, AlertTriangle, CheckCircle, Cpu, FileText, RefreshCw } from 'lucide-react'

export const ResultPage: React.FC = () => {
  const navigate = useNavigate()
  const [result, setResult] = useState<AnalysisResult | null>(null)

  useEffect(() => {
    document.title = 'CLASSROOM VISION AI - Analysis Result'
    const stored = getLastAnalysisResult()
    if (stored) {
      setResult(stored)
    }
  }, [])

  if (!result) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col">
        <Navbar activeTab="result" />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
          <div className="p-4 bg-neutral-100 rounded-full border border-neutral-300 mb-4">
            <FileText className="w-8 h-8 text-neutral-500" />
          </div>
          <h1 className="text-xl font-mono font-bold uppercase tracking-tight text-black mb-2">
            NO RECENT ANALYSIS FOUND
          </h1>
          <p className="text-sm text-neutral-600 max-w-md font-sans mb-6">
            There is no active or saved inference result available in the current session. Please run an image analysis or start camera monitoring first.
          </p>
          <Link to="/home" className="btn-primary text-xs font-mono py-3 px-6 gap-2">
            <ArrowLeft className="w-4 h-4" /> GO TO MONITORING
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar activeTab="result" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase px-2.5 py-0.5 bg-black text-white">
                INFERENCE RESULT
              </span>
              <span className="text-xs font-mono text-neutral-500">ID: {result.id}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-black mt-2">
              ANALYSIS REPORT
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/home')}
              className="btn-primary text-xs font-mono py-2.5 px-5 gap-2"
            >
              <RefreshCw className="w-4 h-4" /> ANALYZE ANOTHER IMAGE
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Image Canvas Preview with Bounding Box Overlay (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-video bg-neutral-100 border border-neutral-300 rounded-xl overflow-hidden shadow-subtle flex items-center justify-center">
              {result.imageDataUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={result.imageDataUrl}
                    alt="Analyzed target frame"
                    className="w-full h-full object-contain"
                  />
                  {/* Bounding box overlays SVG layer */}
                  <svg
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    viewBox={`0 0 ${result.frameWidth || 640} ${result.frameHeight || 480}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {result.detections.map((det, idx) => {
                      const [x, y, w, h] = det.bbox
                      return (
                        <g key={idx}>
                          <rect
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            fill="none"
                            stroke="#000000"
                            strokeWidth="3"
                          />
                          <rect
                            x={x + 1}
                            y={y + 1}
                            width={w - 2}
                            height={h - 2}
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="1"
                          />
                          <rect
                            x={x}
                            y={Math.max(0, y - 20)}
                            width={90}
                            height={20}
                            fill="#000000"
                          />
                          <text
                            x={x + 6}
                            y={Math.max(14, y - 6)}
                            fill="#FFFFFF"
                            fontSize="11"
                            fontWeight="600"
                            fontFamily="JetBrains Mono, monospace"
                          >
                            PERSON {Math.round(det.score * 100)}%
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                </div>
              ) : (
                <div className="text-xs font-mono text-neutral-400">NO IMAGE PREVIEW</div>
              )}
            </div>

            <p className="text-xs text-neutral-500 font-sans italic">
              Bounding boxes rendered from actual model output predictions.
            </p>
          </div>

          {/* Right Column: Detailed Breakdown (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Primary Metrics Panel */}
            <div className="frosted-panel p-6 space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500 border-b border-neutral-200 pb-2">
                DETECTION SUMMARY
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-mono uppercase text-neutral-500">DETECTED PERSONS</span>
                  <div className="text-3xl font-extrabold font-mono mt-1 text-black">
                    {result.personCount}
                  </div>
                </div>

                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-mono uppercase text-neutral-500">INFERENCE DURATION</span>
                  <div className="text-3xl font-extrabold font-mono mt-1 text-black">
                    {result.processingTimeMs} <span className="text-sm font-normal">ms</span>
                  </div>
                </div>
              </div>

              {/* Model Info */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2 text-xs font-mono">
                <div className="flex items-center gap-2 text-neutral-700 font-bold border-b border-neutral-200 pb-2">
                  <Cpu className="w-4 h-4 text-black" />
                  <span>MODEL DETAILS</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>MODEL NAME:</span>
                  <span className="text-black font-semibold">{result.modelName}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>VERSION:</span>
                  <span className="text-black font-semibold">{result.modelVersion}</span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>TIMESTAMP:</span>
                  <span className="text-black font-semibold">{result.timestamp}</span>
                </div>
              </div>

              {/* Detections Breakdown List */}
              <div className="space-y-2 pt-2 border-t border-neutral-200">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-500">
                  INDIVIDUAL DETECTIONS ({result.detections.length})
                </span>

                {result.detections.length === 0 ? (
                  <p className="text-xs text-neutral-400 font-mono italic py-2">
                    No individual person bounding boxes detected in frame.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {result.detections.map((det, index) => (
                      <div
                        key={index}
                        className="p-3 bg-neutral-50 border border-neutral-200 rounded text-xs font-mono flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-black" />
                          <span className="font-bold text-black uppercase">{det.class} #{index + 1}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-black">
                            {(det.score * 100).toFixed(1)}% CONF
                          </span>
                          <div className="text-[10px] text-neutral-500">
                            BBOX: [{det.bbox.join(', ')}]
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Disclaimer Box */}
            <div className="p-4 bg-neutral-50 border border-neutral-300 rounded-lg flex items-start gap-3 text-xs font-sans text-neutral-700">
              <AlertTriangle className="w-5 h-5 text-neutral-700 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-mono text-black uppercase block mb-1">
                  VISION AI DISCLAIMER
                </strong>
                Computer vision models produce probabilistic output predictions. Factors like room lighting, occlusions, or extreme camera distance can influence detected counts and confidence scores.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
