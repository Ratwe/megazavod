import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StoryStore } from '../server/store.mjs'
import { createStoryServer } from '../server/app.mjs'

async function withApi(run) {
  let now = Date.UTC(2026, 9, 25, 10, 0, 0)
  const store = new StoryStore({ filename: ':memory:', now: () => now })
  const server = createStoryServer(store, { allowDevAuth: true, nodeEnv: 'test', allowedOrigins: ['http://localhost'] })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const client = (id, name = id) => async (path, init = {}) => {
    const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Dev-Player': id, 'X-Dev-Name': encodeURIComponent(name), ...init.headers } })
    const body = await response.json()
    return { status: response.status, body }
  }
  try { await run({ store, client, setNow: value => { now = value }, getNow: () => now }) } finally { await new Promise(resolve => server.close(resolve)); store.close() }
}

async function complete(client, workId, count, prefix) {
  for (let index = 0; index < count; index += 1) {
    const result = await client(`/api/works/${workId}/contribute`, { method: 'POST', body: JSON.stringify({ eventId: `${prefix}:${index}` }) })
    assert.equal(result.status, 200)
  }
}

test('two clients publish shared facts, one synthesis and a council', async () => withApi(async ({ client }) => {
  const alice = client('alice', 'Алиса')
  const boris = client('boris', 'Борис')
  await complete(alice, 'drive-diagnostics', 20, 'a-drive')
  let bobEpisode = await boris('/api/episode/current')
  assert.equal(bobEpisode.body.publicFacts.some(fact => fact.id === 'drive_worn'), true)
  await complete(boris, 'power-audit', 20, 'b-power')
  bobEpisode = await alice('/api/episode/current')
  assert.equal(bobEpisode.body.publicFacts.some(fact => fact.id === 'manual_cutoff'), true)
  assert.equal(bobEpisode.body.council.status, 'open')
  const chronicle = await alice('/api/chronicle')
  assert.equal(chronicle.body.filter(entry => entry.id === 'chapter:synthesis-diagnostics').length, 1)
  assert.deepEqual(chronicle.body.find(entry => entry.id === 'chapter:synthesis-diagnostics').contributors.map(person => person.name).sort(), ['Алиса', 'Борис'])
}))

test('contribution idempotency prevents duplicate progress and XP', async () => withApi(async ({ client }) => {
  const alice = client('alice')
  const first = await alice('/api/works/drive-diagnostics/contribute', { method: 'POST', body: JSON.stringify({ eventId: 'same-event' }) })
  const second = await alice('/api/works/drive-diagnostics/contribute', { method: 'POST', body: JSON.stringify({ eventId: 'same-event' }) })
  assert.equal(first.body.duplicate, false)
  assert.equal(second.body.duplicate, true)
  const me = await alice('/api/player/me')
  assert.equal(me.body.skills.repair.xp, 1)
  assert.equal(me.body.contributions[0].amount, 1)
}))

test('one account replaces its ballot and counts once', async () => withApi(async ({ client, store }) => {
  const alice = client('alice')
  const bob = client('bob')
  await complete(alice, 'drive-diagnostics', 20, 'drive')
  await complete(bob, 'power-audit', 20, 'power')
  const vote = store.council('dev:alice')
  await alice(`/api/council/${vote.id}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId: 'launch' }) })
  await alice(`/api/council/${vote.id}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId: 'investigate' }) })
  const rows = store.db.prepare('SELECT * FROM council_ballots WHERE vote_id = ?').all(vote.id)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].option_id, 'investigate')
  assert.equal('totalBallots' in store.council('dev:alice'), false)
}))

test('council is open at 23:59:59 and closes exactly at 24:00:00 once', async () => withApi(async ({ client, store, setNow }) => {
  const alice = client('alice')
  const bob = client('bob')
  await complete(alice, 'drive-diagnostics', 20, 'drive')
  await complete(bob, 'power-audit', 20, 'power')
  const vote = store.db.prepare('SELECT * FROM council_votes').get()
  setNow(vote.closes_at - 1000)
  assert.equal((await alice(`/api/council/${vote.id}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId: 'launch' }) })).status, 200)
  assert.equal(store.council('dev:alice').status, 'open')
  setNow(vote.closes_at)
  const episode = await alice('/api/episode/current')
  assert.equal(episode.body.council.status, 'closed')
  assert.equal(episode.body.council.resultOptionId, 'launch')
  assert.equal(store.db.prepare("SELECT COUNT(*) count FROM chronicle_entries WHERE id = ?").get(`council-result:${vote.id}`).count, 1)
  await alice('/api/episode/current')
  assert.equal(store.db.prepare("SELECT COUNT(*) count FROM chronicle_entries WHERE id = ?").get(`council-result:${vote.id}`).count, 1)
  assert.equal((await bob(`/api/council/${vote.id}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId: 'conserve' }) })).status, 409)
}))

test('tie chooses safe default and different result changes available work', async () => withApi(async ({ client, store, setNow }) => {
  const alice = client('alice')
  const bob = client('bob')
  await complete(alice, 'drive-diagnostics', 20, 'drive')
  await complete(bob, 'power-audit', 20, 'power')
  const vote = store.db.prepare('SELECT * FROM council_votes').get()
  await alice(`/api/council/${vote.id}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId: 'launch' }) })
  await bob(`/api/council/${vote.id}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId: 'conserve' }) })
  setNow(vote.closes_at)
  const works = (await alice('/api/works/available')).body.filter(work => work.status !== 'completed').map(work => work.id)
  assert.equal(store.council('dev:alice').resultOptionId, 'investigate')
  assert.equal(works.includes('repair-drive'), true)
  assert.equal(works.includes('bypass-interlock'), false)
  assert.equal(works.includes('seal-shaft'), false)
}))

test('recap cursor marks significant entries as read', async () => withApi(async ({ client }) => {
  const alice = client('alice')
  let recap = await alice('/api/recap')
  assert.equal(recap.body.whileAway.length, 1)
  await alice('/api/chronicle/read', { method: 'POST', body: JSON.stringify({ sequence: recap.body.latestSequence }) })
  recap = await alice('/api/recap')
  assert.equal(recap.body.whileAway.length, 0)
}))

test('SQLite persistence survives store restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zavod-story-'))
  const filename = join(directory, 'story.db')
  const first = new StoryStore({ filename, now: () => 1000 })
  first.ensurePlayer({ id: 'dev:persist', name: 'Память' })
  first.contribute('dev:persist', 'drive-diagnostics', 'persistent-event')
  first.close()
  const second = new StoryStore({ filename, now: () => 2000 })
  assert.equal(second.getPlayer('dev:persist').skills.repair.xp, 1)
  assert.equal(second.availableWorks('dev:persist').find(work => work.id === 'drive-diagnostics').progress, 1)
  second.close()
})

test('production mode rejects development identity headers', async () => {
  const store = new StoryStore({ filename: ':memory:' })
  const server = createStoryServer(store, { allowDevAuth: true, nodeEnv: 'production' })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/player/me`, { headers: { 'X-Dev-Player': 'forged' } })
  assert.equal(response.status, 401)
  await new Promise(resolve => server.close(resolve)); store.close()
})

