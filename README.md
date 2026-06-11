# 🎙️ Echo Chamber

A voice-mimicry game. The app plays you a line from a famous speech; you say it back; it scores how well your **pronunciation, intonation, rhythm and tone** match the original speaker — then coaches you to do better. Three tries per speech per day.

## How scoring works (all in-browser, no server)

1. Your take and the reference clip are decoded to 16 kHz mono via the Web Audio API.
2. Per-frame features are extracted: YIN pitch (converted to semitones relative to each speaker's own median, so vocal register doesn't matter — only melody shape), RMS energy, spectral centroid.
3. The two takes are aligned with dynamic time warping (DTW), so speaking slightly faster/slower still compares corresponding moments.
4. Dimension scores:
   - **Intonation** — correlation of aligned pitch contours
   - **Rhythm** — tempo ratio + how much DTW had to warp the timeline
   - **Tone** — correlation of aligned loudness dynamics + spectral brightness
   - **Pronunciation** — browser SpeechRecognition transcript vs the target text (word error rate). Gracefully skipped where unsupported.
5. Rule-based coach notes are generated from the measurements (too fast, too flat, missed words, …).

## Clips

All reference clips are public-domain US government recordings (17 USC §105): FDR's first inaugural, JFK's inaugural and Rice "Moon" speech, Apollo 11, and Reagan at the Brandenburg Gate. Sources: Wikimedia Commons and the Internet Archive.

To regenerate clips from the raw downloads: `python scripts/locate_phrases.py` finds phrase timestamps with Whisper, then trim with ffmpeg into `public/clips/`.

## Run

```sh
npm install
npm run dev
```

Use Chrome or Edge for all four score dimensions (SpeechRecognition). Wear headphones so the mic only hears you.

## Game rules

- 3 recording attempts per speech per day (tracked in localStorage)
- A speech locks after the third take and unlocks the next day
- Daily play maintains a 🔥 streak
