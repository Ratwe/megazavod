import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Box, Check, ChevronRight,
  CircleGauge, Clock3, Cog, Factory, Gauge, Info, ListChecks, Map, Menu,
  Radio, RotateCcw, ShieldAlert, Sparkles, Target, Terminal, UserRound, Users,
  Wrench, Zap,
} from 'lucide-react'
import { getTelegramUserName, getTelegramWebApp, haptic } from './telegram'
import { useStory } from './story/useStory'
import type { ChronicleEntry as StoryChronicleEntry, CouncilView, EpisodeSnapshot, PlayerView, RecapView, WorkView } from './story/domain'

type Screen = 'lore' | 'onboarding' | 'briefing' | 'floor' | 'journal' | 'skills' | 'map' | 'jobs' | 'incident' | 'chronicle' | 'terminal' | 'objectives'
type Department = 'mechanics' | 'power' | 'repair'
type LocationId = 'floor-hub' | 'production-wing' | 'blank-room' | 'lathe-room' | 'assembly-room' | 'power-wing' | 'switchboard-room' | 'battery-room' | 'relay-room' | 'engineering-wing' | 'repair-bay' | 'shaft-gallery' | 'tool-room' | 'archive-room' | 'dispatch-room' | 'lift-hall'

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

type IncidentRecord = {
  eventId: string
  createdAt: number
  resolvedAt: number
  choice: string
}

type IncidentOption = {
  title: string
  text: string
  progressBonus: number
  xpBonus: number
  knowledge: string | null
  icon: typeof Wrench
}

type IncidentDefinition = {
  id: string
  title: string
  summary: string
  signal: string
  sector: string
  weight: number
  departments?: Department[]
  missions?: number[]
  timeoutOptionId: string
  responseSeconds: number
  options: IncidentOption[]
}

type SavedState = {
  name: string
  screen: Screen
  department: Department
  location: LocationId
  jobId: string | null
  jobStartedAt: number | null
  episodeStartedAt: number | null
  incidentAvailableAt: number | null
  activeIncidentId: string | null
  activeIncidentCreatedAt: number | null
  incidentHistory: IncidentRecord[]
  incidentChoice: string | null
  incidentProgressBonus: number
  incidentXpBonus: number
  incidentKnowledge: string[]
  contributionCycle: number
  storyMigrated: boolean
}

const jobs: Job[] = [
  { id: 'J_BEARING', title: 'Изготовить подшипники', description: 'Комплектующие главного привода', department: 'mechanics', level: 2, reward: '+8 XP · +1 деталь', target: 20, output: 'Подшипник', icon: 'bearing' },
  { id: 'J_BLANK', title: 'Подготовить заготовки', description: 'Поставки для производственной линии', department: 'mechanics', level: 1, reward: '+4 XP · +1 заготовка', target: 20, output: 'Заготовка', icon: 'blank' },
  { id: 'J_FASTENER', title: 'Проверить крепления', description: 'Заказ инженерного отсека', department: 'mechanics', level: 1, reward: '+6 XP · +1 крепёж', target: 20, output: 'Крепёж', icon: 'bolt' },
  { id: 'J_GENERATE', title: 'Стабилизировать накопитель', description: 'Вернуть питание на ярус 47', department: 'power', level: 1, reward: '+6 XP · +4 энергии/ч', target: 20, output: 'Энергия', icon: 'power' },
  { id: 'J_DIAG_POWER', title: 'Проверить силовой щит', description: 'Найти причину потери мощности', department: 'power', level: 1, reward: '+8 XP · диагностика', target: 20, output: 'Диагностика', icon: 'power' },
  { id: 'J_DIAG_REPAIR', title: 'Обследовать шахту', description: 'Определить состояние привода', department: 'repair', level: 1, reward: '+8 XP · диагностика', target: 20, output: 'Осмотр', icon: 'repair' },
  { id: 'J_REPAIR', title: 'Восстановить привод', description: 'Смонтировать исправный узел', department: 'repair', level: 2, reward: '+12 XP · ремонт', target: 20, output: 'Ремонт', icon: 'repair' },
]

function workToJob(work: WorkView): Job {
  return {
    id: work.id, title: work.title, description: work.description, department: work.department,
    level: work.skill.level, reward: '+1 XP за действие', target: work.requiredProgress,
    output: work.nearestResult, icon: work.department === 'power' ? 'power' : work.department === 'repair' ? 'repair' : 'bearing',
  }
}

const departments = {
  mechanics: { label: 'Производство', short: 'Мех. цех', icon: Factory, subtitle: 'Выпуск деталей и заготовок' },
  power: { label: 'Энергетика', short: 'Энергоблок', icon: Zap, subtitle: 'Питание и распределение' },
  repair: { label: 'Инженерия', short: 'Ремонтный пост', icon: Wrench, subtitle: 'Диагностика и восстановление' },
}

type LocationDefinition = {
  id: LocationId
  parent: LocationId | null
  title: string
  code: string
  subtitle: string
  detail: string
  icon: typeof Wrench
  department?: Department
  children?: LocationId[]
  jobIds?: string[]
  utility?: 'chronicle' | 'terminal' | 'map' | 'skills'
}

const locations: Record<LocationId, LocationDefinition> = {
  'floor-hub': { id: 'floor-hub', parent: null, title: 'Центральный переход', code: 'ЯРУС 47 · УЗЕЛ 00', subtitle: 'Отсюда расходятся все маршруты этажа', detail: 'Широкий переход вокруг грузового лифта связывает три рабочих крыла, Архив и диспетчерскую.', icon: Map, children: ['production-wing', 'power-wing', 'engineering-wing', 'archive-room', 'dispatch-room', 'lift-hall'] },
  'production-wing': { id: 'production-wing', parent: 'floor-hub', title: 'Производственный цех', code: 'СЕКТОР 03-А', subtitle: 'Металл, станки и сборочные посты', detail: 'За шумозащитной дверью цех разделяется на подготовку заготовок, токарную комнату и участок сборки.', icon: Factory, department: 'mechanics', children: ['blank-room', 'lathe-room', 'assembly-room'] },
  'blank-room': { id: 'blank-room', parent: 'production-wing', title: 'Заготовительная', code: 'КОМНАТА 03-А1', subtitle: 'Резка, очистка и первичная проверка металла', detail: 'Стеллажи с промаркированными слитками ведут к отрезному станку и столу входного контроля.', icon: Box, department: 'mechanics', jobIds: ['J_BLANK', 'alternate-supply'] },
  'lathe-room': { id: 'lathe-room', parent: 'production-wing', title: 'Токарная комната', code: 'КОМНАТА 03-А2', subtitle: 'Точная обработка деталей привода', detail: 'В центре стоит токарный станок 03-А2. Только здесь можно начать изготовление колец и подшипников.', icon: Cog, department: 'mechanics', jobIds: ['J_BEARING'] },
  'assembly-room': { id: 'assembly-room', parent: 'production-wing', title: 'Сборочная', code: 'КОМНАТА 03-А3', subtitle: 'Крепёж, посадка и контроль комплектов', detail: 'Длинный сборочный стол освещён контрольными лампами. На стене висят ключи с метками допуска.', icon: Wrench, department: 'mechanics', jobIds: ['J_FASTENER'] },
  'power-wing': { id: 'power-wing', parent: 'floor-hub', title: 'Энергетическое крыло', code: 'СЕКТОР 03-Б', subtitle: 'Распределение мощности и резерв', detail: 'За изолирующим шлюзом слышен гул шин. От коридора отходят щитовая, накопительная и релейная.', icon: Zap, department: 'power', children: ['switchboard-room', 'battery-room', 'relay-room'] },
  'switchboard-room': { id: 'switchboard-room', parent: 'power-wing', title: 'Силовая щитовая', code: 'КОМНАТА 03-Б1', subtitle: 'Вводы, контакторы и журнал перегрузок', detail: 'Высокие шкафы закрывают стены. Индикаторы силового щита повторяют пульс линии грузового лифта.', icon: Zap, department: 'power', jobIds: ['J_DIAG_POWER', 'power-audit', 'controlled-test', 'bypass-interlock'] },
  'battery-room': { id: 'battery-room', parent: 'power-wing', title: 'Накопительная', code: 'КОМНАТА 03-Б2', subtitle: 'Буферные ячейки и резервный контур', detail: 'Ряды накопителей уходят в полумрак. Здесь собирают энергию для первого движения кабины.', icon: Gauge, department: 'power', jobIds: ['J_GENERATE'] },
  'relay-room': { id: 'relay-room', parent: 'power-wing', title: 'Релейная', code: 'КОМНАТА 03-Б3', subtitle: 'Автоматика и сигнальные цепи', detail: 'Сотни реле щёлкают за стеклом. Терминал показывает необработанные сообщения силовой сети.', icon: Terminal, department: 'power', jobIds: ['recover-access-log', 'trace-override'], utility: 'terminal' },
  'engineering-wing': { id: 'engineering-wing', parent: 'floor-hub', title: 'Инженерное крыло', code: 'СЕКТОР 03-В', subtitle: 'Ремонт, диагностика и доступ к шахте', detail: 'Коридор заканчивается гермодверью шахты. По пути расположены ремонтный док и инструментальная.', icon: Wrench, department: 'repair', children: ['repair-bay', 'shaft-gallery', 'tool-room'] },
  'repair-bay': { id: 'repair-bay', parent: 'engineering-wing', title: 'Ремонтный док', code: 'КОМНАТА 03-В1', subtitle: 'Разборка и монтаж тяжёлых узлов', detail: 'Под потолочной балкой закреплена таль. На опоре ждёт место для нового сердца лифта.', icon: Wrench, department: 'repair', jobIds: ['J_REPAIR', 'repair-drive'] },
  'shaft-gallery': { id: 'shaft-gallery', parent: 'engineering-wing', title: 'Галерея шахты', code: 'КОМНАТА 03-В2', subtitle: 'Диагностический доступ к грузовому лифту', detail: 'За ограждением начинается шахта. Датчики, тормоза и тросы доступны с сервисной площадки.', icon: CircleGauge, department: 'repair', jobIds: ['J_DIAG_REPAIR', 'drive-diagnostics', 'inspect-impact', 'descend-lower-shaft', 'emergency-start', 'seal-shaft'] },
  'tool-room': { id: 'tool-room', parent: 'engineering-wing', title: 'Инструментальная', code: 'КОМНАТА 03-В3', subtitle: 'Оснастка и личная квалификация', detail: 'Шкафы выдают инструмент по уровню допуска. На терминале можно проверить освоенные знания.', icon: Target, department: 'repair', utility: 'skills' },
  'archive-room': { id: 'archive-room', parent: 'floor-hub', title: 'Комната Архива', code: 'УЗЕЛ 00-А', subtitle: 'Память смен и подтверждённые записи', detail: 'Здесь хранятся решения, которые уже нельзя переписать. Терминал открывает летопись Эпизода.', icon: BookOpen, utility: 'chronicle' },
  'dispatch-room': { id: 'dispatch-room', parent: 'floor-hub', title: 'Диспетчерская', code: 'УЗЕЛ 00-Б', subtitle: 'Сообщения яруса и маршруты нарядов', detail: 'Пустое кресло стоит перед живой панелью. Входящие сообщения продолжают появляться без диспетчера.', icon: Radio, utility: 'terminal' },
  'lift-hall': { id: 'lift-hall', parent: 'floor-hub', title: 'Лифтовой холл', code: 'УЗЕЛ 00-В', subtitle: 'Переход между секторами и уровнями', detail: 'Грузовые двери закрыты после аварии. Схема рядом показывает доступные части сорок седьмого яруса.', icon: Map, utility: 'map' },
}

const workstationByJob: Record<string, LocationId> = {
  J_BLANK: 'blank-room', J_BEARING: 'lathe-room', J_FASTENER: 'assembly-room',
  J_DIAG_POWER: 'switchboard-room', J_GENERATE: 'battery-room',
  J_DIAG_REPAIR: 'shaft-gallery', J_REPAIR: 'repair-bay',
  'drive-diagnostics': 'shaft-gallery', 'power-audit': 'switchboard-room', 'inspect-impact': 'shaft-gallery',
  'recover-access-log': 'relay-room', 'trace-override': 'relay-room', 'descend-lower-shaft': 'shaft-gallery',
  'repair-drive': 'repair-bay', 'controlled-test': 'switchboard-room', 'bypass-interlock': 'switchboard-room',
  'emergency-start': 'shaft-gallery', 'seal-shaft': 'shaft-gallery', 'alternate-supply': 'blank-room',
}

const defaultSaved: SavedState = {
  name: '', screen: 'lore', department: 'mechanics', location: 'floor-hub', jobId: null,
  jobStartedAt: null, episodeStartedAt: null, incidentAvailableAt: null, activeIncidentId: null, activeIncidentCreatedAt: null, incidentHistory: [], incidentChoice: null,
  incidentProgressBonus: 0, incidentXpBonus: 0, incidentKnowledge: [],
  contributionCycle: 0, storyMigrated: false,
}

const STORAGE_KEY = 'zavod-state-v2'
const ORDER_WORK_UNITS = 20
const PACKAGE_WORK_UNITS = 120
const MISSION_WORK_UNITS = 480
const EPISODE_WORK_UNITS = 1440

