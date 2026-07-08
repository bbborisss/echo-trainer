// Mock of server/ for integration testing without API keys.
// Mimics POST /coach and POST /transcribe with canned responses + CORS.
import http from 'node:http'

const PORT = 8787

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
      } else {
        res.end(JSON.stringify({ error: 'not found' }))
      }
    })
  })
  .listen(PORT, () => console.log(`mock backend on http://localhost:${PORT}`))
