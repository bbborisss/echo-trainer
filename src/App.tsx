import { useCallback, useEffect, useState } from 'react'
import { CLIPS } from './clips'
import type { Clip } from './types'
import { fetchMe } from './api'
import { dailyClip, mergeServerState, todayKey } from './game'
import { IntroScreen } from './screens/IntroScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { GameScreen } from './screens/GameScreen'

type Screen =
  | { name: 'intro' }
  | { name: 'practice-picker' }
  | { name: 'game'; clip: Clip; mode: 'daily' | 'practice' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'intro' })
  const [subscribed, setSubscribed] = useState(false)
  const [, setSynced] = useState(0) // re-render once server state is merged
  const daily = dailyClip(CLIPS)

  // Boot: pull the server's view of this player (identity cookie, streak,
  // attempts, heard clips) and merge it into local state. Offline: no-op.
  useEffect(() => {
    void fetchMe(todayKey()).then((state) => {
      if (!state) return
      mergeServerState(state)
      setSubscribed(state.subscribed)
      setSynced((n) => n + 1)
    })
  }, [])

  const goHome = useCallback(() => setScreen({ name: 'intro' }), [])
  const goPractice = useCallback(() => setScreen({ name: 'practice-picker' }), [])

  switch (screen.name) {
    case 'intro':
      return (
        <IntroScreen
          daily={daily}
          subscribed={subscribed}
          onSubscribed={() => setSubscribed(true)}
          onPlayDaily={() => setScreen({ name: 'game', clip: daily, mode: 'daily' })}
          onPractice={goPractice}
        />
      )
    case 'practice-picker':
      return (
        <PracticeScreen
          clips={CLIPS}
          dailyId={daily.id}
          onPick={(clip) => setScreen({ name: 'game', clip, mode: 'practice' })}
          onBack={goHome}
        />
      )
    case 'game':
      return (
        <GameScreen
          key={screen.clip.id} // remount per clip so recorder/ghost state resets
          clip={screen.clip}
          mode={screen.mode}
          onExit={goHome}
          onPractice={goPractice}
        />
      )
  }
}