const news = [
  { time: '10:24', category: 'Производство', title: 'Требуются подшипники для лифта', body: 'Инженерный отсек запросил восемь подшипников для восстановления привода. Производственная задача добавлена в план Эпизода.', critical: true },
  { time: '09:17', category: 'Энергетика', title: 'Потребление на лифтовой линии выше нормы', body: 'Силовой щит зарегистрировал нестабильную нагрузку. Нужна диагностика контура.', critical: false },
  { time: '08:41', category: 'Инженерия', title: 'Обследование шахты завершено', body: 'Привод остановлен из-за износа опорного подшипника. Открыт заказ производству.', critical: false },
]

const option = (title: string, text: string, icon: typeof Wrench, progressBonus: number, xpBonus: number, knowledge: string | null = null): IncidentOption => ({ title, text, icon, progressBonus, xpBonus, knowledge })

const incidents: IncidentDefinition[] = [
  {
    id: 'third-knock', title: 'Третий удар', summary: 'Из-за стены доносятся три ровных удара. После паузы последовательность повторяется.', signal: 'АКУСТИЧЕСКАЯ АНОМАЛИЯ', sector: 'СЕРВИСНЫЙ КОРИДОР', weight: 4, timeoutOptionId: 'Зафиксировать и продолжить', responseSeconds: 600,
    options: [option('Ответить тем же ритмом', 'Отстучать последовательность по трубе и ждать ответа.', Radio, 0, 4, 'Язык сервисных тоннелей'), option('Найти источник', 'Остановить работу и пройти вдоль стены с акустическим датчиком.', Target, 0, 3), option('Зафиксировать и продолжить', 'Записать звук в журнал, не покидая рабочего места.', BookOpen, 1, 2)],
  },
  {
    id: 'nameless-pass', title: 'Пропуск без имени', summary: 'На полу лежит свежий пропуск. Вместо имени на нём выцарапан номер сорок восьмого яруса.', signal: 'НЕУЧТЁННЫЙ ИДЕНТИФИКАТОР', sector: 'ПРОХОД 03', weight: 3, timeoutOptionId: 'Передать в Архив', responseSeconds: 720,
    options: [option('Передать в Архив', 'Запечатать находку и оформить запись происхождения.', BookOpen, 0, 3), option('Проверить журнал проходов', 'Сверить номер пропуска с последними открытиями гермодверей.', ListChecks, 0, 4, 'Следы доступа'), option('Оставить на месте', 'Отметить координаты и наблюдать, кто вернётся за пропуском.', Target, 1, 2)],
  },
  {
    id: 'cold-draft', title: 'Холод снизу', summary: 'Из технологической решётки тянет воздухом, которого не должно быть в замкнутом контуре.', signal: 'РАЗГЕРМЕТИЗАЦИЯ НЕ ПОДТВЕРЖДЕНА', sector: 'НИЖНИЙ НАСТИЛ', weight: 4, timeoutOptionId: 'Закрыть заслонку', responseSeconds: 600,
    options: [option('Закрыть заслонку', 'Изолировать нижний воздуховод ручным приводом.', Wrench, 1, 2), option('Спустить датчик', 'Проверить температуру и состав воздуха под настилом.', Target, 0, 4, 'Воздух нижних ярусов'), option('Позвать дежурного', 'Передать координаты посту герметизации и освободить проход.', Radio, 1, 2)],
  },
  {
    id: 'missing-minute', title: 'Потерянная минута', summary: 'Все часы сектора одновременно отстают на пятьдесят семь секунд. Центральный хронометр уверен, что они точны.', signal: 'РАССИНХРОНИЗАЦИЯ', sector: 'ВЕСЬ СЕКТОР 03', weight: 2, timeoutOptionId: 'Сохранить расхождение', responseSeconds: 540,
    options: [option('Верить центральному времени', 'Синхронизировать рабочее место с главным хронометром.', Clock3, 1, 2), option('Сохранить расхождение', 'Не исправлять часы, пока не будет найдена причина сдвига.', BookOpen, 0, 4, 'Хронология отказов'), option('Свериться с соседями', 'Запросить независимые отметки времени у двух отсеков.', Radio, 0, 3)],
  },
  {
    id: 'intercom-breath', title: 'Дыхание в линии', summary: 'Отключённый переговорник оживает. В динамике слышно дыхание и скрежет далёкой двери.', signal: 'ВХОДЯЩИЙ КАНАЛ БЕЗ АДРЕСА', sector: 'ЛИНИЯ ДИСПЕТЧЕРА', weight: 2, missions: [0, 2], timeoutOptionId: 'Отключить линию физически', responseSeconds: 480,
    options: [option('Назвать свой позывной', 'Открыть канал и потребовать идентификацию собеседника.', Radio, 0, 4), option('Записать молча', 'Не выдавать своего присутствия и сохранить весь сигнал.', BookOpen, 0, 4, 'Шумы закрытых каналов'), option('Отключить линию физически', 'Вынуть разъём переговорника из распределительной панели.', Zap, 1, 2)],
  },
  {
    id: 'red-dust', title: 'Красная пыль', summary: 'На перчатке остаётся красный порошок. В этом секторе не используют материалы такого цвета.', signal: 'НЕИЗВЕСТНЫЙ МАТЕРИАЛ', sector: 'РАБОЧАЯ ЗОНА', weight: 3, timeoutOptionId: 'Очистить рабочее место', responseSeconds: 660,
    options: [option('Собрать образец', 'Изолировать порошок в контейнере для анализа.', Target, 0, 4, 'Следовая экспертиза'), option('Очистить рабочее место', 'Удалить пыль и проверить защитные фильтры.', Wrench, 1, 2), option('Проследить дорожку', 'Идти против следа до места, откуда принесли порошок.', CircleGauge, 0, 3)],
  },
  {
    id: 'blue-shavings', title: 'Синяя стружка', summary: 'Стружка темнеет и отливает синим: металл нагрелся сильнее, чем показывает датчик.', signal: 'ТЕМПЕРАТУРА ВНЕ МОДЕЛИ', sector: 'СТАНОК 03-А', weight: 5, departments: ['mechanics'], timeoutOptionId: 'Уменьшить подачу', responseSeconds: 600,
    options: [option('Сменить резец', 'Остановить проход и установить новый инструмент.', Wrench, 1, 2), option('Проверить датчик', 'Сравнить показания станка с ручным пирометром.', Gauge, 0, 4, 'Тепловая диагностика'), option('Уменьшить подачу', 'Завершить проход на щадящем режиме.', CircleGauge, 1, 3)],
  },
  {
    id: 'alien-marking', title: 'Чужой номер', summary: 'На заготовке проступает номер детали, которой нет в текущем заказе и заводском каталоге.', signal: 'НЕСООТВЕТСТВИЕ МАРКИРОВКИ', sector: 'СТАНОК 03-А', weight: 3, departments: ['mechanics'], timeoutOptionId: 'Отложить деталь', responseSeconds: 720,
    options: [option('Отложить деталь', 'Изолировать заготовку до выяснения её происхождения.', Box, 0, 3), option('Снять слой металла', 'Продолжить обработку и проверить, насколько глубоко нанесён номер.', Cog, 1, 3), option('Искать парную маркировку', 'Проверить склад и последние партии на тот же знак.', Target, 0, 4, 'Скрытая маркировка')],
  },
  {
    id: 'silent-crack', title: 'Трещина без звука', summary: 'Контрольная жидкость проявляет тонкую линию там, где металл должен быть цельным.', signal: 'СКРЫТЫЙ ДЕФЕКТ', sector: 'ПОСТ КОНТРОЛЯ', weight: 4, departments: ['mechanics'], timeoutOptionId: 'Забраковать партию', responseSeconds: 600,
    options: [option('Забраковать партию', 'Остановить обработку всех заготовок из этой плавки.', ShieldAlert, 0, 3), option('Проверить ультразвуком', 'Определить глубину дефекта до принятия решения.', Gauge, 0, 4, 'Дефектоскопия'), option('Вырезать повреждение', 'Попробовать сохранить заготовку, удалив опасный участок.', Cog, 1, 2)],
  },
  {
    id: 'wrong-rhythm', title: 'Сбитый ритм', summary: 'Автоподача повторяет один лишний ход через каждые семнадцать циклов.', signal: 'СБОЙ ПОСЛЕДОВАТЕЛЬНОСТИ', sector: 'СТАНОК 03-А', weight: 4, departments: ['mechanics'], timeoutOptionId: 'Перейти на ручную подачу', responseSeconds: 540,
    options: [option('Перейти на ручную подачу', 'Взять движение суппорта под прямой контроль.', Wrench, 1, 3), option('Дождаться лишнего хода', 'Наблюдать цикл и поймать момент появления сбоя.', Target, 0, 4, 'Ритмы автоматики'), option('Перезапустить контроллер', 'Остановить программу и загрузить её заново.', RotateCcw, 1, 2)],
  },
  {
    id: 'warm-cable', title: 'Тёплый кабель', summary: 'Обесточенный кабель остаётся тёплым. По схеме у него нет второго источника питания.', signal: 'ОБРАТНОЕ ПИТАНИЕ', sector: 'ЩИТ 03-Б', weight: 5, departments: ['power'], timeoutOptionId: 'Отсечь кабель', responseSeconds: 540,
    options: [option('Отсечь кабель', 'Физически разомкнуть линию с обеих сторон.', Zap, 0, 3), option('Найти второй источник', 'Пройти трассу с токовыми клещами до скрытого ответвления.', Target, 0, 4, 'Обратные контуры'), option('Поставить под наблюдение', 'Оградить участок и записывать изменение температуры.', Gauge, 1, 2)],
  },
  {
    id: 'double-flicker', title: 'Свет моргнул дважды', summary: 'Освещение дважды гаснет ровно на одну секунду, но автоматика не фиксирует провала.', signal: 'НЕЗАРЕГИСТРИРОВАННЫЙ ПРОВАЛ', sector: 'СИЛОВОЙ КОНТУР', weight: 4, departments: ['power'], timeoutOptionId: 'Перевести свет на резерв', responseSeconds: 600,
    options: [option('Поднять сырые логи', 'Считать данные до того, как контроллер их отфильтрует.', Terminal, 0, 4, 'Сырые журналы сети'), option('Перевести свет на резерв', 'Отделить освещение от основного контура.', Zap, 1, 2), option('Повторить нагрузку', 'Создать тот же режим и попытаться вызвать провал снова.', Gauge, 0, 3)],
  },
  {
    id: 'extra-consumer', title: 'Лишний потребитель', summary: 'Сеть отдаёт семь киловатт в линию, отсутствующую на схеме яруса.', signal: 'НЕУЧТЁННЫЙ РАСХОД', sector: 'РАСПРЕДЕЛИТЕЛЬ 03-Б', weight: 3, departments: ['power'], timeoutOptionId: 'Ограничить мощность', responseSeconds: 720,
    options: [option('Обесточить линию', 'Разомкнуть неизвестный канал на распределителе.', Zap, 1, 2), option('Проследить нагрузку', 'Оставить питание и определить конечную точку по импульсам.', Target, 0, 4, 'Карта скрытой сети'), option('Ограничить мощность', 'Установить безопасный предел и продолжить наблюдение.', Gauge, 1, 3)],
  },
  {
    id: 'reverse-current', title: 'Ток обратного хода', summary: 'Накопитель на мгновение принимает энергию со стороны остановленного лифта.', signal: 'НАПРАВЛЕНИЕ ТОКА ИЗМЕНЕНО', sector: 'НАКОПИТЕЛЬ 03-Б', weight: 2, departments: ['power'], missions: [0, 2], timeoutOptionId: 'Заземлить импульс', responseSeconds: 480,
    options: [option('Открыть приём', 'Дать импульсу войти в накопитель под контролем защиты.', Zap, 1, 3), option('Снять форму сигнала', 'Изолировать контур измерительным мостом.', Gauge, 0, 4, 'Почерк силовых импульсов'), option('Заземлить импульс', 'Сбросить неизвестную энергию на защитный контур.', ShieldAlert, 0, 2)],
  },
  {
    id: 'singing-rope', title: 'Трос поёт выше', summary: 'Один из тросов отвечает на удар нотой выше остальных. Натяжение изменилось совсем недавно.', signal: 'РАЗНИЦА НАТЯЖЕНИЯ', sector: 'ЛИФТОВАЯ ШАХТА', weight: 5, departments: ['repair'], timeoutOptionId: 'Разгрузить трос', responseSeconds: 600,
    options: [option('Разгрузить трос', 'Перенести часть усилия на соседние ветви.', Wrench, 1, 2), option('Измерить всю связку', 'Сравнить частоты каждого троса и составить карту натяжения.', Gauge, 0, 4, 'Акустика тросов'), option('Поставить метку', 'Нанести контрольную риску и наблюдать смещение.', Target, 1, 3)],
  },
  {
    id: 'fresh-oil', title: 'След свежего масла', summary: 'На давно закрытом люке блестит свежая капля масла. След уходит к шахте.', signal: 'СЛЕД НЕДАВНЕГО ДОСТУПА', sector: 'СЕРВИСНЫЙ ЛЮК', weight: 4, departments: ['repair'], timeoutOptionId: 'Опломбировать проход', responseSeconds: 720,
    options: [option('Открыть люк', 'Проверить пространство за панелью прямо сейчас.', Wrench, 0, 3), option('Снять отпечатки инструмента', 'Сначала изучить царапины на крепеже и кромке.', Target, 0, 4, 'Почерк ремонтника'), option('Опломбировать проход', 'Закрыть люк контрольной лентой и ждать нового доступа.', ShieldAlert, 1, 2)],
  },
  {
    id: 'forgotten-key', title: 'Дверь не помнит ключ', summary: 'Сервисная дверь принимает ваш ключ, но сообщает, что такой допуск никогда не выдавался.', signal: 'КОНФЛИКТ ПРАВ ДОСТУПА', sector: 'ШЛЮЗ Ш-47', weight: 3, departments: ['repair'], timeoutOptionId: 'Запросить новый допуск', responseSeconds: 600,
    options: [option('Войти по аварийному контуру', 'Открыть механический замок в обход терминала.', Wrench, 1, 2), option('Сравнить копии реестра', 'Найти момент, когда запись о допуске исчезла.', BookOpen, 0, 4, 'История прав доступа'), option('Запросить новый допуск', 'Оставить дверь закрытой и обратиться к диспетчеру.', Radio, 0, 3)],
  },
  {
    id: 'foreign-bolt', title: 'Болт другой смены', summary: 'В креплении стоит новый болт с клеймом смены, которой нет в списках уже девять лет.', signal: 'НЕСООТВЕТСТВИЕ КЛЕЙМА', sector: 'РЕМОНТНЫЙ ПОСТ 03-В', weight: 3, departments: ['repair'], timeoutOptionId: 'Снять болт', responseSeconds: 660,
    options: [option('Снять болт', 'Извлечь крепёж и отправить его в Архив.', Wrench, 0, 3), option('Оставить под нагрузкой', 'Проверить, зачем неизвестный ремонт до сих пор держит узел.', Gauge, 1, 3), option('Найти старую смену', 'Поднять закрытые наряды по номеру клейма.', BookOpen, 0, 4, 'Клейма исчезнувших смен')],
  },
  {
    id: 'empty-toolbox', title: 'Пустой ящик', summary: 'Запломбированный аварийный ящик оказывается пустым. Пломба не повреждена.', signal: 'НАРУШЕНИЕ КОМПЛЕКТНОСТИ', sector: 'АВАРИЙНЫЙ ПОСТ', weight: 3, missions: [1, 2], timeoutOptionId: 'Собрать свой набор', responseSeconds: 600,
    options: [option('Вскрыть соседний комплект', 'Проверить второй ящик и восстановить оснащение поста.', Box, 1, 2), option('Исследовать пломбу', 'Определить, когда и каким способом ящик опустошили.', Target, 0, 4, 'Поддельные пломбы'), option('Собрать свой набор', 'Заменить пропажу инструментами с рабочего места.', Wrench, 1, 3)],
  },
  {
    id: 'lift-call', title: 'Вызов из пустой кабины', summary: 'На панели загорается запрос с грузового лифта. По журналу кабина обесточена и пуста.', signal: 'ВЫЗОВ С ОТКЛЮЧЁННОГО ОБЪЕКТА', sector: 'ЛИФТОВАЯ ЛИНИЯ', weight: 1, missions: [0, 2], timeoutOptionId: 'Сбросить запрос', responseSeconds: 420,
    options: [option('Ответить на вызов', 'Открыть служебный канал кабины.', Radio, 0, 4), option('Определить источник', 'Трассировать сигнал, не отвечая отправителю.', Target, 0, 4, 'Фантомные вызовы'), option('Сбросить запрос', 'Очистить панель и заблокировать повторный вызов.', ShieldAlert, 1, 2)],
  },
]

