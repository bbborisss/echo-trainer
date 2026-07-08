# Roadmap / handoff notes

## Done — Stage 3: stateful backend + retention loop (2026-07-08)

Worker grew from a thin proxy into a real backend (D1 + cookies + cron); see
`server/README.md` for endpoints, local-dev recipe (no Cloudflare account
needed — wrangler dev + `scripts/mock_backend.mjs` as LLM/ASR upstreams on
port 8788), and deploy steps.

- **Anonymous identity**: httpOnly `uid` cookie minted on `GET /me`; game
  state (attempts/day, best-ever, streak, heard-clips) lives in D1, keyed by
  uid + the client's LOCAL day string (server never guesses timezones).
- **Client hybrid state**: localStorage stays authoritative offline;
  `mergeServerState()` on boot (max/union merge), every mutation fire-and-
  forgets to the server. Verified: attempts + heard state survive a full
  localStorage wipe, restored via cookie.
- **Mic-gate bug fixed**: "heard clip X today" now persists in game state
  (`markHeard`/`heardToday`) + syncs to `/heard` — the mic stays unlocked when
  leaving/returning to the game screen, reloading, or switching devices.
- **Coach allowance enforced server-side** (3/clip/day, checked against the
  attempts table; 429 past the cap).
- **Email retention loop**: opt-in card on intro (`POST /subscribe`), daily
  cron (13:00 UTC) sends the tomorrow-teaser email via Resend when
  RESEND_API_KEY is set (silently skips otherwise), one-click `GET
  /unsubscribe?token=`. OG meta tags added for link unfurls.
- **Still needed to go live**: `wrangler login` + `d1 create` (paste id into
  wrangler.toml) + secrets (DeepSeek/Groq/Resend) + `wrangler deploy`, then a
  real-provider coaching-quality pass (prompt tuning in `COACH_SYSTEM`).
  Later hardening: rate-limit /coach & /transcribe per uid, email
  double-opt-in/verification, backfill offline plays to the server on boot.

## Done — Stage 1f: library expansion + tomorrow teaser (2026-07-08)

- **Four new clips** (see provenance in `src/clips.ts`): Eleanor Roosevelt
  (Human Rights Day, ~30s), Frances Perkins (Social Security, ~16s),
  FDR Pearl Harbor "Infamy" (~28s), Eisenhower military-industrial complex
  (~26s). Longer snippets than the original five; `MAX_RECORDING_MS` bumped
  30s → 45s to fit. Clip texts verified against audio via whisper.cpp
  (`brew install whisper-cpp` + `tools/ggml-base.en.bin`); pipeline: download
  from archive.org → cut windows with ffmpeg → base.en transcribe → adjust
  boundaries → encode 48kHz mono 96kbps mp3 with fades → re-transcribe the
  encoded clip as QA. (Watch for Whisper hallucinating "Thank you" on faded
  tails — transcribe the tail in isolation to check.)
- **Sourcing leads that didn't pan out** (for next expansion): Barbara Jordan
  1974 impeachment statement — only found on americanrhetoric.com (they claim
  rights on their encodes; look for the NARA/pool recording); Shirley Chisholm
  — no House floor audio exists pre-1978; Sally Ride / NASA women — air-to-
  ground audio is §105-clean, worth mining NASA collections on archive.org.
- **Tomorrow teaser**: intro screen shows next day's speaker (portrait, name,
  year — never the quote) via `tomorrowClip()` in `game.ts`.

