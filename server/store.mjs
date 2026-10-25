import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  availableDefinitions,
  councilDefinition,
  goalFor,
  openingEntry,
  resolveCouncilBallots,
  workDefinitions,
} from '../src/story/domain.ts'

const RUN_ID = 'silent-lift-public-01'
const EPISODE_ID = 'silent-lift-v1'

const json = value => JSON.stringify(value)
const parse = (value, fallback) => {
  try { return value == null ? fallback : JSON.parse(value) } catch { return fallback }
}

export class StoryStore {
  constructor({ filename = 'server/data/zavod.db', now = () => Date.now() } = {}) {
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true })
    this.db = new DatabaseSync(filename)
    this.now = now
    this.inTransaction = false
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
    this.migrate()
    this.seed()
  }

  close() { this.db.close() }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS episode_runs (
        id TEXT PRIMARY KEY, definition_id TEXT NOT NULL, status TEXT NOT NULL,
        world_state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        started_at INTEGER NOT NULL, ended_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY, telegram_id TEXT UNIQUE, display_name TEXT NOT NULL,
        skills TEXT NOT NULL, current_location TEXT NOT NULL DEFAULT 'floor-hub',
        active_work_id TEXT, last_seen_sequence INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS participants (
        episode_run_id TEXT NOT NULL, player_id TEXT NOT NULL, joined_at INTEGER NOT NULL,
        PRIMARY KEY (episode_run_id, player_id),
        FOREIGN KEY (episode_run_id) REFERENCES episode_runs(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      );
      CREATE TABLE IF NOT EXISTS work_instances (
        id TEXT PRIMARY KEY, episode_run_id TEXT NOT NULL, definition_id TEXT NOT NULL,
        status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
        required_progress INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1,
        completed_at INTEGER, UNIQUE (episode_run_id, definition_id)
      );
      CREATE TABLE IF NOT EXISTS work_contributions (
        event_id TEXT PRIMARY KEY, work_instance_id TEXT NOT NULL, player_id TEXT NOT NULL,
        amount INTEGER NOT NULL, xp_awarded INTEGER NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY (work_instance_id) REFERENCES work_instances(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      );
      CREATE TABLE IF NOT EXISTS world_facts (
        episode_run_id TEXT NOT NULL, fact_id TEXT NOT NULL, value TEXT NOT NULL,
        certainty TEXT NOT NULL, visibility TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
        source_work_id TEXT NOT NULL, source_event_id TEXT NOT NULL, discovered_at INTEGER NOT NULL,
        PRIMARY KEY (episode_run_id, fact_id)
      );
      CREATE TABLE IF NOT EXISTS world_events (
        id TEXT PRIMARY KEY, episode_run_id TEXT NOT NULL, kind TEXT NOT NULL,
        payload TEXT NOT NULL, created_at INTEGER NOT NULL, idempotency_key TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS chronicle_entries (
        id TEXT PRIMARY KEY, episode_run_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        type TEXT NOT NULL, significance TEXT NOT NULL, source_event_ids TEXT NOT NULL,
        title TEXT NOT NULL, lead TEXT NOT NULL, body TEXT NOT NULL,
        fact_ids TEXT NOT NULL, illustration_ids TEXT NOT NULL, contributors TEXT NOT NULL,
        published_at INTEGER NOT NULL, UNIQUE (episode_run_id, sequence)
      );
      CREATE TABLE IF NOT EXISTS council_votes (
        id TEXT PRIMARY KEY, episode_run_id TEXT NOT NULL, status TEXT NOT NULL,
        question TEXT NOT NULL, context TEXT NOT NULL, opened_at INTEGER NOT NULL,
        closes_at INTEGER NOT NULL, options TEXT NOT NULL, default_option_id TEXT NOT NULL,
        result_option_id TEXT, resolved_at INTEGER, effects_applied INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS council_ballots (
        vote_id TEXT NOT NULL, player_id TEXT NOT NULL, option_id TEXT NOT NULL,
        submitted_at INTEGER NOT NULL, PRIMARY KEY (vote_id, player_id),
        FOREIGN KEY (vote_id) REFERENCES council_votes(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
      );
      CREATE INDEX IF NOT EXISTS idx_chronicle_run_seq ON chronicle_entries(episode_run_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_contributions_work ON work_contributions(work_instance_id);
      CREATE INDEX IF NOT EXISTS idx_facts_run ON world_facts(episode_run_id);
    `)
  }

  seed() {
    const now = this.now()
    this.db.prepare(`INSERT OR IGNORE INTO episode_runs
      (id, definition_id, status, world_state, version, started_at)
      VALUES (?, ?, 'active', ?, 1, ?)`)
      .run(RUN_ID, EPISODE_ID, json({ phase: 'investigation', liftState: 'stopped', councilResult: null, ending: null }), now)
    const exists = this.db.prepare('SELECT 1 FROM chronicle_entries WHERE id = ?').get(openingEntry.id)
    if (!exists) this.insertChronicle({ ...openingEntry, sourceEventIds: [], factIds: [], contributors: [], publishedAt: now })
  }

  transaction(fn) {
    if (this.inTransaction) return fn()
    this.db.exec('BEGIN IMMEDIATE')
    this.inTransaction = true
    try { const result = fn(); this.db.exec('COMMIT'); return result } catch (error) { this.db.exec('ROLLBACK'); throw error } finally { this.inTransaction = false }
  }

  ensurePlayer(identity) {
    const now = this.now()
    const existing = this.db.prepare('SELECT * FROM players WHERE id = ?').get(identity.id)
    if (!existing) {
      const skills = { mechanics: { xp: 0, level: 1 }, power: { xp: 0, level: 1 }, repair: { xp: 0, level: 1 } }
      this.db.prepare(`INSERT INTO players (id, telegram_id, display_name, skills, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(identity.id, identity.telegramId ?? null, identity.name.slice(0, 40), json(skills), now, now)
    } else if (identity.name && identity.name !== existing.display_name) {
      this.db.prepare('UPDATE players SET display_name = ?, updated_at = ? WHERE id = ?').run(identity.name.slice(0, 40), now, identity.id)
    }
    this.db.prepare('INSERT OR IGNORE INTO participants (episode_run_id, player_id, joined_at) VALUES (?, ?, ?)').run(RUN_ID, identity.id, now)
    return this.getPlayer(identity.id)
  }

  getRun() {
    const row = this.db.prepare('SELECT * FROM episode_runs WHERE id = ?').get(RUN_ID)
    return { ...row, world: parse(row.world_state, {}) }
  }

  getPlayer(playerId) {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId)
    if (!row) return null
    const contributions = this.db.prepare(`SELECT wi.definition_id workId, SUM(wc.amount) amount, SUM(wc.xp_awarded) xp
      FROM work_contributions wc JOIN work_instances wi ON wi.id = wc.work_instance_id
      WHERE wc.player_id = ? GROUP BY wi.definition_id ORDER BY MIN(wc.created_at)`).all(playerId)
    return {
      id: row.id, displayName: row.display_name, skills: parse(row.skills, {}), currentLocation: row.current_location,
      activeWorkId: row.active_work_id, lastSeenChronicleSequence: row.last_seen_sequence,
      contributions: contributions.map(item => ({ workId: item.workId, amount: Number(item.amount), xp: Number(item.xp) })),
    }
  }

  setPlayerLocation(playerId, location) {
    this.db.prepare('UPDATE players SET current_location = ?, updated_at = ? WHERE id = ?').run(String(location).slice(0, 60), this.now(), playerId)
    return this.getPlayer(playerId)
  }

  context() {
    const run = this.getRun()
    const facts = new Set(this.db.prepare('SELECT fact_id FROM world_facts WHERE episode_run_id = ? AND visibility = ?').all(RUN_ID, 'factory').map(row => row.fact_id))
    const completed = new Set(this.db.prepare("SELECT definition_id FROM work_instances WHERE episode_run_id = ? AND status = 'completed'").all(RUN_ID).map(row => row.definition_id))
    return { phase: run.world.phase, facts, completed, councilResult: run.world.councilResult ?? null }
  }

  availableWorks(playerId) {
    this.resolveDueCouncil()
    const player = this.getPlayer(playerId)
    const context = this.context()
    const skillLevels = Object.fromEntries(Object.entries(player.skills).map(([key, value]) => [key, value.level]))
    const available = availableDefinitions(context, skillLevels).map(({ definition, skillLocked }) => this.workView(definition, playerId, skillLocked ? 'locked_skill' : player.activeWorkId === definition.id ? 'active' : 'available'))
    const completed = workDefinitions.filter(definition => context.completed.has(definition.id)).map(definition => this.workView(definition, playerId, 'completed'))
    return [...available, ...completed]
  }

  workView(definition, playerId, status) {
    const instance = this.db.prepare('SELECT * FROM work_instances WHERE episode_run_id = ? AND definition_id = ?').get(RUN_ID, definition.id)
    const contribution = instance ? this.db.prepare('SELECT COALESCE(SUM(amount), 0) amount FROM work_contributions WHERE work_instance_id = ? AND player_id = ?').get(instance.id, playerId) : { amount: 0 }
    const { facts, effects, visibility, chronicle, ...publicDefinition } = definition
    return { ...publicDefinition, status, progress: Number(instance?.progress ?? 0), playerContribution: Number(contribution.amount ?? 0) }
  }

  contribute(playerId, workId, eventId) {
    if (!eventId || eventId.length > 120) throw this.error(400, 'INVALID_EVENT_ID', 'Нужен стабильный eventId')
    return this.transaction(() => {
      this.resolveDueCouncil(false)
      const duplicate = this.db.prepare('SELECT event_id FROM work_contributions WHERE event_id = ?').get(eventId)
      if (duplicate) return { duplicate: true, works: this.availableWorks(playerId), episode: this.snapshot(playerId), player: this.getPlayer(playerId) }
      const player = this.getPlayer(playerId)
      const definition = workDefinitions.find(work => work.id === workId)
      if (!definition) throw this.error(404, 'WORK_NOT_FOUND', 'Работа не найдена')
      const context = this.context()
      const skills = Object.fromEntries(Object.entries(player.skills).map(([key, value]) => [key, value.level]))
      const availability = availableDefinitions(context, skills).find(item => item.definition.id === workId)
      if (!availability) throw this.error(409, 'WORK_UNAVAILABLE', 'Условия этой работы изменились')
      if (availability.skillLocked) throw this.error(403, 'SKILL_REQUIRED', `Требуется уровень ${definition.skill.level}`)
      const instanceId = `${RUN_ID}:${workId}`
      this.db.prepare(`INSERT OR IGNORE INTO work_instances
        (id, episode_run_id, definition_id, status, progress, required_progress)
        VALUES (?, ?, ?, 'active', 0, ?)`).run(instanceId, RUN_ID, workId, definition.requiredProgress)
      const instance = this.db.prepare('SELECT * FROM work_instances WHERE id = ?').get(instanceId)
      if (instance.status === 'completed') return { duplicate: true, works: this.availableWorks(playerId), episode: this.snapshot(playerId), player: this.getPlayer(playerId) }
      this.db.prepare('INSERT INTO work_contributions (event_id, work_instance_id, player_id, amount, xp_awarded, created_at) VALUES (?, ?, ?, 1, 1, ?)').run(eventId, instanceId, playerId, this.now())
      const nextProgress = Math.min(definition.requiredProgress, instance.progress + 1)
      this.db.prepare('UPDATE work_instances SET progress = ?, version = version + 1 WHERE id = ?').run(nextProgress, instanceId)
      this.db.prepare('UPDATE players SET active_work_id = ?, updated_at = ? WHERE id = ?').run(workId, this.now(), playerId)
      this.awardXp(playerId, definition.department, 1)
      let completed = false
      if (nextProgress >= definition.requiredProgress) {
        const result = this.db.prepare("UPDATE work_instances SET status = 'completed', completed_at = ?, version = version + 1 WHERE id = ? AND status != 'completed'").run(this.now(), instanceId)
        if (Number(result.changes) === 1) {
          completed = true
          this.completeWork(definition, eventId)
          this.db.prepare('UPDATE players SET active_work_id = NULL WHERE active_work_id = ?').run(workId)
        }
      }
      return { duplicate: false, completed, works: this.availableWorks(playerId), episode: this.snapshot(playerId), player: this.getPlayer(playerId) }
    })
  }

  awardXp(playerId, department, amount) {
    const row = this.db.prepare('SELECT skills FROM players WHERE id = ?').get(playerId)
    const skills = parse(row.skills, {})
    const nextXp = (skills[department]?.xp ?? 0) + amount
    skills[department] = { xp: nextXp, level: Math.floor(nextXp / 20) + 1 }
    this.db.prepare('UPDATE players SET skills = ?, updated_at = ? WHERE id = ?').run(json(skills), this.now(), playerId)
  }

  completeWork(definition, sourceEventId) {
    const eventId = `work-completed:${definition.id}`
    this.db.prepare('INSERT OR IGNORE INTO world_events (id, episode_run_id, kind, payload, created_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)')
      .run(eventId, RUN_ID, 'work_completed', json({ workId: definition.id }), this.now(), eventId)
    definition.facts.forEach(fact => {
      this.db.prepare(`INSERT OR IGNORE INTO world_facts
        (episode_run_id, fact_id, value, certainty, visibility, title, body, source_work_id, source_event_id, discovered_at)
        VALUES (?, ?, 'true', ?, 'factory', ?, ?, ?, ?, ?)`)
        .run(RUN_ID, fact.id, fact.certainty, fact.title, fact.text, definition.id, eventId, this.now())
    })
    if (definition.chronicle) {
      const contributors = this.contributorsFor([definition.id])
      this.insertChronicle({ id: `report:${definition.id}`, type: definition.significance === 'finale' ? 'finale' : definition.significance === 'turning_point' ? 'turning_point' : definition.significance === 'chapter' ? 'chapter' : 'report', significance: definition.significance, sourceEventIds: [eventId, sourceEventId], factIds: definition.facts.map(fact => fact.id), illustrationIds: definition.chronicle.illustrationId ? [definition.chronicle.illustrationId] : [], contributors, publishedAt: this.now(), ...definition.chronicle })
    }
    const run = this.getRun()
    const world = { ...run.world, ...definition.effects }
    if (definition.effects.ending) world.phase = 'complete'
    this.db.prepare('UPDATE episode_runs SET world_state = ?, status = ?, ended_at = ?, version = version + 1 WHERE id = ?')
      .run(json(world), world.phase === 'complete' ? 'complete' : 'active', world.phase === 'complete' ? this.now() : null, RUN_ID)
    this.maybePublishSynthesisAndCouncil()
  }

  contributorsFor(workIds) {
    if (!workIds.length) return []
    const placeholders = workIds.map(() => '?').join(',')
    return this.db.prepare(`SELECT DISTINCT p.id, p.display_name name
      FROM work_contributions wc JOIN work_instances wi ON wi.id = wc.work_instance_id
      JOIN players p ON p.id = wc.player_id WHERE wi.definition_id IN (${placeholders}) ORDER BY p.display_name`).all(...workIds)
  }

  maybePublishSynthesisAndCouncil() {
    const context = this.context()
    if (!context.facts.has('drive_worn') || !context.facts.has('manual_cutoff')) return
    const sourceEventIds = ['work-completed:drive-diagnostics', 'work-completed:power-audit']
    this.insertChronicle({
      id: 'chapter:synthesis-diagnostics', type: 'chapter', significance: 'chapter', sourceEventIds,
      factIds: ['drive_worn', 'manual_cutoff'], illustrationIds: ['diagnostic-synthesis'], contributors: this.contributorsFor(['drive-diagnostics', 'power-audit']), publishedAt: this.now(),
      title: 'Две причины одной тишины', lead: 'Независимые доклады доказали: механическая поломка и ручное отключение произошли рядом, но не были одним событием.',
      body: 'Инженерный и энергетический отчёты сложились в новую последовательность. Изношенный привод действительно был опасен, однако силовая линия не отключилась из-за него: после удара кто-то отправил корректную ручную команду. Пока неизвестно, спасла ли эта команда кабину или скрыла другое действие. Первоначальный приказ «просто восстановить лифт» больше нельзя считать нейтральным. Заводу предстоит решить, допустим ли запуск до полного выяснения причин.',
    })
    const existing = this.db.prepare('SELECT id FROM council_votes WHERE id = ?').get(councilDefinition.id)
    if (!existing) {
      const openedAt = this.now()
      this.db.prepare(`INSERT INTO council_votes
        (id, episode_run_id, status, question, context, opened_at, closes_at, options, default_option_id)
        VALUES (?, ?, 'open', ?, ?, ?, ?, ?, ?)`)
        .run(councilDefinition.id, RUN_ID, councilDefinition.question, councilDefinition.context, openedAt, openedAt + 24 * 60 * 60 * 1000, json(councilDefinition.options), councilDefinition.defaultOptionId)
      const run = this.getRun(); const world = { ...run.world, phase: 'council' }
      this.db.prepare('UPDATE episode_runs SET world_state = ?, version = version + 1 WHERE id = ?').run(json(world), RUN_ID)
    }
  }

  insertChronicle(entry) {
    const exists = this.db.prepare('SELECT id FROM chronicle_entries WHERE id = ?').get(entry.id)
    if (exists) return false
    const sequence = Number(this.db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 sequence FROM chronicle_entries WHERE episode_run_id = ?').get(RUN_ID).sequence)
    this.db.prepare(`INSERT INTO chronicle_entries
      (id, episode_run_id, sequence, type, significance, source_event_ids, title, lead, body, fact_ids, illustration_ids, contributors, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(entry.id, RUN_ID, sequence, entry.type, entry.significance, json(entry.sourceEventIds ?? []), entry.title, entry.lead, entry.body, json(entry.factIds ?? []), json(entry.illustrationIds ?? []), json(entry.contributors ?? []), entry.publishedAt ?? this.now())
    return true
  }

  chronicle(after = 0) {
    return this.db.prepare('SELECT * FROM chronicle_entries WHERE episode_run_id = ? AND sequence > ? ORDER BY sequence').all(RUN_ID, after).map(row => ({
      id: row.id, sequence: row.sequence, type: row.type, significance: row.significance, sourceEventIds: parse(row.source_event_ids, []),
      title: row.title, lead: row.lead, body: row.body, factIds: parse(row.fact_ids, []), illustrationIds: parse(row.illustration_ids, []),
      contributors: parse(row.contributors, []), publishedAt: new Date(row.published_at).toISOString(),
    }))
  }

  facts() {
    return this.db.prepare("SELECT * FROM world_facts WHERE episode_run_id = ? AND visibility = 'factory' ORDER BY discovered_at").all(RUN_ID).map(row => ({
      id: row.fact_id, certainty: row.certainty, title: row.title, text: row.body, sourceWorkId: row.source_work_id, discoveredAt: new Date(row.discovered_at).toISOString(),
    }))
  }

  council(playerId) {
    this.resolveDueCouncil()
    const row = this.db.prepare('SELECT * FROM council_votes WHERE episode_run_id = ? ORDER BY opened_at DESC LIMIT 1').get(RUN_ID)
    if (!row) return null
    const ballot = playerId ? this.db.prepare('SELECT option_id FROM council_ballots WHERE vote_id = ? AND player_id = ?').get(row.id, playerId) : null
    return {
      id: row.id, status: row.status, question: row.question, context: row.context,
      openedAt: new Date(row.opened_at).toISOString(), closesAt: new Date(row.closes_at).toISOString(), options: parse(row.options, []),
      ownOptionId: ballot?.option_id ?? null, resultOptionId: row.result_option_id, defaultOptionId: row.default_option_id,
      ...(row.status === 'closed' ? { totalBallots: Number(this.db.prepare('SELECT COUNT(*) count FROM council_ballots WHERE vote_id = ?').get(row.id).count) } : {}),
    }
  }

  vote(playerId, voteId, optionId) {
    return this.transaction(() => {
      this.resolveDueCouncil(false)
      const vote = this.db.prepare('SELECT * FROM council_votes WHERE id = ?').get(voteId)
      if (!vote) throw this.error(404, 'VOTE_NOT_FOUND', 'Вече не найдено')
      if (vote.status !== 'open' || this.now() >= vote.closes_at) throw this.error(409, 'VOTE_CLOSED', 'Время голосования истекло')
      const options = parse(vote.options, [])
      if (!options.some(option => option.id === optionId)) throw this.error(400, 'INVALID_OPTION', 'Такого варианта нет')
      this.db.prepare(`INSERT INTO council_ballots (vote_id, player_id, option_id, submitted_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(vote_id, player_id) DO UPDATE SET option_id = excluded.option_id, submitted_at = excluded.submitted_at`)
        .run(voteId, playerId, optionId, this.now())
      return this.council(playerId)
    })
  }

  resolveDueCouncil(transaction = true) {
    const work = () => {
      const vote = this.db.prepare("SELECT * FROM council_votes WHERE episode_run_id = ? AND status = 'open' AND closes_at <= ? LIMIT 1").get(RUN_ID, this.now())
      if (!vote) return null
      const ballots = this.db.prepare('SELECT option_id FROM council_ballots WHERE vote_id = ?').all(vote.id).map(row => row.option_id)
      const result = resolveCouncilBallots(ballots, vote.default_option_id)
      const update = this.db.prepare("UPDATE council_votes SET status = 'closed', result_option_id = ?, resolved_at = ?, effects_applied = 1 WHERE id = ? AND status = 'open' AND effects_applied = 0").run(result.optionId, this.now(), vote.id)
      if (Number(update.changes) !== 1) return null
      const run = this.getRun(); const world = { ...run.world, phase: 'branch', councilResult: result.optionId }
      this.db.prepare('UPDATE episode_runs SET world_state = ?, version = version + 1 WHERE id = ?').run(json(world), RUN_ID)
      const selected = councilDefinition.options.find(option => option.id === result.optionId)
      this.insertChronicle({ id: `council-result:${vote.id}`, type: 'council', significance: 'turning_point', sourceEventIds: [`council:${vote.id}`], factIds: [], illustrationIds: ['factory-council'], contributors: [], publishedAt: this.now(), title: 'Завод сделал выбор', lead: selected.title, body: `Вече завершилось строго через двадцать четыре часа. Кворум не требовался, каждый участник имел один равный голос. Принято решение: «${selected.title}». ${selected.argument} С этого момента изменился набор доступных работ; прежние результаты диагностики сохранены в общей истории.` })
      return result
    }
    return transaction ? this.transaction(work) : work()
  }

  snapshot(playerId = null) {
    this.resolveDueCouncil()
    const run = this.getRun()
    const [goal, goalDetail] = goalFor(run.world.phase, run.world.councilResult, run.world.ending)
    const completedWorkIds = this.db.prepare("SELECT definition_id FROM work_instances WHERE episode_run_id = ? AND status = 'completed' ORDER BY completed_at").all(RUN_ID).map(row => row.definition_id)
    const entries = this.chronicle()
    return {
      id: run.id, status: run.status, phase: run.world.phase, goal, goalDetail, liftState: run.world.liftState,
      publicFacts: this.facts(), completedWorkIds, latestChronicle: entries.at(-1) ?? null,
      council: this.council(playerId), ending: run.world.ending ?? null, version: run.version,
      mode: 'shared', serverTime: new Date(this.now()).toISOString(),
    }
  }

  markChronicleRead(playerId, sequence) {
    const latest = Number(this.db.prepare('SELECT COALESCE(MAX(sequence), 0) sequence FROM chronicle_entries WHERE episode_run_id = ?').get(RUN_ID).sequence)
    const safe = Math.max(0, Math.min(latest, Number(sequence) || 0))
    this.db.prepare('UPDATE players SET last_seen_sequence = MAX(last_seen_sequence, ?), updated_at = ? WHERE id = ?').run(safe, this.now(), playerId)
    return this.getPlayer(playerId)
  }

  recap(playerId) {
    const player = this.getPlayer(playerId)
    const all = this.chronicle()
    return {
      previous: all,
      whileAway: all.filter(entry => entry.sequence > player.lastSeenChronicleSequence),
      now: { goal: this.snapshot(playerId).goal, goalDetail: this.snapshot(playerId).goalDetail, works: this.availableWorks(playerId).filter(work => work.status !== 'completed'), council: this.council(playerId) },
      latestSequence: all.at(-1)?.sequence ?? 0,
    }
  }

  error(status, code, message) { return Object.assign(new Error(message), { status, code }) }
}

export { RUN_ID }