const episodeMissions = [
  {
    code: 'М-01',
    title: 'Тишина в шахте',
    story: 'Открывает истинную причину поломки лифта и план восстановления.',
    packages: [
      { title: 'Голос молчащей кабины', department: 'repair' as Department, jobId: 'J_DIAG_REPAIR', purpose: 'Показания нужны, чтобы отделить механическую поломку от сбоя управления.', tasks: ['Последнее слово кабины — считать код остановки', 'Струны над пустотой — измерить натяжение тросов', 'Зубья, которые должны удержать — проверить аварийный тормоз', 'Жар молчащего сердца — снять температуру привода', 'Качание мёртвого пути — измерить люфт направляющих', 'Шесть строк о тишине — передать сводку диагностики'] },
      { title: 'Шрам в глубине', department: 'repair' as Department, jobId: 'J_DIAG_REPAIR', purpose: 'Осмотр шахты должен найти место удара и определить объём будущего ремонта.', tasks: ['Дверь в холодный пролёт — открыть сервисный шлюз', 'Свет ниже сорок седьмого — осветить нижний пролёт', 'Серебряный шрам — изучить след на направляющей', 'Ладони над пропастью — проверить ловители кабины', 'Пепел старого железа — найти источник металлической пыли', 'Карта раны — отметить повреждения шахты'] },
      { title: 'Погасшая жила', department: 'power' as Department, jobId: 'J_DIAG_POWER', purpose: 'Без причины отключения питания нельзя безопасно составить план запуска.', tasks: ['Пульс на входе — измерить напряжение линии', 'Реле последней защиты — проверить аварийное отключение', 'Память перегрузки — прочитать журнал силового щита', 'Нить сквозь шахту — проверить кабель до кабины', 'Контактор, который не ответил — испытать резерв', 'Место, где погас свет — подтвердить точку обрыва'] },
      { title: 'Анатомия остановки', department: 'repair' as Department, jobId: 'J_DIAG_REPAIR', purpose: 'Карта связывает найденные дефекты и завершает миссию по установлению причины.', tasks: ['Две минуты одной аварии — сопоставить время отказов', 'Чужая рука в цифрах — проверить правку телеметрии', 'Удар прежде тишины — связать повреждение и обрыв', 'Возраст старого сердца — оценить износ привода', 'Порядок возвращения — составить план ремонта', 'Диагноз для яруса — утвердить карту неисправностей'] },
    ],
  },
  {
    code: 'М-02',
    title: 'Сердце для лифта',
    story: 'Возвращает ярусу производство деталей и резерв мощности.',
    packages: [
      { title: 'Металл будущего хода', department: 'mechanics' as Department, jobId: 'J_BLANK', purpose: 'Из этих заготовок будут изготовлены детали нового привода.', tasks: ['Металл, достойный подъёма — выбрать сплав', 'Первое кольцо — отрезать заготовку', 'Кожа будущей детали — снять окалину', 'Ровный край — выправить торец', 'Напряжение внутри — проверить металл', 'Дорога к резцу — передать комплект на обработку'] },
      { title: 'Кольца возвращения', department: 'mechanics' as Department, jobId: 'J_BEARING', purpose: 'Подшипники заменят разрушенный узел и позволят кабине снова двигаться.', tasks: ['Внешний круг — проточить кольцо', 'Дорожка возвращения — обработать внутреннюю поверхность', 'Шарики для нового хода — подогнать тела качения', 'Клетка вращения — собрать сепаратор', 'Зазор в толщину дыхания — проверить допуск', 'Знак готового узла — опломбировать подшипники'] },
      { title: 'То, что удержит', department: 'mechanics' as Department, jobId: 'J_FASTENER', purpose: 'Крепёж удержит новый привод под нагрузкой во время испытаний.', tasks: ['Шпильки против падения — подобрать крепёж', 'Резьба, которая удержит — нарезать витки', 'Закалённые круги — обработать шайбы', 'Мера усилия — проверить момент затяжки', 'Метки доверия — нанести контрольные риски', 'Ящик для шахты — упаковать комплект'] },
      { title: 'Дорога к шахте', department: 'repair' as Department, jobId: 'J_DIAG_REPAIR', purpose: 'Все детали должны одновременно оказаться у шахты, чтобы завершить подготовку восстановления.', tasks: ['Сорок деталей одного спасения — сверить комплект', 'Тележка без права на крен — закрепить груз', 'Свободный путь — очистить сервисный коридор', 'Через гермодверь — провести детали к шахте', 'Порядок у края — разложить узлы для монтажа', 'Всё готово к спуску — подтвердить комплектность'] },
    ],
  },
  {
    code: 'М-03',
    title: 'Первое движение',
    story: 'Запускает грузовой лифт и закрывает Эпизод 01.',
    packages: [
      { title: 'Новое сердце', department: 'repair' as Department, jobId: 'J_REPAIR', purpose: 'Новый привод превращает подготовленные детали в работающий механизм.', tasks: ['Освободить старое сердце — снять разрушенный узел', 'Чистое место для нового — подготовить опору', 'Кольца на валу — установить подшипники', 'Ось без отклонения — выставить привод', 'Шесть точек удержания — затянуть крепёж', 'Первый оборот рукой — проверить свободный ход'] },
      { title: 'Свет для первого шага', department: 'power' as Department, jobId: 'J_GENERATE', purpose: 'Резервная линия нужна для первого безопасного движения кабины.', tasks: ['Отсечь раненую линию — отключить ввод', 'Собрать свет в накопителе — зарядить буфер', 'Укротить первый ток — настроить ограничение', 'Замкнуть обходной путь — включить резерв', 'Три фазы в одном ритме — проверить двигатель', 'Разбудить привод — подать питание'] },
      { title: 'Вес, который он выдержит', department: 'repair' as Department, jobId: 'J_REPAIR', purpose: 'Испытания докажут, что ремонт выдержит груз и не повторит аварию.', tasks: ['Голос без кабины — запустить пустой привод', 'Один пролёт вверх — поднять кабину', 'Испытание остановкой — проверить тормоз', 'Вес вместо пассажира — добавить контрольный груз', 'Дрожь под грузом — измерить вибрацию', 'Подпись под движением — утвердить испытание'] },
      { title: 'Двери открываются', department: 'power' as Department, jobId: 'J_GENERATE', purpose: 'Последовательный запуск возвращает снабжение и завершает цель Эпизода.', tasks: ['Последний замок — снять сервисную блокировку', 'Вернуть голос диспетчеру — восстановить канал', 'Вызов на сорок седьмой — привести кабину', 'Двери после долгой тишины — открыть грузовой шлюз', 'Первая дорога наверх — отправить поставку', 'Строка, закрывающая Эпизод — записать запуск'] },
    ],
  },
]

const narrativePassages = [
  { chapter: 'ГЛАВА I · НЕМОТА', scene: 'Сцена 01', title: 'Лифт перестал дышать', text: 'Обычно тросы гудят за стенами, как натянутые струны. Сегодня в шахте тихо, и от этой тишины голоса в цехе звучат слишком громко.' },
  { chapter: 'ГЛАВА I · НЕМОТА', scene: 'Сцена 02', title: 'След на металле', text: 'На направляющей остаётся свежая серебряная царапина. Кто-то уже осматривал её до вас — торопливо, без записи в журнале.' },
  { chapter: 'ГЛАВА I · НЕМОТА', scene: 'Сцена 03', title: 'Чужой почерк', text: 'В телеметрии обнаруживается ручная правка. Несколько цифр стёрты, но система помнит прикосновение оператора.' },
  { chapter: 'ГЛАВА I · НЕМОТА', scene: 'Сцена 04', title: 'Причина', text: 'Лифт остановила не одна поломка. Питание отключили после удара в шахте, а изношенный привод лишь сделал аварию неизбежной.' },
  { chapter: 'ГЛАВА II · СБОРКА', scene: 'Сцена 05', title: 'Цех просыпается', text: 'Станки принимают новый ритм. Горячая стружка падает в поддоны, и будущий привод впервые существует хотя бы в виде точных размеров.' },
  { chapter: 'ГЛАВА II · СБОРКА', scene: 'Сцена 06', title: 'Подшипник', text: 'Кольцо выходит из станка тёплым. На внутренней кромке проступает метка старого мастера — такая же была на разрушенном узле.' },
  { chapter: 'ГЛАВА II · СБОРКА', scene: 'Сцена 07', title: 'Резерв', text: 'Энергоблок отвечает низким гулом. Свет на мгновение меркнет, затем возвращается ярче: ярус делится последним запасом мощности.' },
  { chapter: 'ГЛАВА II · СБОРКА', scene: 'Сцена 08', title: 'Перед шахтой', text: 'Комплект сложен у гермодвери. За ней пахнет пылью, маслом и холодным воздухом из уровней, куда давно никто не спускался.' },
  { chapter: 'ГЛАВА III · ДВИЖЕНИЕ', scene: 'Сцена 09', title: 'Старый привод', text: 'Крепления не хотят отпускать механизм. Каждый оборот ключа отдаётся в шахте эхом, будто внизу кто-то повторяет вашу работу.' },
  { chapter: 'ГЛАВА III · ДВИЖЕНИЕ', scene: 'Сцена 10', title: 'Первый ток', text: 'Контакторы сходятся один за другим. В кабине загорается аварийная лампа, выхватывая из темноты пустое кресло диспетчера.' },
  { chapter: 'ГЛАВА III · ДВИЖЕНИЕ', scene: 'Сцена 11', title: 'Испытание', text: 'Кабина поднимается на один пролёт и замирает. Тросы держат. Где-то наверху по металлу трижды стучат — слишком ровно для случайности.' },
  { chapter: 'ГЛАВА III · ДВИЖЕНИЕ', scene: 'Сцена 12', title: 'Голос в динамике', text: 'Перед запуском оживает переговорное устройство. Сквозь помехи слышно дыхание, а затем единственную фразу: «Не открывайте сорок восьмой».' },
]

const episodeEpilogue = {
  chapter: 'ЭПИЛОГ · ЯРУС 47', scene: 'Последняя страница', title: 'Лифт снова идёт',
  text: 'Кабина уходит вверх, увозя детали и свет. Цех возвращается к привычному гулу, но предупреждение из динамика остаётся в архиве — первой строкой следующей истории.',
}

