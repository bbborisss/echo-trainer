import { useEffect, useState } from 'react'
import type { Clip } from '../types'
import { getRefData } from '../audio/refdata'
import { AudioBubble } from './AudioBubble'

interface Props {
  clip: Clip
  onEnded?: () => void
}

/** Speaker portrait with the clip's sound wave and quote beneath it. */
export function ClipCard({ clip, onEnded }: Props) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null)

  useEffect(() => {
    let alive = true
    getRefData(clip)
      .then((d) => {
        if (alive) setPeaks(d.wave.peaks)
      })
      .catch(() => {}) // waveform is decorative; playback errors surface elsewhere
    return () => {
      alive = false
    }
  }, [clip])

  return (
    <div className="w-full max-w-[320px] space-y-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={clip.image}
          alt={`Portrait of ${clip.speaker}`}
          className="h-40 w-full object-cover object-top"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2 pt-8">
          <div className="text-sm font-bold leading-tight text-white">{clip.speaker}</div>
          <div className="text-[11px] text-white/80">
            {clip.emoji} {clip.title} · {clip.year}
          </div>
        </div>
      </div>
      <AudioBubble src={clip.audio} peaks={peaks} onEnded={onEnded} />
      <blockquote className="border-l-2 border-indigo-300 pl-3 font-display text-sm italic text-slate-600">
        “{clip.text}”
      </blockquote>
    </div>
  )
}
