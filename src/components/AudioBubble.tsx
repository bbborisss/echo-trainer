import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  accent?: boolean
  label?: string
  onEnded?: () => void
  autoPlay?: boolean
}

function format(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioBubble({ src, accent = false, label, onEnded, autoPlay = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = new Audio(src)
    audioRef.current = audio
    const onTime = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0)
    const onMeta = () => setDuration(audio.duration)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onDone = () => {
      setPlaying(false)
      setProgress(1)
      onEnded?.()
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onDone)
    if (autoPlay) audio.play().catch(() => {})
    return () => {
      audio.pause()
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onDone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      if (progress >= 1) audio.currentTime = 0
      audio.play().catch(() => {})
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[230px] ${
        accent ? 'bg-indigo-600 text-white' : 'bg-white text-slate-800 border border-slate-200'
      }`}
    >
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition ${
          accent
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="flex-1">
        {label && (
          <div className={`text-xs font-semibold mb-1 ${accent ? 'text-indigo-100' : 'text-slate-500'}`}>
            {label}
          </div>
        )}
        <div className={`h-1.5 rounded-full overflow-hidden ${accent ? 'bg-white/25' : 'bg-slate-200'}`}>
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              accent ? 'bg-white' : 'bg-indigo-500'
            }`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>
      <span className={`text-xs tabular-nums ${accent ? 'text-indigo-100' : 'text-slate-400'}`}>
        {format(duration)}
      </span>
    </div>
  )
}
