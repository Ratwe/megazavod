import {
  availableDefinitions, councilDefinition, goalFor, openingEntry, resolveCouncilBallots, workDefinitions,
  type ChronicleEntry, type CouncilView, type Department, type EpisodeSnapshot, type PlayerView, type PublicFact, type RecapView, type WorkView,
} from './domain'
import { getTelegramWebApp } from '../telegram'

export type StoryBundle = {
  episode: EpisodeSnapshot
  works: WorkView[]
  chronicle: ChronicleEntry[]
  player: PlayerView
  recap: RecapView
}

export interface StoryRepository {
  readonly mode: 'shared' | 'local-demo'
  load(): Promise<StoryBundle>
  contribute(workId: string, eventId: string): Promise<StoryBundle>
  vote(voteId: string, optionId: string): Promise<StoryBundle>
  markChronicleRead(sequence: number): Promise<PlayerView>
  setLocation(location: string): Promise<PlayerView>
  setDisplayName(name: string): void
  resolveDemoCouncil?(): Promise<StoryBundle>
}

const apiUrl = (import.meta.env.VITE_STORY_API_URL as string | undefined)?.replace(/\/$/, '')

export function createStoryRepository(): StoryRepository {
  return apiUrl ? new RemoteStoryRepository(apiUrl) : new LocalStoryRepository()
}

class RemoteStoryRepository implements StoryRepository {
  readonly mode = 'shared' as const
  constructor(private baseUrl: string) {}
  setDisplayName() {}

  private headers() {
    const telegram = getTelegramWebApp()
    if (telegram?.initData) return { Authorization: `tma ${telegram.initData}` }
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(location.search)
      return { 'X-Dev-Player': params.get('player') ?? (import.meta.env.VITE_DEV_PLAYER_ID as string | undefined) ?? 'browser-a', 'X-Dev-Name': encodeURIComponent(params.get('name') ?? 'Браузерный испытатель') }
    }
    return {}
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    headers.set('Content-Type', 'application/json')
    Object.entries(this.headers()).forEach(([key, value]) => { if (value) headers.set(key, value) })
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.error?.message ?? `API ${response.status}`)
    return body
  }

  async load(): Promise<StoryBundle> {
    const [episode, works, chronicle, player, recap] = await Promise.all([
      this.request<EpisodeSnapshot>('/api/episode/current'), this.request<WorkView[]>('/api/works/available'),
      this.request<ChronicleEntry[]>('/api/chronicle'), this.request<PlayerView>('/api/player/me'), this.request<RecapView>('/api/recap'),
    ])
    return { episode, works, chronicle, player, recap }
  }

  async contribute(workId: string, eventId: string) {
    await this.request(`/api/works/${encodeURIComponent(workId)}/contribute`, { method: 'POST', body: JSON.stringify({ eventId }) })
    return this.load()
  }
  async vote(voteId: string, optionId: string) {
    await this.request(`/api/council/${encodeURIComponent(voteId)}/ballot`, { method: 'PUT', body: JSON.stringify({ optionId }) })
    return this.load()
  }
  markChronicleRead(sequence: number) { return this.request<PlayerView>('/api/chronicle/read', { method: 'POST', body: JSON.stringify({ sequence }) }) }
  setLocation(location: string) { return this.request<PlayerView>('/api/player/location', { method: 'POST', body: JSON.stringify({ location }) }) }
}

type LocalState = {
  version: 1
  phase: 'investigation' | 'council' | 'branch' | 'complete'
  liftState: string
  councilResult: string | null
  ending: string | null
  facts: PublicFact[]
  completed: string[]
  progress: Record<string, number>
  contributions: Record<string, number>
  chronicle: ChronicleEntry[]
  council: CouncilView | null
  player: PlayerView
  eventIds: string[]
}

const LOCAL_KEY = 'zavod-story-demo-v1'

class LocalStoryRepository implements StoryRepository {
  readonly mode = 'local-demo' as const
  private state: LocalState
  constructor() { this.state = this.read() }

