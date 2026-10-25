import { createHmac, timingSafeEqual } from 'node:crypto'

function safeEqual(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function verifyTelegramInitData(initData, botToken, now = Date.now()) {
  if (!initData || !botToken) throw authError('Telegram authentication is not configured')
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  if (!hash || !authDate) throw authError('Telegram initData is incomplete')
  if (Math.abs(now / 1000 - authDate) > 24 * 60 * 60) throw authError('Telegram initData has expired')
  const check = [...params.entries()].filter(([key]) => key !== 'hash').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest('hex')
  if (!safeEqual(hash, expected)) throw authError('Telegram signature is invalid')
  const user = JSON.parse(params.get('user') ?? '{}')
  if (!user.id || !user.first_name) throw authError('Telegram user is missing')
  return { id: `tg:${user.id}`, telegramId: String(user.id), name: [user.first_name, user.last_name].filter(Boolean).join(' ') }
}

export function authenticate(request, config, now = Date.now()) {
  const header = request.headers.authorization ?? ''
  if (header.startsWith('tma ')) return verifyTelegramInitData(header.slice(4), config.botToken, now)
  const devPlayer = request.headers['x-dev-player']
  if (config.allowDevAuth && config.nodeEnv !== 'production' && devPlayer) {
    const id = String(devPlayer).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
    if (!id) throw authError('Invalid development player')
    let name = String(request.headers['x-dev-name'] ?? id)
    try { name = decodeURIComponent(name) } catch { /* plain ASCII name */ }
    name = name.slice(0, 40)
    return { id: `dev:${id}`, name }
  }
  throw authError('Authentication required')
}

function authError(message) { return Object.assign(new Error(message), { status: 401, code: 'AUTH_REQUIRED' }) }

