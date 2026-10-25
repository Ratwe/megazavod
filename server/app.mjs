import { createServer } from 'node:http'
import { authenticate } from './auth.mjs'

const readJson = request => new Promise((resolve, reject) => {
  let body = ''
  request.on('data', chunk => {
    body += chunk
    if (body.length > 32_000) reject(Object.assign(new Error('Body too large'), { status: 413, code: 'BODY_TOO_LARGE' }))
  })
  request.on('end', () => {
    try { resolve(body ? JSON.parse(body) : {}) } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400, code: 'INVALID_JSON' })) }
  })
  request.on('error', reject)
})

export function createStoryServer(store, options = {}) {
  const config = {
    botToken: options.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? '',
    allowDevAuth: options.allowDevAuth ?? process.env.ALLOW_DEV_AUTH === 'true',
    nodeEnv: options.nodeEnv ?? process.env.NODE_ENV ?? 'development',
    allowedOrigins: options.allowedOrigins ?? (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(',').map(value => value.trim()),
  }

  return createServer(async (request, response) => {
    const origin = request.headers.origin
    if (origin && config.allowedOrigins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Dev-Player, X-Dev-Name')
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS')
    }
    if (request.method === 'OPTIONS') return send(response, 204, null)
    try {
      const url = new URL(request.url, 'http://localhost')
      if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { ok: true, time: new Date(store.now()).toISOString() })
      const identity = authenticate(request, config, store.now())
      const player = store.ensurePlayer(identity)
      if (request.method === 'GET' && url.pathname === '/api/episode/current') return send(response, 200, store.snapshot(player.id))
      if (request.method === 'GET' && url.pathname === '/api/works/available') return send(response, 200, store.availableWorks(player.id))
      if (request.method === 'GET' && url.pathname === '/api/chronicle') return send(response, 200, store.chronicle(Number(url.searchParams.get('after') ?? 0)))
      if (request.method === 'POST' && url.pathname === '/api/chronicle/read') {
        const body = await readJson(request)
        return send(response, 200, store.markChronicleRead(player.id, body.sequence))
      }
      if (request.method === 'GET' && url.pathname === '/api/recap') return send(response, 200, store.recap(player.id))
      if (request.method === 'GET' && url.pathname === '/api/council/current') return send(response, 200, store.council(player.id))
      if (request.method === 'GET' && url.pathname === '/api/player/me') return send(response, 200, store.getPlayer(player.id))
      if (request.method === 'POST' && url.pathname === '/api/player/location') {
        const body = await readJson(request)
        return send(response, 200, store.setPlayerLocation(player.id, body.location))
      }
      const contribution = url.pathname.match(/^\/api\/works\/([^/]+)\/contribute$/)
      if (request.method === 'POST' && contribution) {
        const body = await readJson(request)
        return send(response, 200, store.contribute(player.id, decodeURIComponent(contribution[1]), body.eventId))
      }
      const ballot = url.pathname.match(/^\/api\/council\/([^/]+)\/ballot$/)
      if (request.method === 'PUT' && ballot) {
        const body = await readJson(request)
        return send(response, 200, store.vote(player.id, decodeURIComponent(ballot[1]), body.optionId))
      }
      const result = url.pathname.match(/^\/api\/council\/([^/]+)\/result$/)
      if (request.method === 'GET' && result) {
        const council = store.council(player.id)
        if (!council || council.id !== decodeURIComponent(result[1])) throw Object.assign(new Error('Вече не найдено'), { status: 404, code: 'VOTE_NOT_FOUND' })
        return send(response, 200, council.status === 'closed' ? council : { status: 'open', closesAt: council.closesAt })
      }
      return send(response, 404, { error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } })
    } catch (error) {
      return send(response, error.status ?? 500, { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.status ? error.message : 'Internal server error' } })
    }
  })
}

function send(response, status, body) {
  response.statusCode = status
  if (body == null) return response.end()
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

