# Echo Chamber backend

Thin Cloudflare Worker proxy. Two endpoints, keys stay server-side:

| Endpoint | In | Out |
|---|---|---|
| `POST /coach` | `{ clip, report, attempt }` JSON | `{ note }` — one LLM coach note |
| `POST /transcribe` | raw audio bytes (webm/opus) | `{ text }` — Whisper transcript |

The client treats both as optional: if `VITE_API_BASE` is unset or a call
fails, it falls back to the rule-based coach and browser speech recognition.

## Deploy

```sh
cd server
npx wrangler login
npx wrangler secret put COACH_API_KEY   # DeepSeek key (sk-...)
npx wrangler secret put ASR_API_KEY     # Groq key (gsk_...)
npx wrangler deploy
```

Then point the client at it — in the project root create `.env.local`:

```
VITE_API_BASE=https://echo-chamber-api.<your-subdomain>.workers.dev
```

Update `ALLOWED_ORIGINS` in `wrangler.toml` with your production origin.

## Swapping providers

Everything is env config in `wrangler.toml` — no code changes:

- **Coach LLM** — any OpenAI-compatible endpoint: set `COACH_BASE_URL` +
  `COACH_MODEL` (DeepSeek, Groq, OpenRouter, LM Studio, self-hosted Ollama —
  for Ollama set `OLLAMA_ORIGINS` so the Worker can reach it). For Anthropic,
  set `COACH_FORMAT = "anthropic"` and `COACH_MODEL = "claude-haiku-4-5"`.
- **ASR** — any OpenAI-compatible `/audio/transcriptions` endpoint: Groq
  (default), OpenAI Whisper, or self-hosted faster-whisper behind such a shim.

## Local dev

```sh
npx wrangler dev   # serves on http://localhost:8787
```

with `VITE_API_BASE=http://localhost:8787` in `.env.local`.
