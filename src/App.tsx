import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Box, Check, ChevronRight,
  CircleGauge, Clock3, Cog, Factory, Gauge, Info, ListChecks, Map, Menu,
  Radio, RotateCcw, ShieldAlert, Sparkles, Target, Terminal, UserRound, Users,
  Wrench, Zap,
} from 'lucide-react'
import { getTelegramUserName, getTelegramWebApp, haptic } from './telegram'

type Screen = 'onboarding' | 'briefing' | 'floor' | 'journal' | 'skills' | 'map' | 'jobs' | 'incident' | 'chronicle' | 'terminal' | 'objectives'
type Department = 'mechanics' | 'power' | 'repair'

type Job = {
  id: string
  title: string
  description: string
  department: Department
  level: number
  reward: string
  target: number
  output: string
  icon: 'bearing' | 'blank' | 'bolt' | 'power' | 'repair'
}

type SavedState = {
  name: string
  screen: Screen
  department: Department
  jobId: string | null
  jobStartedAt: number | null
  incidentAvailableAt: number | null
  incidentCreatedAt: number | null
  incidentResolved: boolean
  incidentChoice: string | null
}

const jobs: Job[] = [
  { id: 'J_BEARING', title: 'Изготовить подшипники', description: 'Комплектующие главного привода', department: 'mechanics', level: 2, reward: '+8 XP · +1 деталь', target: 24, output: 'Подшипник', icon: 'bearing' },
  { id: 'J_BLANK', title: 'Подготовить заготовки', description: 'Поставки для производственной линии', department: 'mechanics', level: 1, reward: '+4 XP · +1 заготовка', target: 18, output: 'Заготовка', icon: 'blank' },
  { id: 'J_FASTENER', title: 'Проверить крепления', description: 'Заказ инженерного отсека', department: 'mechanics', level: 1, reward: '+6 XP · +1 крепёж', target: 12, output: 'Крепёж', icon: 'bolt' },
  { id: 'J_GENERATE', title: 'Стабилизировать накопитель', description: 'Вернуть питание на ярус 47', department: 'power', level: 1, reward: '+6 XP · +4 энергии/ч', target: 16, output: 'Энергия', icon: 'power' },
  { id: 'J_DIAG_POWER', title: 'Проверить силовой щит', description: 'Найти причину потери мощности', department: 'power', level: 1, reward: '+8 XP · диагностика', target: 10, output: 'Диагностика', icon: 'power' },
  { id: 'J_DIAG_REPAIR', title: 'Обследовать шахту', description: 'Определить состояние привода', department: 'repair', level: 1, reward: '+8 XP · диагностика', target: 14, output: 'Осмотр', icon: 'repair' },
  { id: 'J_REPAIR', title: 'Восстановить привод', description: 'Смонтировать исправный узел', department: 'repair', level: 2, reward: '+12 XP · ремонт', target: 20, output: 'Ремонт', icon: 'repair' },
]

const departments = {
  mechanics: { label: 'Производство', short: 'Мех. цех', icon: Factory, subtitle: 'Выпуск деталей и заготовок' },
  power: { label: 'Энергетика', short: 'Энергоблок', icon: Zap, subtitle: 'Питание и распределение' },
  repair: { label: 'Инженерия', short: 'Ремонтный пост', icon: Wrench, subtitle: 'Диагностика и восстановление' },
}

const defaultSaved: SavedState = {
  name: '', screen: 'onboarding', department: 'mechanics', jobId: null,
  jobStartedAt: null, incidentAvailableAt: null, incidentCreatedAt: null, incidentResolved: false, incidentChoice: null,
}

const STORAGE_KEY = 'zavod-state-v2'
const FIRST_INCIDENT_DELAY_MS = 3 * 60 * 1000

const news = [
  { time: '10:24', category: 'Производство', title: 'Требуются подшипники для лифта', body: 'Инженерный отсек открыл запрос на восемь подшипников. Производственная линия готова принять наряд.', critical: true },
  { time: '09:17', category: 'Энергетика', title: 'Потребление на лифтовой линии выше нормы', body: 'Силовой щит зарегистрировал нестабильную нагрузку. Нужна диагностика контура.', critical: false },
  { time: '08:41', category: 'Инженерия', title: 'Обследование шахты завершено', body: 'Привод остановлен из-за износа опорного подшипника. Открыт заказ производству.', critical: false },
]

const workActions: Record<Department, { active: string, completed: string }[]> = {
  mechanics: [
    { active: 'Проверяю настройки станка', completed: 'Я проверил настройки станка и подготовил его к рабочему циклу.' },
    { active: 'Обрабатываю заготовку', completed: 'Я обработал заготовку и передал деталь на контроль.' },
    { active: 'Проверяю допуски детали', completed: 'Я измерил допуски. Деталь соответствует наряду.' },
    { active: 'Готовлю следующий комплект', completed: 'Я подготовил инструмент и начал следующий комплект.' },
  ],
  power: [
    { active: 'Проверяю нагрузку контура', completed: 'Я проверил нагрузку. Контур работает в допустимом диапазоне.' },
    { active: 'Выравниваю подачу энергии', completed: 'Я выровнял подачу энергии на силовой линии.' },
    { active: 'Диагностирую накопитель', completed: 'Я завершил диагностику накопителя и сохранил показания.' },
  ],
  repair: [
    { active: 'Осматриваю узел привода', completed: 'Я осмотрел узел привода и отметил изношенные элементы.' },
    { active: 'Проверяю крепления', completed: 'Я проверил крепления и восстановил рабочий зазор.' },
    { active: 'Сверяю схему механизма', completed: 'Я сверил механизм со схемой и обновил журнал ремонта.' },
  ],
}

function getWorkAction(job: Job, cycle: number) {
  const actions = workActions[job.department]
  return actions[cycle % actions.length]
}

function loadState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaultSaved, ...JSON.parse(raw) } : defaultSaved
  } catch { return defaultSaved }
}