const choiceEchoes: Record<string, string> = {
  'Проверить крепления': 'Вы помните, как выбрали осторожность. После этого каждый незнакомый звук кажется предупреждением, которое можно успеть услышать.',
  'Снизить обороты': 'Вы научились продолжать работу, не заставляя машину кричать. Теперь её тихий ход кажется почти доверительным.',
  'Разобраться самому': 'Вы не передали загадку другому. Знание осталось с вами — вместе с неприятным ощущением, что вибрация была похожа на сигнал.',
}

function getStoryAssignment(workUnits: number) {
  const complete = workUnits >= EPISODE_WORK_UNITS
  const missionIndex = complete ? 2 : Math.floor(workUnits / MISSION_WORK_UNITS)
  const missionWork = complete ? MISSION_WORK_UNITS - 1 : workUnits % MISSION_WORK_UNITS
  const packageIndex = Math.floor(missionWork / PACKAGE_WORK_UNITS)
  const packageWork = complete ? PACKAGE_WORK_UNITS - 1 : workUnits % PACKAGE_WORK_UNITS
  const taskIndex = Math.floor(packageWork / ORDER_WORK_UNITS)
  const mission = episodeMissions[missionIndex]
  const workPackage = mission.packages[packageIndex]
  return { complete, missionIndex, packageIndex, taskIndex, mission, workPackage, task: workPackage.tasks[taskIndex] }
}

function getIncident(id: string | null) {
  return incidents.find(incident => incident.id === id) ?? null
}

function getLocationPath(id: LocationId) {
  const path: LocationDefinition[] = []
  let current: LocationDefinition | undefined = locations[id]
  while (current) {
    path.unshift(current)
    current = current.parent ? locations[current.parent] : undefined
  }
  return path
}

function getNextLocation(currentId: LocationId, targetId: LocationId) {
  if (currentId === targetId) return targetId
  const targetPath = getLocationPath(targetId)
  const currentIndex = targetPath.findIndex(location => location.id === currentId)
  if (currentIndex >= 0) return targetPath[currentIndex + 1]?.id ?? targetId
  return locations[currentId].parent ?? 'floor-hub'
}

function getWorkstation(jobId: string) {
  return locations[workstationByJob[jobId] ?? 'floor-hub']
}

function randomFraction() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1)
    globalThis.crypto.getRandomValues(value)
    return value[0] / 4_294_967_296
  }
  return Math.random()
}

function scheduleIncidentAt(from: number, first: boolean) {
  const minimum = first ? 4 : 22
  const spread = first ? 5 : 34
  const longPause = !first && randomFraction() < 0.14 ? 18 : 0
  const minutes = minimum + Math.floor(randomFraction() * spread) + longPause
  const seconds = Math.floor(randomFraction() * 60)
  return from + (minutes * 60 + seconds) * 1000
}

function chooseIncident(state: SavedState, department: Department, missionIndex: number) {
  const eligible = incidents.filter(incident =>
    (!incident.departments || incident.departments.includes(department)) &&
    (!incident.missions || incident.missions.includes(missionIndex))
  )
  const recent = new Set(state.incidentHistory.slice(-8).map(record => record.eventId))
  const fresh = eligible.filter(incident => !recent.has(incident.id))
  const pool = fresh.length ? fresh : eligible.filter(incident => !state.incidentHistory.slice(-3).some(record => record.eventId === incident.id))
  const weightedPool = pool.length ? pool : eligible
  const totalWeight = weightedPool.reduce((sum, incident) => sum + incident.weight, 0)
  let cursor = randomFraction() * totalWeight
  return weightedPool.find(incident => (cursor -= incident.weight) <= 0) ?? weightedPool[weightedPool.length - 1]
}

function resolveIncident(state: SavedState, incident: IncidentDefinition, choice: IncidentOption, resolvedAt: number): SavedState {
  const createdAt = state.activeIncidentCreatedAt ?? resolvedAt
  return {
    ...state,
    activeIncidentId: null,
    activeIncidentCreatedAt: null,
    incidentAvailableAt: scheduleIncidentAt(resolvedAt, false),
    incidentHistory: [...state.incidentHistory, { eventId: incident.id, createdAt, resolvedAt, choice: choice.title }],
    incidentChoice: choice.title,
    incidentProgressBonus: state.incidentProgressBonus + choice.progressBonus,
    incidentXpBonus: state.incidentXpBonus + choice.xpBonus,
    incidentKnowledge: choice.knowledge && !state.incidentKnowledge.includes(choice.knowledge) ? [...state.incidentKnowledge, choice.knowledge] : state.incidentKnowledge,
  }
}

const workActions: Record<Department, { active: string, completed: string }[]> = {
  mechanics: [
    { active: 'Проверяю настройки станка', completed: 'Я проверил настройки станка и подготовил его к рабочему циклу.' },
    { active: 'Обрабатываю заготовку', completed: 'Я обработал заготовку и передал деталь на контроль.' },
    { active: 'Проверяю допуски детали', completed: 'Я измерил допуски. Деталь соответствует требованиям текущей задачи.' },
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
    if (!raw) return defaultSaved
    const parsed = JSON.parse(raw)
    const saved = {
      ...defaultSaved,
      ...parsed,
      incidentHistory: Array.isArray(parsed.incidentHistory) ? parsed.incidentHistory : [],
      incidentKnowledge: Array.isArray(parsed.incidentKnowledge) ? parsed.incidentKnowledge : parsed.incidentKnowledge ? [parsed.incidentKnowledge] : [],
    } as SavedState
    if (!locations[saved.location]) saved.location = 'floor-hub'
    if (!saved.episodeStartedAt && saved.jobStartedAt) saved.episodeStartedAt = saved.jobStartedAt
    if (parsed.incidentCreatedAt && !saved.incidentHistory.length) {
      if (parsed.incidentResolved) {
        saved.incidentHistory = [{ eventId: 'third-knock', createdAt: parsed.incidentCreatedAt, resolvedAt: parsed.incidentResolvedAt ?? parsed.incidentCreatedAt, choice: parsed.incidentChoice ?? 'Зафиксировать и продолжить' }]
        saved.incidentAvailableAt = scheduleIncidentAt(Date.now(), false)
      } else {
        saved.activeIncidentId = 'third-knock'
        saved.activeIncidentCreatedAt = parsed.incidentCreatedAt
      }
    }
    return saved
  } catch { return defaultSaved }
}

function App() {
  const story = useStory()
  const [state, setState] = useState<SavedState>(loadState)
  const [nameDraft, setNameDraft] = useState(state.name || getTelegramUserName())
  const [now, setNow] = useState(Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const [tickerVisible, setTickerVisible] = useState(true)
  const bundle = story.bundle
  const activeWork = bundle?.works.find(work => work.id === state.jobId && work.status !== 'completed') ?? null
  const activeJob = activeWork ? workToJob(activeWork) : null
  const availableWorks = bundle?.works.filter(work => ['available', 'active', 'locked_skill'].includes(work.status)) ?? []
  const primaryWork = activeWork ?? availableWorks.find(work => work.status !== 'locked_skill') ?? availableWorks[0] ?? null
  const elapsed = activeJob && state.jobStartedAt ? Math.max(0, Math.floor((now - state.jobStartedAt) / 1000)) : 0
  const jobProgress = activeWork?.progress ?? 0

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
      briefing: 'lore', onboarding: 'briefing', jobs: 'floor', journal: 'floor', skills: 'floor',
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
    if (!state.activeIncidentId && state.incidentAvailableAt && now >= state.incidentAvailableAt) {
      setState(prev => {
        if (prev.activeIncidentId || !prev.incidentAvailableAt || now < prev.incidentAvailableAt) return prev
        if (now - prev.incidentAvailableAt > 15 * 60 * 1000) {
          return { ...prev, incidentAvailableAt: scheduleIncidentAt(now, true) }
        }
        const work = bundle?.works.find(item => item.id === prev.jobId)
        const incident = chooseIncident(prev, work?.department ?? prev.department, bundle?.episode.phase === 'investigation' ? 0 : bundle?.episode.phase === 'council' ? 1 : 2)
        return { ...prev, activeIncidentId: incident.id, activeIncidentCreatedAt: now, incidentAvailableAt: null }
      })
    }
  }, [now, state.activeIncidentId, state.incidentAvailableAt, bundle])

  useEffect(() => {
    const incident = getIncident(state.activeIncidentId)
    if (incident && state.activeIncidentCreatedAt && now - state.activeIncidentCreatedAt >= incident.responseSeconds * 1000) {
      setState(prev => {
        const current = getIncident(prev.activeIncidentId)
        const timeoutOption = current?.options.find(option => option.title === current.timeoutOptionId)
        return current && timeoutOption ? resolveIncident(prev, current, timeoutOption, now) : prev
      })
    }
  }, [now, state.activeIncidentId, state.activeIncidentCreatedAt])

  useEffect(() => {
    if (state.jobId && bundle?.works.some(work => work.id === state.jobId && work.status === 'completed')) {
      setState(prev => ({ ...prev, jobId: null, jobStartedAt: null, contributionCycle: 0 }))
    }
  }, [bundle?.works, state.jobId])

  useEffect(() => {
    if (!activeWork || !state.jobStartedAt || story.busy || bundle?.episode.mode === 'offline-cache') return
    const completedCycle = Math.floor((now - state.jobStartedAt) / 60_000)
    if (completedCycle <= state.contributionCycle) return
    const nextCycle = state.contributionCycle + 1
    const eventId = `${bundle?.player.id ?? 'local'}:${activeWork.id}:${state.jobStartedAt}:${nextCycle}`
    story.contribute(activeWork.id, eventId).then(() => setState(prev => ({ ...prev, contributionCycle: Math.max(prev.contributionCycle, nextCycle) }))).catch(() => undefined)
  }, [activeWork, bundle?.episode.mode, bundle?.player.id, now, state.contributionCycle, state.jobStartedAt, story.busy, story.contribute])

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
    story.setDisplayName(clean)
    setState(prev => ({ ...prev, name: clean, screen: 'floor' }))
  }

  const beginJob = (selected: WorkView) => {
    haptic('success')
    const startedAt = Date.now()
    setState(prev => ({
      ...prev,
      department: selected.department,
      jobId: selected.id,
      jobStartedAt: startedAt,
      episodeStartedAt: prev.episodeStartedAt ?? startedAt,
      contributionCycle: 0,
      incidentAvailableAt: prev.incidentAvailableAt ?? scheduleIncidentAt(startedAt, true),
      screen: 'journal',
    }))
  }

  if (state.screen === 'lore') return <LoreIntro continueIntro={() => setState(prev => ({ ...prev, screen: 'briefing' }))} />
  if (state.screen === 'briefing') return <Briefing continueGame={() => setState(prev => ({ ...prev, screen: 'onboarding' }))} />
  if (state.screen === 'onboarding') return <Onboarding name={nameDraft} setName={setNameDraft} submit={createCharacter} />
  if (!bundle) return <div className="story-loading"><span className="brand-z">Z</span><b>ПОДКЛЮЧЕНИЕ К АРХИВУ</b><p>{story.error ?? 'Получаем общее состояние Эпизода…'}</p></div>

  return (
    <div className="app-shell">
      <DesktopRail state={state} progress={jobProgress} episode={bundle.episode} job={activeJob} navigate={navigate} />
      <main className="game-frame">
        <TopBar state={state} episode={bundle.episode} navigate={navigate} menuOpen={menuOpen} setMenuOpen={setMenuOpen} reset={reset} />
        {tickerVisible && state.screen === 'floor' && (
          <button className="ticker" onClick={() => navigate('terminal')} aria-label="Открыть сообщение в терминале">
            <span className="ticker-icon"><Radio size={14} /></span>
            <span className="ticker-label">ЯРУС 47</span>
            <span className="ticker-scroll"><span>{bundle.episode.latestChronicle?.lead ?? bundle.episode.goalDetail}</span></span>
            <ChevronRight size={16} />
          </button>
        )}

        <section className="screen-area">
          {state.screen === 'floor' && <Floor state={state} setState={setState} job={activeJob} work={primaryWork} progress={jobProgress} episode={bundle.episode} chronicle={bundle.chronicle} navigate={navigate} setRemoteLocation={story.setLocation} />}
          {state.screen === 'jobs' && <Jobs location={locations[state.location]} works={bundle.works.filter(work => work.location === state.location)} activeWork={activeWork} beginJob={beginJob} continueJob={() => navigate('journal')} back={() => navigate('floor')} />}
          {state.screen === 'journal' && <Journal state={state} job={activeJob} work={activeWork} progress={jobProgress} elapsed={elapsed} navigate={navigate} />}
          {state.screen === 'incident' && <Incident state={state} setState={setState} navigate={navigate} remaining={Math.max(0, (getIncident(state.activeIncidentId)?.responseSeconds ?? 0) - Math.floor((now - (state.activeIncidentCreatedAt ?? now)) / 1000))} />}
          {state.screen === 'skills' && <Skills state={state} player={bundle.player} />}
          {state.screen === 'map' && <DepartmentMap state={state} setState={setState} navigate={navigate} setRemoteLocation={story.setLocation} />}
          {state.screen === 'terminal' && <NewsTerminal episode={bundle.episode} chronicle={bundle.chronicle} navigate={navigate} openProductionJobs={() => setState(prev => ({ ...prev, location: 'floor-hub', screen: 'floor' }))} />}
          {state.screen === 'chronicle' && <Chronicle state={state} job={activeJob} progress={jobProgress} episode={bundle.episode} chronicle={bundle.chronicle} player={bundle.player} navigate={navigate} />}
          {state.screen === 'objectives' && <Objectives state={state} job={activeJob} progress={jobProgress} episode={bundle.episode} works={availableWorks} council={bundle.episode.council} busy={story.busy} vote={story.vote} resolveDemo={story.resolveDemoCouncil} setState={setState} navigate={navigate} />}
        </section>
        <BottomNav current={state.screen} navigate={navigate} />
      </main>
      <StoryModeBanner mode={bundle.episode.mode} error={story.error} />
      {!state.storyMigrated && <MigrationNotice accept={() => setState(prev => ({ ...prev, storyMigrated: true }))} />}
      {state.storyMigrated && bundle.recap.whileAway.length > 0 && <RecapModal recap={bundle.recap} close={() => story.markRead(bundle.recap.latestSequence)} navigate={navigate} />}
    </div>
  )
}

