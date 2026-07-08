import type { Clip } from './types'

/**
 * All clips are public-domain recordings. Exact `text` matches what is
 * audible in the trimmed clip files (verified by Whisper transcription).
 *
 * Audio provenance:
 * - armstrong/fdr-fear/jfk/reagan: US government recordings (17 USC §105).
 * - fdr-infamy: address to Congress (archive.org/details/FDRInfamy_201802).
 * - ike-mic: presidential farewell address, PD-marked
 *   (archive.org/details/defarewell).
 * - perkins-security: Sec. of Labor on "America's Town Meeting of the Air",
 *   Dec 1935, digitized and published by the Social Security Administration's
 *   official history archive (archive.org/details/gov.ssa.perkins.townhall).
 * - er-humanrights: Human Rights Day TV message, FDR Presidential Library
 *   upload, CC0 (archive.org/details/gov.fdr.309).
 *
 * Portraits are public-domain photographs via Wikimedia Commons:
 * Armstrong — NASA Apollo 11 crew portrait; FDR — NARA 535943; JFK — White
 * House portrait; Reagan — 1981 official portrait; Eleanor Roosevelt — 1933
 * portrait (PD); Perkins — LOC cph.3a04983; Eisenhower — 1959 official photo.
 */
export const CLIPS: Clip[] = [
  {
    id: 'armstrong-step',
    speaker: 'Neil Armstrong',
    title: 'One Small Step',
    year: 1969,
    text: "That's one small step for man, one giant leap for mankind.",
    audio: '/clips/armstrong-step.mp3',
    image: '/speakers/armstrong.webp',
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
    image: '/speakers/fdr.webp',
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
    image: '/speakers/jfk.webp',
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
    image: '/speakers/jfk.webp',
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
    image: '/speakers/reagan.webp',
    emoji: '🧱',
    context:
      'At the Brandenburg Gate, June 12, 1987, with the Berlin Wall at his back. Six words that ricocheted around the world.',
  },
  {
    id: 'er-humanrights',
    speaker: 'Eleanor Roosevelt',
    title: 'Foundation Stones',
    year: 1950,
    text: 'And the Declaration was written to elaborate the rights already mentioned in the Charter, and to emphasize also, for all of us, the fact that the building of human rights would be one of the foundation stones on which we would build in the world an atmosphere in which peace could grow.',
    audio: '/clips/er-humanrights.mp3',
    image: '/speakers/er.jpg',
    emoji: '🕊️',
    context:
      'A televised Human Rights Day message. Roosevelt chaired the commission that wrote the Universal Declaration of Human Rights — hear how deliberately she builds the long sentence.',
  },
  {
    id: 'perkins-security',
    speaker: 'Frances Perkins',
    title: 'Life, Liberty & Security',
    year: 1935,
    text: 'It is embraced within those famous words of the Declaration of Independence: life, liberty, and the pursuit of happiness. For life and the pursuit of happiness in modern America certainly includes the conception of economic security.',
    audio: '/clips/perkins-security.mp3',
    image: '/speakers/perkins.jpg',
    emoji: '🤝',
    context:
      'America’s Town Meeting of the Air, December 1935. The first woman in a US cabinet defends her months-old Social Security Act before a skeptical debate audience.',
  },
  {
    id: 'fdr-infamy',
    speaker: 'Franklin D. Roosevelt',
    title: 'A Date Which Will Live in Infamy',
    year: 1941,
    text: 'Yesterday, December 7, 1941 — a date which will live in infamy — the United States of America was suddenly and deliberately attacked by naval and air forces of the Empire of Japan.',
    audio: '/clips/fdr-infamy.mp3',
    image: '/speakers/fdr.webp',
    emoji: '⚓',
    context:
      'Address to Congress, December 8, 1941 — the day after Pearl Harbor. Congress declared war thirty-three minutes later. Mind the grave, deliberate pacing.',
  },
  {
    id: 'ike-mic',
    speaker: 'Dwight D. Eisenhower',
    title: 'Military-Industrial Complex',
    year: 1961,
    text: 'In the councils of government, we must guard against the acquisition of unwarranted influence, whether sought or unsought, by the military-industrial complex. The potential for the disastrous rise of misplaced power exists and will persist. We must never let the weight of this combination endanger our liberties or democratic processes.',
    audio: '/clips/ike-mic.mp3',
    image: '/speakers/ike.jpg',
    emoji: '⭐',
    context:
      'Farewell address from the Oval Office, January 17, 1961 — a five-star general, three days from leaving office, warning the nation about its own arms industry.',
  },
]
