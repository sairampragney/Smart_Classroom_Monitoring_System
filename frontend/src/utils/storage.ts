import type { AnalysisResult } from '@/types/vision'

const STORAGE_KEY = 'classroom_vision_last_result'

export function setLastAnalysisResult(result: AnalysisResult | null): void {
  if (!result) {
    sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result))
  } catch (err) {
    console.warn('Failed to save analysis result to sessionStorage:', err)
  }
}

export function getLastAnalysisResult(): AnalysisResult | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AnalysisResult
  } catch {
    return null
  }
}