function App() {
  const [state, setState] = useState<SavedState>(loadState)
  const [nameDraft, setNameDraft] = useState(state.name || getTelegramUserName())
  const [now, setNow] = useState(Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const [tickerVisible, setTickerVisible] = useState(true)

  useEffect(() => {
    localStorage.removeItem('zavod-state-v1')
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    const telegram = getTelegramWebApp()
    if (!telegram) return
    telegram.ready()
  }, [])

  useEffect(() => {
    const telegram = getTelegramWebApp()
    if (!telegram) return

    if (state.jobId) telegram.enableClosingConfirmation?.()
    else telegram.disableClosingConfirmation?.()
  }, [state.jobId])

  useEffect(() => {
    const telegram = getTelegramWebApp()
    if (!telegram) return

    const backTargets: Partial<Record<Screen, Screen>> = {
      briefing: 'onboarding', jobs: 'floor', journal: 'floor', skills: 'floor',
      map: 'floor', incident: 'journal', chronicle: 'floor', terminal: 'floor', objectives: 'floor',
    }
    const target = backTargets[state.screen]
    const handleBack = () => {
      haptic('light')
      if (target) setState(prev => ({ ...prev, screen: target }))
    }

    if (target) {
      telegram.BackButton.show()
      telegram.BackButton.onClick(handleBack)
    } else telegram.BackButton.hide()

    return () => {
      telegram.BackButton.offClick(handleBack)
      telegram.BackButton.hide()
    }
  }, [state.screen])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    const ticker = window.setTimeout(() => setTickerVisible(false), 11000)
    return () => { clearInterval(timer); clearTimeout(ticker) }
  }, [])

  useEffect(() => {
    if (!state.incidentResolved && !state.incidentCreatedAt && state.incidentAvailableAt && now >= state.incidentAvailableAt) {
      setState(prev => ({ ...prev, incidentCreatedAt: prev.incidentAvailableAt }))
    }
  }, [now, state.incidentAvailableAt, state.incidentCreatedAt, state.incidentResolved])

  useEffect(() => {
    if (!state.incidentResolved && state.incidentCreatedAt && now - state.incidentCreatedAt >= 600_000) {
      setState(prev => ({ ...prev, incidentResolved: true, incidentChoice: 'Проверить крепления' }))
    }
  }, [now, state.incidentCreatedAt, state.incidentResolved])

  const job = jobs.find(item => item.id === state.jobId) ?? null
  const elapsed = state.jobStartedAt ? Math.max(0, Math.floor((now - state.jobStartedAt) / 1000)) : 0
  const jobProgress = job ? Math.min(job.target, Math.floor(elapsed / 60)) : 0
  const operationProgress = job ? Math.min(25, Math.round(jobProgress / job.target * 25)) : 0

  const navigate = (screen: Screen) => {
    haptic('selection')
    setState(prev => ({ ...prev, screen }))
  }

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem('zavod-state-v1')
    setState(defaultSaved)
    setNameDraft('')
    setMenuOpen(false)
  }

  const createCharacter = () => {
    const clean = nameDraft.trim().slice(0, 24)
    if (clean.length < 2) return
    haptic('success')
    setState(prev => ({ ...prev, name: clean, screen: 'briefing' }))
  }

  const beginJob = (selected: Job) => {
    haptic('success')
    const startedAt = Date.now()
    setState(prev => ({ ...prev, department: selected.department, jobId: selected.id, jobStartedAt: startedAt, incidentAvailableAt: startedAt + FIRST_INCIDENT_DELAY_MS, incidentCreatedAt: null, incidentResolved: false, incidentChoice: null, screen: 'journal' }))
  }

  if (state.screen === 'onboarding') return <Onboarding name={nameDraft} setName={setNameDraft} submit={createCharacter} />
  if (state.screen === 'briefing') return <Briefing name={state.name} continueGame={() => navigate('floor')} />

  return (
    <div className="app-shell">
      <DesktopRail state={state} progress={jobProgress} operationProgress={operationProgress} job={job} navigate={navigate} />
      <main className="game-frame">
        <TopBar state={state} navigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} reset={reset} />
        {tickerVisible && state.screen === 'floor' && (
          <button className="ticker" onClick={() => navigate('terminal')} aria-label="Открыть сообщение в терминале">
            <span className="ticker-icon"><Radio size={14} /></span>
            <span className="ticker-label">ЯРУС 47</span>
            <span className="ticker-scroll"><span>ТРЕБУЮТСЯ ПОДШИПНИКИ ДЛЯ ЛИФТА&nbsp;&nbsp;•&nbsp;&nbsp;ЗАПРОС ИНЖЕНЕРНОГО ОТСЕКА</span></span>
            <ChevronRight size={16} />
          </button>
        )}

        <section className="screen-area">
          {state.screen === 'floor' && <Floor state={state} setState={setState} job={job} progress={jobProgress} operationProgress={operationProgress} navigate={navigate} />}
          {state.screen === 'jobs' && <Jobs department={state.department} activeJob={job} beginJob={beginJob} continueJob={() => navigate('journal')} back={() => navigate('floor')} />}
          {state.screen === 'journal' && <Journal state={state} job={job} progress={jobProgress} elapsed={elapsed} navigate={navigate} />}
          {state.screen === 'incident' && <Incident state={state} setState={setState} navigate={navigate} remaining={Math.max(0, 600 - Math.floor((now - (state.incidentCreatedAt ?? now)) / 1000))} />}
          {state.screen === 'skills' && <Skills state={state} elapsed={elapsed} />}
          {state.screen === 'map' && <DepartmentMap state={state} setState={setState} navigate={navigate} />}
          {state.screen === 'terminal' && <NewsTerminal navigate={navigate} openProductionJobs={() => setState(prev => ({ ...prev, department: 'mechanics', screen: 'jobs' }))} />}
          {state.screen === 'chronicle' && <Chronicle state={state} job={job} progress={jobProgress} operationProgress={operationProgress} navigate={navigate} />}
          {state.screen === 'objectives' && <Objectives state={state} job={job} progress={jobProgress} operationProgress={operationProgress} setState={setState} navigate={navigate} />}
        </section>
        <BottomNav current={state.screen} navigate={navigate} />
      </main>
    </div>
  )
}

