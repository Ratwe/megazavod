import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Box, Check, ChevronRight,
  CircleGauge, Clock3, Cog, Factory, Gauge, Info, ListChecks, Map, Menu,
  Radio, RotateCcw, ShieldAlert, Sparkles, Target, Terminal, UserRound, Users,
  Wrench, Zap,
} from 'lucide-react'
import { getTelegramUserName, getTelegramWebApp, haptic } from './telegram'

type Screen = 'lore' | 'onboarding' | 'briefing' | 'floor' | 'journal' | 'skills' | 'map' | 'jobs' | 'incident' | 'chronicle' | 'terminal' | 'objectives'
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
  responseSeconds: number
  options: IncidentOption[]
}

type SavedState = {
  name: string
  screen: Screen
  department: Department
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

const departments = {
  mechanics: { label: 'Производство', short: 'Мех. цех', icon: Factory, subtitle: 'Выпуск деталей и заготовок' },
  power: { label: 'Энергетика', short: 'Энергоблок', icon: Zap, subtitle: 'Питание и распределение' },
  repair: { label: 'Инженерия', short: 'Ремонтный пост', icon: Wrench, subtitle: 'Диагностика и восстановление' },
}

const defaultSaved: SavedState = {
  name: '', screen: 'lore', department: 'mechanics', jobId: null,
  jobStartedAt: null, episodeStartedAt: null, incidentAvailableAt: null, activeIncidentId: null, activeIncidentCreatedAt: null, incidentHistory: [], incidentChoice: null,
  incidentProgressBonus: 0, incidentXpBonus: 0, incidentKnowledge: [],
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
    id: 'third-knock', title: 'Третий удар', summary: 'Из-за стены доносятся три ровных удара. После паузы последовательность повторяется.', signal: 'АКУСТИЧЕСКАЯ АНОМАЛИЯ', sector: 'СЕРВИСНЫЙ КОРИДОР', weight: 4, responseSeconds: 600,
    options: [option('Ответить тем же ритмом', 'Отстучать последовательность по трубе и ждать ответа.', Radio, 0, 4, 'Язык сервисных тоннелей'), option('Найти источник', 'Остановить работу и пройти вдоль стены с акустическим датчиком.', Target, 0, 3), option('Зафиксировать и продолжить', 'Записать звук в журнал, не покидая рабочего места.', BookOpen, 1, 2)],
  },
  {
    id: 'nameless-pass', title: 'Пропуск без имени', summary: 'На полу лежит свежий пропуск. Вместо имени на нём выцарапан номер сорок восьмого яруса.', signal: 'НЕУЧТЁННЫЙ ИДЕНТИФИКАТОР', sector: 'ПРОХОД 03', weight: 3, responseSeconds: 720,
    options: [option('Передать в Архив', 'Запечатать находку и оформить запись происхождения.', BookOpen, 0, 3), option('Проверить журнал проходов', 'Сверить номер пропуска с последними открытиями гермодверей.', ListChecks, 0, 4, 'Следы доступа'), option('Оставить на месте', 'Отметить координаты и наблюдать, кто вернётся за пропуском.', Target, 1, 2)],
  },
  {
    id: 'cold-draft', title: 'Холод снизу', summary: 'Из технологической решётки тянет воздухом, которого не должно быть в замкнутом контуре.', signal: 'РАЗГЕРМЕТИЗАЦИЯ НЕ ПОДТВЕРЖДЕНА', sector: 'НИЖНИЙ НАСТИЛ', weight: 4, responseSeconds: 600,
    options: [option('Закрыть заслонку', 'Изолировать нижний воздуховод ручным приводом.', Wrench, 1, 2), option('Спустить датчик', 'Проверить температуру и состав воздуха под настилом.', Target, 0, 4, 'Воздух нижних ярусов'), option('Позвать дежурного', 'Передать координаты посту герметизации и освободить проход.', Radio, 1, 2)],
  },
  {
    id: 'missing-minute', title: 'Потерянная минута', summary: 'Все часы сектора одновременно отстают на пятьдесят семь секунд. Центральный хронометр уверен, что они точны.', signal: 'РАССИНХРОНИЗАЦИЯ', sector: 'ВЕСЬ СЕКТОР 03', weight: 2, responseSeconds: 540,
    options: [option('Верить центральному времени', 'Синхронизировать рабочее место с главным хронометром.', Clock3, 1, 2), option('Сохранить расхождение', 'Не исправлять часы, пока не будет найдена причина сдвига.', BookOpen, 0, 4, 'Хронология отказов'), option('Свериться с соседями', 'Запросить независимые отметки времени у двух отсеков.', Radio, 0, 3)],
  },
  {
    id: 'intercom-breath', title: 'Дыхание в линии', summary: 'Отключённый переговорник оживает. В динамике слышно дыхание и скрежет далёкой двери.', signal: 'ВХОДЯЩИЙ КАНАЛ БЕЗ АДРЕСА', sector: 'ЛИНИЯ ДИСПЕТЧЕРА', weight: 2, missions: [0, 2], responseSeconds: 480,
    options: [option('Назвать свой позывной', 'Открыть канал и потребовать идентификацию собеседника.', Radio, 0, 4), option('Записать молча', 'Не выдавать своего присутствия и сохранить весь сигнал.', BookOpen, 0, 4, 'Шумы закрытых каналов'), option('Отключить линию физически', 'Вынуть разъём переговорника из распределительной панели.', Zap, 1, 2)],
  },
  {
    id: 'red-dust', title: 'Красная пыль', summary: 'На перчатке остаётся красный порошок. В этом секторе не используют материалы такого цвета.', signal: 'НЕИЗВЕСТНЫЙ МАТЕРИАЛ', sector: 'РАБОЧАЯ ЗОНА', weight: 3, responseSeconds: 660,
    options: [option('Собрать образец', 'Изолировать порошок в контейнере для анализа.', Target, 0, 4, 'Следовая экспертиза'), option('Очистить рабочее место', 'Удалить пыль и проверить защитные фильтры.', Wrench, 1, 2), option('Проследить дорожку', 'Идти против следа до места, откуда принесли порошок.', CircleGauge, 0, 3)],
  },
  {
    id: 'blue-shavings', title: 'Синяя стружка', summary: 'Стружка темнеет и отливает синим: металл нагрелся сильнее, чем показывает датчик.', signal: 'ТЕМПЕРАТУРА ВНЕ МОДЕЛИ', sector: 'СТАНОК 03-А', weight: 5, departments: ['mechanics'], responseSeconds: 600,
    options: [option('Сменить резец', 'Остановить проход и установить новый инструмент.', Wrench, 1, 2), option('Проверить датчик', 'Сравнить показания станка с ручным пирометром.', Gauge, 0, 4, 'Тепловая диагностика'), option('Уменьшить подачу', 'Завершить проход на щадящем режиме.', CircleGauge, 1, 3)],
  },
  {
    id: 'alien-marking', title: 'Чужой номер', summary: 'На заготовке проступает номер детали, которой нет в текущем заказе и заводском каталоге.', signal: 'НЕСООТВЕТСТВИЕ МАРКИРОВКИ', sector: 'СТАНОК 03-А', weight: 3, departments: ['mechanics'], responseSeconds: 720,
    options: [option('Отложить деталь', 'Изолировать заготовку до выяснения её происхождения.', Box, 0, 3), option('Снять слой металла', 'Продолжить обработку и проверить, насколько глубоко нанесён номер.', Cog, 1, 3), option('Искать парную маркировку', 'Проверить склад и последние партии на тот же знак.', Target, 0, 4, 'Скрытая маркировка')],
  },
  {
    id: 'silent-crack', title: 'Трещина без звука', summary: 'Контрольная жидкость проявляет тонкую линию там, где металл должен быть цельным.', signal: 'СКРЫТЫЙ ДЕФЕКТ', sector: 'ПОСТ КОНТРОЛЯ', weight: 4, departments: ['mechanics'], responseSeconds: 600,
    options: [option('Забраковать партию', 'Остановить обработку всех заготовок из этой плавки.', ShieldAlert, 0, 3), option('Проверить ультразвуком', 'Определить глубину дефекта до принятия решения.', Gauge, 0, 4, 'Дефектоскопия'), option('Вырезать повреждение', 'Попробовать сохранить заготовку, удалив опасный участок.', Cog, 1, 2)],
  },
  {
    id: 'wrong-rhythm', title: 'Сбитый ритм', summary: 'Автоподача повторяет один лишний ход через каждые семнадцать циклов.', signal: 'СБОЙ ПОСЛЕДОВАТЕЛЬНОСТИ', sector: 'СТАНОК 03-А', weight: 4, departments: ['mechanics'], responseSeconds: 540,
    options: [option('Перейти на ручную подачу', 'Взять движение суппорта под прямой контроль.', Wrench, 1, 3), option('Дождаться лишнего хода', 'Наблюдать цикл и поймать момент появления сбоя.', Target, 0, 4, 'Ритмы автоматики'), option('Перезапустить контроллер', 'Остановить программу и загрузить её заново.', RotateCcw, 1, 2)],
  },
  {
    id: 'warm-cable', title: 'Тёплый кабель', summary: 'Обесточенный кабель остаётся тёплым. По схеме у него нет второго источника питания.', signal: 'ОБРАТНОЕ ПИТАНИЕ', sector: 'ЩИТ 03-Б', weight: 5, departments: ['power'], responseSeconds: 540,
    options: [option('Отсечь кабель', 'Физически разомкнуть линию с обеих сторон.', Zap, 0, 3), option('Найти второй источник', 'Пройти трассу с токовыми клещами до скрытого ответвления.', Target, 0, 4, 'Обратные контуры'), option('Поставить под наблюдение', 'Оградить участок и записывать изменение температуры.', Gauge, 1, 2)],
  },
  {
    id: 'double-flicker', title: 'Свет моргнул дважды', summary: 'Освещение дважды гаснет ровно на одну секунду, но автоматика не фиксирует провала.', signal: 'НЕЗАРЕГИСТРИРОВАННЫЙ ПРОВАЛ', sector: 'СИЛОВОЙ КОНТУР', weight: 4, departments: ['power'], responseSeconds: 600,
    options: [option('Поднять сырые логи', 'Считать данные до того, как контроллер их отфильтрует.', Terminal, 0, 4, 'Сырые журналы сети'), option('Перевести свет на резерв', 'Отделить освещение от основного контура.', Zap, 1, 2), option('Повторить нагрузку', 'Создать тот же режим и попытаться вызвать провал снова.', Gauge, 0, 3)],
  },
  {
    id: 'extra-consumer', title: 'Лишний потребитель', summary: 'Сеть отдаёт семь киловатт в линию, отсутствующую на схеме яруса.', signal: 'НЕУЧТЁННЫЙ РАСХОД', sector: 'РАСПРЕДЕЛИТЕЛЬ 03-Б', weight: 3, departments: ['power'], responseSeconds: 720,
    options: [option('Обесточить линию', 'Разомкнуть неизвестный канал на распределителе.', Zap, 1, 2), option('Проследить нагрузку', 'Оставить питание и определить конечную точку по импульсам.', Target, 0, 4, 'Карта скрытой сети'), option('Ограничить мощность', 'Установить безопасный предел и продолжить наблюдение.', Gauge, 1, 3)],
  },
  {
    id: 'reverse-current', title: 'Ток обратного хода', summary: 'Накопитель на мгновение принимает энергию со стороны остановленного лифта.', signal: 'НАПРАВЛЕНИЕ ТОКА ИЗМЕНЕНО', sector: 'НАКОПИТЕЛЬ 03-Б', weight: 2, departments: ['power'], missions: [0, 2], responseSeconds: 480,
    options: [option('Открыть приём', 'Дать импульсу войти в накопитель под контролем защиты.', Zap, 1, 3), option('Снять форму сигнала', 'Изолировать контур измерительным мостом.', Gauge, 0, 4, 'Почерк силовых импульсов'), option('Заземлить импульс', 'Сбросить неизвестную энергию на защитный контур.', ShieldAlert, 0, 2)],
  },
  {
    id: 'singing-rope', title: 'Трос поёт выше', summary: 'Один из тросов отвечает на удар нотой выше остальных. Натяжение изменилось совсем недавно.', signal: 'РАЗНИЦА НАТЯЖЕНИЯ', sector: 'ЛИФТОВАЯ ШАХТА', weight: 5, departments: ['repair'], responseSeconds: 600,
    options: [option('Разгрузить трос', 'Перенести часть усилия на соседние ветви.', Wrench, 1, 2), option('Измерить всю связку', 'Сравнить частоты каждого троса и составить карту натяжения.', Gauge, 0, 4, 'Акустика тросов'), option('Поставить метку', 'Нанести контрольную риску и наблюдать смещение.', Target, 1, 3)],
  },
  {
    id: 'fresh-oil', title: 'След свежего масла', summary: 'На давно закрытом люке блестит свежая капля масла. След уходит к шахте.', signal: 'СЛЕД НЕДАВНЕГО ДОСТУПА', sector: 'СЕРВИСНЫЙ ЛЮК', weight: 4, departments: ['repair'], responseSeconds: 720,
    options: [option('Открыть люк', 'Проверить пространство за панелью прямо сейчас.', Wrench, 0, 3), option('Снять отпечатки инструмента', 'Сначала изучить царапины на крепеже и кромке.', Target, 0, 4, 'Почерк ремонтника'), option('Опломбировать проход', 'Закрыть люк контрольной лентой и ждать нового доступа.', ShieldAlert, 1, 2)],
  },
  {
    id: 'forgotten-key', title: 'Дверь не помнит ключ', summary: 'Сервисная дверь принимает ваш ключ, но сообщает, что такой допуск никогда не выдавался.', signal: 'КОНФЛИКТ ПРАВ ДОСТУПА', sector: 'ШЛЮЗ Ш-47', weight: 3, departments: ['repair'], responseSeconds: 600,
    options: [option('Войти по аварийному контуру', 'Открыть механический замок в обход терминала.', Wrench, 1, 2), option('Сравнить копии реестра', 'Найти момент, когда запись о допуске исчезла.', BookOpen, 0, 4, 'История прав доступа'), option('Запросить новый допуск', 'Оставить дверь закрытой и обратиться к диспетчеру.', Radio, 0, 3)],
  },
  {
    id: 'foreign-bolt', title: 'Болт другой смены', summary: 'В креплении стоит новый болт с клеймом смены, которой нет в списках уже девять лет.', signal: 'НЕСООТВЕТСТВИЕ КЛЕЙМА', sector: 'РЕМОНТНЫЙ ПОСТ 03-В', weight: 3, departments: ['repair'], responseSeconds: 660,
    options: [option('Снять болт', 'Извлечь крепёж и отправить его в Архив.', Wrench, 0, 3), option('Оставить под нагрузкой', 'Проверить, зачем неизвестный ремонт до сих пор держит узел.', Gauge, 1, 3), option('Найти старую смену', 'Поднять закрытые наряды по номеру клейма.', BookOpen, 0, 4, 'Клейма исчезнувших смен')],
  },
  {
    id: 'empty-toolbox', title: 'Пустой ящик', summary: 'Запломбированный аварийный ящик оказывается пустым. Пломба не повреждена.', signal: 'НАРУШЕНИЕ КОМПЛЕКТНОСТИ', sector: 'АВАРИЙНЫЙ ПОСТ', weight: 3, missions: [1, 2], responseSeconds: 600,
    options: [option('Вскрыть соседний комплект', 'Проверить второй ящик и восстановить оснащение поста.', Box, 1, 2), option('Исследовать пломбу', 'Определить, когда и каким способом ящик опустошили.', Target, 0, 4, 'Поддельные пломбы'), option('Собрать свой набор', 'Заменить пропажу инструментами с рабочего места.', Wrench, 1, 3)],
  },
  {
    id: 'lift-call', title: 'Вызов из пустой кабины', summary: 'На панели загорается запрос с грузового лифта. По журналу кабина обесточена и пуста.', signal: 'ВЫЗОВ С ОТКЛЮЧЁННОГО ОБЪЕКТА', sector: 'ЛИФТОВАЯ ЛИНИЯ', weight: 1, missions: [0, 2], responseSeconds: 420,
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
        const workUnits = prev.episodeStartedAt ? Math.min(EPISODE_WORK_UNITS, Math.floor((now - prev.episodeStartedAt) / 60_000) + prev.incidentProgressBonus) : 0
        const assignment = getStoryAssignment(workUnits)
        const incident = chooseIncident(prev, assignment.workPackage.department, assignment.missionIndex)
        return { ...prev, activeIncidentId: incident.id, activeIncidentCreatedAt: now, incidentAvailableAt: null }
      })
    }
  }, [now, state.activeIncidentId, state.incidentAvailableAt])

  useEffect(() => {
    const incident = getIncident(state.activeIncidentId)
    if (incident && state.activeIncidentCreatedAt && now - state.activeIncidentCreatedAt >= incident.responseSeconds * 1000) {
      setState(prev => {
        const current = getIncident(prev.activeIncidentId)
        return current ? resolveIncident(prev, current, current.options[0], now) : prev
      })
    }
  }, [now, state.activeIncidentId, state.activeIncidentCreatedAt])

  const hasActiveShift = Boolean(state.jobId)
  const elapsed = state.jobStartedAt ? Math.max(0, Math.floor((now - state.jobStartedAt) / 1000)) : 0
  const episodeElapsed = state.episodeStartedAt ? Math.max(0, Math.floor((now - state.episodeStartedAt) / 1000)) : 0
  const episodeWorkUnits = hasActiveShift ? Math.min(EPISODE_WORK_UNITS, Math.floor(episodeElapsed / 60) + state.incidentProgressBonus) : 0
  const assignment = getStoryAssignment(episodeWorkUnits)
  const assignmentBaseJob = jobs.find(item => item.id === assignment.workPackage.jobId) ?? jobs[0]
  const assignmentJob: Job = { ...assignmentBaseJob, title: assignment.task, description: assignment.workPackage.purpose, department: assignment.workPackage.department, target: ORDER_WORK_UNITS }
  const job = hasActiveShift ? assignmentJob : null
  const jobProgress = job ? episodeWorkUnits === EPISODE_WORK_UNITS ? job.target : episodeWorkUnits % ORDER_WORK_UNITS : 0
  const operationProgress = Math.round(episodeWorkUnits / EPISODE_WORK_UNITS * 100)

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
    setState(prev => ({ ...prev, name: clean, screen: 'floor' }))
  }

  const beginJob = (selected: Job) => {
    haptic('success')
    const startedAt = Date.now()
    setState(prev => ({
      ...prev,
      department: selected.department,
      jobId: selected.id,
      jobStartedAt: startedAt,
      episodeStartedAt: prev.episodeStartedAt ?? startedAt,
      incidentAvailableAt: prev.incidentAvailableAt ?? scheduleIncidentAt(startedAt, true),
      screen: 'journal',
    }))
  }

  if (state.screen === 'lore') return <LoreIntro continueIntro={() => setState(prev => ({ ...prev, screen: 'briefing' }))} />
  if (state.screen === 'briefing') return <Briefing continueGame={() => setState(prev => ({ ...prev, screen: 'onboarding' }))} />
  if (state.screen === 'onboarding') return <Onboarding name={nameDraft} setName={setNameDraft} submit={createCharacter} />

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
          {state.screen === 'floor' && <Floor state={state} setState={setState} job={job} progress={jobProgress} episodeWorkUnits={episodeWorkUnits} operationProgress={operationProgress} navigate={navigate} />}
          {state.screen === 'jobs' && <Jobs department={state.department} assignmentJob={assignmentJob} activeJob={job} episodeWorkUnits={episodeWorkUnits} beginJob={beginJob} continueJob={() => navigate('journal')} back={() => navigate('floor')} />}
          {state.screen === 'journal' && <Journal state={state} job={job} progress={jobProgress} episodeWorkUnits={episodeWorkUnits} elapsed={elapsed} navigate={navigate} />}
          {state.screen === 'incident' && <Incident state={state} setState={setState} navigate={navigate} remaining={Math.max(0, (getIncident(state.activeIncidentId)?.responseSeconds ?? 0) - Math.floor((now - (state.activeIncidentCreatedAt ?? now)) / 1000))} />}
          {state.screen === 'skills' && <Skills state={state} episodeWorkUnits={episodeWorkUnits} />}
          {state.screen === 'map' && <DepartmentMap state={state} setState={setState} navigate={navigate} />}
          {state.screen === 'terminal' && <NewsTerminal navigate={navigate} openProductionJobs={() => setState(prev => ({ ...prev, department: assignmentJob.department, screen: 'jobs' }))} />}
          {state.screen === 'chronicle' && <Chronicle state={state} job={job} progress={jobProgress} episodeWorkUnits={episodeWorkUnits} operationProgress={operationProgress} navigate={navigate} />}
          {state.screen === 'objectives' && <Objectives state={state} job={job} progress={jobProgress} episodeWorkUnits={episodeWorkUnits} operationProgress={operationProgress} setState={setState} navigate={navigate} />}
        </section>
        <BottomNav current={state.screen} navigate={navigate} />
      </main>
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
        <p className="microcopy"><ShieldAlert size={14} /> Данные персонажа сохраняются только на этом устройстве</p>
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
          <div className="episode-facts"><span><b>03:17:42</b> остановка</span><span><b>3</b> версии отказа</span><span><b>24 ч</b> путь соло</span></div>
        </section>
        <section className="operation-plan">
          <div className="section-kicker">ПЛАН ЭПИЗОДА <span>3 СЮЖЕТНЫЕ МИССИИ · ≈24 ЧАСА</span></div>
          {[
            { num: '01', title: 'Тишина в шахте', dept: 'Найти причину · 8 часов', summary: 'Восстановить повреждённую последовательность событий и понять, что произошло раньше: удар, износ или отключение.', Icon: Wrench },
            { num: '02', title: 'Сердце для лифта', dept: 'Подготовить восстановление · 8 часов', summary: 'Превратить диагноз в металл: изготовить узлы, собрать крепёж и доставить полный комплект к шахте.', Icon: Cog },
            { num: '03', title: 'Первое движение', dept: 'Вернуть лифт в строй · 8 часов', summary: 'Смонтировать привод, вернуть питание и рискнуть первым подъёмом, когда шахта ещё хранит не все ответы.', Icon: Zap },
          ].map(({ num, title, dept, summary, Icon }) => (
            <div className="operation-step" key={num}>
              <span className="step-num">{num}</span><span className="step-icon"><Icon size={22} /></span>
              <div><b>{title}</b><span>{dept}</span><p>{summary}</p></div><span className="step-status">МИССИЯ</span>
            </div>
          ))}
          <div className="collective-goal"><Users size={20} /><div><b>Ваши решения станут частью сюжета</b><span>Конкретные задачи объединяются в этапы и миссии. Дневник сохранит не только сделанное, но и то, каким способом вы прошли через происшествия.</span></div></div>
          <button className="primary-button" onClick={continueGame}>ПОЛУЧИТЬ ПРОПУСК <ArrowRight size={18} /></button>
        </section>
      </div>
      <footer className="briefing-footer"><span>МЕГАЗАВОД // ВНУТРЕННЯЯ СЕТЬ</span><span>СОЛО-ПРОХОЖДЕНИЕ: ОКОЛО 24 ЧАСОВ</span></footer>
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

