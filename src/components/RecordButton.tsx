interface Props {
  recording: boolean
  disabled?: boolean
  elapsed: number
  onStart: () => void
  onStop: () => void
}

export function RecordButton({ recording, disabled, elapsed, onStart, onStop }: Props) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {recording && (
          <span className="absolute inset-0 rounded-full bg-rose-500 animate-pulse-ring" />
        )}
        <button
          onClick={recording ? onStop : onStart}
          disabled={disabled}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          className={`relative flex h-16 w-16 items-center justify-center rounded-full text-2xl shadow-lg transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
            recording ? 'bg-rose-500 hover:bg-rose-400 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
          }`}
        >
          {recording ? '■' : '🎤'}
        </button>
      </div>
      <span className="text-xs font-medium text-slate-500 tabular-nums">
        {recording ? `${(elapsed / 1000).toFixed(1)}s — tap to finish` : 'Tap to record your take'}
      </span>
    </div>
  )
}