function Onboarding({ name, setName, submit }: { name: string, setName: (v: string) => void, submit: () => void }) {
  return (
    <main className="onboarding">
      <div className="onboarding-grid" aria-hidden="true" />
      <div className="gantry gantry-left" aria-hidden="true"><span /><span /><span /></div>
      <div className="gantry gantry-right" aria-hidden="true"><span /><span /></div>
      <div className="onboarding-mark">Z<span>47</span></div>
      <section className="identity-panel">
        <div className="eyebrow"><span /> МЕГАЗАВОД · ПРОПУСКНАЯ СИСТЕМА</div>
        <h1>ZAVOD</h1>
        <p className="tagline">ЖИЗНЬ ВНУТРИ МЕГАЗАВОДА</p>
        <div className="identity-copy">
          <div className="rule-number">01</div>
          <div><strong>Создайте имя.</strong><p>Оно останется в истории этого Эпизода.</p></div>
        </div>
        <label className="field-label" htmlFor="character-name">ПОЗЫВНОЙ</label>
        <div className="name-field">
          <UserRound size={19} />
          <input id="character-name" autoFocus maxLength={24} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Введите имя" />
          <span>{name.length}/24</span>
        </div>
        <button className="primary-button" onClick={submit} disabled={name.trim().length < 2}>ПОЛУЧИТЬ ПРОПУСК <ArrowRight size={18} /></button>
        <p className="microcopy"><ShieldAlert size={14} /> Данные персонажа сохраняются только на этом устройстве</p>
      </section>
      <div className="system-status"><span className="status-dot" /> СИСТЕМЫ ЯРУСА В СЕТИ <b>03:17:42</b></div>
    </main>
  )
}

function Briefing({ name, continueGame }: { name: string, continueGame: () => void }) {
  return (
    <main className="briefing">
      <header className="briefing-header"><div className="brand-mini">Z</div><span>ОПЕРАТИВНЫЙ БРИФИНГ</span><span className="briefing-id">ЭПИЗОД 01 / ЯРУС 47</span></header>
      <div className="briefing-content">
        <section className="briefing-lead">
          <div className="eyebrow"><span /> ДОБРО ПОЖАЛОВАТЬ, {name.toUpperCase()}</div>
          <p className="episode-code">ЭПИЗОД 01</p>
          <h1>НЕМОЙ<br />ЛИФТ</h1>
          <p className="lead-text">Грузовой лифт яруса 47 не отвечает. Без него остановится снабжение верхних секторов.</p>
          <div className="briefing-alert"><AlertTriangle size={20} /><div><b>Связь с диспетчером отсутствует</b><span>Причина отказа неизвестна</span></div></div>
        </section>
        <section className="operation-plan">
          <div className="section-kicker">ПЛАН ОПЕРАЦИИ <span>3 ОСНОВНЫЕ ЗАДАЧИ</span></div>
          {[
            { num: '01', title: 'Обследовать механизм', dept: 'Инженерия', Icon: Wrench },
            { num: '02', title: 'Подготовить компоненты', dept: 'Производство', Icon: Cog },
            { num: '03', title: 'Восстановить питание', dept: 'Энергетика', Icon: Zap },
          ].map(({ num, title, dept, Icon }) => (
            <div className="operation-step" key={num}>
              <span className="step-num">{num}</span><span className="step-icon"><Icon size={22} /></span>
              <div><b>{title}</b><span>{dept}</span></div><ChevronRight size={18} />
            </div>
          ))}
          <div className="collective-goal"><Users size={20} /><div><b>Это общая операция</b><span>Работа каждого приближает запуск лифта. Отсек можно сменить в любой момент.</span></div></div>
          <button className="primary-button" onClick={continueGame}>ПЕРЕЙТИ НА ЯРУС <ArrowRight size={18} /></button>
        </section>
      </div>
      <footer className="briefing-footer"><span>МЕГАЗАВОД // ВНУТРЕННЯЯ СЕТЬ</span><span>ЦЕЛЬ НЕ ИМЕЕТ КАЛЕНДАРНОГО СРОКА</span></footer>
    </main>
  )
}

function DesktopRail({ state, progress, operationProgress, job, navigate }: { state: SavedState, progress: number, operationProgress: number, job: Job | null, navigate: (s: Screen) => void }) {
  return (
    <aside className="desktop-rail">
      <div className="rail-brand">Z<span>ЗАВОД</span></div>
      <div className="rail-section">
        <span className="rail-label">ОПЕРАЦИЯ</span><b>Немой лифт</b><small>Ярус 47 · Эпизод 01</small>
        <div className="rail-progress"><span style={{ width: `${operationProgress}%` }} /></div><small>Общий прогресс {operationProgress}%</small>
        <button className="rail-plan" onClick={() => navigate('objectives')}><ListChecks size={15} /> Открыть план операции</button>
      </div>
      <div className="rail-section resource-list">
        <span className="rail-label">РЕСУРСЫ ЯРУСА</span>
        <p><Box size={15} /> Заготовки <b>12</b></p><p><Cog size={15} /> Подшипники <b>8</b></p><p><Zap size={15} /> Энергия <b>21</b></p>
      </div>
      <div className="rail-section current-shift">
        <span className="rail-label">ВАША СМЕНА</span>
        {job ? <><b>{job.title}</b><small>{progress} / {job.target} · работа идёт</small><span className="live-line"><i /> АКТИВНО</span></> : <><b>Нет назначения</b><small>Выберите объект на этаже</small></>}
      </div>
      <button className="rail-chronicle" onClick={() => navigate('chronicle')}><BookOpen size={17} /> Летопись Эпизода</button>
      <div className="rail-user"><div>{state.name.slice(0, 1).toUpperCase()}</div><span><b>{state.name}</b><small>Работник яруса 47</small></span></div>
    </aside>
  )
}

