# Echo Chamber backend

Cloudflare Worker + D1. Anonymous identity via httpOnly `uid` cookie; game
state is tracked server-side so streaks/attempts survive cache clears and
follow the player across devices.

| Endpoint | What |
|---|---|
| `GET /me?day=YYYY-MM-DD` | bootstrap: mints the uid cookie, returns streak / today's attempts / heard clips / bests / subscribed |
| `POST /heard` | reference clip listened to completion (keeps the mic unlocked across visits) |
| `POST /attempt` | scored attempt; aggregates per day + best-ever, advances the streak on the daily |
| `POST /subscribe` / `GET /unsubscribe?token=` | daily-teaser email opt-in / one-click opt-out |
| `POST /coach` | ScoreReport → one LLM coach note (allowance enforced server-side, 3/clip/day) |
| `POST /transcribe` | raw audio bytes → Whisper transcript |
| cron `0 13 * * *` | daily teaser email (speaker, never the quote) via Resend |

The client treats everything as optional: if `VITE_API_BASE` is unset or a
call fails, it falls back to localStorage state, the rule-based coach, and
browser speech recognition.

## Local dev (no Cloudflare account needed)

```sh
cp server/.dev.vars.example server/.dev.vars       # mock upstream config
PORT=8788 node scripts/mock_backend.mjs &          # mock LLM + Whisper upstreams
cd server
npx wrangler d1 execute echo-chamber-db --local --file=schema.sql
npx wrangler dev --port 8787 --test-scheduled &    # local D1 included
cd .. && VITE_API_BASE=http://localhost:8787 npm run dev
# trigger the email cron: curl "http://localhost:8787/__scheduled?cron=0+13+*+*+*"
```

## Deploy

```sh
cd server
npx wrangler login
npx wrangler d1 create echo-chamber-db          # paste database_id into wrangler.toml
npx wrangler d1 execute echo-chamber-db --file=schema.sql
npx wrangler secret put COACH_API_KEY           # DeepSeek key (sk-...)
npx wrangler secret put ASR_API_KEY             # Groq key (gsk_...)
npx wrangler secret put RESEND_API_KEY          # optional: enables reminder emails
npx wrangler deploy
```

Set `ALLOWED_ORIGINS`, `SITE_URL`, `API_URL`, `EMAIL_FROM` in `wrangler.toml`
for production.

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
