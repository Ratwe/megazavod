export type Department = 'mechanics' | 'power' | 'repair'
export type FactCertainty = 'confirmed' | 'hypothesis' | 'refuted'
export type StorySignificance = 'routine' | 'report' | 'chapter' | 'turning_point' | 'finale'
export type EpisodePhase = 'investigation' | 'council' | 'branch' | 'complete'

export type StoryCondition =
  | { fact: string }
  | { completed: string }
  | { phase: EpisodePhase }
  | { councilResult: string }
  | { all: StoryCondition[] }
  | { any: StoryCondition[] }
  | { not: StoryCondition }

export type WorkDefinition = {
  id: string
  location: string
  department: Department
  title: string
  description: string
  nearestResult: string
  skill: { id: Department, level: number }
  visibility: StoryCondition
  requiredProgress: number
  facts: { id: string, certainty: FactCertainty, title: string, text: string }[]
  effects: Record<string, string | number | boolean>
  significance: StorySignificance
  chronicle?: { title: string, lead: string, body: string, illustrationId?: string }
}

export type PublicFact = {
  id: string
  certainty: FactCertainty
  title: string
  text: string
  sourceWorkId: string
  discoveredAt: string
}

export type WorkView = Pick<WorkDefinition, 'id' | 'location' | 'department' | 'title' | 'description' | 'nearestResult' | 'skill' | 'requiredProgress' | 'significance'> & {
  status: 'available' | 'active' | 'completed' | 'locked_skill'
  progress: number
  playerContribution: number
}

export type ChronicleEntry = {
  id: string
  sequence: number
  type: 'opening' | 'report' | 'chapter' | 'council' | 'turning_point' | 'finale'
  significance: StorySignificance
  title: string
  lead: string
  body: string
  sourceEventIds: string[]
  factIds: string[]
  illustrationIds: string[]
  contributors: { id: string, name: string }[]
  publishedAt: string
}

export type CouncilOption = {
  id: string
  title: string
  argument: string
}

export type CouncilView = {
  id: string
  status: 'open' | 'closed'
  question: string
  context: string
  openedAt: string
  closesAt: string
  options: CouncilOption[]
  ownOptionId: string | null
  resultOptionId: string | null
  defaultOptionId: string
  totalBallots?: number
}

export type EpisodeSnapshot = {
  id: string
  status: 'active' | 'complete'
  phase: EpisodePhase
  goal: string
  goalDetail: string
  liftState: string
  publicFacts: PublicFact[]
  completedWorkIds: string[]
  latestChronicle: ChronicleEntry | null
  council: CouncilView | null
  ending: string | null
  version: number
  mode: 'shared' | 'local-demo' | 'offline-cache'
  serverTime: string
}

export type PlayerView = {
  id: string
  displayName: string
  skills: Record<Department, { xp: number, level: number }>
  currentLocation: string
  activeWorkId: string | null
  lastSeenChronicleSequence: number
  contributions: { workId: string, amount: number, xp: number }[]
}

export type RecapView = {
  previous: ChronicleEntry[]
  whileAway: ChronicleEntry[]
  now: { goal: string, goalDetail: string, works: WorkView[], council: CouncilView | null }
  latestSequence: number
}

export type StoryContext = {
  phase: EpisodePhase
  facts: Set<string>
  completed: Set<string>
  councilResult: string | null
}

export const openingEntry = {
  id: 'chapter-opening',
  type: 'opening' as const,
  significance: 'chapter' as const,
  title: 'Лифт перестал отвечать',
  lead: 'В 03:17 грузовой лифт замер между ярусами, оставив верхние сектора без снабжения.',
  body: 'Сначала остановку приняли за обычную поломку привода. Но автоматика отметила удар в шахте, всплеск нагрузки и ручное отключение линии почти в одну минуту. Диспетчер не отвечает, часть телеметрии повреждена, а запасов наверху хватит ненадолго. Заводу нужны отдельные, независимо подтверждённые ответы: что произошло с механизмом, почему исчезло питание и безопасно ли вообще возвращать кабину в движение.',
  illustrationIds: ['lift-silent'],
}