function TopBar({ state, navigate, menuOpen, setMenuOpen, reset }: { state: SavedState, navigate: (s: Screen) => void, menuOpen: boolean, setMenuOpen: (v: boolean) => void, reset: () => void }) {
  return (
    <header className="top-bar">
      <button className="mobile-brand" onClick={() => navigate('floor')}><span>Z</span><b>МЕГАЗАВОД</b></button>
      <div className="top-context"><span>ЭПИЗОД 01</span><b>НЕМОЙ ЛИФТ</b></div>
      <div className="top-stats"><span><Box size={15} /> 12</span><span><Zap size={15} /> 21</span><span><Wrench size={15} /> 8</span></div>
      <button className="task-button" onClick={() => navigate('objectives')} aria-label="Открыть текущие задачи"><ListChecks size={19} /><span>ЗАДАЧИ</span><i /></button>
      <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Меню"><Menu size={21} /></button>
      {menuOpen && <div className="popover-menu"><button onClick={() => { navigate('chronicle'); setMenuOpen(false) }}><BookOpen size={16} /> Летопись</button><button onClick={reset}><RotateCcw size={16} /> Начать заново</button></div>}
    </header>
  )
}

function ActionProgress({ job, elapsed, compact = false }: { job: Job, elapsed: number, compact?: boolean }) {
  const cycleSeconds = 60
  const secondsInCycle = elapsed % cycleSeconds
  const progress = secondsInCycle / cycleSeconds * 100
  const remaining = cycleSeconds - secondsInCycle
  const action = getWorkAction(job, Math.floor(elapsed / cycleSeconds))

  return <div className={`action-progress ${compact ? 'compact' : ''}`}>
    <div className="action-progress-title"><span><i /> ТЕКУЩЕЕ ДЕЙСТВИЕ</span><b>{formatDuration(remaining)} до записи</b></div>
    <p>{action.active}</p>
    <div className="action-progress-track"><i style={{ width: `${progress}%` }} /></div>
  </div>
}

function CurrentDirective({ state, job, progress, setState, navigate }: { state: SavedState, job: Job | null, progress: number, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  const urgent = Boolean(job && state.incidentCreatedAt && !state.incidentResolved)
  const title = !job ? 'Получите первый рабочий наряд' : urgent ? 'Примите решение по происшествию' : 'Продолжайте текущий наряд'
  const description = !job
    ? 'Откройте токарный станок и возьмите задачу «Подготовить заготовки». Это запустит производство деталей для лифта.'
    : urgent
      ? 'Станок вибрирует. У вас есть 10 минут, чтобы выбрать действие; иначе сработает безопасный вариант.'
      : `${job.title}: выполнено ${progress} из ${job.target}. Производство идёт, даже когда приложение закрыто.`
  const action = () => {
    if (!job) setState(prev => ({ ...prev, department: 'mechanics', screen: 'jobs' }))
    else navigate(urgent ? 'incident' : 'journal')
  }

  return <section className={`current-directive ${urgent ? 'urgent' : ''}`}>
    <div className="directive-icon">{urgent ? <AlertTriangle /> : <Target />}</div>
    <div className="directive-copy"><span>{urgent ? 'ТРЕБУЕТ РЕШЕНИЯ' : 'ЧТО ДЕЛАТЬ СЕЙЧАС'}</span><h2>{title}</h2><p>{description}</p>{job && !urgent && <ActionProgress job={job} elapsed={state.jobStartedAt ? Math.floor((Date.now() - state.jobStartedAt) / 1000) : 0} compact />}</div>
    <div className="directive-actions"><button className="directive-primary" onClick={action}>{urgent ? 'ПРИНЯТЬ РЕШЕНИЕ' : job ? 'ОТКРЫТЬ ДНЕВНИК' : 'ПЕРЕЙТИ К НАРЯДАМ'} <ArrowRight size={16} /></button><button className="directive-secondary" onClick={() => navigate('objectives')}><ListChecks size={15} /> ВЕСЬ ПЛАН</button></div>
  </section>
}

function Floor({ state, setState, job, progress, operationProgress, navigate }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, job: Job | null, progress: number, operationProgress: number, navigate: (s: Screen) => void }) {
  const dept = departments[state.department]
  const Icon = dept.icon
  const openObject = (department: Department) => setState(prev => ({ ...prev, department, screen: 'jobs' }))
  return (
    <div className="floor-screen">
      <div className="screen-heading">
        <div><span className="eyebrow"><span /> ЯРУС 47 · СЕКТОР 03</span><h1>{dept.label}</h1><p>{dept.subtitle}</p></div>
        <button className="department-switch" onClick={() => navigate('map')}><Map size={17} /> СМЕНИТЬ ОТСЕК</button>
      </div>
      <CurrentDirective state={state} job={job} progress={progress} setState={setState} navigate={navigate} />
      <div className="floor-layout">
        <div className={`floor-scene dept-${state.department}`}>
          <div className="scene-label">СХЕМА СЕКТОРА <b>03–{state.department === 'mechanics' ? 'А' : state.department === 'power' ? 'Б' : 'В'}</b></div>
          <div className="scene-grid" aria-hidden="true" />
          <div className="pipe pipe-a" /><div className="pipe pipe-b" /><div className="cable cable-a" />
          <button className="machine-object lathe" onClick={() => openObject('mechanics')}>
            <span className="object-pulse" /><span className="machine-art"><Cog size={52} /></span>
            <span className="object-label"><Factory size={15} /><span><b>ТОКАРНЫЙ СТАНОК</b><small>{job?.department === 'mechanics' ? 'ВЫ РАБОТАЕТЕ' : 'СВОБОДЕН'}</small></span></span>
          </button>
          <button className="machine-object power-panel" onClick={() => openObject('power')}>
            <span className="object-pulse" /><span className="machine-art"><Zap size={43} /></span>
            <span className="object-label"><Zap size={15} /><span><b>СИЛОВОЙ ЩИТ</b><small>{state.department === 'power' ? 'ДОСТУПЕН' : 'УДАЛЁННЫЙ ДОСТУП'}</small></span></span>
          </button>
          <button className="machine-object repair-post" onClick={() => openObject('repair')}>
            <span className="object-pulse" /><span className="machine-art"><Wrench size={46} /></span>
            <span className="object-label"><Wrench size={15} /><span><b>РЕМОНТНЫЙ ПОСТ</b><small>НУЖНЫ ДЕТАЛИ</small></span></span>
          </button>
          <button className="machine-object info-terminal" onClick={() => navigate('terminal')}>
            <span className="terminal-screen"><span>3</span> НОВЫХ</span>
            <span className="object-label"><Terminal size={15} /><span><b>ИНФО-ТЕРМИНАЛ</b><small>ЕСТЬ НОВОСТИ</small></span></span>
          </button>
          <div className="floor-id"><span>03</span><small>ЯРУС<br />МЕХАНИЧЕСКИЙ</small></div>
        </div>
        <aside className="floor-status">
          <div className="status-title"><Icon size={19} /><span><small>СОСТОЯНИЕ ОТСЕКА</small><b>{dept.label}</b></span><i>СТАБИЛЬНО</i></div>
          <div className="metric"><span>Готовность операции</span><b>{operationProgress}%</b><div><i style={{ width: `${operationProgress}%` }} /></div></div>
          <div className="metric"><span>Нагрузка линии</span><b>67%</b><div><i className="blue" style={{ width: '67%' }} /></div></div>
          {job ? <div className="active-task"><span className="live-line"><i /> ВАША РАБОТА</span><b>{job.title}</b><p>{progress} из {job.target} · производство продолжается</p><button onClick={() => navigate('journal')}>Открыть дневник <ChevronRight size={16} /></button></div> : <div className="empty-task"><CircleGauge size={24} /><b>Выберите рабочее место</b><p>Нажмите на объект на схеме, чтобы получить наряд.</p></div>}
          <div className="workers"><span><Users size={16} /> В ОТСЕКЕ</span><div><i>МК</i><i>СП</i><i>АВ</i><b>+4</b></div></div>
        </aside>
      </div>
    </div>
  )
}

