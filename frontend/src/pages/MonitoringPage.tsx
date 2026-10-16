import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Navbar } from '@/components/Navbar'
import { cameraService } from '@/services/cameraService'
import { modelService } from '@/services/modelService'
import { motionService } from '@/services/motionService'
import type {
  AnalysisResult,
  DetectionEvent,
  DetectionResult,
  ModelStatus,
  MovementStatus,
  SessionMetrics,
} from '@/types/vision'
import { setLastAnalysisResult } from '@/utils/storage'
import { Camera, Play, Square, Upload, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react'

export const MonitoringPage: React.FC = () => {
  const navigate = useNavigate()

  // Video and Canvas refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State management
  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false)
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Live Analysis States
  const [currentDetections, setCurrentDetections] = useState<DetectionResult[]>([])
  const [currentMovement, setCurrentMovement] = useState<MovementStatus>('UNKNOWN')
  const [lastProcessingTime, setLastProcessingTime] = useState<number>(0)

  // Session Metrics
  const [sessionMetrics, setSessionMetrics] = useState<SessionMetrics>({
    currentCount: 0,
    maxOccupancy: 0,
    framesAnalyzed: 0,
    avgInferenceMs: 0,
    totalEvents: 0,
    movementStatus: 'UNKNOWN',
  })

  // Session Event History
  const [eventsHistory, setEventsHistory] = useState<DetectionEvent[]>([])

  // Animation Loop Ref
  const animationFrameRef = useRef<number | null>(null)
  const isProcessingRef = useRef<boolean>(false)
  const totalInferenceTimeRef = useRef<number>(0)

  useEffect(() => {
    document.title = 'CLASSROOM VISION AI - Live Monitoring'

    // Pre-load model on page mount
    modelService
      .loadModel((status) => setModelStatus(status))
      .catch((err) => {
        setErrorMessage('Failed to initialize computer vision model: ' + err.message)
      })

    return () => {
      stopCameraStream()
    }
  }, [])

  // Draw bounding boxes on canvas over video/image
  const drawBoundingBoxes = useCallback(
    (
      canvas: HTMLCanvasElement,
      detections: DetectionResult[],
      width: number,
      height: number
    ) => {
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, width, height)

      detections.forEach((det) => {
        const [x, y, w, h] = det.bbox

        // PixelCheck aesthetic: sleek black / hairline border boxes with pure white background tags
        ctx.lineWidth = 2
        ctx.strokeStyle = '#000000'
        ctx.strokeRect(x, y, w, h)

        // Draw hairline inner border for high visibility
        ctx.lineWidth = 1
        ctx.strokeStyle = '#FFFFFF'
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)

        // Tag label
        const scorePct = Math.round(det.score * 100)
        const labelText = `PERSON ${scorePct}%`
        ctx.font = '600 11px "JetBrains Mono", monospace'
        const textMetrics = ctx.measureText(labelText)
        const labelWidth = textMetrics.width + 12
        const labelHeight = 20

        // Tag background - solid black
        ctx.fillStyle = '#000000'
        ctx.fillRect(x, Math.max(0, y - labelHeight), labelWidth, labelHeight)

        // Tag text - crisp white
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(labelText, x + 6, Math.max(14, y - 6))
      })
    },
    []
  )

  // Live camera detection loop
  const processCameraFrame = useCallback(async () => {
    if (!videoRef.current || !cameraService.isActive() || isProcessingRef.current) return

    const video = videoRef.current
    if (video.readyState < 2 || video.paused || video.ended) {
      if (cameraService.isActive()) {
        animationFrameRef.current = requestAnimationFrame(processCameraFrame)
      }
      return
    }

    isProcessingRef.current = true

    try {
      const vWidth = video.videoWidth || 640
      const vHeight = video.videoHeight || 480

      // Run real ML model inference
      const { detections, durationMs } = await modelService.detectPersons(video)

      // Motion analysis
      const movement = motionService.analyzeMotion(video, vWidth, vHeight)

      setCurrentDetections(detections)
      setCurrentMovement(movement)
      setLastProcessingTime(durationMs)

      // Update Overlay Canvas
      if (overlayCanvasRef.current) {
        drawBoundingBoxes(overlayCanvasRef.current, detections, vWidth, vHeight)
      }

      // Update Session Metrics
      const count = detections.length
      totalInferenceTimeRef.current += durationMs

      setSessionMetrics((prev) => {
        const newFrames = prev.framesAnalyzed + 1
        const newAvg = Math.round(totalInferenceTimeRef.current / newFrames)
        const newMax = Math.max(prev.maxOccupancy, count)
        return {
          currentCount: count,
          maxOccupancy: newMax,
          framesAnalyzed: newFrames,
          avgInferenceMs: newAvg,
          totalEvents: count > 0 ? prev.totalEvents + 1 : prev.totalEvents,
          movementStatus: movement,
        }
      })

      // Record event history if persons detected
      if (count > 0) {
        const maxConf = Math.max(...detections.map((d) => d.score), 0)
        setEventsHistory((prev) => {
          const newEvent: DetectionEvent = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            personCount: count,
            maxConfidence: maxConf,
            movementStatus: movement,
          }
          return [newEvent, ...prev.slice(0, 19)] // Keep last 20 events
        })
      }
    } catch (err: any) {
      console.error('Inference error during camera loop:', err)
    } finally {
      isProcessingRef.current = false
      if (cameraService.isActive()) {
        // Run frame analysis every ~150ms to maintain smoothness without hogging main thread
        setTimeout(() => {
          if (cameraService.isActive()) {
            animationFrameRef.current = requestAnimationFrame(processCameraFrame)
          }
        }, 150)
      }
    }
  }, [drawBoundingBoxes])

  useEffect(() => {
    if (isCameraActive) {
      animationFrameRef.current = requestAnimationFrame(processCameraFrame)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isCameraActive, processCameraFrame])

  // Camera Controls
  const handleStartCamera = async () => {
    setErrorMessage(null)
    setUploadedImageSrc(null)
    if (!videoRef.current) return

    try {
      await cameraService.startCamera(videoRef.current)
      setIsCameraActive(true)
    } catch (err: any) {
      setIsCameraActive(false)
      setErrorMessage(err.message || 'Failed to access camera')
    }
  }

  const stopCameraStream = () => {
    setIsCameraActive(false)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    cameraService.stopCamera()
    motionService.reset()
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d')
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height)
    }
  }

  // File Upload Controls
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Clear error
    setErrorMessage(null)

    // Validate type and size (max 10MB)
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please upload a valid JPEG, PNG or WebP image file.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image size exceeds 10MB limit.')
      return
    }

    // Stop camera if active
    stopCameraStream()

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      setUploadedImageSrc(result)
      setCurrentDetections([])
    }
    reader.readAsDataURL(file)
  }

  // Single Image Analysis
  const runImageAnalysis = async () => {
    if (!uploadedImageSrc) return
    setErrorMessage(null)
    setModelStatus('processing')

    const img = new Image()
    img.src = uploadedImageSrc
    img.onload = async () => {
      try {
        const width = img.naturalWidth || img.width
        const height = img.naturalHeight || img.height

        const { detections, durationMs } = await modelService.detectPersons(img)

        setCurrentDetections(detections)
        setLastProcessingTime(durationMs)
        setModelStatus('ready')

        if (overlayCanvasRef.current) {
          drawBoundingBoxes(overlayCanvasRef.current, detections, width, height)
        }

        // Store result for /result page navigation
        const analysisResult: AnalysisResult = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString(),
          personCount: detections.length,
          detections,
          movementStatus: 'UNKNOWN', // Image static analysis
          processingTimeMs: durationMs,
          modelName: 'MobileNetV2 COCO-SSD',
          modelVersion: '2.2.3',
          imageDataUrl: uploadedImageSrc,
          frameWidth: width,
          frameHeight: height,
        }

        setLastAnalysisResult(analysisResult)

        // Update session metrics
        setSessionMetrics((prev) => ({
          ...prev,
          currentCount: detections.length,
          maxOccupancy: Math.max(prev.maxOccupancy, detections.length),
          framesAnalyzed: prev.framesAnalyzed + 1,
          avgInferenceMs: durationMs,
        }))
      } catch (err: any) {
        setModelStatus('error')
        setErrorMessage('Image detection failed: ' + err.message)
      }
    }
  }

  // Navigate to detailed result page
  const handleViewFullResult = () => {
    if (!uploadedImageSrc && !isCameraActive && currentDetections.length === 0) return

    // Capture snapshot if camera active
    if (isCameraActive && videoRef.current) {
      const video = videoRef.current
      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      const snapCanvas = document.createElement('canvas')
      snapCanvas.width = w
      snapCanvas.height = h
      const ctx = snapCanvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h)
        const snapDataUrl = snapCanvas.toDataURL('image/jpeg', 0.9)

        const analysisResult: AnalysisResult = {
          id: Date.now().toString(),
          timestamp: new Date().toLocaleTimeString(),
          personCount: currentDetections.length,
          detections: currentDetections,
          movementStatus: currentMovement,
          processingTimeMs: lastProcessingTime,
          modelName: 'MobileNetV2 COCO-SSD',
          modelVersion: '2.2.3',
          imageDataUrl: snapDataUrl,
          frameWidth: w,
          frameHeight: h,
        }
        setLastAnalysisResult(analysisResult)
      }
    }

    navigate('/result')
  }

  const resetSession = () => {
    setSessionMetrics({
      currentCount: 0,
      maxOccupancy: 0,
      framesAnalyzed: 0,
      avgInferenceMs: 0,
      totalEvents: 0,
      movementStatus: 'UNKNOWN',
    })
    setEventsHistory([])
    totalInferenceTimeRef.current = 0
  }

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      <Navbar activeTab="home" />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header & Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-black">
              LIVE MONITORING
            </h1>
            <p className="text-sm text-neutral-500 font-sans mt-1">
              Real-time browser-executed computer vision occupancy detection.
            </p>
          </div>

          {/* Model Status Pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded font-mono text-xs text-black">
              <span className="text-neutral-400">MODEL STATUS:</span>
              {modelStatus === 'loading' && <span className="animate-pulse text-neutral-800">LOADING...</span>}
              {modelStatus === 'ready' && <span className="font-bold text-black">● READY</span>}
              {modelStatus === 'processing' && <span className="animate-pulse font-bold">PROCESSING...</span>}
              {modelStatus === 'error' && <span className="text-red-600 font-bold">ERROR</span>}
              {modelStatus === 'idle' && <span>IDLE</span>}
            </div>

            <button
              onClick={resetSession}
              className="px-3 py-1.5 text-xs font-mono border border-neutral-300 hover:bg-neutral-100 rounded transition-colors"
              title="Reset current monitoring session metrics"
            >
              RESET SESSION
            </button>
          </div>
        </div>

        {/* Error Notification banner if any */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-lg flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Main Monitoring Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Camera / Upload Analysis Canvas (8 Cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 p-3 border border-neutral-200 rounded-lg">
              <div className="flex items-center gap-2">
                {!isCameraActive ? (
                  <button
                    onClick={handleStartCamera}
                    disabled={modelStatus === 'loading'}
                    className="btn-primary py-2 px-4 text-xs gap-2"
                  >
                    <Play className="w-4 h-4" /> START CAMERA
                  </button>
                ) : (
                  <button onClick={stopCameraStream} className="btn-secondary py-2 px-4 text-xs gap-2 border-black">
                    <Square className="w-4 h-4 fill-current" /> STOP CAMERA
                  </button>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary py-2 px-4 text-xs gap-2"
                >
                  <Upload className="w-4 h-4" /> UPLOAD IMAGE
                </button>
              </div>

              {uploadedImageSrc && (
                <button
                  onClick={runImageAnalysis}
                  disabled={modelStatus === 'processing'}
                  className="btn-outline py-2 px-4 text-xs gap-2 font-mono"
                >
                  <RefreshCw className={`w-4 h-4 ${modelStatus === 'processing' ? 'animate-spin' : ''}`} /> RUN ANALYSIS
                </button>
              )}
            </div>

            {/* Video Viewport / Analysis Panel */}
            <div className="relative aspect-video bg-neutral-100 border border-neutral-300 rounded-xl overflow-hidden flex items-center justify-center shadow-subtle">
              {/* Camera Video Element */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-contain ${isCameraActive ? 'block' : 'hidden'}`}
              />

              {/* Uploaded Static Image Preview */}
              {uploadedImageSrc && !isCameraActive && (
                <img
                  src={uploadedImageSrc}
                  alt="Uploaded analysis target"
                  className="w-full h-full object-contain"
                />
              )}

              {/* Live Overlay Canvas for Bounding Boxes */}
              <canvas
                ref={overlayCanvasRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
              />

              {/* Empty state when neither camera nor image active */}
              {!isCameraActive && !uploadedImageSrc && (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <div className="p-4 bg-white border border-neutral-200 rounded-full shadow-subtle">
                    <Camera className="w-8 h-8 text-neutral-400" />
                  </div>
                  <h3 className="font-mono text-sm font-semibold tracking-wider text-black">
                    FEED INACTIVE
                  </h3>
                  <p className="text-xs text-neutral-500 max-w-xs font-sans">
                    Click <strong>START CAMERA</strong> for real-time live video stream inference or <strong>UPLOAD IMAGE</strong> to analyze a saved photo.
                  </p>
                </div>
              )}

              {/* Top Status Indicators inside viewport */}
              {(isCameraActive || uploadedImageSrc) && (
                <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
                  <span className="bg-black text-white font-mono text-[10px] uppercase px-2.5 py-1 rounded shadow-subtle tracking-wider">
                    {isCameraActive ? 'LIVE CAMERA FEED' : 'STATIC IMAGE'}
                  </span>
                  {lastProcessingTime > 0 && (
                    <span className="bg-white text-black border border-neutral-300 font-mono text-[10px] px-2.5 py-1 rounded shadow-subtle">
                      INFERENCE: {lastProcessingTime}ms
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Results Nav CTA if detections available */}
            {(currentDetections.length > 0 || uploadedImageSrc) && (
              <div className="flex justify-end pt-1">
                <button onClick={handleViewFullResult} className="btn-outline text-xs py-2 px-4 gap-2 font-mono">
                  VIEW FULL DETAILED ANALYSIS RESULT →
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Live Metrics & Session History (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Occupancy Card */}
            <div className="frosted-panel p-6 space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500 border-b border-neutral-200 pb-2">
                OCCUPANCY & METRICS
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-mono uppercase text-neutral-500">CURRENT COUNT</span>
                  <div className="text-3xl font-extrabold font-mono mt-1 text-black">
                    {sessionMetrics.currentCount}
                  </div>
                </div>

                <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <span className="text-[11px] font-mono uppercase text-neutral-500">MAX OCCUPANCY</span>
                  <div className="text-3xl font-extrabold font-mono mt-1 text-black">
                    {sessionMetrics.maxOccupancy}
                  </div>
                </div>
              </div>

              {/* Movement Status Indicator */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-lg space-y-1">
                <span className="text-[11px] font-mono uppercase text-neutral-500">FRAME MOVEMENT STATUS</span>
                <div className="font-mono text-sm font-bold text-black flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-black" />
                  {currentMovement === 'SIGNIFICANT_MOVEMENT' && 'SIGNIFICANT MOVEMENT'}
                  {currentMovement === 'SLIGHT_MOVEMENT' && 'SLIGHT MOVEMENT'}
                  {currentMovement === 'NO_MOVEMENT' && 'NO SIGNIFICANT MOVEMENT'}
                  {currentMovement === 'UNKNOWN' && 'AWAITING VIDEO STREAM'}
                </div>
                <p className="text-[11px] text-neutral-500 pt-1 font-sans">
                  Calculated from sequential frame pixel delta.
                </p>
              </div>

              {/* Secondary Metrics */}
              <div className="pt-2 text-xs font-mono space-y-2 text-neutral-600 border-t border-neutral-200">
                <div className="flex justify-between">
                  <span>FRAMES ANALYZED:</span>
                  <span className="font-bold text-black">{sessionMetrics.framesAnalyzed}</span>
                </div>
                <div className="flex justify-between">
                  <span>AVG INFERENCE TIME:</span>
                  <span className="font-bold text-black">{sessionMetrics.avgInferenceMs} ms</span>
                </div>
                <div className="flex justify-between">
                  <span>DETECTION EVENTS:</span>
                  <span className="font-bold text-black">{sessionMetrics.totalEvents}</span>
                </div>
              </div>
            </div>

            {/* Current Session Event Log */}
            <div className="frosted-panel p-6 space-y-4">
              <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500 border-b border-neutral-200 pb-2">
                SESSION EVENT HISTORY
              </h2>

              {eventsHistory.length === 0 ? (
                <p className="text-xs text-neutral-400 font-mono italic py-4 text-center">
                  No detection events recorded in this session.
                </p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {eventsHistory.map((evt) => (
                    <div
                      key={evt.id}
                      className="p-2.5 bg-neutral-50 border border-neutral-200 rounded text-xs font-mono flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-black">{evt.personCount} PERSON(S)</span>
                        <div className="text-[10px] text-neutral-500">{evt.timestamp}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-black font-semibold">
                          {Math.round(evt.maxConfidence * 100)}% CONF
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* About Section */}
        <section id="about" className="frosted-panel p-6 sm:p-8 space-y-4 mt-12 border-t border-neutral-200">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-black" />
            <h2 className="text-lg font-mono font-bold uppercase tracking-tight text-black">
              ABOUT COMPUTER VISION ENGINE & LIMITATIONS
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-neutral-700 font-sans leading-relaxed">
            <div className="space-y-2">
              <h3 className="font-mono font-bold text-black text-xs uppercase tracking-wider">
                TECHNOLOGY ARCHITECTURE
              </h3>
              <p>
                This monitoring website executes computer vision and deep learning inference entirely on your client device using <strong>TensorFlow.js</strong> with a MobileNetV2 COCO-SSD architecture. No video frames, camera feeds, or uploaded images leave your browser or get sent to any server.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-mono font-bold text-black text-xs uppercase tracking-wider">
                DETLECTION LIMITATIONS & DISCLAIMER
              </h3>
              <p>
                Computer vision object detection models can yield false positives or false negatives due to heavy occlusion, extreme classroom lighting, low resolution, or unusual camera angles. Motion status is derived from frame pixel differences and does not claim to detect identity, emotion, or attention.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