const visibleIn = (...phases: EpisodePhase[]): StoryCondition => ({ any: phases.map(phase => ({ phase })) })

export const workDefinitions: WorkDefinition[] = [
  {
    id: 'drive-diagnostics', location: 'shaft-gallery', department: 'repair', title: 'Выслушать молчащий привод',
    description: 'Снять температуру, люфт и акустический профиль привода, не пытаясь его запускать.', nearestResult: 'Технический диагноз привода', skill: { id: 'repair', level: 1 }, visibility: { phase: 'investigation' }, requiredProgress: 20,
    facts: [{ id: 'drive_worn', certainty: 'confirmed', title: 'Привод предельно изношен', text: 'Износ опорного узла мог вызвать остановку под нагрузкой, но сам по себе не объясняет ручное отключение линии.' }], effects: { driveCondition: 'worn' }, significance: 'report',
    chronicle: { title: 'Сердце, которое устало раньше срока', lead: 'Диагностика подтвердила опасный износ привода, но оставила главный вопрос открытым.', body: 'Сервисная площадка вернула первые надёжные показания. Опорный узел перегрет, подшипник имеет критический люфт, а на валу остался след недавней перегрузки. Такой привод нельзя запускать без ремонта. Однако временная последовательность не сходится: защиту отключили вручную уже после удара в шахте. Поломка реальна, но она не объясняет всю остановку. Доклад автоматически опубликован для всех рабочих мест, чтобы энергетики могли сопоставить его со своими журналами.', illustrationId: 'drive-diagnostics' },
  },
  {
    id: 'power-audit', location: 'switchboard-room', department: 'power', title: 'Прочитать память погасшей линии',
    description: 'Снять сырой журнал щита и восстановить порядок срабатывания защиты.', nearestResult: 'Подтверждение причины отключения питания', skill: { id: 'power', level: 1 }, visibility: { phase: 'investigation' }, requiredProgress: 20,
    facts: [{ id: 'manual_cutoff', certainty: 'confirmed', title: 'Линию отключили вручную', text: 'Команда пришла с сервисного контура после удара. Личность оператора и мотив неизвестны.' }], effects: { powerLine: 'manual_cutoff' }, significance: 'report',
    chronicle: { title: 'Команда, которой не должно быть', lead: 'Силовой щит сохранил ручную команду отключения, пришедшую после удара в шахте.', body: 'Сырые журналы пережили очистку телеметрии. Они показывают: автоматика не обесточивала лифт самостоятельно. Через двенадцать секунд после удара сервисный контур отправил правильную, авторизованную команду ручного отключения. Это подтверждает вмешательство, но пока не доказывает умысел или саботаж: оператор мог предотвращать более тяжёлую аварию. Источник команды скрыт повреждённой записью доступа.', illustrationId: 'power-lock' },
  },
  {
    id: 'inspect-impact', location: 'shaft-gallery', department: 'repair', title: 'Найти место первого удара',
    description: 'Осмотреть направляющие и ловители ниже кабины, сохранив следы до ремонта.', nearestResult: 'Карта механических повреждений', skill: { id: 'repair', level: 1 }, visibility: { any: [{ fact: 'drive_worn' }, { fact: 'manual_cutoff' }] }, requiredProgress: 16,
    facts: [{ id: 'impact_below_cabin', certainty: 'confirmed', title: 'Удар пришёл снизу кабины', text: 'На нижней направляющей найден свежий след, не совпадающий с разрушением привода.' }], effects: { shaftAccess: 'mapped' }, significance: 'report',
    chronicle: { title: 'Шрам ниже кабины', lead: 'След на направляющей отделил удар в шахте от последующей поломки привода.', body: 'Осмотр нижнего пролёта обнаружил свежую деформацию на направляющей. Металл смят снизу вверх, словно кабина встретила препятствие, которого не было на схеме. Изношенный привод принял удар и начал разрушаться уже после контакта. Находка не называет виновника и не объясняет природу препятствия, но меняет порядок событий: сначала произошло столкновение, затем ручное отключение, и только потом остановился механизм.', illustrationId: 'shaft-mark' },
  },
  {
    id: 'recover-access-log', location: 'relay-room', department: 'power', title: 'Вернуть стёртый позывной',
    description: 'Сопоставить резервные копии доступа и восстановить повреждённую строку журнала.', nearestResult: 'Источник команды отключения', skill: { id: 'power', level: 2 }, visibility: { fact: 'manual_cutoff' }, requiredProgress: 24,
    facts: [{ id: 'dispatcher_override', certainty: 'hypothesis', title: 'Команда связана с постом диспетчера', text: 'Резервная копия указывает на терминал диспетчера, но подпись повреждена и требует проверки.' }], effects: { accessLog: 'partially_recovered' }, significance: 'report',
    chronicle: { title: 'Позывной под слоем помех', lead: 'Резервная копия связала команду отключения с диспетчерским терминалом, но не с конкретным человеком.', body: 'Релейная сохранила фрагмент маршрута команды. Он ведёт к терминалу диспетчерской, однако криптографическая подпись оборвана. Это основание для проверки, а не приговор: команду могли отправить с резервного поста или через повреждённый ретранслятор. В общей системе знание опубликовано как гипотеза, пока другой источник не подтвердит личность оператора.' },
  },
  {
    id: 'trace-override', location: 'relay-room', department: 'power', title: 'Пройти по следу ручной блокировки',
    description: 'Проверить физический маршрут команды от диспетчерской до силового щита.', nearestResult: 'Подтверждение или опровержение версии о вмешательстве', skill: { id: 'power', level: 2 }, visibility: { all: [{ councilResult: 'investigate' }, { fact: 'manual_cutoff' }] }, requiredProgress: 28,
    facts: [{ id: 'protective_override', certainty: 'confirmed', title: 'Отключение было защитной мерой', text: 'Команда остановила повторную подачу питания после неизвестного сигнала из нижнего пролёта.' }], effects: { overridePurpose: 'protective' }, significance: 'chapter',
    chronicle: { title: 'Рука на аварийном рубильнике', lead: 'Проверка показала: ручная блокировка не ломала лифт, а удерживала его от повторного запуска.', body: 'Физическая трассировка восстановила назначение команды. После удара нижний датчик дважды требовал движение кабины вниз, хотя диспетчер уже остановил линию. Ручная блокировка разорвала этот цикл. Кто бы ни отправил её, действие было похоже на защиту, а не на попытку вывести лифт из строя. Версия о доказанном саботаже опровергнута; остаётся вопрос, что сформировало ложный вызов из нижнего пролёта.', illustrationId: 'power-lock' },
  },
  {
    id: 'descend-lower-shaft', location: 'shaft-gallery', department: 'repair', title: 'Спуститься к закрытому пролёту',
    description: 'Открыть сервисный путь ниже кабины и проверить источник неизвестного сигнала.', nearestResult: 'Состояние нижнего пролёта', skill: { id: 'repair', level: 2 }, visibility: { all: [{ councilResult: 'investigate' }, { fact: 'impact_below_cabin' }] }, requiredProgress: 30,
    facts: [{ id: 'lower_beacon', certainty: 'confirmed', title: 'Под шахтой работает старый маяк', text: 'Сигнал вызова идёт с законсервированного сорок восьмого яруса.' }], effects: { lowerLevelSignal: true }, significance: 'chapter',
    chronicle: { title: 'Сигнал под сорок седьмым', lead: 'Нижний пролёт вывел расследование за границы известной схемы этажа.', body: 'За сервисной переборкой обнаружен старый индукционный маяк. Он продолжает посылать команды вызова от имени законсервированного сорок восьмого яруса, которого нет на действующей карте снабжения. Именно одна из таких команд совпала с ударом кабины. Маяк не объясняет, кто его включил и почему диспетчер исчез, но первоначальная цель изменилась: простой запуск лифта теперь означает открыть путь к неизвестному источнику сигнала.', illustrationId: 'lower-signal' },
  },
  {
    id: 'repair-drive', location: 'repair-bay', department: 'repair', title: 'Собрать сердце для осторожного хода',
    description: 'Заменить опорный узел и подготовить привод к ограниченному испытанию.', nearestResult: 'Исправный привод для контролируемого запуска', skill: { id: 'repair', level: 2 }, visibility: { councilResult: 'investigate' }, requiredProgress: 32,
    facts: [{ id: 'drive_repaired', certainty: 'confirmed', title: 'Привод восстановлен', text: 'Механизм готов к ограниченному испытанию после проверки защит.' }], effects: { driveCondition: 'repaired' }, significance: 'report',
    chronicle: { title: 'Новое сердце старого лифта', lead: 'Привод восстановлен без снятия защитной блокировки.', body: 'Ремонтный док заменил разрушенный опорный узел, выровнял вал и провернул механизм вручную. Лифт снова способен двигаться, но команда на запуск пока не дана. Выполненная работа сохраняет значение при любом дальнейшем решении: исправный привод нужен и для контролируемого испытания, и для безопасной консервации шахты.' },
  },
  {
    id: 'controlled-test', location: 'switchboard-room', department: 'power', title: 'Дать кабине один осторожный шаг',
    description: 'Подать ограниченную мощность при включённых защитах и проверить реакцию нижнего сигнала.', nearestResult: 'Проверенный запуск или обнаружение скрытого риска', skill: { id: 'power', level: 2 }, visibility: { all: [{ councilResult: 'investigate' }, { fact: 'drive_repaired' }, { fact: 'protective_override' }] }, requiredProgress: 24,
    facts: [{ id: 'controlled_motion', certainty: 'confirmed', title: 'Кабина прошла один пролёт безопасно', text: 'Защиты удержали неизвестный вызов, снабжение можно восстановить в ограниченном режиме.' }], effects: { ending: 'restored_checked', liftState: 'limited_service' }, significance: 'finale',
    chronicle: { title: 'Первое движение после тишины', lead: 'Лифт вернулся в ограниченную эксплуатацию, а путь вниз остался закрыт до следующего решения.', body: 'Кабина поднялась на один пролёт под ограничением мощности. Новый привод выдержал нагрузку, тормоза сработали вовремя, а защитная блокировка отсекла повторный вызов снизу. Верхние сектора снова получают грузы, хотя маршрут к сорок восьмому ярусу остаётся закрытым. Завод выполнил первоначальное поручение иначе, чем планировал: не стирая неизвестность, а оставив её под наблюдением.', illustrationId: 'ending-safe' },
  },
  {
    id: 'bypass-interlock', location: 'switchboard-room', department: 'power', title: 'Разомкнуть упрямую защиту',
    description: 'Снять ручную блокировку и вернуть силовой линии штатную схему.', nearestResult: 'Питание для немедленного запуска', skill: { id: 'power', level: 1 }, visibility: { councilResult: 'launch' }, requiredProgress: 20,
    facts: [{ id: 'interlock_bypassed', certainty: 'confirmed', title: 'Защитная блокировка снята', text: 'Лифт может получить полную мощность, включая команды нижнего контура.' }], effects: { powerLine: 'unlocked' }, significance: 'turning_point',
    chronicle: { title: 'Защита отпустила линию', lead: 'По решению вече ручная блокировка снята до полного выяснения причин.', body: 'Силовая линия снова принимает команды от всех зарегистрированных контуров. Это ускоряет запуск, но возвращает в схему неизвестный нижний вызов. Энергетики сохранили аварийный рубильник под рукой; другого способа выполнить решение вече в заданный срок нет.' },
  },
  {
    id: 'emergency-start', location: 'shaft-gallery', department: 'repair', title: 'Разбудить кабину под нагрузкой',
    description: 'Запустить изношенный привод и вывести кабину к сорок седьмому ярусу.', nearestResult: 'Немедленное восстановление снабжения с принятым риском', skill: { id: 'repair', level: 2 }, visibility: { all: [{ councilResult: 'launch' }, { fact: 'interlock_bypassed' }] }, requiredProgress: 28,
    facts: [{ id: 'risky_motion', certainty: 'confirmed', title: 'Кабина сорвалась на аварийный тормоз', text: 'Снабжение не восстановлено; ловители удержали кабину после повторного нижнего вызова.' }], effects: { ending: 'risky_damage', liftState: 'caught_on_brakes' }, significance: 'finale',
    chronicle: { title: 'Цена немедленного запуска', lead: 'Кабина ответила на нижний вызов раньше, чем успела подняться к ярусу.', body: 'Полная мощность разбудила не только привод. В сеть снова вошёл сигнал снизу, двигатель изменил направление, а изношенный узел не выдержал встречного усилия. Аварийные ловители удержали кабину, люди не пострадали, но шахта теперь требует тяжёлого ремонта. Решение вече дало ясный ответ ценой снабжения: блокировка действительно защищала лифт от чужой команды.', illustrationId: 'ending-risk' },
  },
  {
    id: 'seal-shaft', location: 'shaft-gallery', department: 'repair', title: 'Запечатать путь под кабиной',
    description: 'Установить механические упоры и отделить неизвестный нижний контур.', nearestResult: 'Безопасная консервация шахты', skill: { id: 'repair', level: 1 }, visibility: { councilResult: 'conserve' }, requiredProgress: 24,
    facts: [{ id: 'shaft_sealed', certainty: 'confirmed', title: 'Шахта законсервирована', text: 'Кабина и нижний пролёт физически отделены от рабочего яруса.' }], effects: { liftState: 'sealed' }, significance: 'turning_point',
    chronicle: { title: 'Двери, которые решили не открывать', lead: 'Вече остановило восстановление лифта и приказало отделить неизвестный нижний путь.', body: 'Сервисная площадка установила упоры и закрыла силовые вводы. Кабина осталась между ярусами, но больше не может ответить на неизвестный вызов. Уже выполненная диагностика не пропала: она определила безопасные точки крепления и сохранила привод для будущего расследования.' },
  },
  {
    id: 'alternate-supply', location: 'blank-room', department: 'mechanics', title: 'Проложить дорогу без лифта',
    description: 'Собрать контейнеры и тяговые узлы для временной подачи грузов по сервисной линии.', nearestResult: 'Альтернативное снабжение верхних секторов', skill: { id: 'mechanics', level: 1 }, visibility: { all: [{ councilResult: 'conserve' }, { fact: 'shaft_sealed' }] }, requiredProgress: 30,
    facts: [{ id: 'alternate_route', certainty: 'confirmed', title: 'Открыт временный путь снабжения', text: 'Сервисная линия принимает ограниченные грузы без использования лифта.' }], effects: { ending: 'conserved_alternative', liftState: 'sealed_supplied' }, significance: 'finale',
    chronicle: { title: 'Дорога в обход тишины', lead: 'Лифт остался закрыт, но верхние сектора получили новый путь снабжения.', body: 'Производственный цех собрал лёгкие контейнеры и тяговые узлы для старой сервисной линии. Она медленнее грузового лифта, зато не связана с неизвестным нижним сигналом. Завод отказался от быстрого возвращения к прежнему порядку и нашёл другой способ выполнить главную обязанность — не оставить верхние ярусы без деталей и энергии.', illustrationId: 'ending-conserve' },
  },
]