function LoreIntro({ continueIntro }: { continueIntro: () => void }) {
  const [slide, setSlide] = useState(0)
  const scenes = [
    {
      code: 'ПРОЛОГ · 01',
      title: 'Гул под кожей',
      text: 'Сначала вы слышите Завод. Он проходит через койку, стены и кости — ровный, бесконечный гул насосов, поездов и приводов. Люди засыпают под него, сверяют по нему время и просыпаются, если ритм меняется. Вы выросли с этим звуком и почти перестали его замечать. Поэтому тишина приходит не в уши, а сразу под кожу.',
      note: '03:17:42. На ярусе 47 грузовой лифт прекращает движение. Через восемь секунд пропадает голос диспетчера.',
      Icon: Factory,
      figure: '∞',
    },
    {
      code: 'ПРОЛОГ · 02',
      title: 'Город без неба',
      text: 'Мегазавод одновременно служит машиной, городом и единственной известной картой мира. Жилые блоки подвешены между цехами, столовые греются от паровых магистралей, а грузовые поезда проходят там, где в другом городе были бы улицы. Большинство жителей никогда не покидает родной ярус. Здесь не говорят «север» и «юг» — только «выше», «ниже» и «к центральному валу».',
      note: 'Внешние ворота опечатаны дольше, чем помнит Архив. Достоверных сообщений снаружи нет.',
      Icon: Cog,
      figure: '47',
    },
    {
      code: 'ПРОЛОГ · 03',
      title: 'Закон смены',
      text: 'Жизнь измеряют сменами. Позывной важнее фамилии: он остаётся на деталях, в журналах и в памяти тех, кто примет работу после вас. Работник может перейти между производством, энергетикой и ремонтом, потому что остановка одного отсека быстро становится бедой всего яруса. Право выбирать работу означает обязанность довести общую цепочку до конца.',
      note: 'Основной закон яруса: результат передаётся дальше; незакрытая задача становится чужой аварией.',
      Icon: Users,
      figure: '03',
    },
    {
      code: 'ПРОЛОГ · 04',
      title: 'Цена остановки',
      text: 'Ни один ярус не существует отдельно. Нижние уровни дают металл и тепло, средние превращают их в детали и энергию, верхние хранят системы, назначение которых давно забыто. Грузовые лифты связывают эту цепь. Если кабина не приходит, сначала заканчиваются запасные части, затем гаснут резервные линии, а после останавливается то, чему люди даже не успели дать имя.',
      note: 'Лифт яруса 47 снабжает верхние сектора деталями привода и энергетическими модулями.',
      Icon: Zap,
      figure: '24',
    },
    {
      code: 'ПРОЛОГ · 05',
      title: 'Память Завода',
      text: 'Архив хранит не только приказы. Он собирает дневники, ошибки, решения во время аварий и короткие фразы, оставленные перед исчезновениями. Из этих записей складывается официальная история Мегазавода — и множество историй, которые официальными так и не стали. Система замечает выбор каждого работника, даже когда начальство предпочитает его не замечать.',
      note: 'Запись нельзя переписать после подтверждения. Но её смысл может измениться, когда откроются следующие страницы.',
      Icon: BookOpen,
      figure: 'A',
    },
    {
      code: 'ПРОЛОГ · 06',
      title: 'Строка для вас',
      text: 'У терминала мигает непрочитанный вызов. Обычно большие истории принадлежат мастерам, диспетчерам и людям с именами на латунных табличках. Сегодня диспетчер молчит, мастера спорят о причине остановки, а первая задача ещё никому не назначена. В журнале открыта пустая строка. Она ждёт вашего позывного.',
      note: 'Эпизод 01 начнётся с простой проверки. Его последняя запись зависит от того, что вы обнаружите между ними.',
      Icon: BookOpen,
      figure: 'Z',
    },
  ]
  const scene = scenes[slide]
  const SceneIcon = scene.Icon
  const next = () => slide < scenes.length - 1 ? setSlide(value => value + 1) : continueIntro()

  return <main className={`lore-intro lore-intro-${slide + 1}`}>
    <div className="lore-grid" aria-hidden="true" />
    <header className="lore-header"><div className="brand-mini">Z</div><span>АРХИВ МЕГАЗАВОДА</span><b>{String(slide + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}</b></header>
    <div className="lore-figure" aria-hidden="true">{scene.figure}</div>
    <section className="lore-panel">
      <div className="lore-icon"><SceneIcon /></div>
      <span className="eyebrow"><span /> {scene.code}</span>
      <h1>{scene.title}</h1>
      <p>{scene.text}</p>
      <aside><Radio size={16} /><span>{scene.note}</span></aside>
      <div className="lore-controls">
        <button className="lore-back" onClick={() => setSlide(value => Math.max(0, value - 1))} disabled={slide === 0}><ArrowLeft size={17} /> НАЗАД</button>
        <div className="lore-dots">{scenes.map((item, index) => <button key={item.code} className={index === slide ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Открыть часть ${index + 1}`} />)}</div>
        <button className="primary-button" onClick={next}>{slide === scenes.length - 1 ? 'К ЭПИЗОДУ' : 'ДАЛЕЕ'} <ArrowRight size={18} /></button>
      </div>
    </section>
    <footer className="lore-footer"><span>ВНУТРЕННЯЯ СЕТЬ // ДОСТУП К АРХИВУ</span><span>СИГНАЛ УСТОЙЧИВ</span></footer>
  </main>
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
        <button className="primary-button" onClick={submit} disabled={name.trim().length < 2}>ВОЙТИ НА ЯРУС <ArrowRight size={18} /></button>
        <p className="microcopy"><ShieldAlert size={14} /> В Telegram личность проверяет сервер; обычный браузер запускает локальную демонстрацию</p>
      </section>
      <div className="system-status"><span className="status-dot" /> СИСТЕМЫ ЯРУСА В СЕТИ <b>03:17:42</b></div>
    </main>
  )
}

function Briefing({ continueGame }: { continueGame: () => void }) {
  return (
    <main className="briefing">
      <header className="briefing-header"><div className="brand-mini">Z</div><span>ОПЕРАТИВНЫЙ БРИФИНГ</span><span className="briefing-id">ЭПИЗОД 01 / ЯРУС 47</span></header>
      <div className="briefing-content">
        <section className="briefing-lead">
          <div className="eyebrow"><span /> ВХОДЯЩИЙ АВАРИЙНЫЙ СИГНАЛ</div>
          <p className="episode-code">ЭПИЗОД 01</p>
          <h1>НЕМОЙ<br />ЛИФТ</h1>
          <p className="lead-text">В 03:17 грузовой лифт яруса 47 остановился между уровнями. Система сначала отметила удар в шахте, затем перегрузку привода и ручное отключение силовой линии. Порядок событий неизвестен: часть телеметрии повреждена.</p>
          <p className="lead-detail">Лифт связывает производственный ярус с верхними секторами. Без него туда не попадут детали и энергетические модули. Запаса на складах хватит, чтобы не объявлять эвакуацию немедленно, но каждая следующая смена делает восстановление труднее.</p>
          <blockquote className="briefing-transcript"><span>ПОСЛЕДНЯЯ ПЕРЕДАЧА · 03:17:50</span><p>«Слышу удар ниже кабины. Отключаю линию и проверяю…»</p><small>СВЯЗЬ ОБОРВАНА · ДИСПЕТЧЕР НЕ ОТВЕЧАЕТ</small></blockquote>
          <div className="briefing-alert"><AlertTriangle size={20} /><div><b>Местоположение диспетчера неизвестно</b><span>Кабина не отвечает на вызов · аварийный канал молчит</span></div></div>
          <div className="episode-facts"><span><b>03:17:42</b> остановка</span><span><b>2</b> независимых проверки</span><span><b>?</b> причина неизвестна</span></div>
        </section>
        <section className="operation-plan">
          <div className="section-kicker">ПЕРВЫЕ НАПРАВЛЕНИЯ <span>БУДУЩИЙ ПУТЬ СКРЫТ</span></div>
          {[
            { num: '01', title: 'Выслушать молчащий привод', dept: 'Галерея шахты · инженерное крыло', summary: 'Снять независимый технический диагноз, не пытаясь запустить механизм.', Icon: Wrench },
            { num: '02', title: 'Прочитать память погасшей линии', dept: 'Силовая щитовая · энергетическое крыло', summary: 'Восстановить порядок срабатывания защиты по сырому журналу.', Icon: Zap },
          ].map(({ num, title, dept, summary, Icon }) => (
            <div className="operation-step" key={num}>
              <span className="step-num">{num}</span><span className="step-icon"><Icon size={22} /></span>
              <div><b>{title}</b><span>{dept}</span><p>{summary}</p></div><span className="step-status">ДОСТУПНО</span>
            </div>
          ))}
          <div className="collective-goal"><Users size={20} /><div><b>Результаты изменят доступные действия</b><span>Завод покажет только ближайшие работы. Новые направления, важные решения и возможные исходы откроются из подтверждённых фактов.</span></div></div>
          <button className="primary-button" onClick={continueGame}>ПОЛУЧИТЬ ПРОПУСК <ArrowRight size={18} /></button>
        </section>
      </div>
      <footer className="briefing-footer"><span>МЕГАЗАВОД // ВНУТРЕННЯЯ СЕТЬ</span><span>ОБЩИЙ ЭПИЗОД · РЕЗУЛЬТАТЫ ПУБЛИКУЮТСЯ АВТОМАТИЧЕСКИ</span></footer>
    </main>
  )
}

function DesktopRail({ state, progress, episode, job, navigate }: { state: SavedState, progress: number, episode: EpisodeSnapshot, job: Job | null, navigate: (s: Screen) => void }) {
  return (
    <aside className="desktop-rail">
      <div className="rail-brand">Z<span>ЗАВОД</span></div>
      <div className="rail-section">
        <span className="rail-label">ОБЩАЯ ЦЕЛЬ</span><b>{episode.goal}</b><small>{episode.goalDetail}</small>
        <div className="rail-progress"><span style={{ width: `${Math.min(100, episode.publicFacts.length * 20)}%` }} /></div><small>Подтверждённых сведений: {episode.publicFacts.filter(fact => fact.certainty === 'confirmed').length}</small>
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

function TopBar({ state, episode, navigate, menuOpen, setMenuOpen, reset }: { state: SavedState, episode: EpisodeSnapshot, navigate: (s: Screen) => void, menuOpen: boolean, setMenuOpen: (v: boolean) => void, reset: () => void }) {
  return (
    <header className="top-bar">
      <button className="mobile-brand" onClick={() => navigate('floor')}><span>Z</span><b>МЕГАЗАВОД</b></button>
      <div className="top-context"><span>ЭПИЗОД 01</span><b>НЕМОЙ ЛИФТ</b></div>
      <div className="top-stats"><span><Box size={15} /> 12</span><span><Zap size={15} /> 21</span><span><Wrench size={15} /> 8</span></div>
      <button className="task-button" onClick={() => navigate('objectives')} aria-label="Открыть текущие задачи"><ListChecks size={19} /><span>{episode.council?.status === 'open' ? 'ВЕЧЕ' : 'ЗАДАЧИ'}</span><i /></button>
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

function CurrentDirective({ state, job, work, progress, episode, setState, navigate }: { state: SavedState, job: Job | null, work: WorkView | null, progress: number, episode: EpisodeSnapshot, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  const activeIncident = getIncident(state.activeIncidentId)
  const urgent = Boolean(job && activeIncident)
  const target = work ? getWorkstation(work.id) : locations['floor-hub']
  const atWorkstation = state.location === target.id
  const nextLocation = locations[getNextLocation(state.location, target.id)]
  const route = getLocationPath(target.id).map(location => location.title).join(' → ')
  const title = urgent ? 'Примите решение по происшествию' : job ? job.title : work ? work.title : episode.goal
  const description = urgent
    ? `${activeIncident?.title}: ${activeIncident?.summary} Решение ограничено по времени.`
    : work
      ? `${work.description} Ближайший результат: ${work.nearestResult}. ${atWorkstation ? 'Вы на месте.' : `Маршрут: ${route}.`}`
      : episode.goalDetail
  const action = () => {
    if (urgent) return navigate('incident')
    if (!work) return navigate('objectives')
    if (atWorkstation) return navigate(job ? 'journal' : 'jobs')
    setState(prev => ({ ...prev, department: target.department ?? prev.department, location: nextLocation.id, screen: 'floor' }))
  }

  return <section className={`current-directive ${urgent ? 'urgent' : ''}`}>
    <div className="directive-icon">{urgent ? <AlertTriangle /> : <Target />}</div>
    <div className="directive-copy"><span>{urgent ? 'ТРЕБУЕТ РЕШЕНИЯ' : work ? 'ЧТО ДЕЛАТЬ СЕЙЧАС' : 'ОБЩАЯ ЦЕЛЬ'}</span><h2>{title}</h2><p>{description}</p>{job && !urgent && <ActionProgress job={job} elapsed={state.jobStartedAt ? Math.floor((Date.now() - state.jobStartedAt) / 1000) : 0} compact />}</div>
    <div className="directive-actions"><button className="directive-primary" onClick={action}>{urgent ? 'ПРИНЯТЬ РЕШЕНИЕ' : !work ? 'ОТКРЫТЬ СВОДКУ' : atWorkstation ? job ? 'ОТКРЫТЬ ДНЕВНИК' : 'ОТКРЫТЬ РАБОЧЕЕ МЕСТО' : `ВОЙТИ: ${nextLocation.title}`} <ArrowRight size={16} /></button><button className="directive-secondary" onClick={() => navigate('objectives')}><ListChecks size={15} /> СВОДКА</button></div>
  </section>
}

function StoryPassage({ entry, complete }: { entry: StoryChronicleEntry | null, complete: boolean }) {
  if (!entry) return null
  return <aside className={`story-passage ${complete ? 'complete' : ''}`}>
    <div className="story-page-number">{String(entry.sequence).padStart(2, '0')}</div>
    <div className="story-copy"><span>{entry.type === 'finale' ? 'ФИНАЛЬНАЯ ГЛАВА' : entry.type === 'council' ? 'РЕШЕНИЕ ВЕЧЕ' : 'ЛЕТОПИСЬ ЭПИЗОДА'}</span><h2>{entry.title}</h2><p>«{entry.lead}»</p></div>
    <div className="story-next"><BookOpen size={17} /><span>{complete ? 'ЭПИЗОД ЗАВЕРШЁН' : 'НОВАЯ ГЛАВА ПОЯВИТСЯ ПОСЛЕ ЗНАЧИМОГО РЕЗУЛЬТАТА'}</span></div>
  </aside>
}

function Floor({ state, setState, job, work, progress, episode, chronicle, navigate, setRemoteLocation }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, job: Job | null, work: WorkView | null, progress: number, episode: EpisodeSnapshot, chronicle: StoryChronicleEntry[], navigate: (s: Screen) => void, setRemoteLocation: (location: string) => void }) {
  const location = locations[state.location]
  const Icon = location.icon
  const target = work ? getWorkstation(work.id) : locations['floor-hub']
  const targetPath = new Set(getLocationPath(target.id).map(item => item.id))
  const path = getLocationPath(location.id)
  const children = (location.children ?? []).map(id => locations[id])
  const enter = (id: LocationId) => {
    const destination = locations[id]
    haptic('selection')
    setState(prev => ({ ...prev, location: id, department: destination.department ?? prev.department, screen: 'floor' }))
    setRemoteLocation(id)
  }
  const interact = () => {
    if (location.jobIds) return setState(prev => ({ ...prev, department: location.department ?? prev.department, screen: 'jobs' }))
    if (location.utility) return navigate(location.utility)
  }
  const equipmentName = location.id === 'lathe-room' ? 'Токарный станок 03-А2' : location.id === 'blank-room' ? 'Отрезной пост' : location.id === 'assembly-room' ? 'Сборочный стол' : location.id === 'switchboard-room' ? 'Силовой щит' : location.id === 'battery-room' ? 'Блок накопителей' : location.id === 'repair-bay' ? 'Монтажный стенд' : location.id === 'shaft-gallery' ? 'Сервисная площадка' : location.title
  const utilityLabel = location.utility === 'chronicle' ? 'ОТКРЫТЬ ЛЕТОПИСЬ' : location.utility === 'terminal' ? 'ОТКРЫТЬ ТЕРМИНАЛ' : location.utility === 'map' ? 'ОТКРЫТЬ СХЕМУ ЯРУСА' : 'ПРОВЕРИТЬ НАВЫКИ'
  return (
    <div className="floor-screen">
      <nav className="location-breadcrumb" aria-label="Текущий маршрут">{path.map((item, index) => <span key={item.id}>{index > 0 && <ChevronRight size={13} />}<button className={item.id === location.id ? 'active' : ''} onClick={() => enter(item.id)}>{item.title}</button></span>)}</nav>
      <div className="screen-heading">
        <div><span className="eyebrow"><span /> {location.code}</span><h1>{location.title}</h1><p>{location.subtitle}</p></div>
        {location.parent ? <button className="department-switch" onClick={() => enter(location.parent!)}><ArrowLeft size={17} /> НАЗАД: {locations[location.parent].title}</button> : <button className="department-switch" onClick={() => navigate('map')}><Map size={17} /> СХЕМА ЯРУСА</button>}
      </div>
      <CurrentDirective state={state} job={job} work={work} progress={progress} episode={episode} setState={setState} navigate={navigate} />
      <StoryPassage entry={chronicle.at(-1) ?? null} complete={episode.status === 'complete'} />
      <div className="floor-layout">
        <div className={`location-stage ${location.children ? 'location-directory' : 'location-room'} dept-${location.department ?? 'hub'}`}>
          <div className="scene-grid" aria-hidden="true" /><div className="pipe pipe-a" /><div className="pipe pipe-b" />
          <div className="location-intro"><span>{location.code}</span><h2>{location.title}</h2><p>{location.detail}</p></div>
          {children.length > 0 && <div className={`location-grid ${location.id === 'floor-hub' ? 'hub-grid' : ''}`}>{children.map(child => { const ChildIcon = child.icon; const onRoute = targetPath.has(child.id); return <button className={`location-card ${onRoute ? 'route' : ''}`} key={child.id} onClick={() => enter(child.id)}><span className="location-card-icon"><ChildIcon /></span><span className="location-card-copy"><small>{child.code}</small><b>{child.title}</b><em>{child.subtitle}</em></span>{onRoute && <strong><Target size={12} /> МАРШРУТ ЗАДАЧИ</strong>}<ChevronRight size={19} /></button> })}</div>}
          {!children.length && <div className={`room-equipment ${target.id === location.id ? 'route' : ''}`}><div className="room-machine"><Icon size={72} /><span className="machine-glow" /></div><div><small>{location.jobIds ? 'РАБОЧЕЕ ОБОРУДОВАНИЕ' : 'ДОСТУПНЫЙ ОБЪЕКТ'}</small><h3>{equipmentName}</h3><p>{target.id === location.id && work ? `Здесь доступна работа «${work.title}».` : location.detail}</p><button onClick={interact}>{location.jobIds ? target.id === location.id ? 'ВСТАТЬ ЗА РАБОЧЕЕ МЕСТО' : 'ПРОВЕРИТЬ ДОСТУПНЫЕ РАБОТЫ' : utilityLabel} <ArrowRight size={17} /></button></div></div>}
        </div>
        <aside className="floor-status">
          <div className="status-title"><Icon size={19} /><span><small>ТЕКУЩАЯ ЛОКАЦИЯ</small><b>{location.title}</b></span><i>ДОСТУПНО</i></div>
          <div className="metric"><span>Опубликовано фактов</span><b>{episode.publicFacts.length}</b><div><i style={{ width: `${Math.min(100, episode.publicFacts.length * 20)}%` }} /></div></div>
          <div className="metric"><span>Глубина маршрута</span><b>{path.length} / 3</b><div><i className="blue" style={{ width: `${path.length / 3 * 100}%` }} /></div></div>
          {job ? <div className="active-task"><span className="live-line"><i /> ВАША РАБОТА</span><b>{job.title}</b><p>{progress} из {job.target} · место: {target.title}</p><button onClick={() => location.id === target.id ? navigate('journal') : enter(getNextLocation(location.id, target.id))}>{location.id === target.id ? 'Открыть дневник' : `Дальше: ${locations[getNextLocation(location.id, target.id)].title}`} <ChevronRight size={16} /></button></div> : work ? <div className="empty-task"><CircleGauge size={24} /><b>{work.title}</b><p>Ближайшее доступное направление находится в помещении «{target.title}».</p></div> : <div className="empty-task"><Check size={24} /><b>Нет открытых работ</b><p>Проверьте общую цель и решения Заводского вече.</p></div>}
          <div className="workers"><span><Users size={16} /> ОБЩАЯ СЕТЬ</span><p>{episode.mode === 'shared' ? 'Результаты других работников поступают с общего сервера.' : 'Локальная демонстрация: общий вклад не синхронизируется.'}</p></div>
        </aside>
      </div>
    </div>
  )
}

function Objectives({ state, job, progress, episode, works, council, busy, vote, resolveDemo, setState, navigate }: { state: SavedState, job: Job | null, progress: number, episode: EpisodeSnapshot, works: WorkView[], council: CouncilView | null, busy: boolean, vote: (voteId: string, optionId: string) => Promise<unknown>, resolveDemo: (() => Promise<unknown>) | null, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  const [choice, setChoice] = useState(council?.ownOptionId ?? '')
  const [clock, setClock] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer) }, [])
  useEffect(() => setChoice(council?.ownOptionId ?? ''), [council?.ownOptionId])
  const actionable = works.filter(work => work.status !== 'completed').slice(0, 3)
  const activeWork = works.find(work => work.id === job?.id) ?? actionable[0] ?? null
  const remaining = council?.status === 'open' ? Math.max(0, Math.floor((Date.parse(council.closesAt) - clock) / 1000)) : 0
  const goToWork = (work: WorkView) => {
    const target = getWorkstation(work.id)
    const next = getNextLocation(state.location, target.id)
    setState(prev => ({ ...prev, location: next, department: work.department, screen: 'floor' }))
  }
  const submitVote = () => { if (council && choice) vote(council.id, choice).catch(() => undefined) }
  return <div className="content-screen objectives-screen">
    <button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> К ТЕКУЩЕЙ ЛОКАЦИИ</button>
    <div className="screen-heading compact"><div><span className="eyebrow"><span /> ЭПИЗОД 01 · ОБЩЕЕ СОСТОЯНИЕ</span><h1>{episode.goal}</h1><p>{episode.goalDetail}</p></div><div className="objective-total"><span>ИЗВЕСТНО ЗАВОДУ</span><b>{episode.publicFacts.length}</b><small>фактов · версия мира {episode.version}</small></div></div>
    <CurrentDirective state={state} job={job} work={activeWork} progress={progress} episode={episode} setState={setState} navigate={navigate} />

    {council && <section className={`council-card ${council.status}`}>
      <div className="council-heading"><span><Users size={18} /> ЗАВОДСКОЕ ВЕЧЕ</span><b>{council.status === 'open' ? `ОСТАЛОСЬ ${formatCouncilDuration(remaining)}` : 'РЕШЕНИЕ ПРИНЯТО'}</b></div>
      <h2>{council.question}</h2><p>{council.context}</p>
      {council.status === 'open' ? <>
        <div className="council-options" role="radiogroup" aria-label="Варианты решения">{council.options.map(option => <button role="radio" aria-checked={choice === option.id} className={choice === option.id ? 'selected' : ''} key={option.id} onClick={() => setChoice(option.id)}><span className="radio-mark">{choice === option.id && <i />}</span><span><b>{option.title}</b><small>{option.argument}</small></span></button>)}</div>
        <div className="council-actions"><button className="primary-button" disabled={!choice || busy} onClick={submitVote}>{council.ownOptionId ? 'ИЗМЕНИТЬ СВОЙ ГОЛОС' : 'ПОДАТЬ ГОЛОС'} <ArrowRight size={17} /></button>{episode.mode === 'local-demo' && resolveDemo && <button className="demo-resolve" onClick={() => resolveDemo().catch(() => undefined)}>ЗАВЕРШИТЬ ДЕМО-ВЕЧЕ</button>}</div>
        <small className="council-rule"><Clock3 size={14} /> Один аккаунт — один равный голос. Его можно изменить до срока. Числа скрыты до закрытия; кворума нет. При ничьей действует безопасный вариант.</small>
      </> : <div className="council-result"><Check size={22} /><span><b>{council.options.find(option => option.id === council.resultOptionId)?.title}</b><small>Итог применён к состоянию мира и списку доступных работ.</small></span></div>}
    </section>}

    <section className="known-facts"><div className="section-kicker">ПОДТВЕРЖДЁННЫЕ СВЕДЕНИЯ <span>{episode.publicFacts.length}</span></div>{episode.publicFacts.length ? <div className="fact-grid">{episode.publicFacts.map(fact => <article key={fact.id} className={fact.certainty}><span>{fact.certainty === 'confirmed' ? 'ПОДТВЕРЖДЕНО' : fact.certainty === 'refuted' ? 'ОПРОВЕРГНУТО' : 'ГИПОТЕЗА'}</span><h3>{fact.title}</h3><p>{fact.text}</p></article>)}</div> : <div className="objective-empty"><Info /><p>Причины остановки ещё не подтверждены. Первые независимые работы доступны в разных отсеках.</p></div>}</section>

    <section className="available-directions"><div className="section-kicker">ДОСТУПНЫЕ НАПРАВЛЕНИЯ <span>{actionable.length}</span></div><div className="direction-grid">{actionable.map(work => <article key={work.id} className={work.status === 'locked_skill' ? 'locked' : ''}><span>{locations[work.location as LocationId]?.code ?? work.location}</span><h3>{work.title}</h3><p>{work.description}</p><div><small>БЛИЖАЙШИЙ РЕЗУЛЬТАТ</small><b>{work.nearestResult}</b></div><em>{work.progress} / {work.requiredProgress} общего вклада · навык {work.skill.level}</em><button disabled={work.status === 'locked_skill'} onClick={() => goToWork(work)}>{work.status === 'locked_skill' ? `НУЖЕН УРОВЕНЬ ${work.skill.level}` : 'ПОКАЗАТЬ МАРШРУТ'} <ChevronRight size={16} /></button></article>)}</div>{!actionable.length && <div className="objective-empty"><Check /><p>{episode.status === 'complete' ? 'Эпизод завершён. Итог сохранён в летописи.' : 'Новые работы появятся после публикации результата или решения вече.'}</p></div>}</section>
  </div>
}

function Jobs({ location, works, activeWork, beginJob, continueJob, back }: { location: LocationDefinition, works: WorkView[], activeWork: WorkView | null, beginJob: (work: WorkView) => void, continueJob: () => void, back: () => void }) {
  const [filter, setFilter] = useState<'available' | 'active' | 'completed'>('available')
  const available = works.filter(work => ['available', 'locked_skill'].includes(work.status))
  const active = works.filter(work => work.status === 'active' || work.id === activeWork?.id)
  const completed = works.filter(work => work.status === 'completed')
  const visible = filter === 'available' ? available : filter === 'active' ? active : completed
  const Icon = location.icon
  return <div className="content-screen jobs-screen">
    <button className="back-button" onClick={back}><ArrowLeft size={17} /> НАЗАД В ПОМЕЩЕНИЕ</button>
    <div className="screen-heading compact"><div><span className="eyebrow"><span /> {location.code} · ДОСТУПНЫЕ РАБОТЫ</span><h1>{location.title}</h1><p>Показаны только работы, уже открытые общими знаниями. Скрытые ветви и будущие исходы не раскрываются.</p></div><div className="station-badge"><Icon size={40} /><span><b>{location.title}</b><small>РАБОЧЕЕ МЕСТО ДОСТУПНО</small></span></div></div>
    <div className="job-filter" role="tablist" aria-label="Фильтр работ"><button className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')}>ДОСТУПНЫЕ <span>{available.length}</span></button><button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>В РАБОТЕ <span>{active.length}</span></button><button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')}>ЗАВЕРШЕНЫ <span>{completed.length}</span></button></div>
    <div className="job-grid">{visible.map(work => {
      const isActive = work.id === activeWork?.id
      return <article className={`job-card story-job ${isActive ? 'selected' : ''} ${work.status === 'locked_skill' ? 'locked' : ''}`} key={work.id}>
        <div className="job-icon">{work.department === 'power' ? <Zap /> : work.department === 'repair' ? <Wrench /> : <Cog />}</div>
        <div className="job-copy"><span className="job-code">{work.significance === 'routine' ? 'РАБОЧИЙ НАРЯД' : 'СЮЖЕТНАЯ РАБОТА'} · {locations[work.location as LocationId]?.code}</span><h3>{work.title}</h3><p>{work.description}</p><div className="job-chain"><span>БЛИЖАЙШИЙ РЕЗУЛЬТАТ</span><b>{work.nearestResult}</b></div><div className="job-meta"><span><Clock3 size={14} /> {work.requiredProgress} действий</span><span><Sparkles size={14} /> Навык {work.skill.level}</span><span><Users size={14} /> Ваш вклад {work.playerContribution}</span></div></div>
        <div className="job-progress-mini"><span>{work.status === 'completed' ? 'РАБОТА ЗАВЕРШЕНА' : `${work.progress} / ${work.requiredProgress} ОБЩЕГО ВКЛАДА`}</span><div><i style={{ width: `${Math.round(work.progress / work.requiredProgress * 100)}%` }} /></div></div>
        <button disabled={work.status === 'locked_skill' || work.status === 'completed'} onClick={() => isActive ? continueJob() : beginJob(work)}>{work.status === 'locked_skill' ? `НУЖЕН УРОВЕНЬ ${work.skill.level}` : work.status === 'completed' ? 'РЕЗУЛЬТАТ ОПУБЛИКОВАН' : isActive ? 'ПРОДОЛЖИТЬ РАБОТУ' : 'НАЧАТЬ РАБОТУ'} <ChevronRight size={17} /></button>
      </article>
    })}{visible.length === 0 && <div className="job-list-empty"><CircleGauge size={30} /><h3>Здесь пока нет работ</h3><p>Доступность меняется после подтверждённых результатов и решений Заводского вече. Проверьте общую сводку.</p></div>}</div>
    <div className="job-note"><Info size={18} /><span><b>Будущий путь скрыт.</b> Работа сообщает ближайший практический результат; новые возможности появляются только после его фиксации.</span></div>
  </div>
}

function Journal({ state, job, work, progress, elapsed, navigate }: { state: SavedState, job: Job | null, work: WorkView | null, progress: number, elapsed: number, navigate: (s: Screen) => void }) {
  const time = (timestamp: number | null) => new Date(timestamp ?? Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const completedCycles = state.contributionCycle
  type JournalEntry =
    | { kind: 'start', timestamp: number, order: number }
    | { kind: 'cycle', timestamp: number, order: number, cycle: number }
    | { kind: 'incident', timestamp: number, order: number, eventId: string, active: boolean }
    | { kind: 'resolution', timestamp: number, order: number, record: IncidentRecord }
  const entries: JournalEntry[] = []
  if (job && state.jobStartedAt) {
    entries.push({ kind: 'start', timestamp: state.jobStartedAt, order: 0 })
    const firstVisibleCycle = Math.max(0, completedCycles - 20)
    for (let cycle = firstVisibleCycle; cycle < completedCycles; cycle += 1) entries.push({ kind: 'cycle', timestamp: state.jobStartedAt + (cycle + 1) * 60_000, order: 1, cycle })
  }
  state.incidentHistory.forEach(record => {
    entries.push({ kind: 'incident', timestamp: record.createdAt, order: 3, eventId: record.eventId, active: false })
    entries.push({ kind: 'resolution', timestamp: record.resolvedAt, order: 4, record })
  })
  if (state.activeIncidentId && state.activeIncidentCreatedAt) entries.push({ kind: 'incident', timestamp: state.activeIncidentCreatedAt, order: 3, eventId: state.activeIncidentId, active: true })
  entries.sort((left, right) => left.timestamp - right.timestamp || left.order - right.order)
  return <div className="content-screen journal-screen">
    <div className="screen-heading compact"><div><span className="eyebrow"><span /> ЛИЧНЫЙ ЖУРНАЛ · {state.name.toUpperCase()}</span><h1>Рабочий дневник</h1><p>Здесь остаются ваши действия и происшествия. Общая летопись получает только значимые результаты.</p></div>{job && <div className="working-now"><span><i /> РАБОТА ИДЁТ</span><b>{job.title}</b><small>{progress} / {job.target} общего вклада · {formatDuration(elapsed)}</small></div>}</div>
    {job && <ActionProgress job={job} elapsed={elapsed} />}
    <div className="journal-layout"><div className="timeline">
      {!job && <div className="journal-empty"><BookOpen size={28} /><h3>Сейчас нет активной работы</h3><p>Выберите одно из доступных направлений в общей сводке и дойдите до указанного рабочего места.</p><button onClick={() => navigate('objectives')}>ОТКРЫТЬ ОБЩУЮ СВОДКУ <ChevronRight size={16} /></button></div>}
      {entries.map(entry => {
        if (entry.kind === 'start') return <div className="timeline-event" key={`start-${entry.timestamp}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot" /><div><span className="entry-type">РАБОТА НАЧАТА</span><h3>{work?.title ?? job?.title}</h3><p>{work?.description}</p><small>Ближайший результат: {work?.nearestResult}</small></div></div>
        if (entry.kind === 'cycle') { const action = job ? getWorkAction(job, entry.cycle) : null; return <div className="timeline-event" key={`cycle-${entry.cycle}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot" /><div><span className="entry-type">ВКЛАД {String(entry.cycle + 1).padStart(2, '0')}</span><p>{action?.completed}</p><small>+1 XP · +1 к общему результату работы</small></div></div> }
        if (entry.kind === 'incident') {
          const incident = getIncident(entry.eventId)
          if (entry.active) return <button className="timeline-event incident-entry" key={`incident-${entry.timestamp}`} onClick={() => navigate('incident')}><time>{time(entry.timestamp)}</time><span className="timeline-dot danger" /><div><span className="entry-type">АКТИВНОЕ ПРОИСШЕСТВИЕ</span><h3>{incident?.title}</h3><p>{incident?.summary}</p><b>ПРИНЯТЬ РЕШЕНИЕ <ChevronRight size={15} /></b></div></button>
          return <div className="timeline-event incident-entry" key={`incident-${entry.timestamp}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot danger" /><div><span className="entry-type">ПРОИСШЕСТВИЕ · {incident?.sector}</span><h3>{incident?.title}</h3><p>{incident?.summary}</p></div></div>
        }
        const incident = getIncident(entry.record.eventId)
        return <div className="timeline-event resolved-entry" key={`resolution-${entry.timestamp}-${entry.record.eventId}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot success" /><div><span className="entry-type">РЕШЕНИЕ ЗАФИКСИРОВАНО · {incident?.title}</span><h3>{entry.record.choice}</h3><p>Выбор сохранён в личной истории. Рядовое происшествие не создаёт отдельную большую главу.</p></div></div>
      })}
    </div><aside className="shift-summary"><span className="rail-label">ЛИЧНЫЙ ВКЛАД</span><div className="summary-number"><b>{work?.playerContribution ?? 0}</b><span>ДЕЙСТВИЙ<br />В РАБОТЕ</span></div><div className="summary-stats"><p><span>Опыт смены</span><b>+{state.contributionCycle + state.incidentXpBonus} XP</b></p><p><span>Время</span><b>{formatDuration(elapsed)}</b></p><p><span>Происшествия</span><b>{state.incidentHistory.length + (state.activeIncidentId ? 1 : 0)}</b></p></div><button onClick={() => navigate('floor')}>ВЕРНУТЬСЯ В ЛОКАЦИЮ</button></aside></div>
  </div>
}

function Incident({ state, setState, navigate, remaining }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void, remaining: number }) {
  const [choice, setChoice] = useState<string | null>(null)
  const incident = getIncident(state.activeIncidentId)
  const selectedOption = incident?.options.find(option => option.title === choice) ?? null
  const confirm = () => {
    if (!selectedOption || !incident) return
    haptic('success')
    setState(prev => ({ ...resolveIncident(prev, incident, selectedOption, Date.now()), screen: 'journal' }))
  }
  if (!incident) return <div className="content-screen resolved-screen"><Check size={44} /><span className="eyebrow"><span /> ЗАПИСЬ ЗАКРЫТА</span><h1>Решение принято</h1><p>Происшествие сохранено в хронологическом порядке в рабочем дневнике.</p><button className="primary-button" onClick={() => navigate('journal')}>ВЕРНУТЬСЯ В ДНЕВНИК</button></div>
  return (
    <div className="content-screen incident-screen">
      <button className="back-button" onClick={() => navigate('journal')}><ArrowLeft size={17} /> В ДНЕВНИК</button>
      <div className="incident-header"><div className="warning-sign"><AlertTriangle /></div><div><span>ПРОИСШЕСТВИЕ · {incident.sector}</span><h1>{incident.title}</h1><p>{incident.summary}</p></div><div className="countdown"><Clock3 size={19} /><span>ОСТАЛОСЬ</span><b>{formatDuration(remaining)}</b></div></div>
      <div className="incident-visual"><div className="machine-silhouette"><Cog /><span className="vibration v1" /><span className="vibration v2" /></div><div className="scan-lines" /><span>{incident.sector} · {incident.signal}</span></div>
      <div className="decision-copy"><span>ВАШЕ РЕШЕНИЕ</span><p>Выберите, как поступить. Последствия станут известны после подтверждения.</p></div>
      <aside className="decision-mechanics"><Info size={17} /><span><b>Решение необратимо</b> Оно останется в дневнике и может отразиться в следующих страницах истории.</span></aside>
      <div className="decision-options">{incident.options.map(({ title, text, icon: Icon }) => <button key={title} className={choice === title ? 'selected' : ''} onClick={() => setChoice(title)}><span className="decision-icon"><Icon /></span><span><b>{title}</b><small>{text}</small></span><span className="radio-mark">{choice === title && <i />}</span></button>)}</div>
      <button className="primary-button decision-confirm" disabled={!choice} onClick={confirm}>ПОДТВЕРДИТЬ РЕШЕНИЕ <ArrowRight size={18} /></button>
      <p className="fallback-note"><Info size={15} /> Если время истечёт, система применит безопасный вариант «{incident.timeoutOptionId}».</p>
    </div>
  )
}

function Skills({ state, player }: { state: SavedState, player: PlayerView }) {
  const makeSkill = (id: Department, name: string, icon: typeof Cog, color: string, note: string) => { const skill = player.skills[id]; return { name, level: skill.level, xp: skill.xp % 20, max: 20, total: skill.xp, icon, color, note } }
  const skillData = [makeSkill('mechanics', 'Механическая обработка', Cog, 'orange', 'Точные детали, подшипники, крепёж'), makeSkill('power', 'Энергетика', Zap, 'yellow', 'Силовые линии и накопители'), makeSkill('repair', 'Ремонт', Wrench, 'blue', 'Диагностика и восстановление')]
  return <div className="content-screen skills-screen"><div className="screen-heading compact"><div><span className="eyebrow"><span /> ПРОФИЛЬ РАБОТНИКА</span><h1>Навыки</h1><p>{player.displayName} · навыки принадлежат человеку, а не отсеку</p></div><div className="episode-reset"><Info size={18} /><span><b>Свободный переход</b><small>Можно работать в любом отсеке при достаточном навыке</small></span></div></div><div className="skill-grid">{skillData.map(({ name, level, xp, max, total, icon: Icon, color, note }) => <article className="skill-card" key={name}><div className={`skill-symbol ${color}`}><Icon /></div><div className="skill-main"><span className="skill-level">УРОВЕНЬ {level}</span><h3>{name}</h3><p>{note} · всего {total} XP</p><div className="skill-bar"><i style={{ width: `${xp / max * 100}%` }} /></div><small>{xp} / {max} XP до следующего уровня</small></div></article>)}</div><section className="knowledge"><div className="section-kicker">ЛИЧНЫЕ ЗНАНИЯ ИЗ ПРОИСШЕСТВИЙ <span>{state.incidentKnowledge.length || 'ПОКА НЕТ'}</span></div>{state.incidentKnowledge.length ? <div className="knowledge-grid">{state.incidentKnowledge.map((knowledge, index) => <article key={knowledge}><Sparkles /><div><b>{knowledge}</b><p>Открыто личным решением во время происшествия.</p><span>ЛИЧНАЯ ЗАПИСЬ {String(index + 1).padStart(2, '0')}</span></div></article>)}</div> : <div className="knowledge-empty"><Sparkles /><p>Общие сюжетные факты находятся в сводке; здесь остаются личные знания.</p></div>}</section></div>
}

function DepartmentMap({ state, setState, navigate, setRemoteLocation }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void, setRemoteLocation: (location: string) => void }) {
  const wingByDepartment: Record<Department, LocationId> = { mechanics: 'production-wing', power: 'power-wing', repair: 'engineering-wing' }
  return <div className="content-screen map-screen"><div className="screen-heading compact"><div><span className="eyebrow"><span /> ГРУЗОВОЙ ЛИФТ · ЯРУС 47</span><h1>Схема этажа</h1><p>Схема переносит ко входу в выбранное крыло. Внутри нужно самостоятельно найти нужную комнату.</p></div></div><div className="department-grid">{(Object.keys(departments) as Department[]).map(key => { const item = departments[key]; const Icon = item.icon; const wing = locations[wingByDepartment[key]]; return <button key={key} className={state.location === wing.id ? 'active' : ''} onClick={() => { setRemoteLocation(wing.id); setState(prev => ({ ...prev, department: key, location: wing.id, screen: 'floor' })) }}><div className={`department-illustration ${key}`}><Icon /><span className="floor-lines" /></div><div><span>{wing.code}</span><h2>{wing.title}</h2><p>{wing.subtitle}</p><small>{wing.children?.length} помещения · вход из центрального перехода</small></div><ChevronRight /></button>})}</div><button className="back-button centered" onClick={() => navigate('floor')}><ArrowLeft size={17} /> ВЕРНУТЬСЯ В ТЕКУЩУЮ ЛОКАЦИЮ</button></div>
}

const storyIllustrations: Record<string, { src: string, alt: string }> = {
  'lift-silent': { src: 'story/lift-silent.svg', alt: 'Остановившийся грузовой лифт между тёмными ярусами' },
  'drive-diagnostics': { src: 'story/drive-diagnostics.svg', alt: 'Диагностический свет над разобранным приводом лифта' },
  'power-lock': { src: 'story/power-lock.svg', alt: 'Силовой щит с активной ручной блокировкой' },
  'shaft-mark': { src: 'story/shaft-mark.svg', alt: 'Свежий след удара на направляющей шахты' },
  'diagnostic-synthesis': { src: 'story/diagnostic-synthesis.svg', alt: 'Два технических доклада, сведённые на одном столе' },
  'factory-council': { src: 'story/factory-council.svg', alt: 'Панель Заводского вече с тремя равными вариантами' },
  'lower-signal': { src: 'story/lower-signal.svg', alt: 'Сигнальный маяк в закрытом нижнем пролёте' },
  'ending-safe': { src: 'story/ending-safe.svg', alt: 'Кабина осторожно поднимается при включённых защитах' },
  'ending-risk': { src: 'story/ending-risk.svg', alt: 'Кабина удержана аварийными ловителями' },
  'ending-conserve': { src: 'story/ending-conserve.svg', alt: 'Грузы идут по сервисной линии мимо закрытой шахты' },
}

function NewsTerminal({ episode, chronicle, navigate, openProductionJobs }: { episode: EpisodeSnapshot, chronicle: StoryChronicleEntry[], navigate: (s: Screen) => void, openProductionJobs: () => void }) {
  const reports = [...chronicle].reverse().slice(0, 8)
  return <div className="content-screen terminal-page"><button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> В ТЕКУЩУЮ ЛОКАЦИЮ</button><div className="screen-heading compact"><div><span className="eyebrow"><span /> ОПЕРАТИВНЫЙ ПОТОК · ЯРУС 47</span><h1>Доклады завода</h1><p>Сообщения создаются из фактических завершений работ и решений, от новых к ранним.</p></div><div className="terminal-live"><i /> {episode.mode === 'shared' ? 'ОБЩАЯ СЕТЬ' : 'ЛОКАЛЬНОЕ ДЕМО'}</div></div><div className="news-list">{reports.map(entry => <article className={entry.significance === 'turning_point' || entry.significance === 'finale' ? 'critical' : ''} key={entry.id}><time>{new Date(entry.publishedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time><div className="news-line"><span>{entry.type}</span><i /></div><div><h3>{entry.title}</h3><p>{entry.lead}</p><button onClick={() => navigate('chronicle')}>ОТКРЫТЬ ПОЛНЫЙ ТЕКСТ <ChevronRight size={15} /></button></div></article>)}</div>{episode.status !== 'complete' && <button className="terminal-route-button" onClick={openProductionJobs}><Target size={16} /> ВЕРНУТЬСЯ К МАРШРУТАМ РАБОТ</button>}<div className="terminal-footer"><Radio size={17} /> РЯДОВЫЕ ДЕЙСТВИЯ ОСТАЮТСЯ В ЛИЧНОМ ДНЕВНИКЕ</div></div>
}

function Chronicle({ state, job, progress, episode, chronicle, player, navigate }: { state: SavedState, job: Job | null, progress: number, episode: EpisodeSnapshot, chronicle: StoryChronicleEntry[], player: PlayerView, navigate: (s: Screen) => void }) {
  const [tab, setTab] = useState<'episode' | 'personal' | 'facts'>('episode')
  const [filter, setFilter] = useState<'all' | 'major'>('all')
  const visible = chronicle.filter(entry => filter === 'all' || ['chapter', 'turning_point', 'finale'].includes(entry.significance))
  const contributionTotal = player.contributions.reduce((sum, item) => sum + item.amount, 0)
  return <div className="content-screen chronicle-screen">
    <button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> НАЗАД</button>
    <div className="chronicle-hero"><span className="eyebrow"><span /> ЛЕТОПИСЬ · ЭПИЗОД 01</span><h1>Немой лифт</h1><p>{episode.goalDetail}</p><div className="chronicle-status"><i /> {episode.status === 'complete' ? 'ЭПИЗОД ЗАВЕРШЁН' : `${chronicle.length} ЗНАЧИМЫХ ПУБЛИКАЦИЙ`}</div></div>
    <div className="chronicle-tabs" role="tablist"><button className={tab === 'episode' ? 'active' : ''} onClick={() => setTab('episode')}>ОБЩАЯ ИСТОРИЯ <span>{chronicle.length}</span></button><button className={tab === 'personal' ? 'active' : ''} onClick={() => setTab('personal')}>ЛИЧНЫЙ ВКЛАД</button><button className={tab === 'facts' ? 'active' : ''} onClick={() => setTab('facts')}>ЗНАНИЯ <span>{episode.publicFacts.length}</span></button></div>
    {tab === 'episode' && <section className="chronicle-feed"><div className="chronicle-filter"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>ВСЕ ЗНАЧИМЫЕ</button><button className={filter === 'major' ? 'active' : ''} onClick={() => setFilter('major')}>ТОЛЬКО ГЛАВЫ</button></div>{visible.map(entry => { const illustration = entry.illustrationIds.map(id => storyIllustrations[id]).find(Boolean); return <article className={`chronicle-entry-card ${entry.significance}`} key={entry.id}>{illustration && <img src={illustration.src} alt={illustration.alt} />}<div className="chronicle-entry-copy"><span>ЗАПИСЬ {String(entry.sequence).padStart(2, '0')} · {entry.type.toUpperCase()}</span><h2>{entry.title}</h2><p className="entry-lead">{entry.lead}</p><details><summary>ЧИТАТЬ ПОЛНОСТЬЮ</summary><p>{entry.body}</p>{entry.contributors.length > 0 && <div className="entry-contributors"><Users size={15} /> Вклад: {entry.contributors.map(person => person.name).join(', ')}</div>}<small>Опубликовано {new Date(entry.publishedAt).toLocaleString('ru-RU')}</small></details></div></article>})}</section>}
    {tab === 'personal' && <section className="personal-story-panel"><span className="contribution-avatar">{player.displayName.slice(0, 1).toUpperCase()}</span><div><span className="rail-label">ЛИЧНАЯ ИСТОРИЯ</span><h2>{player.displayName}</h2><p>{job ? `Сейчас выполняет работу «${job.title}» в локации «${locations[state.location].title}».` : 'Сейчас нет активной работы.'}</p><div className="personal-story-stats"><span><b>{contributionTotal}</b> действий</span><span><b>{player.contributions.length}</b> работ</span><span><b>{state.incidentHistory.length}</b> решений</span><span><b>{progress}</b> текущий результат</span></div>{player.contributions.length > 0 && <div className="personal-work-list">{player.contributions.map(item => <p key={item.workId}><b>{item.workId}</b><span>{item.amount} вклада · {item.xp} XP</span></p>)}</div>}</div></section>}
    {tab === 'facts' && <section className="fact-grid chronicle-facts">{episode.publicFacts.map(fact => <article className={fact.certainty} key={fact.id}><span>{fact.certainty === 'confirmed' ? 'ПОДТВЕРЖДЕНО' : fact.certainty === 'refuted' ? 'ОПРОВЕРГНУТО' : 'ГИПОТЕЗА'}</span><h3>{fact.title}</h3><p>{fact.text}</p><small>Источник: {fact.sourceWorkId}</small></article>)}</section>}
  </div>
}

function StoryModeBanner({ mode, error }: { mode: EpisodeSnapshot['mode'], error: string | null }) {
  if (mode === 'shared' && !error) return null
  return <div className={`story-mode-banner ${mode}`}><Info size={14} /><span><b>{mode === 'local-demo' ? 'ЛОКАЛЬНАЯ ДЕМОНСТРАЦИЯ' : 'НЕТ СВЯЗИ · ТОЛЬКО ЧТЕНИЕ'}</b>{mode === 'local-demo' ? 'Прогресс существует только в этом браузере и не является общим.' : error}</span></div>
}

function MigrationNotice({ accept }: { accept: () => void }) {
  const confirm = () => {
    const previous = localStorage.getItem(STORAGE_KEY)
    if (previous && !localStorage.getItem(`${STORAGE_KEY}-backup-before-story`)) localStorage.setItem(`${STORAGE_KEY}-backup-before-story`, previous)
    accept()
  }
  return <div className="modal-backdrop"><section className="migration-modal"><RotateCcw size={30} /><span className="eyebrow"><span /> ОБНОВЛЕНИЕ СЮЖЕТНОЙ СИСТЕМЫ</span><h2>Прогресс теперь определяется результатами</h2><p>Старый локальный счётчик минут больше не считается общей историей. Имя, личные происшествия и открытые знания сохранены; резервная копия прежнего состояния останется на устройстве.</p><button className="primary-button" onClick={confirm}>ПРОДОЛЖИТЬ В ОБЩИЙ ЭПИЗОД <ArrowRight size={17} /></button></section></div>
}

function RecapModal({ recap, close, navigate }: { recap: RecapView, close: () => void, navigate: (screen: Screen) => void }) {
  const proceed = (screen?: Screen) => { close(); if (screen) navigate(screen) }
  return <div className="modal-backdrop"><section className="recap-modal"><div className="recap-header"><span><BookOpen size={18} /> ВОЗВРАЩЕНИЕ В ЭПИЗОД</span><button onClick={() => proceed()} aria-label="Закрыть пересказ">×</button></div><div className="recap-columns"><section><span>РАНЕЕ В ЭПИЗОДЕ</span>{recap.previous.slice(0, 3).map(entry => <article key={entry.id}><b>{entry.title}</b><p>{entry.lead}</p></article>)}</section><section className="recap-new"><span>ПОКА ВАС НЕ БЫЛО</span>{recap.whileAway.map(entry => <article key={entry.id}><b>{entry.title}</b><p>{entry.lead}</p></article>)}</section><section><span>ЧТО ТЕПЕРЬ</span><h3>{recap.now.goal}</h3><p>{recap.now.goalDetail}</p><small>{recap.now.works.length} доступных направлений{recap.now.council?.status === 'open' ? ' · открыто Заводское вече' : ''}</small></section></div><div className="recap-actions"><button onClick={() => proceed('chronicle')}>ОТКРЫТЬ ЛЕТОПИСЬ</button><button className="primary-button" onClick={() => proceed('objectives')}>К АКТУАЛЬНЫМ ДЕЙСТВИЯМ <ArrowRight size={17} /></button></div></section></div>
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

function formatCouncilDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const secs = seconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatLongDuration(seconds: number) {
  const totalMinutes = Math.ceil(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`
}

export default App
