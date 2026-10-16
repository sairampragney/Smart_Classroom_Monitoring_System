import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'
import type { DetectionResult, ModelStatus } from '@/types/vision'

export class ModelService {
  private model: cocoSsd.ObjectDetection | null = null
  private status: ModelStatus = 'idle'
  private loadPromise: Promise<cocoSsd.ObjectDetection> | null = null

  public getStatus(): ModelStatus {
    return this.status
  }

  public async loadModel(onStatusChange?: (status: ModelStatus) => void): Promise<cocoSsd.ObjectDetection> {
    if (this.model) {
      this.status = 'ready'
      onStatusChange?.('ready')
      return this.model
    }

    if (this.loadPromise) {
      return this.loadPromise
    }

    this.status = 'loading'
    onStatusChange?.('loading')

    this.loadPromise = (async () => {
      try {
        await tf.ready()
        // Load lightweight COCO-SSD pretrained model
        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2',
        })
        this.model = loadedModel
        this.status = 'ready'
        onStatusChange?.('ready')
        return loadedModel
      } catch (err) {
        this.status = 'error'
        onStatusChange?.('error')
        this.loadPromise = null
        console.error('Failed to load TensorFlow COCO-SSD model:', err)
        throw err
      }
    })()

    return this.loadPromise
  }

  public async detectPersons(
    element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
  ): Promise<{ detections: DetectionResult[]; durationMs: number }> {
    if (!this.model) {
      await this.loadModel()
    }

    if (!this.model) {
      throw new Error('ML Model is not loaded')
    }

    const startTime = performance.now()
    const predictions = await this.model.detect(element, 10, 0.35)
    const endTime = performance.now()

    // Filter strictly for person detections
    const personDetections: DetectionResult[] = predictions
      .filter((pred) => pred.class === 'person')
      .map((pred) => ({
        class: pred.class,
        score: Math.round(pred.score * 100) / 100, // actual score from model
        bbox: [
          Math.round(pred.bbox[0]),
          Math.round(pred.bbox[1]),
          Math.round(pred.bbox[2]),
          Math.round(pred.bbox[3]),
        ] as [number, number, number, number],
      }))

    return {
      detections: personDetections,
      durationMs: Math.round(endTime - startTime),
    }
  }
}

export const modelService = new ModelService()
