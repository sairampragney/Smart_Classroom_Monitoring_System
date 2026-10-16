import type { MovementStatus } from '@/types/vision'

export class MotionService {
  private previousCanvas: HTMLCanvasElement | null = null
  private previousCtx: CanvasRenderingContext2D | null = null

  /**
   * Evaluates movement between current frame and previous frame using lightweight pixel differencing.
   */
  public analyzeMotion(
    videoOrImage: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
    _width?: number,
    _height?: number
  ): MovementStatus {
    try {
      if (!this.previousCanvas) {
        this.previousCanvas = document.createElement('canvas')
        this.previousCanvas.width = 64
        this.previousCanvas.height = 48
        this.previousCtx = this.previousCanvas.getContext('2d', { willReadFrequently: true })
      }

      if (!this.previousCtx) return 'UNKNOWN'

      // Create current tiny frame for quick subtraction
      const currentCanvas = document.createElement('canvas')
      currentCanvas.width = 64
      currentCanvas.height = 48
      const currentCtx = currentCanvas.getContext('2d', { willReadFrequently: true })
      if (!currentCtx) return 'UNKNOWN'

      currentCtx.drawImage(videoOrImage, 0, 0, 64, 48)
      const currentData = currentCtx.getImageData(0, 0, 64, 48).data

      // Read previous frame
      const prevData = this.previousCtx.getImageData(0, 0, 64, 48).data

      let diffPixels = 0
      const totalPixels = 64 * 48

      for (let i = 0; i < currentData.length; i += 4) {
        // Luminance calculation
        const currGray = 0.299 * currentData[i] + 0.587 * currentData[i + 1] + 0.114 * currentData[i + 2]
        const prevGray = 0.299 * prevData[i] + 0.587 * prevData[i + 1] + 0.114 * prevData[i + 2]

        if (Math.abs(currGray - prevGray) > 25) {
          diffPixels++
        }
      }

      // Store current as previous for next call
      this.previousCtx.drawImage(currentCanvas, 0, 0)

      const diffRatio = diffPixels / totalPixels

      if (diffRatio > 0.12) {
        return 'SIGNIFICANT_MOVEMENT'
      } else if (diffRatio > 0.02) {
        return 'SLIGHT_MOVEMENT'
      } else {
        return 'NO_MOVEMENT'
      }
    } catch {
      return 'UNKNOWN'
    }
  }

  public reset(): void {
    this.previousCanvas = null
    this.previousCtx = null
  }
}

export const motionService = new MotionService()