  private initial(): LocalState {
    const timestamp = new Date().toISOString()
    return {
      version: 1, phase: 'investigation', liftState: 'stopped', councilResult: null, ending: null,
      facts: [], completed: [], progress: {}, contributions: {}, eventIds: [],
      chronicle: [{ ...openingEntry, sequence: 1, sourceEventIds: [], factIds: [], contributors: [], publishedAt: timestamp }],
      council: null,
      player: { id: 'local:browser', displayName: 'Работник', skills: { mechanics: { xp: 0, level: 1 }, power: { xp: 0, level: 1 }, repair: { xp: 0, level: 1 } }, currentLocation: 'floor-hub', activeWorkId: null, lastSeenChronicleSequence: 0, contributions: [] },
    }
  }

  private read() {
    try { const value = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null'); return value?.version === 1 ? value as LocalState : this.initial() } catch { return this.initial() }
  }
  private save() { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.state)) }
  setDisplayName(name: string) { this.state.player.displayName = name.slice(0, 40); this.save() }

  private context() { return { phase: this.state.phase, facts: new Set(this.state.facts.map(fact => fact.id)), completed: new Set(this.state.completed), councilResult: this.state.councilResult } }
  private closeCouncilIfDue(force = false) {
    const council = this.state.council
    if (!council || council.status === 'closed' || (!force && Date.now() < Date.parse(council.closesAt))) return
    const ballot = council.ownOptionId ? [council.ownOptionId] : []
    const result = resolveCouncilBallots(ballot, council.defaultOptionId)
    council.status = 'closed'; council.resultOptionId = result.optionId; council.totalBallots = ballot.length
    this.state.phase = 'branch'; this.state.councilResult = result.optionId
    const selected = council.options.find(option => option.id === result.optionId)!
    this.addChronicle({ id: `council-result:${council.id}`, type: 'council', significance: 'turning_point', title: 'Завод сделал выбор', lead: selected.title, body: `Локальная демонстрация воспроизводит итог вече: «${selected.title}». В общем мире этот переход происходит на сервере строго через двадцать четыре часа, без кворума, с одним равным голосом на аккаунт.`, sourceEventIds: [`council:${council.id}`], factIds: [], illustrationIds: ['factory-council'], contributors: [] })
  }

  private works(): WorkView[] {
    this.closeCouncilIfDue()
    const levels = Object.fromEntries(Object.entries(this.state.player.skills).map(([id, value]) => [id, value.level])) as Record<Department, number>
    const available = availableDefinitions(this.context(), levels).map(({ definition, skillLocked }) => this.workView(definition.id, skillLocked ? 'locked_skill' : this.state.player.activeWorkId === definition.id ? 'active' : 'available'))
    return [...available, ...this.state.completed.map(id => this.workView(id, 'completed'))]
  }
  private workView(id: string, status: WorkView['status']) {
    const definition = workDefinitions.find(item => item.id === id)!
    const { facts, effects, visibility, chronicle, ...view } = definition
    return { ...view, status, progress: this.state.progress[id] ?? 0, playerContribution: this.state.contributions[id] ?? 0 }
  }
  private snapshot(): EpisodeSnapshot {
    const [goal, goalDetail] = goalFor(this.state.phase, this.state.councilResult, this.state.ending)
    return { id: 'silent-lift-local-demo', status: this.state.phase === 'complete' ? 'complete' : 'active', phase: this.state.phase, goal, goalDetail, liftState: this.state.liftState, publicFacts: this.state.facts, completedWorkIds: this.state.completed, latestChronicle: this.state.chronicle.at(-1) ?? null, council: this.state.council, ending: this.state.ending, version: this.state.chronicle.length, mode: 'local-demo', serverTime: new Date().toISOString() }
  }
  private recap(): RecapView {
    const works = this.works().filter(work => work.status !== 'completed')
    return { previous: this.state.chronicle, whileAway: this.state.chronicle.filter(entry => entry.sequence > this.state.player.lastSeenChronicleSequence), now: { goal: this.snapshot().goal, goalDetail: this.snapshot().goalDetail, works, council: this.state.council }, latestSequence: this.state.chronicle.at(-1)?.sequence ?? 0 }
  }
  async load() { this.closeCouncilIfDue(); this.save(); return { episode: this.snapshot(), works: this.works(), chronicle: this.state.chronicle, player: this.state.player, recap: this.recap() } }

  async contribute(workId: string, eventId: string) {
    if (this.state.eventIds.includes(eventId)) return this.load()
    const work = this.works().find(item => item.id === workId && ['available', 'active'].includes(item.status))
    if (!work) throw new Error('Эта работа сейчас недоступна')
    this.state.eventIds.push(eventId); this.state.player.activeWorkId = workId
    this.state.progress[workId] = Math.min(work.requiredProgress, (this.state.progress[workId] ?? 0) + 1)
    this.state.contributions[workId] = (this.state.contributions[workId] ?? 0) + 1
    const skill = this.state.player.skills[work.department]; skill.xp += 1; skill.level = Math.floor(skill.xp / 20) + 1
    if (this.state.progress[workId] >= work.requiredProgress) this.complete(workId)
    this.syncContributions(); this.save(); return this.load()
  }

  private complete(workId: string) {
    if (this.state.completed.includes(workId)) return
    const definition = workDefinitions.find(item => item.id === workId)!
    this.state.completed.push(workId); this.state.player.activeWorkId = null
    definition.facts.forEach(fact => { if (!this.state.facts.some(item => item.id === fact.id)) this.state.facts.push({ id: fact.id, certainty: fact.certainty, title: fact.title, text: fact.text, sourceWorkId: workId, discoveredAt: new Date().toISOString() }) })
    if (definition.chronicle) this.addChronicle({ id: `report:${workId}`, type: definition.significance === 'finale' ? 'finale' : definition.significance === 'turning_point' ? 'turning_point' : definition.significance === 'chapter' ? 'chapter' : 'report', significance: definition.significance, title: definition.chronicle.title, lead: definition.chronicle.lead, body: definition.chronicle.body, sourceEventIds: [`work-completed:${workId}`], factIds: definition.facts.map(fact => fact.id), illustrationIds: definition.chronicle.illustrationId ? [definition.chronicle.illustrationId] : [], contributors: [{ id: this.state.player.id, name: this.state.player.displayName }] })
    Object.assign(this.state, definition.effects)
    if (definition.effects.ending) this.state.phase = 'complete'
    if (this.state.facts.some(fact => fact.id === 'drive_worn') && this.state.facts.some(fact => fact.id === 'manual_cutoff') && !this.state.council) {
      this.addChronicle({ id: 'chapter:synthesis-diagnostics', type: 'chapter', significance: 'chapter', title: 'Две причины одной тишины', lead: 'Независимые доклады доказали: механическая поломка и ручное отключение произошли рядом, но не были одним событием.', body: 'Инженерный и энергетический отчёты сложились в новую последовательность. Изношенный привод был опасен, однако силовая линия не отключилась из-за него. Первоначальный приказ больше нельзя считать нейтральным: дальнейший путь должно определить Заводское вече.', sourceEventIds: ['work-completed:drive-diagnostics', 'work-completed:power-audit'], factIds: ['drive_worn', 'manual_cutoff'], illustrationIds: ['diagnostic-synthesis'], contributors: [{ id: this.state.player.id, name: this.state.player.displayName }] })
      const opened = Date.now(); this.state.phase = 'council'
      this.state.council = { id: councilDefinition.id, status: 'open', question: councilDefinition.question, context: councilDefinition.context, openedAt: new Date(opened).toISOString(), closesAt: new Date(opened + 24 * 60 * 60 * 1000).toISOString(), options: councilDefinition.options, ownOptionId: null, resultOptionId: null, defaultOptionId: councilDefinition.defaultOptionId }
    }
  }
  private addChronicle(entry: Omit<ChronicleEntry, 'sequence' | 'publishedAt'>) { if (!this.state.chronicle.some(item => item.id === entry.id)) this.state.chronicle.push({ ...entry, sequence: this.state.chronicle.length + 1, publishedAt: new Date().toISOString() }) }
  private syncContributions() { this.state.player.contributions = Object.entries(this.state.contributions).map(([workId, amount]) => ({ workId, amount, xp: amount })) }
  async vote(voteId: string, optionId: string) { if (!this.state.council || this.state.council.id !== voteId || this.state.council.status !== 'open') throw new Error('Вече закрыто'); if (!this.state.council.options.some(option => option.id === optionId)) throw new Error('Неизвестный вариант'); this.state.council.ownOptionId = optionId; this.save(); return this.load() }
  async resolveDemoCouncil() { this.closeCouncilIfDue(true); this.save(); return this.load() }
  async markChronicleRead(sequence: number) { this.state.player.lastSeenChronicleSequence = Math.max(this.state.player.lastSeenChronicleSequence, sequence); this.save(); return this.state.player }
  async setLocation(location: string) { this.state.player.currentLocation = location; this.save(); return this.state.player }
}

