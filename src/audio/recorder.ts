import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'error'

export interface RecordingResult {
  blob: Blob
  url: string
}

// Generous ceiling: the longest reference clip is ~31s and players run long.
const MAX_RECORDING_MS = 45_000

export function useRecorder(onComplete: (result: RecordingResult) => void) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    setAnalyser(null)
  }, [])

  useEffect(() => cleanup, [cleanup])

  /** Returns true once recording is actually running (mic granted). */
  const start = useCallback(async (): Promise<boolean> => {
    setError(null)
    setStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      // Tap the stream with an analyser so the UI can draw live levels.
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const tap = audioCtx.createAnalyser()
      tap.fftSize = 2048
      tap.smoothingTimeConstant = 0.4
      audioCtx.createMediaStreamSource(stream).connect(tap)
      setAnalyser(tap)

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      )
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType })
        cleanup()
        setStatus('idle')
        setElapsed(0)
        onComplete({ blob, url: URL.createObjectURL(blob) })
      }
      mediaRef.current = recorder
      recorder.start()
      startedAtRef.current = Date.now()
      setStatus('recording')
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startedAtRef.current
        setElapsed(ms)
        if (ms >= MAX_RECORDING_MS) {
          mediaRef.current?.stop()
        }
      }, 100)
      return true
    } catch {
      cleanup()
      setStatus('error')
      setError('Microphone access denied. Allow the mic in your browser and try again.')
      return false
    }
  }, [cleanup, onComplete])

  const stop = useCallback(() => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop()
    }
  }, [])

  return { status, error, elapsed, analyser, start, stop }
}