function Objectives({ state, job, progress, operationProgress, setState, navigate }: { state: SavedState, job: Job | null, progress: number, operationProgress: number, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  const goToDepartment = (department: Department) => {
    haptic('selection')
    setState(prev => ({ ...prev, department, screen: 'jobs' }))
  }
  const urgent = Boolean(job && state.incidentCreatedAt && !state.incidentResolved)

  const stages = [
    { id: '01', title: 'Получить назначение', dept: 'Ярус 47', detail: job ? `Вы начали наряд «${job.title}».` : 'Выберите рабочее место и возьмите первый доступный наряд.', status: job ? 'done' : 'active', progress: job ? 100 : 0, action: () => goToDepartment('mechanics') },
    { id: '02', title: 'Подготовить компоненты', dept: 'Производство', detail: 'Нужно изготовить 18 заготовок, затем 8 подшипников и 6 креплений.', status: job?.department === 'mechanics' ? 'active' : 'available', progress: job?.department === 'mechanics' ? Math.round(progress / job.target * 100) : 0, action: () => goToDepartment('mechanics') },
    { id: '03', title: 'Восстановить питание', dept: 'Энергетика', detail: 'Проверить силовой щит и накопить энергию для запуска привода.', status: job?.department === 'power' ? 'active' : 'available', progress: job?.department === 'power' ? Math.round(progress / job.target * 100) : 0, action: () => goToDepartment('power') },
    { id: '04', title: 'Восстановить привод', dept: 'Инженерия', detail: 'Откроется после поставки подшипников и восстановления силовой линии.', status: 'locked', progress: 0, action: () => undefined },
  ]

  return <div className="content-screen objectives-screen">
    <button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> НА ЭТАЖ</button>
    <div className="screen-heading compact"><div><span className="eyebrow"><span /> ЭПИЗОД 01 · ОБЩАЯ ЦЕЛЬ</span><h1>План операции</h1><p>Восстановить грузовой лифт яруса 47 совместными усилиями трёх отсеков.</p></div><div className="objective-total"><span>ОБЩИЙ ПРОГРЕСС</span><b>{operationProgress}%</b><div><i style={{ width: `${operationProgress}%` }} /></div></div></div>

    <CurrentDirective state={state} job={job} progress={progress} setState={setState} navigate={navigate} />

    <div className="objective-list">
      {stages.map(stage => <article className={`objective-card ${stage.status}`} key={stage.id}>
        <div className="objective-index">{stage.status === 'done' ? <Check size={18} /> : stage.id}</div>
        <div className="objective-body"><div className="objective-title"><span>{stage.dept}</span><em>{stage.status === 'done' ? 'ЗАВЕРШЕНО' : stage.status === 'active' ? 'ВЫ РАБОТАЕТЕ' : stage.status === 'locked' ? 'ЗАБЛОКИРОВАНО' : 'ДОСТУПНО'}</em></div><h2>{stage.title}</h2><p>{stage.detail}</p><div className="objective-progress"><i style={{ width: `${stage.progress}%` }} /></div><small>{stage.progress}%</small></div>
        {stage.status !== 'locked' && <button onClick={stage.action}>{stage.status === 'done' ? 'РЕЗУЛЬТАТ' : 'ПЕРЕЙТИ'} <ChevronRight size={17} /></button>}
      </article>)}
    </div>

    <aside className="objective-hint"><Info size={19} /><div><b>Можно менять отсек и работу в любой момент.</b><p>Уже изготовленные ресурсы, опыт и принятые решения сохраняются. Заблокированные этапы откроются автоматически после выполнения зависимостей.</p></div></aside>
  </div>
}

function Jobs({ department, activeJob, beginJob, continueJob, back }: { department: Department, activeJob: Job | null, beginJob: (j: Job) => void, continueJob: () => void, back: () => void }) {
  const available = jobs.filter(j => j.department === department).sort((a, b) => a.level - b.level)
  return (
    <div className="content-screen jobs-screen">
      <button className="back-button" onClick={back}><ArrowLeft size={17} /> НАЗАД НА ЭТАЖ</button>
      <div className="screen-heading compact"><div><span className="eyebrow"><span /> {departments[department].label.toUpperCase()} · НАРЯДЫ</span><h1>Рабочее место</h1><p>Выберите задачу — работа продолжится после выхода из приложения.</p></div><div className="station-badge">{department === 'mechanics' ? <Cog size={40} /> : department === 'power' ? <Zap size={40} /> : <Wrench size={40} />}<span><b>{departments[department].short}</b><small>ОБОРУДОВАНИЕ ИСПРАВНО</small></span></div></div>
      <div className="job-filter"><button className="active">ДОСТУПНЫЕ <span>{available.length}</span></button><button>В РАБОТЕ <span>{activeJob ? 1 : 0}</span></button><button>ЗАВЕРШЕНЫ <span>2</span></button></div>
      <div className="job-grid">
        {available.map(item => {
          const locked = item.level > 1 && activeJob?.id !== item.id
          return <article className={`job-card ${locked ? 'locked' : ''} ${activeJob?.id === item.id ? 'selected' : ''}`} key={item.id}>
            <div className="job-icon">{item.icon === 'power' ? <Zap /> : item.icon === 'repair' ? <Wrench /> : <Cog />}</div>
            <div className="job-copy"><span className="job-code">НАРЯД {item.id.replace('J_', '47-')}</span><h3>{item.title}</h3><p>{item.description}</p><div className="job-meta"><span><Gauge size={14} /> Ур. {item.level}</span><span><Sparkles size={14} /> {item.reward}</span></div></div>
            <div className="job-progress-mini"><span>{activeJob?.id === item.id ? 'В РАБОТЕ' : locked ? 'НУЖЕН УРОВЕНЬ 2' : 'ГОТОВ К ЗАПУСКУ'}</span><div><i style={{ width: activeJob?.id === item.id ? '46%' : '0%' }} /></div></div>
            <button disabled={locked} onClick={() => activeJob?.id === item.id ? continueJob() : beginJob(item)}>{activeJob?.id === item.id ? 'ПРОДОЛЖИТЬ' : locked ? 'НЕДОСТУПНО' : 'ВЗЯТЬ НАРЯД'} <ChevronRight size={17} /></button>
          </article>
        })}
      </div>
      <div className="job-note"><Info size={18} /><span><b>Можно сменить работу в любой момент.</b> Уже произведённые детали и полученный опыт сохранятся.</span></div>
    </div>
  )
}

function Journal({ state, job, progress, elapsed, navigate }: { state: SavedState, job: Job | null, progress: number, elapsed: number, navigate: (s: Screen) => void }) {
  const time = (timestamp: number | null) => new Date(timestamp ?? Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const completedCycles = Math.floor(elapsed / 60)
  const recentCycles = job ? Array.from({ length: Math.min(completedCycles, 20) }, (_, index) => completedCycles - index - 1) : []
  return (
    <div className="content-screen journal-screen">
      <div className="screen-heading compact"><div><span className="eyebrow"><span /> ЛИЧНЫЙ ЖУРНАЛ · {state.name.toUpperCase()}</span><h1>Рабочий дневник</h1><p>Записи смены формируются из подтверждённых событий.</p></div>{job && <div className="working-now"><span><i /> РАБОТА ИДЁТ</span><b>{job.title}</b><small>{progress} / {job.target} · {formatDuration(elapsed)}</small></div>}</div>
      {job && <ActionProgress job={job} elapsed={elapsed} />}
      <div className="journal-layout">
        <div className="timeline">
          {!job && <div className="journal-empty"><BookOpen size={28} /><h3>Смена ещё не началась</h3><p>Получите наряд на одном из рабочих мест. После этого здесь появятся только события вашей смены.</p><button onClick={() => navigate('objectives')}>ОТКРЫТЬ ПЛАН ОПЕРАЦИИ <ChevronRight size={16} /></button></div>}
          {state.incidentCreatedAt && !state.incidentResolved && <button className="timeline-event incident-entry" onClick={() => navigate('incident')}><time>{time(state.incidentCreatedAt)}</time><span className="timeline-dot danger" /><div><span className="entry-type">АКТИВНОЕ ПРОИСШЕСТВИЕ</span><h3>Станок вибрирует</h3><p>Непонятный стук привода. Решение нужно принять в течение десяти минут.</p><b>ПРИНЯТЬ РЕШЕНИЕ <ChevronRight size={15} /></b></div></button>}
          {state.incidentCreatedAt && state.incidentResolved && <div className="timeline-event resolved-entry"><time>{time(state.incidentCreatedAt)}</time><span className="timeline-dot success" /><div><span className="entry-type">РЕШЕНИЕ ЗАФИКСИРОВАНО</span><h3>{state.incidentChoice}</h3><p>Исход сохранён в журнале. Повторное изменение невозможно.</p></div></div>}
          {job && recentCycles.map(cycle => {
            const action = getWorkAction(job, cycle)
            return <div className="timeline-event" key={cycle}><time>{time((state.jobStartedAt ?? Date.now()) + (cycle + 1) * 60_000)}</time><span className="timeline-dot" /><div><span className="entry-type">РАБОЧИЙ ЦИКЛ {String(cycle + 1).padStart(2, '0')}</span><p>{action.completed}</p><small>+1 XP · +1 к прогрессу наряда</small></div></div>
          })}
          {job && <div className="timeline-event"><time>{time(state.jobStartedAt)}</time><span className="timeline-dot" /><div><span className="entry-type">НАЧАЛО СМЕНЫ</span><p>Я получил наряд «{job.title}» и начал работу. Первые результаты появятся после завершения рабочего цикла.</p></div></div>}
        </div>
        <aside className="shift-summary"><span className="rail-label">СВОДКА СМЕНЫ</span><div className="summary-number"><b>{progress}</b><span>ЕДИНИЦ<br />ПРОИЗВЕДЕНО</span></div><div className="summary-stats"><p><span>Опыт</span><b>+{Math.floor(elapsed / 60)} XP</b></p><p><span>Время</span><b>{formatDuration(elapsed)}</b></p><p><span>Происшествия</span><b>{state.incidentCreatedAt ? 1 : 0}</b></p></div><button onClick={() => navigate('floor')}>ВЕРНУТЬСЯ НА ЭТАЖ</button></aside>
      </div>
    </div>
  )
}

function Incident({ state, setState, navigate, remaining }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void, remaining: number }) {
  const [choice, setChoice] = useState<string | null>(null)
  const options = [
    { title: 'Проверить крепления', text: 'Безопасный вариант по умолчанию. Производительность −5% на 10 минут.', icon: Wrench, safe: true },
    { title: 'Снизить обороты', text: 'Продолжить выпуск осторожно. +7 XP, производительность +7%.', icon: Gauge },
    { title: 'Позвать инженера', text: 'Создать межотсечный запрос и остановить станок на диагностику.', icon: Users },
  ]
  const confirm = () => {
    if (!choice) return
    setState(prev => ({ ...prev, incidentResolved: true, incidentChoice: choice, screen: 'journal' }))
  }
  if (state.incidentResolved) return <div className="content-screen resolved-screen"><Check size={44} /><span className="eyebrow"><span /> ИСХОД ЗАФИКСИРОВАН</span><h1>{state.incidentChoice}</h1><p>Решение уже применено и останется в истории Эпизода.</p><button className="primary-button" onClick={() => navigate('journal')}>ВЕРНУТЬСЯ В ДНЕВНИК</button></div>
  return (
    <div className="content-screen incident-screen">
      <button className="back-button" onClick={() => navigate('journal')}><ArrowLeft size={17} /> В ДНЕВНИК</button>
      <div className="incident-header"><div className="warning-sign"><AlertTriangle /></div><div><span>ПРОИСШЕСТВИЕ · ПРОИЗВОДСТВЕННЫЙ ОТСЕК</span><h1>Станок вибрирует</h1><p>Привод издаёт неровный металлический стук.</p></div><div className="countdown"><Clock3 size={19} /><span>ОСТАЛОСЬ</span><b>{formatDuration(remaining)}</b></div></div>
      <div className="incident-visual"><div className="machine-silhouette"><Cog /><span className="vibration v1" /><span className="vibration v2" /></div><div className="scan-lines" /><span>СТАНОК 03-А · АНОМАЛИЯ ПРИВОДА</span></div>
      <div className="decision-copy"><span>ВАШЕ РЕШЕНИЕ</span><p>Выберите одно действие. После подтверждения изменить его будет нельзя.</p></div>
      <div className="decision-options">{options.map(({ title, text, icon: Icon, safe }) => <button key={title} className={choice === title ? 'selected' : ''} onClick={() => setChoice(title)}><span className="decision-icon"><Icon /></span><span><b>{title}</b><small>{text}</small>{safe && <em>БЕЗОПАСНЫЙ ВАРИАНТ</em>}</span><span className="radio-mark">{choice === title && <i />}</span></button>)}</div>
      <button className="primary-button decision-confirm" disabled={!choice} onClick={confirm}>ПОДТВЕРДИТЬ РЕШЕНИЕ <ArrowRight size={18} /></button>
      <p className="fallback-note"><Info size={15} /> Если время истечёт, система автоматически выберет «Проверить крепления».</p>
    </div>
  )
}

function Skills({ state, elapsed }: { state: SavedState, elapsed: number }) {
  const activeJob = jobs.find(item => item.id === state.jobId)
  const xpFor = (department: Department) => activeJob?.department === department ? Math.floor(elapsed / 60) : 0
  const skillData = [
    { name: 'Механическая обработка', level: 1, xp: xpFor('mechanics'), max: 60, icon: Cog, color: 'orange', note: 'Точные детали, подшипники, крепёж' },
    { name: 'Энергетика', level: 1, xp: xpFor('power'), max: 60, icon: Zap, color: 'yellow', note: 'Силовые линии и накопители' },
    { name: 'Ремонт', level: 1, xp: xpFor('repair'), max: 60, icon: Wrench, color: 'blue', note: 'Диагностика и восстановление' },
  ]
  return <div className="content-screen skills-screen"><div className="screen-heading compact"><div><span className="eyebrow"><span /> ПРОФИЛЬ РАБОТНИКА</span><h1>Навыки</h1><p>{state.name} · прогресс текущего Эпизода</p></div><div className="episode-reset"><RotateCcw size={18} /><span><b>Прогресс Эпизода</b><small>Сбросится после финала</small></span></div></div><div className="skill-grid">{skillData.map(({ name, level, xp, max, icon: Icon, color, note }) => <article className="skill-card" key={name}><div className={`skill-symbol ${color}`}><Icon /></div><div className="skill-main"><span className="skill-level">УРОВЕНЬ {level}</span><h3>{name}</h3><p>{note}</p><div className="skill-bar"><i style={{ width: `${Math.min(100, xp / max * 100)}%` }} /></div><small>{xp} / {max} XP до следующего уровня</small></div><ChevronRight /></article>)}</div><section className="knowledge"><div className="section-kicker">ОСОБЫЕ ЗНАНИЯ <span>{state.incidentResolved ? '1 ОТКРЫТО' : 'ПОКА НЕТ'}</span></div>{state.incidentResolved ? <div className="knowledge-grid"><article><Sparkles /><div><b>Опыт происшествия</b><p>Зафиксировано решение: {state.incidentChoice}.</p><span>ПРОИСШЕСТВИЕ P-01</span></div></article></div> : <div className="knowledge-empty"><Sparkles /><p>Особые знания открываются после значимых происшествий и решений.</p></div>}</section></div>
}

function DepartmentMap({ state, setState, navigate }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  return <div className="content-screen map-screen"><div className="screen-heading compact"><div><span className="eyebrow"><span /> ГРУЗОВОЙ ЛИФТ · ЯРУС 47</span><h1>Выбор отсека</h1><p>Специализация не фиксирована. Готовый результат сохранится при переходе.</p></div></div><div className="department-grid">{(Object.keys(departments) as Department[]).map(key => { const item = departments[key]; const Icon = item.icon; return <button key={key} className={state.department === key ? 'active' : ''} onClick={() => setState(prev => ({ ...prev, department: key, screen: 'floor' }))}><div className={`department-illustration ${key}`}><Icon /><span className="floor-lines" /></div><div><span>СЕКТОР {key === 'mechanics' ? '03-А' : key === 'power' ? '03-Б' : '03-В'}</span><h2>{item.label}</h2><p>{item.subtitle}</p><small>{key === 'mechanics' ? '7 работников · 3 наряда' : key === 'power' ? '4 работника · 2 наряда' : '5 работников · 2 наряда'}</small></div><ChevronRight /></button>})}</div><button className="back-button centered" onClick={() => navigate('floor')}><ArrowLeft size={17} /> ОСТАТЬСЯ В ТЕКУЩЕМ ОТСЕКЕ</button></div>
}

function NewsTerminal({ navigate, openProductionJobs }: { navigate: (s: Screen) => void, openProductionJobs: () => void }) {
  return <div className="content-screen terminal-page"><button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> К СХЕМЕ ЭТАЖА</button><div className="screen-heading compact"><div><span className="eyebrow"><span /> ИНФО-ТЕРМИНАЛ · ЯРУС 47</span><h1>Новости яруса</h1><p>Запросы отсеков и подтверждённые изменения операции.</p></div><div className="terminal-live"><i /> СЕТЬ АКТИВНА</div></div><div className="news-list">{news.map((item, index) => <article className={item.critical ? 'critical' : ''} key={item.time}><time>{item.time}</time><div className="news-line"><span>{item.category}</span><i /></div><div><h3>{item.title}</h3><p>{item.body}</p>{index === 0 && <button onClick={openProductionJobs}>ПЕРЕЙТИ К НАРЯДУ <ChevronRight size={15} /></button>}</div></article>)}</div><div className="terminal-footer"><Radio size={17} /> ПОКАЗАНЫ СООБЩЕНИЯ ТЕКУЩЕГО ЭПИЗОДА</div></div>
}

function Chronicle({ state, job, progress, operationProgress, navigate }: { state: SavedState, job: Job | null, progress: number, operationProgress: number, navigate: (s: Screen) => void }) {
  return <div className="content-screen chronicle-screen"><button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> НАЗАД</button><div className="chronicle-hero"><span className="eyebrow"><span /> ЛЕТОПИСЬ · ЭПИЗОД 01</span><h1>Немой лифт</h1><p>Ярус 47 снова слышит движение тросов. Операция продолжается — эта запись показывает возможный итог общего труда.</p><div className="chronicle-status"><i /> ОПЕРАЦИЯ В ПРОЦЕССЕ · {operationProgress}%</div></div><div className="chronicle-tabs"><button className="active">ЭПИЗОД</button><button>ЛИЧНАЯ ИСТОРИЯ</button><button>УЧАСТНИКИ <span>16</span></button></div><div className="chronicle-layout"><section><div className="section-kicker">КЛЮЧЕВЫЕ СОБЫТИЯ</div><div className="chronicle-events"><p><time>10:24</time><Zap /><span><b>Заказ на подшипники открыт</b>Инженеры подтвердили износ привода.</span></p><p><time>09:17</time><Users /><span><b>Энергетика восстановила резерв</b>Линия получила стабильное питание.</span></p><p><time>08:41</time><Wrench /><span><b>Шахта обследована</b>Причина остановки лифта найдена.</span></p></div></section><aside className="personal-contribution"><span className="rail-label">ВАШ ВКЛАД</span><div className="contribution-avatar">{state.name.slice(0, 1).toUpperCase()}</div><h3>{state.name}</h3><p>{job ? `Работает в отсеке «${departments[job.department].label}» и выполняет наряд «${job.title}».` : 'Смена ещё не началась. Первая запись появится после получения рабочего наряда.'}</p><div><span><b>{progress}</b> единиц</span><span><b>{state.incidentResolved ? 1 : 0}</b> решений</span><span><b>1 ур.</b> навык</span></div></aside></div></div>
}

function BottomNav({ current, navigate }: { current: Screen, navigate: (s: Screen) => void }) {
  const items: [Screen, string, typeof Factory][] = [['floor', 'Этаж', Factory], ['journal', 'Дневник', BookOpen], ['skills', 'Навыки', Gauge], ['map', 'Карта', Map]]
  return <nav className="bottom-nav">{items.map(([screen, label, Icon]) => <button key={screen} className={current === screen || (screen === 'floor' && ['jobs', 'terminal', 'incident'].includes(current)) ? 'active' : ''} onClick={() => navigate(screen)}><Icon size={20} /><span>{label}</span>{screen === 'journal' && <i />}</button>)}</nav>
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export default App
