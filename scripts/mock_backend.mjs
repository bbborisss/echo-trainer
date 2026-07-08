// Mock backends for integration testing without API keys. Serves BOTH:
//  - the game-backend surface (/coach, /transcribe) so the client can be
//    tested without the Worker (legacy mode, port 8787), AND
//  - OpenAI-format provider upstreams (/chat/completions,
//    /audio/transcriptions) so the REAL Worker (wrangler dev) can point its
//    COACH_BASE_URL / ASR_BASE_URL here (port 8788 via PORT env).
import http from 'node:http'

const PORT = Number(process.env.PORT ?? 8787)

http
  .createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      return res.end()
    }
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors })
      if (req.url === '/coach') {
        const payload = JSON.parse(body.toString() || '{}')
        console.log('coach request: attempt', payload.attempt, 'overall', payload.report?.overall)
        res.end(JSON.stringify({ note: `Mock coach: punch "${payload.clip?.title}" harder on the downbeat.` }))
      } else if (req.url === '/transcribe') {
        console.log('transcribe request:', body.length, 'bytes of', req.headers['content-type'])
        res.end(JSON.stringify({ text: 'mock server transcript of your take' }))
      } else if (req.url === '/chat/completions') {
        // OpenAI-format LLM upstream (what the Worker's /coach calls)
        const payload = JSON.parse(body.toString() || '{}')
        const user = payload.messages?.find((m) => m.role === 'user')?.content ?? ''
        console.log('LLM upstream request, model', payload.model, '| prompt bytes', user.length)
        res.end(
          JSON.stringify({
            choices: [
              { message: { role: 'assistant', content: 'Mock LLM note: lean into the pauses — your rhythm ran ahead of the original.' } },
            ],
          }),
        )
      } else if (req.url === '/audio/transcriptions') {
        // OpenAI-format Whisper upstream (what the Worker's /transcribe calls)
        console.log('ASR upstream request:', body.length, 'bytes multipart')
        res.end(JSON.stringify({ text: 'mock whisper transcript from upstream' }))
      } else {
        res.end(JSON.stringify({ error: 'not found' }))
      }
    })
  })
  .listen(PORT, () => console.log(`mock backend on http://localhost:${PORT}`))
