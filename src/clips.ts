import type { Clip } from './types'

/**
 * All clips are public-domain US government recordings (17 USC §105).
 * Exact `text` matches what is audible in the trimmed clip files.
 */
export const CLIPS: Clip[] = [
  {
    id: 'armstrong-step',
    speaker: 'Neil Armstrong',
    title: 'One Small Step',
    year: 1969,
    text: "That's one small step for man, one giant leap for mankind.",
    audio: '/clips/armstrong-step.mp3',
    emoji: '🌕',
    context:
      'Spoken from the surface of the Moon, July 20, 1969, to six hundred million people listening back on Earth.',
  },
  {
    id: 'fdr-fear',
    speaker: 'Franklin D. Roosevelt',
    title: 'Fear Itself',
    year: 1933,
    text: 'So first of all, let me assert my firm belief that the only thing we have to fear is fear itself.',
    audio: '/clips/fdr-fear.mp3',
    emoji: '🎩',
    context:
      'First inaugural address, March 4, 1933 — a country in the depths of the Great Depression needed exactly this sentence.',
  },
  {
    id: 'jfk-asknot',
    speaker: 'John F. Kennedy',
    title: 'Ask Not',
    year: 1961,
    text: 'And so, my fellow Americans: ask not what your country can do for you — ask what you can do for your country.',
    audio: '/clips/jfk-asknot.mp3',
    emoji: '🇺🇸',
    context:
      'The climax of JFK’s inaugural address, January 20, 1961. Listen for the pause before the turn.',
  },
  {
    id: 'jfk-moon',
    speaker: 'John F. Kennedy',
    title: 'We Choose the Moon',
    year: 1962,
    text: 'We choose to go to the Moon in this decade and do the other things, not because they are easy, but because they are hard.',
    audio: '/clips/jfk-moon.mp3',
    emoji: '🚀',
    context:
      'Rice University, September 12, 1962. Kennedy is fighting a headwind of skeptics — hear how he leans into “hard.”',
  },
  {
    id: 'reagan-wall',
    speaker: 'Ronald Reagan',
    title: 'Tear Down This Wall',
    year: 1987,
    text: 'Mr. Gorbachev, tear down this wall!',
    audio: '/clips/reagan-wall.mp3',
    emoji: '🧱',
    context:
      'At the Brandenburg Gate, June 12, 1987, with the Berlin Wall at his back. Six words that ricocheted around the world.',
  },
]