export const councilDefinition = {
  id: 'lift-future-01',
  question: 'Что делать с лифтом после обнаружения ручной блокировки?',
  context: 'Износ привода подтверждён. Линия была отключена вручную после удара, но мотив и источник команды пока неизвестны.',
  defaultOptionId: 'investigate',
  options: [
    { id: 'investigate', title: 'Продолжить расследование', argument: 'Сохранить блокировку, восстановить привод и выяснить назначение неизвестной команды.' },
    { id: 'launch', title: 'Запустить немедленно', argument: 'Снять блокировку и вернуть снабжение, приняв риск неполной диагностики.' },
    { id: 'conserve', title: 'Законсервировать шахту', argument: 'Отделить неизвестный контур и искать альтернативный путь снабжения.' },
  ] satisfies CouncilOption[],
}

export function conditionMatches(condition: StoryCondition, context: StoryContext): boolean {
  if ('fact' in condition) return context.facts.has(condition.fact)
  if ('completed' in condition) return context.completed.has(condition.completed)
  if ('phase' in condition) return context.phase === condition.phase
  if ('councilResult' in condition) return context.councilResult === condition.councilResult
  if ('all' in condition) return condition.all.every(item => conditionMatches(item, context))
  if ('any' in condition) return condition.any.some(item => conditionMatches(item, context))
  return !conditionMatches(condition.not, context)
}