function CurrentDirective({ state, job, progress, episodeWorkUnits, setState, navigate }: { state: SavedState, job: Job | null, progress: number, episodeWorkUnits: number, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  const activeIncident = getIncident(state.activeIncidentId)
  const urgent = Boolean(job && activeIncident)
  const assignment = getStoryAssignment(episodeWorkUnits)
  const wrongDepartment = Boolean(job && state.department !== job.department)
  const title = !job ? assignment.task : urgent ? 'Примите решение по происшествию' : 'Выполните текущую задачу'
  const description = !job
    ? `${assignment.workPackage.purpose} Начните с рабочего места «${departments[assignment.workPackage.department].short}».`
    : urgent
      ? `${activeIncident?.title}: ${activeIncident?.summary} Решение ограничено по времени.`
      : `${job.title}: выполнено ${progress} из ${job.target}. Эта задача необходима для этапа «${assignment.workPackage.title}» и миссии «${assignment.mission.title}».${wrongDepartment ? ` Рабочее место: «${departments[job.department].short}».` : ''}`
  const action = () => {
    if (!job) setState(prev => ({ ...prev, department: assignment.workPackage.department, screen: 'jobs' }))
    else if (wrongDepartment && !urgent) setState(prev => ({ ...prev, department: job.department, screen: 'jobs' }))
    else navigate(urgent ? 'incident' : 'journal')
  }

  return <section className={`current-directive ${urgent ? 'urgent' : ''}`}>
    <div className="directive-icon">{urgent ? <AlertTriangle /> : <Target />}</div>
    <div className="directive-copy"><span>{urgent ? 'ТРЕБУЕТ РЕШЕНИЯ' : 'ЧТО ДЕЛАТЬ СЕЙЧАС'}</span><h2>{title}</h2><p>{description}</p>{job && !urgent && <ActionProgress job={job} elapsed={state.jobStartedAt ? Math.floor((Date.now() - state.jobStartedAt) / 1000) : 0} compact />}</div>
    <div className="directive-actions"><button className="directive-primary" onClick={action}>{urgent ? 'ПРИНЯТЬ РЕШЕНИЕ' : !job || wrongDepartment ? 'ПЕРЕЙТИ К ЗАДАЧЕ' : 'ОТКРЫТЬ ДНЕВНИК'} <ArrowRight size={16} /></button><button className="directive-secondary" onClick={() => navigate('objectives')}><ListChecks size={15} /> ВЕСЬ ПЛАН</button></div>
  </section>
}

function StoryPassage({ state, episodeWorkUnits }: { state: SavedState, episodeWorkUnits: number }) {
  const complete = episodeWorkUnits >= EPISODE_WORK_UNITS
  const passageIndex = Math.min(narrativePassages.length - 1, Math.floor(episodeWorkUnits / PACKAGE_WORK_UNITS))
  const passage = complete ? episodeEpilogue : narrativePassages[passageIndex]
  const unitsToNextPage = complete ? 0 : PACKAGE_WORK_UNITS - episodeWorkUnits % PACKAGE_WORK_UNITS
  const choiceEcho = state.incidentChoice ? choiceEchoes[state.incidentChoice] : null

  return <aside className={`story-passage ${complete ? 'complete' : ''}`}>
    <div className="story-page-number">{complete ? 'Э' : String(passageIndex + 1).padStart(2, '0')}</div>
    <div className="story-copy"><span>{passage.chapter} · {passage.scene}</span><h2>{passage.title}</h2><p>«{passage.text}»</p>{choiceEcho && <em>{choiceEcho}</em>}</div>
    <div className="story-next"><BookOpen size={17} /><span>{complete ? 'ЭПИЗОД ЗАВЕРШЁН' : `НОВАЯ СТРАНИЦА ЧЕРЕЗ ≈ ${formatLongDuration(unitsToNextPage * 60)}`}</span></div>
  </aside>
}

function Floor({ state, setState, job, progress, episodeWorkUnits, operationProgress, navigate }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, job: Job | null, progress: number, episodeWorkUnits: number, operationProgress: number, navigate: (s: Screen) => void }) {
  const dept = departments[state.department]
  const Icon = dept.icon
  const openObject = (department: Department) => setState(prev => ({ ...prev, department, screen: 'jobs' }))
  return (
    <div className="floor-screen">
      <div className="screen-heading">
        <div><span className="eyebrow"><span /> ЯРУС 47 · СЕКТОР 03</span><h1>{dept.label}</h1><p>{dept.subtitle}</p></div>
        <button className="department-switch" onClick={() => navigate('map')}><Map size={17} /> СМЕНИТЬ ОТСЕК</button>
      </div>
      <CurrentDirective state={state} job={job} progress={progress} episodeWorkUnits={episodeWorkUnits} setState={setState} navigate={navigate} />
      {job && <StoryPassage state={state} episodeWorkUnits={episodeWorkUnits} />}
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
          {job ? <div className="active-task"><span className="live-line"><i /> ВАША РАБОТА</span><b>{job.title}</b><p>{progress} из {job.target} · выполнение продолжается</p><button onClick={() => navigate('journal')}>Открыть дневник <ChevronRight size={16} /></button></div> : <div className="empty-task"><CircleGauge size={24} /><b>Начните первую задачу</b><p>План операции укажет нужное рабочее место и объяснит, зачем эта работа нужна Эпизоду.</p></div>}
          <div className="workers"><span><Users size={16} /> В ОТСЕКЕ</span><div><i>МК</i><i>СП</i><i>АВ</i><b>+4</b></div></div>
        </aside>
      </div>
    </div>
  )
}

