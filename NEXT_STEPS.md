# Roadmap / handoff notes

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

- `src/audio/wav.ts` — done, not yet wired up. `blobToWav()` decodes the
  recorded webm/opus blob and re-encodes as 16-bit PCM WAV (plays everywhere,
  unlike webm). `encodeWav()` is the reusable low-level piece.
- **Still needed:**
  1. Wire a "Download" button into the scorecard or the user's `AudioBubble`
     that calls `blobToWav(result.blob)` and triggers a save (`URL.createObjectURL`
     + temporary `<a download>`).
  2. Share-card PNG generator: canvas composite of speaker portrait + reference
     waveform + user waveform + score ring, sized for IG/TikTok (1080×1920).
     Reuse `drawBars()` from `waveform.ts` for both waveforms.
  3. Share-video export: same composite, animated (waveform draws in sync with
     playback) + the user's actual audio track, encoded via
     `canvas.captureStream()` + `MediaRecorder` → WebM, or ffmpeg.wasm if a
     specific container/codec (e.g. mp4 for IG) turns out to be required.
     Keep it toggle-able and treat as a stretch goal per the original ask —
     don't block the PNG path on it.
  4. Speaker *video* behind the waveform (rather than a static photo) is an
     explicit stretch goal — only pursue after the above ships.

## Not started — Stage 2: LLM coach backend

User wants a real backend (not another client-side key), producing a **one-shot
coach note** (not a chat) after each scored attempt, cheap to run, pluggable
across providers (DeepSeek, self-hosted, etc.).

Suggested cheap approach:
- Small serverless proxy (Cloudflare Worker or Vercel Edge Function — both have
  generous free tiers and no idle cost) that holds the API key server-side and
  forwards a single chat-completion request.
- Speak the **OpenAI chat-completions wire format** as the lingua franca — it
  covers DeepSeek, Ollama/self-hosted, OpenRouter, and LM Studio with one
  adapter; add a thin Anthropic-format adapter alongside it.
- Request body: full `ScoreReport` (dimension scores, transcript vs. target,
  tempo ratio, etc.) + speaker/clip context; response: one coach note string.
- Client calls the proxy instead of an LLM directly; existing rule-based coach
  in `score.ts` stays as the zero-config/offline/error fallback.
- Config (which provider/model the proxy uses) lives in the proxy's env vars,
  not in client localStorage — keeps this a real backend, not a key-in-browser
  hack.
- Note for self-hosted Ollama as a backend target: needs `OLLAMA_ORIGINS` set
  to allow the proxy to reach it.

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