export function availableDefinitions(context: StoryContext, skills: Record<Department, number>) {
  return workDefinitions.filter(work => !context.completed.has(work.id) && conditionMatches(work.visibility, context)).map(work => ({
    definition: work,
    skillLocked: (skills[work.skill.id] ?? 1) < work.skill.level,
  }))
}

export function resolveCouncilBallots(ballots: string[], defaultOptionId = councilDefinition.defaultOptionId) {
  const counts = new Map(councilDefinition.options.map(option => [option.id, 0]))
  ballots.forEach(optionId => { if (counts.has(optionId)) counts.set(optionId, (counts.get(optionId) ?? 0) + 1) })
  const maximum = Math.max(0, ...counts.values())
  const winners = [...counts].filter(([, count]) => count === maximum && count > 0).map(([id]) => id)
  return { optionId: winners.length === 1 ? winners[0] : defaultOptionId, counts: Object.fromEntries(counts) }
}

export function goalFor(phase: EpisodePhase, councilResult: string | null, ending: string | null) {
  if (phase === 'complete') {
    if (ending === 'restored_checked') return ['Снабжение восстановлено', 'Лифт работает в ограниченном режиме, а неизвестный нижний контур остаётся изолирован.'] as const
    if (ending === 'risky_damage') return ['Удержать кабину и начать тяжёлый ремонт', 'Немедленный запуск завершился срабатыванием аварийных ловителей.'] as const
    return ['Поддерживать обходной путь', 'Шахта законсервирована, верхние сектора получают грузы по сервисной линии.'] as const
  }
  if (phase === 'council') return ['Решить судьбу грузового лифта', 'Диагностика изменила понимание аварии. До решения вече обычные исследования остаются доступны.'] as const
  if (councilResult === 'investigate') return ['Выяснить назначение блокировки', 'Сохранить защиту, восстановить привод и проверить источник сигнала снизу.'] as const
  if (councilResult === 'launch') return ['Вернуть лифт в строй немедленно', 'Снять блокировку и поднять кабину, приняв риск неизвестной команды.'] as const
  if (councilResult === 'conserve') return ['Закрыть шахту и сохранить снабжение', 'Отделить нижний контур и подготовить альтернативную линию грузов.'] as const
  return ['Понять, почему замолчал лифт', 'Независимо проверить привод, питание и следы удара. Будущие действия откроются из подтверждённых результатов.'] as const
}

