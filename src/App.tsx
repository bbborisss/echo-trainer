import { useCallback, useState } from 'react'
import { CLIPS } from './clips'
import type { Clip } from './types'
import { dailyClip } from './game'
import { IntroScreen } from './screens/IntroScreen'
import { PracticeScreen } from './screens/PracticeScreen'
import { GameScreen } from './screens/GameScreen'

type Screen =
  | { name: 'intro' }
  | { name: 'practice-picker' }
  | { name: 'game'; clip: Clip; mode: 'daily' | 'practice' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'intro' })
  const daily = dailyClip(CLIPS)

  const goHome = useCallback(() => setScreen({ name: 'intro' }), [])
  const goPractice = useCallback(() => setScreen({ name: 'practice-picker' }), [])

  switch (screen.name) {
    case 'intro':
      return (
        <IntroScreen
          daily={daily}
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