function Objectives({ state, job, progress, episodeWorkUnits, operationProgress, setState, navigate }: { state: SavedState, job: Job | null, progress: number, episodeWorkUnits: number, operationProgress: number, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  const activeMissionIndex = Math.min(episodeMissions.length - 1, Math.floor(episodeWorkUnits / MISSION_WORK_UNITS))
  const activePackageIndex = Math.min(3, Math.floor((episodeWorkUnits % MISSION_WORK_UNITS) / PACKAGE_WORK_UNITS))
  const [expandedMission, setExpandedMission] = useState(activeMissionIndex)
  useEffect(() => setExpandedMission(activeMissionIndex), [activeMissionIndex])
  const activeMission = episodeMissions[activeMissionIndex]
  const activePackage = activeMission.packages[activePackageIndex]
  const remainingUnits = Math.max(0, EPISODE_WORK_UNITS - episodeWorkUnits)
  const episodeComplete = episodeWorkUnits >= EPISODE_WORK_UNITS
  const segmentProgress = (start: number, size: number) => Math.max(0, Math.min(100, Math.round((episodeWorkUnits - start) / size * 100)))
  const currentOrder = episodeComplete ? 6 : Math.floor((episodeWorkUnits % PACKAGE_WORK_UNITS) / ORDER_WORK_UNITS) + 1

  const levels = [
    { label: 'МАЛОЕ ЗАДАНИЕ', title: job ? job.title : 'Начать первую задачу', value: job ? Math.round(progress / job.target * 100) : 0, meta: '1 действие в минуту' },
    { label: 'СРЕДНИЙ ЭТАП', title: episodeComplete ? 'Все этапы завершены' : activePackage.title, value: episodeComplete ? 100 : segmentProgress(activeMissionIndex * MISSION_WORK_UNITS + activePackageIndex * PACKAGE_WORK_UNITS, PACKAGE_WORK_UNITS), meta: `${currentOrder} из 6 задач` },
    { label: 'БОЛЬШАЯ МИССИЯ', title: episodeComplete ? episodeMissions[2].title : activeMission.title, value: episodeComplete ? 100 : segmentProgress(activeMissionIndex * MISSION_WORK_UNITS, MISSION_WORK_UNITS), meta: episodeComplete ? '4 из 4 этапов' : `${activePackageIndex + 1} из 4 этапов` },
    { label: 'ЭПИЗОД', title: 'Немой лифт', value: operationProgress, meta: episodeComplete ? 'сюжет завершён' : `осталось ≈ ${formatLongDuration(remainingUnits * 60)}` },
  ]

  return <div className="content-screen objectives-screen">
    <button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> НА ЭТАЖ</button>
    <div className="screen-heading compact"><div><span className="eyebrow"><span /> ЭПИЗОД 01 · 24 ЧАСА СОЛО</span><h1>План операции</h1><p>Минута работы закрывает действие. 20 действий решают конкретную задачу, 6 задач завершают этап, 4 этапа — сюжетную миссию.</p></div><div className="objective-total"><span>{episodeComplete ? 'ЭПИЗОД ЗАВЕРШЁН' : 'ОБЩИЙ ПРОГРЕСС'}</span><b>{operationProgress}%</b><div><i style={{ width: `${operationProgress}%` }} /></div></div></div>

    <CurrentDirective state={state} job={job} progress={progress} episodeWorkUnits={episodeWorkUnits} setState={setState} navigate={navigate} />
    {job && <StoryPassage state={state} episodeWorkUnits={episodeWorkUnits} />}

    <section className="progress-hierarchy">
      {levels.map((level, index) => <article key={level.label} className={index === 3 && episodeComplete ? 'complete' : ''}><span>{String(index + 1).padStart(2, '0')}</span><div><small>{level.label}</small><b>{level.title}</b><em>{level.meta}</em><div><i style={{ width: `${level.value}%` }} /></div></div><strong>{level.value}%</strong></article>)}
    </section>

    <div className="mission-tree">
      {episodeMissions.map((mission, missionIndex) => {
        const missionStart = missionIndex * MISSION_WORK_UNITS
        const missionProgress = segmentProgress(missionStart, MISSION_WORK_UNITS)
        const status = missionProgress >= 100 ? 'done' : episodeWorkUnits >= missionStart && episodeWorkUnits < missionStart + MISSION_WORK_UNITS && job ? 'active' : 'locked'
        const expanded = expandedMission === missionIndex
        return <section className={`mission-card ${status}`} key={mission.code}>
          <button className="mission-header" onClick={() => setExpandedMission(expanded ? -1 : missionIndex)} aria-expanded={expanded}>
            <span className="mission-code">{status === 'done' ? <Check size={18} /> : mission.code}</span>
            <span><small>{status === 'done' ? 'МИССИЯ ЗАВЕРШЕНА' : status === 'active' ? 'ТЕКУЩАЯ МИССИЯ' : 'ОТКРОЕТСЯ ПОСЛЕ ПРЕДЫДУЩЕЙ'}</small><b>{mission.title}</b><em>{mission.story}</em></span>
            <strong>{missionProgress}%</strong><ChevronRight size={19} />
          </button>
          {expanded && <div className="package-list">{mission.packages.map((workPackage, packageIndex) => {
            const packageStart = missionStart + packageIndex * PACKAGE_WORK_UNITS
            const packageProgress = segmentProgress(packageStart, PACKAGE_WORK_UNITS)
            const packageStatus = packageProgress >= 100 ? 'done' : packageProgress > 0 || (episodeWorkUnits === packageStart && job) ? 'active' : 'locked'
            return <article className={`package-card ${packageStatus}`} key={workPackage.title}>
              <div className="package-heading"><span>{packageStatus === 'done' ? <Check size={15} /> : `${missionIndex + 1}.${packageIndex + 1}`}</span><div><small>{departments[workPackage.department].label.toUpperCase()} · ЭТАП ≈2 ЧАСА</small><b>{workPackage.title}</b></div><strong>{packageProgress}%</strong></div>
              <p className="package-purpose">{workPackage.purpose}</p>
              <div className="order-chain">{Array.from({ length: 6 }, (_, orderIndex) => {
                const orderStart = packageStart + orderIndex * ORDER_WORK_UNITS
                const orderStatus = episodeWorkUnits >= orderStart + ORDER_WORK_UNITS ? 'done' : episodeWorkUnits >= orderStart && episodeWorkUnits < orderStart + ORDER_WORK_UNITS && job ? 'active' : 'locked'
                return <span className={orderStatus} key={orderIndex} title={workPackage.tasks[orderIndex]}>{orderStatus === 'done' ? <Check size={12} /> : String(orderIndex + 1).padStart(2, '0')}</span>
              })}</div>
              <ol className="story-task-list">{workPackage.tasks.map((task, orderIndex) => {
                const orderStart = packageStart + orderIndex * ORDER_WORK_UNITS
                const orderStatus = episodeWorkUnits >= orderStart + ORDER_WORK_UNITS ? 'done' : episodeWorkUnits >= orderStart && episodeWorkUnits < orderStart + ORDER_WORK_UNITS && job ? 'active' : 'locked'
                return <li className={orderStatus} key={task}><span>{orderStatus === 'done' ? <Check size={12} /> : String(orderIndex + 1).padStart(2, '0')}</span>{task}</li>
              })}</ol>
              <div className="package-progress"><i style={{ width: `${packageProgress}%` }} /></div>
            </article>
          })}</div>}
        </section>
      })}
    </div>

    {episodeComplete && <section className="episode-finale"><Check size={34} /><div><span>ЭПИЗОД 01 ЗАКРЫТ</span><h2>Грузовой лифт снова работает</h2><p>Ярус 47 восстановил снабжение верхних секторов. Ваши решения и освоенные знания сохранены в летописи.</p></div><button onClick={() => navigate('chronicle')}>ОТКРЫТЬ ЛЕТОПИСЬ <ChevronRight size={17} /></button></section>}

    <aside className="objective-hint"><Info size={19} /><div><b>Прогресс продолжается после выхода.</b><p>Смена экрана или рабочего места не сбрасывает задачу, этап, миссию и Эпизод. Полное одиночное прохождение занимает около 24 часов активной смены.</p></div></aside>
  </div>
}

function Jobs({ department, assignmentJob, activeJob, episodeWorkUnits, beginJob, continueJob, back }: { department: Department, assignmentJob: Job, activeJob: Job | null, episodeWorkUnits: number, beginJob: (j: Job) => void, continueJob: () => void, back: () => void }) {
  const [filter, setFilter] = useState<'available' | 'active' | 'completed'>('available')
  const assignment = getStoryAssignment(episodeWorkUnits)
  const available = assignmentJob.department === department && !assignment.complete ? [assignmentJob] : []
  const active = activeJob?.department === department ? [activeJob] : []
  const visibleJobs = filter === 'available' ? available : filter === 'active' ? active : []
  const completedCount = Math.floor(episodeWorkUnits / ORDER_WORK_UNITS)
  const taskProgress = assignment.complete ? 100 : Math.round((episodeWorkUnits % ORDER_WORK_UNITS) / ORDER_WORK_UNITS * 100)
  return (
    <div className="content-screen jobs-screen">
      <button className="back-button" onClick={back}><ArrowLeft size={17} /> НАЗАД НА ЭТАЖ</button>
      <div className="screen-heading compact"><div><span className="eyebrow"><span /> {departments[department].label.toUpperCase()} · СЮЖЕТНАЯ ЗАДАЧА</span><h1>Рабочее место</h1><p>Здесь появляется только работа, необходимая текущему этапу операции.</p></div><div className="station-badge">{department === 'mechanics' ? <Cog size={40} /> : department === 'power' ? <Zap size={40} /> : <Wrench size={40} />}<span><b>{departments[department].short}</b><small>ОБОРУДОВАНИЕ ИСПРАВНО</small></span></div></div>
      <div className="job-filter" role="tablist" aria-label="Фильтр задач">
        <button className={filter === 'available' ? 'active' : ''} onClick={() => setFilter('available')} role="tab" aria-selected={filter === 'available'}>ДОСТУПНЫЕ <span>{available.length}</span></button>
        <button className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')} role="tab" aria-selected={filter === 'active'}>В РАБОТЕ <span>{active.length}</span></button>
        <button className={filter === 'completed' ? 'active' : ''} onClick={() => setFilter('completed')} role="tab" aria-selected={filter === 'completed'}>ЗАВЕРШЕНЫ <span>{completedCount}</span></button>
      </div>
      <div className="job-grid">
        {visibleJobs.map(item => {
          const isActive = Boolean(activeJob && activeJob.title === item.title)
          return <article className={`job-card story-job ${isActive ? 'selected' : ''}`} key={item.title}>
            <div className="job-icon">{item.icon === 'power' ? <Zap /> : item.icon === 'repair' ? <Wrench /> : <Cog />}</div>
            <div className="job-copy"><span className="job-code">ЗАДАЧА {assignment.missionIndex + 1}.{assignment.packageIndex + 1}.{assignment.taskIndex + 1}</span><h3>{item.title}</h3><p>{item.description}</p><div className="job-chain"><span>НУЖНА ДЛЯ</span><b>{assignment.workPackage.title}</b><i /><b>{assignment.mission.title}</b><i /><b>Цель Эпизода: запустить лифт</b></div><div className="job-meta"><span><Clock3 size={14} /> ≈20 минут</span><span><Sparkles size={14} /> +20 XP</span></div></div>
            <div className="job-progress-mini"><span>{isActive ? 'ТЕКУЩАЯ ЗАДАЧА' : 'НЕОБХОДИМА ДЛЯ ПРОДОЛЖЕНИЯ СЮЖЕТА'}</span><div><i style={{ width: isActive ? `${taskProgress}%` : '0%' }} /></div></div>
            <button onClick={() => isActive ? continueJob() : beginJob(item)}>{isActive ? 'ПРОДОЛЖИТЬ ЗАДАЧУ' : 'НАЧАТЬ ЗАДАЧУ'} <ChevronRight size={17} /></button>
          </article>
        })}
        {filter === 'completed' && <div className="job-list-empty"><Check size={30} /><h3>Завершено задач: {completedCount}</h3><p>Каждые шесть задач закрывают производственный этап. Подробная цепочка сохранена в плане операции.</p></div>}
        {filter !== 'completed' && visibleJobs.length === 0 && <div className="job-list-empty"><CircleGauge size={30} /><h3>{assignment.complete ? 'Эпизод завершён' : `Задача находится в отсеке «${departments[assignmentJob.department].label}»`}</h3><p>{assignment.complete ? 'Все задачи выполнены. Итог операции записан в летописи.' : `Для этапа «${assignment.workPackage.title}» сейчас необходимо: «${assignment.task}». Перейдите к нужному рабочему месту на этаже.`}</p></div>}
      </div>
      <div className="job-note"><Info size={18} /><span><b>Задачи открываются последовательно.</b> Выполненная работа закрывает текущий этап, открывает следующий и двигает сюжет Эпизода.</span></div>
    </div>
  )
}

function Journal({ state, job, progress, episodeWorkUnits, elapsed, navigate }: { state: SavedState, job: Job | null, progress: number, episodeWorkUnits: number, elapsed: number, navigate: (s: Screen) => void }) {
  const time = (timestamp: number | null) => new Date(timestamp ?? Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const completedCycles = Math.min(EPISODE_WORK_UNITS, Math.floor(elapsed / 60))
  type JournalEntry =
    | { kind: 'start', timestamp: number, order: number }
    | { kind: 'cycle', timestamp: number, order: number, cycle: number }
    | { kind: 'task', timestamp: number, order: number, taskNumber: number }
    | { kind: 'incident', timestamp: number, order: number, eventId: string, active: boolean }
    | { kind: 'resolution', timestamp: number, order: number, record: IncidentRecord }
  const entries: JournalEntry[] = []
  if (job && state.jobStartedAt) {
    entries.push({ kind: 'start', timestamp: state.jobStartedAt, order: 0 })
    const firstVisibleCycle = Math.max(0, completedCycles - 20)
    for (let cycle = firstVisibleCycle; cycle < completedCycles; cycle += 1) {
      entries.push({ kind: 'cycle', timestamp: state.jobStartedAt + (cycle + 1) * 60_000, order: 1, cycle })
    }
  }
  if (state.episodeStartedAt) {
    const completedTasks = Math.min(72, Math.floor(episodeWorkUnits / ORDER_WORK_UNITS))
    for (let taskNumber = 0; taskNumber < completedTasks; taskNumber += 1) {
      entries.push({ kind: 'task', timestamp: state.episodeStartedAt + (taskNumber + 1) * ORDER_WORK_UNITS * 60_000, order: 2, taskNumber })
    }
  }
  state.incidentHistory.forEach(record => {
    entries.push({ kind: 'incident', timestamp: record.createdAt, order: 3, eventId: record.eventId, active: false })
    entries.push({ kind: 'resolution', timestamp: record.resolvedAt, order: 4, record })
  })
  if (state.activeIncidentId && state.activeIncidentCreatedAt) entries.push({ kind: 'incident', timestamp: state.activeIncidentCreatedAt, order: 3, eventId: state.activeIncidentId, active: true })
  entries.sort((a, b) => a.timestamp - b.timestamp || a.order - b.order)

  return (
    <div className="content-screen journal-screen">
      <div className="screen-heading compact"><div><span className="eyebrow"><span /> ЛИЧНЫЙ ЖУРНАЛ · {state.name.toUpperCase()}</span><h1>Рабочий дневник</h1><p>Записи смены идут от ранних событий к поздним.</p></div>{job && <div className="working-now"><span><i /> РАБОТА ИДЁТ</span><b>{job.title}</b><small>{progress} / {job.target} · {formatDuration(elapsed)}</small></div>}</div>
      {job && <ActionProgress job={job} elapsed={elapsed} />}
      <div className="journal-layout">
        <div className="timeline">
          {!job && <div className="journal-empty"><BookOpen size={28} /><h3>История ещё не началась</h3><p>Откройте план и начните первую конкретную задачу. Здесь будут появляться её результат и связь со следующими этапами.</p><button onClick={() => navigate('objectives')}>ОТКРЫТЬ ПЛАН ОПЕРАЦИИ <ChevronRight size={16} /></button></div>}
          {job && entries.map(entry => {
            if (entry.kind === 'start') {
              const firstAssignment = getStoryAssignment(0)
              return <div className="timeline-event" key={`start-${entry.timestamp}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot" /><div><span className="entry-type">НАЧАЛО ЭПИЗОДА</span><p>Я начал задачу «{firstAssignment.task}». Она нужна для этапа «{firstAssignment.workPackage.title}» и миссии «{firstAssignment.mission.title}».</p></div></div>
            }
            if (entry.kind === 'cycle') {
              const action = getWorkAction(job, entry.cycle)
              return <div className="timeline-event" key={`cycle-${entry.cycle}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot" /><div><span className="entry-type">РАБОЧИЙ ЦИКЛ {String(entry.cycle + 1).padStart(2, '0')}</span><p>{action.completed}</p><small>+1 XP · +1 к прогрессу задачи</small></div></div>
            }
            if (entry.kind === 'task') {
              const completedAssignment = getStoryAssignment(entry.taskNumber * ORDER_WORK_UNITS)
              return <div className="timeline-event task-complete-entry" key={`task-${entry.taskNumber}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot success" /><div><span className="entry-type">ЗАДАЧА {completedAssignment.missionIndex + 1}.{completedAssignment.packageIndex + 1}.{completedAssignment.taskIndex + 1} ЗАВЕРШЕНА</span><h3>{completedAssignment.task}</h3><p>Результат передан в этап «{completedAssignment.workPackage.title}», необходимый для миссии «{completedAssignment.mission.title}».</p></div></div>
            }
            if (entry.kind === 'incident') {
              const incident = getIncident(entry.eventId)
              if (entry.active) return <button className="timeline-event incident-entry" key={`incident-${entry.timestamp}`} onClick={() => navigate('incident')}><time>{time(entry.timestamp)}</time><span className="timeline-dot danger" /><div><span className="entry-type">АКТИВНОЕ ПРОИСШЕСТВИЕ</span><h3>{incident?.title}</h3><p>{incident?.summary}</p><b>ПРИНЯТЬ РЕШЕНИЕ <ChevronRight size={15} /></b></div></button>
              return <div className="timeline-event incident-entry" key={`incident-${entry.timestamp}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot danger" /><div><span className="entry-type">ПРОИСШЕСТВИЕ · {incident?.sector}</span><h3>{incident?.title}</h3><p>{incident?.summary}</p></div></div>
            }
            const incident = getIncident(entry.record.eventId)
            return <div className="timeline-event resolved-entry" key={`resolution-${entry.timestamp}-${entry.record.eventId}`}><time>{time(entry.timestamp)}</time><span className="timeline-dot success" /><div><span className="entry-type">РЕШЕНИЕ ЗАФИКСИРОВАНО · {incident?.title}</span><h3>{entry.record.choice}</h3><p>Выбор внесён в личную историю. Его значение может проявиться на следующих страницах Эпизода.</p></div></div>
          })}
        </div>
        <aside className="shift-summary"><span className="rail-label">СВОДКА СМЕНЫ</span><div className="summary-number"><b>{progress}</b><span>ЕДИНИЦ<br />ПРОИЗВЕДЕНО</span></div><div className="summary-stats"><p><span>Опыт</span><b>+{Math.floor(elapsed / 60) + state.incidentXpBonus} XP</b></p><p><span>Время</span><b>{formatDuration(elapsed)}</b></p><p><span>Происшествия</span><b>{state.incidentHistory.length + (state.activeIncidentId ? 1 : 0)}</b></p></div><button onClick={() => navigate('floor')}>ВЕРНУТЬСЯ НА ЭТАЖ</button></aside>
      </div>
    </div>
  )
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
      <p className="fallback-note"><Info size={15} /> Если время истечёт, система автоматически выберет «{incident.options[0].title}».</p>
    </div>
  )
}

function Skills({ state, episodeWorkUnits }: { state: SavedState, episodeWorkUnits: number }) {
  const xpFor = (department: Department) => {
    let total = department === 'repair' ? state.incidentXpBonus : 0
    episodeMissions.forEach((mission, missionIndex) => mission.packages.forEach((workPackage, packageIndex) => {
      if (workPackage.department !== department) return
      const start = missionIndex * MISSION_WORK_UNITS + packageIndex * PACKAGE_WORK_UNITS
      total += Math.max(0, Math.min(PACKAGE_WORK_UNITS, episodeWorkUnits - start))
    }))
    return total
  }
  const makeSkill = (name: string, totalXp: number, icon: typeof Cog, color: string, note: string) => ({ name, level: Math.floor(totalXp / 60) + 1, xp: totalXp % 60, max: 60, icon, color, note })
  const skillData = [
    makeSkill('Механическая обработка', xpFor('mechanics'), Cog, 'orange', 'Точные детали, подшипники, крепёж'),
    makeSkill('Энергетика', xpFor('power'), Zap, 'yellow', 'Силовые линии и накопители'),
    makeSkill('Ремонт', xpFor('repair'), Wrench, 'blue', 'Диагностика и восстановление'),
  ]
  return <div className="content-screen skills-screen"><div className="screen-heading compact"><div><span className="eyebrow"><span /> ПРОФИЛЬ РАБОТНИКА</span><h1>Навыки</h1><p>{state.name} · прогресс текущего Эпизода</p></div><div className="episode-reset"><Info size={18} /><span><b>Прогресс Эпизода</b><small>Сохранится до следующего Эпизода</small></span></div></div><div className="skill-grid">{skillData.map(({ name, level, xp, max, icon: Icon, color, note }) => <article className="skill-card" key={name}><div className={`skill-symbol ${color}`}><Icon /></div><div className="skill-main"><span className="skill-level">УРОВЕНЬ {level}</span><h3>{name}</h3><p>{note}</p><div className="skill-bar"><i style={{ width: `${Math.min(100, xp / max * 100)}%` }} /></div><small>{xp} / {max} XP до следующего уровня</small></div></article>)}</div><section className="knowledge"><div className="section-kicker">ОСОБЫЕ ЗНАНИЯ <span>{state.incidentKnowledge.length ? `${state.incidentKnowledge.length} ОТКРЫТО` : 'ПОКА НЕТ'}</span></div>{state.incidentKnowledge.length ? <div className="knowledge-grid">{state.incidentKnowledge.map((knowledge, index) => <article key={knowledge}><Sparkles /><div><b>{knowledge}</b><p>Открыто решением во время происшествия.</p><span>ЛИЧНАЯ ЗАПИСЬ {String(index + 1).padStart(2, '0')}</span></div></article>)}</div> : <div className="knowledge-empty"><Sparkles /><p>Особые знания открываются некоторыми решениями во время происшествий.</p></div>}</section></div>
}

function DepartmentMap({ state, setState, navigate }: { state: SavedState, setState: React.Dispatch<React.SetStateAction<SavedState>>, navigate: (s: Screen) => void }) {
  return <div className="content-screen map-screen"><div className="screen-heading compact"><div><span className="eyebrow"><span /> ГРУЗОВОЙ ЛИФТ · ЯРУС 47</span><h1>Выбор отсека</h1><p>Каждая сюжетная задача указывает нужный отсек. Результат сохраняется при переходе.</p></div></div><div className="department-grid">{(Object.keys(departments) as Department[]).map(key => { const item = departments[key]; const Icon = item.icon; return <button key={key} className={state.department === key ? 'active' : ''} onClick={() => setState(prev => ({ ...prev, department: key, screen: 'floor' }))}><div className={`department-illustration ${key}`}><Icon /><span className="floor-lines" /></div><div><span>СЕКТОР {key === 'mechanics' ? '03-А' : key === 'power' ? '03-Б' : '03-В'}</span><h2>{item.label}</h2><p>{item.subtitle}</p><small>{key === 'mechanics' ? '7 работников · производственная линия' : key === 'power' ? '4 работника · силовой контур' : '5 работников · ремонтный пост'}</small></div><ChevronRight /></button>})}</div><button className="back-button centered" onClick={() => navigate('floor')}><ArrowLeft size={17} /> ОСТАТЬСЯ В ТЕКУЩЕМ ОТСЕКЕ</button></div>
}

function NewsTerminal({ navigate, openProductionJobs }: { navigate: (s: Screen) => void, openProductionJobs: () => void }) {
  const chronologicalNews = [...news].sort((a, b) => a.time.localeCompare(b.time))
  return <div className="content-screen terminal-page"><button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> К СХЕМЕ ЭТАЖА</button><div className="screen-heading compact"><div><span className="eyebrow"><span /> ИНФО-ТЕРМИНАЛ · ЯРУС 47</span><h1>Новости яруса</h1><p>Запросы отсеков и подтверждённые изменения операции — от ранних к поздним.</p></div><div className="terminal-live"><i /> СЕТЬ АКТИВНА</div></div><div className="news-list">{chronologicalNews.map(item => <article className={item.critical ? 'critical' : ''} key={item.time}><time>{item.time}</time><div className="news-line"><span>{item.category}</span><i /></div><div><h3>{item.title}</h3><p>{item.body}</p>{item.critical && <button onClick={openProductionJobs}>ПЕРЕЙТИ К ТЕКУЩЕЙ ЗАДАЧЕ <ChevronRight size={15} /></button>}</div></article>)}</div><div className="terminal-footer"><Radio size={17} /> ПОКАЗАНЫ СООБЩЕНИЯ ТЕКУЩЕГО ЭПИЗОДА</div></div>
}

function Chronicle({ state, job, progress, episodeWorkUnits, operationProgress, navigate }: { state: SavedState, job: Job | null, progress: number, episodeWorkUnits: number, operationProgress: number, navigate: (s: Screen) => void }) {
  const [tab, setTab] = useState<'episode' | 'personal' | 'participants'>('episode')
  const chronicleTime = (workUnits: number) => new Date((state.episodeStartedAt ?? Date.now()) + workUnits * 60_000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const storyEvents = [
    { threshold: 0, title: 'Операция началась', text: 'Начата первая задача. Ярус 47 приступил к восстановлению лифта.', icon: Target },
    { threshold: MISSION_WORK_UNITS, title: 'Причина остановки найдена', text: episodeMissions[0].story, icon: Wrench },
    { threshold: MISSION_WORK_UNITS * 2, title: 'Восстановление подготовлено', text: episodeMissions[1].story, icon: Cog },
    { threshold: EPISODE_WORK_UNITS, title: 'Грузовой лифт запущен', text: episodeMissions[2].story, icon: Zap },
  ].filter(event => job && episodeWorkUnits >= event.threshold)
  const participants = [
    { name: state.name, department: job ? departments[job.department].label : 'Без назначения', contribution: progress, self: true },
    { name: 'Марина К.', department: 'Инженерия', contribution: 6 },
    { name: 'Сергей П.', department: 'Энергетика', contribution: 4 },
    { name: 'Алексей В.', department: 'Производство', contribution: 3 },
  ]

  return <div className="content-screen chronicle-screen">
    <button className="back-button" onClick={() => navigate('floor')}><ArrowLeft size={17} /> НАЗАД</button>
    <div className="chronicle-hero"><span className="eyebrow"><span /> ЛЕТОПИСЬ · ЭПИЗОД 01</span><h1>Немой лифт</h1><p>{episodeWorkUnits >= EPISODE_WORK_UNITS ? 'Грузовой лифт снова работает. Снабжение верхних секторов восстановлено, Эпизод 01 завершён.' : 'Летопись пополняется после каждой большой миссии и фиксирует изменения сюжета.'}</p><div className="chronicle-status"><i /> {episodeWorkUnits >= EPISODE_WORK_UNITS ? 'ЭПИЗОД ЗАВЕРШЁН' : `ОПЕРАЦИЯ В ПРОЦЕССЕ · ${operationProgress}%`}</div></div>
    <div className="chronicle-tabs" role="tablist" aria-label="Разделы летописи">
      <button className={tab === 'episode' ? 'active' : ''} onClick={() => setTab('episode')} role="tab" aria-selected={tab === 'episode'}>ЭПИЗОД</button>
      <button className={tab === 'personal' ? 'active' : ''} onClick={() => setTab('personal')} role="tab" aria-selected={tab === 'personal'}>ЛИЧНАЯ ИСТОРИЯ</button>
      <button className={tab === 'participants' ? 'active' : ''} onClick={() => setTab('participants')} role="tab" aria-selected={tab === 'participants'}>УЧАСТНИКИ <span>{participants.length}</span></button>
    </div>
    {tab === 'episode' && <div className="chronicle-layout"><section><div className="section-kicker">СЮЖЕТНЫЕ СОБЫТИЯ · ОТ РАННИХ К ПОЗДНИМ</div>{storyEvents.length > 0 ? <div className="chronicle-events">{storyEvents.map(({ threshold, title, text, icon: Icon }) => <p key={threshold}><time>{chronicleTime(threshold)}</time><Icon /><span><b>{title}</b>{text}</span></p>)}</div> : <div className="chronicle-empty"><BookOpen /><p>Летопись начнётся после первой выполненной задачи.</p></div>}</section><aside className="personal-contribution"><span className="rail-label">ВАШ ВКЛАД</span><div className="contribution-avatar">{state.name.slice(0, 1).toUpperCase()}</div><h3>{state.name}</h3><p>{job ? `Выполняет задачу «${job.title}» ради этапа «${getStoryAssignment(episodeWorkUnits).workPackage.title}».` : 'История ещё не началась. Первая запись появится после начала задачи.'}</p><div><span><b>{episodeWorkUnits}</b> действий</span><span><b>{state.incidentHistory.length}</b> решений</span><span><b>{Math.min(3, Math.floor(episodeWorkUnits / MISSION_WORK_UNITS))}</b> миссий</span></div></aside></div>}
    {tab === 'personal' && <section className="personal-story-panel"><span className="rail-label">ЛИЧНАЯ ИСТОРИЯ</span><div className="contribution-avatar">{state.name.slice(0, 1).toUpperCase()}</div><div><h2>{state.name}</h2><p>{job ? `Текущая задача: «${job.title}». Её результат нужен этапу «${getStoryAssignment(episodeWorkUnits).workPackage.title}» и миссии «${getStoryAssignment(episodeWorkUnits).mission.title}».` : 'История ещё не началась. Откройте план и начните первую задачу.'}</p><div className="personal-story-stats"><span><b>{progress}</b> выполнено</span><span><b>{state.incidentHistory.length}</b> решений</span><span><b>{job ? 'В работе' : 'Ожидает'}</b> статус</span></div></div></section>}
    {tab === 'participants' && <section className="participants-panel"><div className="section-kicker">УЧАСТНИКИ ОПЕРАЦИИ <span>{participants.length}</span></div><div className="participants-grid">{participants.map(participant => <article key={participant.name} className={participant.self ? 'self' : ''}><div>{participant.name.slice(0, 1).toUpperCase()}</div><span><b>{participant.name} {participant.self && <em>ВЫ</em>}</b><small>{participant.department}</small></span><strong>{participant.contribution}</strong></article>)}</div></section>}
  </div>
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

function formatLongDuration(seconds: number) {
  const totalMinutes = Math.ceil(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours} ч ${minutes} мин` : `${minutes} мин`
}

export default App