Working through five feature requests in discrete, independently-committed stages
(see git log for what's landed). This file tracks what's left so work can resume
on another machine.

## Done

- **Stage 1a** (885f104): shared waveform module (`src/audio/waveform.ts`), live
  ghost-envelope view while recording (`LiveWave.tsx`, taps a mic `AnalyserNode`
  added to `useRecorder`), and a "melody map" chart on the scorecard comparing
  aligned pitch contours (`ScoreReport.melody`, computed in `score.ts`).
- **Stage 1b** (3096eb5): public-domain speaker portraits in `public/speakers/`
  (Wikimedia Commons, same §105 basis as the audio clips), new `ClipCard.tsx`
  showing portrait + waveform + quote, reference-data caching pulled out into
  `src/audio/refdata.ts` so components can share it with the scorer.

## In progress — Stage 1c: exports

Goal: download your take as audio, and a share-card / share-video suitable for
IG/TikTok (vertical, waveform + score baked in).

- `src/audio/wav.ts` — done. `blobToWav()` decodes the recorded webm/opus blob
  and re-encodes as 16-bit PCM WAV (plays everywhere, unlike webm).
  `encodeWav()` is the reusable low-level piece.
- **Done (items 1 & 2):**
  1. ✅ "Download take" button on the scorecard (`ScoreCard` → `ExportRow`)
     calls `blobToWav(blob)` and saves via `saveBlob()` (`src/audio/download.ts`,
     `URL.createObjectURL` + temporary `<a download>`).
  2. ✅ Share-card PNG generator (`src/audio/shareCard.ts`, `renderShareCard()`):
     1080×1920 canvas composite of portrait + quote + score ring + per-dimension
     chips + original/you waveforms (reuses `drawBars()`). "Share card" button
     uses the Web Share API with a file when available (mobile → straight to
     IG/TikTok), else falls back to a plain PNG download.
     - The scorecard message now carries `blob`, `refPeaks`, `userPeaks`, `clip`
       (see `ChatMessage` in `types.ts`; wired in `App.handleRecordingComplete`).
     - E2E coverage: `scripts/smoke_export.mjs` drives record→score, clicks both
       buttons, and asserts the WAV (RIFF/WAVE, 16-bit) and PNG (signature,
       1080×1920) bytes. Run with the dev server up: `node scripts/smoke_export.mjs`.
- **Still needed:**
  3. Share-video export: same composite, animated (waveform draws in sync with
     playback) + the user's actual audio track, encoded via
     `canvas.captureStream()` + `MediaRecorder` → WebM, or ffmpeg.wasm if a
     specific container/codec (e.g. mp4 for IG) turns out to be required.
     Keep it toggle-able and treat as a stretch goal per the original ask —
     don't block the PNG path on it.
  4. Speaker *video* behind the waveform (rather than a static photo) is an
     explicit stretch goal — only pursue after the above ships.

## Done — Stage 1d: game-feel review round (2026-07-07)

Product review against the "Wordle viral loop" bar led to three shipped changes:

- **Dark theme**: zinc-950/900 surfaces with orange accents replace the white
  slate/indigo look, across all components and the share card (orange is the
  brand color — matches the 🔥 streak).
- **Waveform milestones**: `findMilestones()` in `waveform.ts` picks the ghost
  envelope's prominent peaks; `LiveWave` draws them as ◆ targets that light up
  (with a pop + tally) when the player's live level hits them on time.
  Tunables: `HIT_WINDOW` (±0.22 s) and `HIT_LEVEL` (50 % of the ghost peak).
- **Speech of the Day**: `dayNumber()` / `dailyClip()` in `game.ts`
  (epoch 2026-07-01 = #1, local-date based, deterministic rotation). Everyone
  gets the same clip first — scores comparable between friends; remaining clips
  are framed as practice rounds. Puzzle number shown in the header.

Reviewed-but-deferred backlog (in rough priority order):

1. **Emoji text share** — Wordle-style copy-to-clipboard result
   (`Echo Chamber #N 🎙️ / 🗣️🟩 🎵🟨 … → 78 / 🔥 streak`). The low-friction
   chat-share loop; pairs with the day number that now exists.
2. **Faster returning-player boot** — skip the staged coach greeting
   (~4 s of typing theatre in `App.tsx` boot effect) after the first visit.
3. **Score juice** — confetti / ring animation on 90+ and new-best scorecards.

## Done — Stage 1e: game-UI redo (2026-07-07)

Chat interface replaced with a screen-based game flow:

- **Screens**: `IntroScreen` (two doors: Speech of the Day vs Practice) →
  `PracticeScreen` (clip grid, daily clip hidden so it can't burn takes) →
  `GameScreen` (portrait hero, "The occasion" context, quote, listen, record,
  results). `App.tsx` is now a tiny router; `ChatMessage`/`LiveWave`/`ClipCard`
  removed.
- **Rules**: daily keeps 3 takes; practice is unlimited; the 🔥 streak is earned
  only by playing the daily (`recordAttempt(..., {daily})`). LLM coaching is
  allowed for the first `MAX_COACHED_TRIES` (3) attempts per clip per day
  (`coachedTriesLeft`).
- **ScrollingWave** (`src/components/ScrollingWave.tsx`): note-highway live
  view — fixed 140 px/s scale so the wave starts off-screen and scrolls under
  a fixed playhead (30% from left), milestone ◆s ride along, gradient edge
  fades. Replaces the squeeze-to-fit `LiveWave`.
- Smoke tests rewritten for the new flow (`smoke.mjs`, `smoke_full.mjs`,
  `smoke_export.mjs`, `probe_smoke.mjs` — probes now cover daily lock,
  lock persistence, unlimited practice, daily hidden from practice).

## Done — Stage 2: backend (LLM coach + server ASR) (2026-07-07)

Cloudflare Worker in `server/` (deploy: see `server/README.md`; not yet
deployed — needs `wrangler login` + DeepSeek/Groq keys as secrets):

- `POST /coach` — one-shot coach note. Speaks OpenAI chat-completions format
  (default: DeepSeek `deepseek-chat`) with an Anthropic `/v1/messages` adapter
  via `COACH_FORMAT=anthropic` (default model `claude-haiku-4-5`). Provider is
  env config in `wrangler.toml`, key is a Worker secret.
- `POST /transcribe` — raw audio bytes → Whisper transcript via any
  OpenAI-compatible `/audio/transcriptions` endpoint (default: Groq
  `whisper-large-v3-turbo`). Fixes Safari/Firefox having no pronunciation
  scoring; `language=en` pinned.
- **Client** (`src/api.ts`): `VITE_API_BASE` (`.env.local`, see `.env.example`)
  points at the Worker; unset = fully offline. Server transcript is preferred,
  live browser SR is the fallback (`serverTranscript ?? browserTranscript` in
  `GameScreen`); rule-based tips always render, the LLM note appears above them
  in the scorecard when available. All calls are best-effort with timeouts.
- Verified end-to-end against `scripts/mock_backend.mjs` (run it + start vite
  with `VITE_API_BASE=http://localhost:8787` to test without keys); offline
  fallback covered by the standard smoke suite.
- **Still needed:** actually deploy the Worker, then a smoke pass against the
  real providers; consider word-timestamps from Whisper (`verbose_json`) for
  sharper per-word feedback later.

## Not started — Stage 3: i18n

Spanish + Mandarin (zh-CN) UI localization, recordings stay English/agnostic.

- Do this *last* — every other stage adds UI strings, and translating before
  they exist means translating twice.
- Strings live in two places right now: canned coach lines in `App.tsx`, and
  generated feedback sentences in `score.ts` (these have interpolated values —
  percentages, missing-word lists — so the `t()` helper needs param support).
- Plan: small typed `t(key, params)` dictionary (no i18n library needed at this
  size), toggle in the header, persisted to localStorage, default from
  `navigator.language`.
- Speech quotes stay English (that's what's being mimicked); show a translated
  subtitle in the UI language for comprehension. `SpeechRecognition` stays
  pinned to `en-US` regardless of toggle.
