export class CameraService {
  private stream: MediaStream | null = null

  public async startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    this.stopCamera()

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera access is not supported by your browser.')
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints)
      videoElement.srcObject = this.stream
      await videoElement.play()
      return this.stream
    } catch (err: any) {
      this.stopCamera()
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Camera permission was denied. Please allow camera access in browser settings.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No camera hardware found on your device.')
      } else {
        throw new Error(err.message || 'Failed to start camera feed.')
      }
    }
  }

  public stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
  }

  public isActive(): boolean {
    return !!this.stream && this.stream.active
  }
}

export const cameraService = new CameraService()
