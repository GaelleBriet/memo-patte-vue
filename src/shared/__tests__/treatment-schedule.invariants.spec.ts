// @vitest-environment node
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import {
  treatmentSchedule,
  type DoseFields,
  type Due,
  type Frequency,
  type LineChange,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
  type TreatmentSchedule,
} from '../domain/treatment-schedule'

type Book = { periods: TreatmentPeriodInput[]; doses: TreatmentDoseInput[]; today: string }
type Random = () => number

const FREQUENCIES: Frequency[] = [
  { value: 1, unit: 'day' },
  { value: 2, unit: 'day' },
  { value: 3, unit: 'day' },
  { value: 1, unit: 'week' },
  { value: 2, unit: 'week' },
  { value: 6, unit: 'week' },
  { value: 1, unit: 'month' },
  { value: 3, unit: 'month' },
]
const TIMES = [
  [],
  ['20:00'],
  ['08:00', '20:00'],
  ['08:00', '14:00', '20:00'],
  ['06:00', '12:00', '18:00', '23:00'],
]
const GESTURES = [
  'give',
  'give',
  'miss',
  'log',
  'otherDate',
  'move',
  'move',
  'redate',
  'delete',
  'newPeriod',
  'stop',
  'resume',
  'resume',
  'unmove',
  'wait',
  'wait',
] as const
// Campagne longue, hors `vitest run` : INVARIANTS_SEEDS=20000 (et INVARIANTS_FROM, INVARIANTS_STEPS).
const FIRST_SEED = Number(process.env.INVARIANTS_FROM ?? 1)
const CARNETS = Number(process.env.INVARIANTS_SEEDS ?? 150)
const STEPS = Number(process.env.INVARIANTS_STEPS ?? 24)
const TIMEOUT = 30_000 + CARNETS * STEPS * 5
if (![FIRST_SEED, CARNETS, STEPS].every((value) => Number.isInteger(value) && value > 0)) {
  throw new Error(`Campagne illisible : INVARIANTS_FROM, INVARIANTS_SEEDS ou INVARIANTS_STEPS`)
}

function mulberry32(seed: number): Random {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

function int(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

function pick<T>(random: Random, items: readonly T[]): T | undefined {
  return items[int(random, 0, items.length - 1)]
}

function plusDays(day: string, count: number): string {
  return format(addDays(parseISO(day), count), 'yyyy-MM-dd')
}

function shifted(day: string, { value, unit }: Frequency, steps: number): string {
  const start = parseISO(day)
  const amount = value * steps
  const end =
    unit === 'day'
      ? addDays(start, amount)
      : unit === 'week'
        ? addWeeks(start, amount)
        : addMonths(start, amount)
  return format(end, 'yyyy-MM-dd')
}

// Le rythme repris à `from` retombe-t-il de lui-même sur `day` ?
function landsOn(from: string, day: string, frequency: Frequency): boolean {
  for (let step = 1; step < 400; step += 1) {
    const reached = shifted(from, frequency, step)
    if (reached >= day) return reached === day
  }
  return false
}

function idOf({ periodId, dueOn, dueTime }: Due): string {
  return `${periodId} ${dueOn} ${dueTime ?? ''}`
}

function isNote({ status }: Pick<TreatmentDoseInput, 'status'>): boolean {
  return status === 'given' || status === 'missed'
}

function familyOf({ status }: Pick<TreatmentDoseInput, 'status'>): string {
  return isNote({ status }) ? 'note' : status
}

function scheduleOf({ periods, doses, today }: Book): TreatmentSchedule {
  return treatmentSchedule({ periods, doses, today })
}

function pendingOf(schedule: TreatmentSchedule): Due[] {
  const all = [...schedule.unloggedDoses, ...schedule.currentDoses, ...schedule.upcoming(60)]
  return [...new Map(all.map((due) => [idOf(due), due])).values()]
}

// Les échéances des deux listes jusqu'à la dernière journée que l'une et l'autre atteignent.
function upToCommonHorizon(a: Due[], b: Due[]): [string[], string[]] {
  const lastA = a.at(-1)?.dueOn ?? ''
  const lastB = b.at(-1)?.dueOn ?? ''
  const horizon = lastA < lastB ? lastA : lastB
  const cut = (dues: Due[]) => dues.filter(({ dueOn }) => dueOn < horizon).map(idOf)
  return [cut(a), cut(b)]
}

// G23 : une période peut s'ouvrir sur l'arrivée d'un report seul, hors de sa grille.
function isOffGridStart(period: TreatmentPeriodInput, day: string): boolean {
  return (
    day === period.firstDueOn &&
    period.referenceOn !== period.firstDueOn &&
    !landsOn(period.referenceOn, period.firstDueOn, period.frequency)
  )
}

// La prochaine dose est l'arrivée d'un report seul (sans décalage) de cette période.
function loneArrivalOf(
  schedule: TreatmentSchedule,
  period: TreatmentPeriodInput,
): TreatmentDoseInput | undefined {
  const day = schedule.currentDoses[0]?.dueOn
  const lines = schedule.doses.filter(({ periodId }) => periodId === period.id)
  const move = lines.find(
    ({ status, nextDueDate }) => status === 'postponed' && nextDueDate === day,
  )
  const shifted = lines.some((line) => line.status === 'shift' && line.dueOn === move?.dueOn)
  return move === undefined || shifted ? undefined : move
}

// La prochaine dose est l'arrivée d'un déplacement de cette période, seul ou avec décalage.
function arrivesOnNextDose(schedule: TreatmentSchedule, period: TreatmentPeriodInput): boolean {
  const day = schedule.currentDoses[0]?.dueOn
  return schedule.doses.some(
    ({ periodId, status, nextDueDate }) =>
      periodId === period.id && status === 'postponed' && nextDueDate === day,
  )
}

// §11 : un mensuel garde le 28 (ou le 30) au lieu du dernier jour du mois ; un calendrier de départ
// dont deux journées sont plus proches que la fréquence, puis hors rythme, ne se reprend pas.
function isKnownLimit(before: string, after: string, frequency: Frequency): boolean {
  const slotsOf = (joined: string) => joined.split(',').map((slot) => slot.split(' '))
  const [was, now] = [slotsOf(before), slotsOf(after)]
  const endOfMonth = (a: string, b: string) =>
    a.slice(0, 7) === b.slice(0, 7) && Number(a.slice(8)) >= 28 && Number(b.slice(8)) >= 28
  const boundedDay =
    frequency.unit === 'month' &&
    was.length === now.length &&
    was.every(([day, time], index) => {
      const [otherDay, otherTime] = now[index]!
      return time === otherTime && (day === otherDay || endOfMonth(day!, otherDay!))
    })
  const days = [...new Set(was.map(([day]) => day!))]
  const [first, second, third] = days
  const irregularStart =
    first !== undefined &&
    second !== undefined &&
    third !== undefined &&
    second < shifted(first, frequency, 1) &&
    shifted(second, frequency, 1) !== third
  return boundedDay || irregularStart
}

// Q8 : une ligne de décalage, sur son échéance ou sur celle de la dose qu'elle a avancée (G18),
// ancrée à la date réelle de la prise : toute sa journée compte alors à cette date.
function refixesSuite(note: TreatmentDoseInput, doses: readonly TreatmentDoseInput[]): boolean {
  if (note.givenOn === null || note.givenOn === note.dueOn) return false
  const origins = doses
    .filter(
      (dose) =>
        dose.status === 'postponed' &&
        dose.periodId === note.periodId &&
        dose.nextDueDate === note.dueOn,
    )
    .map(({ dueOn }) => dueOn)
  return doses.some(
    (dose) =>
      dose.status === 'shift' &&
      dose.periodId === note.periodId &&
      dose.nextDueDate === note.givenOn &&
      ((dose.dueOn === note.dueOn && dose.dueTime === note.dueTime) ||
        origins.includes(dose.dueOn)),
  )
}

function rhythmKey({ frequency, times }: TreatmentPeriodInput): string {
  return JSON.stringify([frequency, [...times].sort()])
}

function calendarOf(schedule: TreatmentSchedule): string {
  return JSON.stringify({
    phase: schedule.phase,
    unlogged: schedule.unloggedDoses.map(idOf),
    current: schedule.currentDoses.map(idOf),
    upcoming: schedule.upcoming(60).map(idOf),
  })
}

function newBook(random: Random): Book {
  const firstDueOn = plusDays('2026-03-01', int(random, 0, 40))
  const period: TreatmentPeriodInput = {
    id: 'p1',
    startsOn: firstDueOn,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn: random() < 0.3 ? plusDays(firstDueOn, int(random, 3, 60)) : null,
    stoppedOn: null,
    frequency: pick(random, FREQUENCIES) ?? { value: 1, unit: 'day' },
    times: pick(random, TIMES) ?? [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  return { periods: [period], doses: [], today: plusDays(firstDueOn, int(random, -2, 3)) }
}

// Date de fin proche : la dernière dose est la deuxième ou la troisième de la période.
function withCloseEnd(book: Book, steps: number): Book {
  const periods = book.periods.map((period) => ({
    ...period,
    endsOn: shifted(period.firstDueOn, period.frequency, steps),
  }))
  return { ...book, periods }
}

function isWithinHalfStep(from: string, day: string, frequency: Frequency): boolean {
  const step = differenceInCalendarDays(parseISO(shifted(from, frequency, 1)), parseISO(from))
  return 2 * differenceInCalendarDays(parseISO(day), parseISO(from)) < step
}

class Simulation {
  private stamp = 0
  private redated = false
  readonly log: string[] = []
  // Tirages à part : les graines déjà connues rejouent les mêmes gestes.
  private readonly shiftRandom: Random
  private readonly extraRandom: Random
  private readonly boxRandom: Random
  private readonly rhythmRandom: Random

  constructor(
    public book: Book,
    private readonly random: Random,
    private readonly seed: number,
  ) {
    this.shiftRandom = mulberry32(seed ^ 0x5f3759df)
    this.extraRandom = mulberry32(seed ^ 0x2545f491)
    this.boxRandom = mulberry32(seed ^ 0x1b873593)
    this.rhythmRandom = mulberry32(seed ^ 0x3c6ef372)
    const endRandom = mulberry32(seed ^ 0x68e31da4)
    if (endRandom() < 0.2) this.book = withCloseEnd(book, int(endRandom, 1, 2))
  }

  // La case « Décaler aussi les doses suivantes », décochée une fois sur trois quand le geste la propose.
  private unchecks(): boolean {
    return this.boxRandom() < 0.35
  }

  fail(message: string): never {
    throw new Error(
      `${message}\n graine ${this.seed}, aujourd’hui ${this.book.today}\n périodes ${JSON.stringify(this.book.periods)}\n gestes :\n  ${this.log.join('\n  ')}`,
    )
  }

  private at(): string {
    this.stamp += 1
    return new Date(Date.UTC(2026, 0, 1, 0, 0, this.stamp)).toISOString()
  }

  schedule(book = this.book): TreatmentSchedule {
    try {
      return scheduleOf(book)
    } catch (error) {
      return this.fail(`le calcul lève : ${String(error)}`)
    }
  }

  // Comme le repository : une ligne par échéance et par famille, réécrite si elle existe déjà.
  private written(book: Book, fields: DoseFields): Book {
    const at = this.at()
    const existing = book.doses.find(
      (dose) => idOf(dose) === idOf(fields) && familyOf(dose) === familyOf(fields),
    )
    const reported = book.doses.some(
      (dose) => idOf(dose) === idOf(fields) && dose.status === 'postponed',
    )
    if (reported && isNote(fields)) {
      this.fail(`deux lignes pour l’échéance ${idOf(fields)} : un déplacement et une prise`)
    }
    const doses = existing
      ? book.doses.map((dose) => (dose === existing ? { ...dose, ...fields, updatedAt: at } : dose))
      : [...book.doses, { id: `d${this.stamp}`, ...fields, createdAt: at, updatedAt: at }]
    return { ...book, doses }
  }

  private applied(book: Book, change: LineChange): Book {
    switch (change.action) {
      case 'none':
        return book
      case 'create':
        return this.written(book, change.dose)
      case 'delete':
        return { ...book, doses: book.doses.filter(({ id }) => id !== change.doseId) }
      case 'rewrite': {
        const at = this.at()
        return {
          ...book,
          doses: book.doses.map((line) =>
            line.id === change.doseId ? { ...line, ...change.dose, updatedAt: at } : line,
          ),
        }
      }
    }
  }

  private afterMove(due: Due, to: string, shiftsFollowing = true): Book {
    const { report, shift } = scheduleOf(this.book).move(due, to, shiftsFollowing)
    return this.applied(this.applied(this.book, shift), report)
  }

  private checkProtected(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    keep: (due: Due) => boolean,
    gesture: string,
  ): void {
    const { today } = this.book
    const remaining = new Set([...pendingOf(after), ...after.doses].map(idOf))
    const lost = [...before.unloggedDoses, ...before.currentDoses]
      .filter((due) => due.dueOn <= today && keep(due))
      .filter((due) => !remaining.has(idOf(due)))
    if (lost.length > 0) this.fail(`${gesture} : échéances disparues ${JSON.stringify(lost)}`)
  }

  private checkFinished(book: Book): void {
    const schedule = this.schedule(book)
    if (!schedule.finished) return
    if (pendingOf(schedule).length > 0) this.fail('terminé avec des doses à donner ou à renseigner')
    for (const later of [1, 7, 45]) {
      const future = this.schedule({ ...book, today: plusDays(book.today, later) })
      if (pendingOf(future).length > 0)
        this.fail(`terminé, puis des doses reviennent ${later} j plus tard`)
    }
  }

  private checkMove(due: Due, to: string, before: TreatmentSchedule, moved: Book): void {
    const gesture = `déplacer ${idOf(due)} au ${to}`
    const after = this.schedule(moved)
    const pending = pendingOf(after).filter(({ periodId }) => periodId === due.periodId)
    if (to === due.dueOn) {
      const same =
        JSON.stringify(pendingOf(after).map(idOf)) === JSON.stringify(pendingOf(before).map(idOf))
      if (!same) this.fail(`${gesture} : la date inchangée a changé le calendrier`)
      return
    }
    const period = this.book.periods.find(({ id }) => id === due.periodId)
    if (period === undefined) return this.fail('période inconnue')
    const noted = new Set(after.doses.filter(isNote).map(idOf))
    // Revenue à sa date d'origine, la dose retrouve la suite d'avant ; un déplacement plus loin garde la sienne.
    const backToOrigin = moved.doses.length < this.book.doses.length
    const laterMove = after.doses.some(
      (dose) =>
        dose.status === 'postponed' && dose.periodId === due.periodId && dose.dueOn > due.dueOn,
    )
    for (const step of backToOrigin || laterMove ? [0] : [0, 1, 2]) {
      const dueOn = shifted(to, period.frequency, step)
      if (period.endsOn !== null && dueOn > period.endsOn) break
      for (const dueTime of period.times.length > 0 ? period.times : [null]) {
        const expected = idOf({ periodId: period.id, dueOn, dueTime })
        if (!noted.has(expected) && !pending.some((other) => idOf(other) === expected)) {
          this.fail(`${gesture} : pas de dose à donner le ${dueOn} ${dueTime ?? ''}`)
        }
      }
    }
    const leftBehind = pending.filter((other) => other.dueOn === due.dueOn)
    const offGrid = isOffGridStart(period, to)
    if (leftBehind.length > 0 && !landsOn(to, due.dueOn, period.frequency) && !offGrid) {
      this.fail(`${gesture} : une dose reste à donner au jour d’origine`)
    }
    this.checkProtected(
      before,
      after,
      (other) => other.dueOn !== due.dueOn || other.periodId !== due.periodId,
      gesture,
    )
  }

  private move(before: TreatmentSchedule): void {
    const due = pick(
      this.random,
      [
        before.currentDoses[0],
        before.currentDoses[0],
        before.currentDoses[0],
        before.nextDue,
      ].filter((item) => item !== null && item !== undefined),
    )
    if (due === undefined) return
    if (before.moveBounds(due) !== null && this.unchecks()) return this.moveAlone(before, due)
    const bounds = before.moveBounds(due)
    if (bounds === null) return
    const { earliest, latest } = bounds
    const last = latest ?? plusDays(earliest, int(this.random, 0, 12))
    if (last < earliest) return
    const span = differenceInCalendarDays(parseISO(last), parseISO(earliest))
    const dates = [earliest, last, plusDays(earliest, int(this.random, 0, span))]
    for (const to of dates) {
      let moved: Book
      try {
        moved = this.afterMove(due, to)
      } catch (error) {
        return this.fail(
          `déplacer ${idOf(due)} au ${to}, dans les bornes [${earliest}, ${latest}] : ${String(error)}`,
        )
      }
      this.checkMove(due, to, before, moved)
      this.checkFinished(moved)
    }
    const to = dates[2] ?? earliest
    this.log.push(`${this.book.today} déplacer ${idOf(due)} au ${to}`)
    this.book = this.afterMove(due, to)
  }

  // Q2 : un report seul, au plus la veille de la dose suivante ; les suivantes gardent leur jour.
  private moveAlone(before: TreatmentSchedule, due: Due): void {
    const bounds = before.moveBounds(due, false)
    if (bounds === null) {
      if (before.moveRefusal(due, false) === null) {
        this.fail(`report seul de ${idOf(due)} : ni bornes ni refus`)
      }
      return
    }
    const { earliest, latest } = bounds
    if (latest === null) return this.fail(`report seul de ${idOf(due)} : aucune borne haute`)
    const span = differenceInCalendarDays(parseISO(latest), parseISO(earliest))
    const to = plusDays(earliest, int(this.boxRandom, 0, span))
    const gesture = `${this.book.today} déplacer seule ${idOf(due)} au ${to}`
    this.log.push(gesture)
    const fresh = !before.doses.some(
      (dose) =>
        dose.status === 'postponed' &&
        dose.periodId === due.periodId &&
        (dose.nextDueDate === due.dueOn || dose.dueOn === due.dueOn),
    )
    const laterDays = (schedule: TreatmentSchedule) =>
      pendingOf(schedule).filter((other) => other.periodId === due.periodId && other.dueOn > to)
    let moved: Book
    try {
      moved = this.afterMove(due, to, false)
    } catch (error) {
      return this.fail(`${gesture}, dans les bornes [${earliest}, ${latest}] : ${String(error)}`)
    }
    if (to === due.dueOn) return
    const after = this.schedule(moved)
    const report = after.doses.find(
      (dose) =>
        dose.status === 'postponed' && dose.periodId === due.periodId && dose.nextDueDate === to,
    )
    // Redéplacée sur l'échéance que son report remplace, la dose n'a plus de report.
    if (report === undefined && fresh) return this.fail(`${gesture} : pas de report`)
    if (
      report !== undefined &&
      after.doses.some((dose) => dose.status === 'shift' && idOf(dose) === idOf(report))
    ) {
      this.fail(`${gesture} : un décalage reste sur l’échéance du report`)
    }
    // Un décalage resté sur la journée déplacée part avec le geste : la suite se lit sans lui.
    const isOwnShift = (dose: TreatmentDoseInput) =>
      dose.status === 'shift' && dose.periodId === due.periodId && dose.dueOn === due.dueOn
    const base = this.schedule({
      ...this.book,
      doses: this.book.doses.filter((dose) => !isOwnShift(dose)),
    })
    if (fresh && to > due.dueOn) {
      const next = pendingOf(base).find(
        (other) => other.periodId === due.periodId && other.dueOn > due.dueOn,
      )
      if (next !== undefined && to >= next.dueOn) {
        this.fail(`${gesture} : au-delà de la veille de la dose suivante (${next.dueOn})`)
      }
      const [kept, now] = upToCommonHorizon(laterDays(base), laterDays(after))
      if (JSON.stringify(kept) !== JSON.stringify(now)) {
        this.fail(
          `${gesture} : les suivantes passent de ${JSON.stringify(kept)} à ${JSON.stringify(now)}`,
        )
      }
    }
    this.checkProtected(
      before,
      after,
      (other) => other.dueOn !== due.dueOn || other.periodId !== due.periodId,
      gesture,
    )
    this.checkFinished(moved)
    this.book = moved
  }

  private note(
    before: TreatmentSchedule,
    due: Due,
    kind: 'given' | 'missed',
    givenOn: string,
    shiftsFollowing?: boolean,
  ): void {
    const box = shiftsFollowing === false ? ', case décochée' : ''
    const gesture = `${this.book.today} ${kind} ${idOf(due)} le ${givenOn}${box}`
    this.log.push(gesture)
    let fields
    let wroteShift = false
    let lostToEnd: string[] = []
    try {
      const noted =
        kind === 'given'
          ? before.doseFor({ kind, due, givenOn, shiftsFollowing })
          : before.doseFor({ kind, due })
      if (shiftsFollowing === false && noted.shift !== null) {
        this.fail(`${gesture} : un décalage est écrit`)
      }
      fields = noted.dose
      wroteShift = noted.shift !== null
      lostToEnd = noted.lostToEnd ?? []
      if (noted.shift !== null) this.book = this.written(this.book, noted.shift)
    } catch (error) {
      return this.fail(`${gesture} : ${String(error)}`)
    }
    const noteFrom = this.book
    this.book = this.written(this.book, fields)
    const after = this.schedule()
    this.checkProtected(before, after, () => true, gesture)
    this.checkNoPassedMove(noteFrom, gesture)
    if (fields.status === 'extra') return this.checkExtra(before, after, due, fields, gesture)
    this.checkWritten(after, due, fields.nextDueDate, gesture)
    const unit = this.book.periods.find(({ id }) => id === due.periodId)?.frequency.unit
    const mayCoincide = unit === 'month' && kind === 'given' && givenOn !== due.dueOn
    const wasUnlogged = before.unloggedDoses.some((unlogged) => idOf(unlogged) === idOf(due))
    if (wasUnlogged && !mayCoincide) this.checkLogged(before, after, gesture)
    if (kind === 'given' && shiftsFollowing === undefined) {
      this.checkEndCut(before, after, due, givenOn, lostToEnd, gesture)
    } else if (lostToEnd.length > 0) {
      this.fail(`${gesture} : doses perdues annoncées pour un geste avec case`)
    }
    if (shiftsFollowing === false) return this.checkKeptDays(before, after, due, gesture)
    if (
      kind === 'given' &&
      before.currentDoses.some((current) => idOf(current) === idOf(due)) &&
      !this.isMovedOnItsOwn(before, due, wroteShift)
    ) {
      this.checkGap(after, due, givenOn, fields.nextDueDate, gesture)
    }
  }

  // Q4, sans case : des doses ne sortent de la date de fin que si la dose suivante tombait à moins
  // d'une demi-fréquence après la prise ; elles sont annoncées, et sans dose restante, terminé.
  private checkEndCut(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    due: Due,
    givenOn: string,
    announced: string[],
    gesture: string,
  ): void {
    const period = this.book.periods.find(({ id }) => id === due.periodId)
    const daysAfter = (schedule: TreatmentSchedule) => [
      ...new Set(
        pendingOf(schedule)
          .filter((other) => other.periodId === due.periodId && other.dueOn > due.dueOn)
          .map(({ dueOn }) => dueOn),
      ),
    ]
    const [kept, now] = [daysAfter(before), daysAfter(after)]
    const bounded = (period?.endsOn ?? null) !== null && kept.length < 40
    const lost = bounded && now.length < kept.length ? kept.slice(now.length) : []
    if (JSON.stringify(announced) !== JSON.stringify(lost)) {
      this.fail(
        `${gesture} : doses perdues ${JSON.stringify(lost)}, annoncées ${JSON.stringify(announced)}`,
      )
    }
    if (period === undefined || lost.length === 0) return
    if (!isWithinHalfStep(givenOn, kept[0]!, period.frequency)) {
      this.fail(`${gesture} : la dose du ${lost.join(', ')} disparaît (date de fin)`)
    }
    if (now.length === 0 && after.currentDoses.length > 0) {
      this.fail(`${gesture} : dernière dose notée, pas terminé`)
    }
  }

  // Q2 a, recalculée à part : les reports seuls (sans décalage sur leur journée) qui arrivent
  // après la dose suivante, lue sans leurs lignes.
  private passedMoves(book: Book): Set<string> {
    const schedule = this.schedule(book)
    const passed = schedule.doses.filter((move) => {
      if (move.status !== 'postponed' || move.nextDueDate <= move.dueOn) return false
      const shifted = schedule.doses.some(
        (other) =>
          other.status === 'shift' &&
          other.periodId === move.periodId &&
          other.dueOn === move.dueOn,
      )
      if (shifted) return false
      const without = this.schedule({
        ...book,
        doses: book.doses.filter((dose) => idOf(dose) !== idOf(move) || dose.status === 'extra'),
      })
      const nextOn = pendingOf(without).find(
        (due) => due.periodId === move.periodId && due.dueOn > move.dueOn,
      )?.dueOn
      return nextOn !== undefined && move.nextDueDate >= nextOn
    })
    return new Set(passed.map(({ id }) => id))
  }

  // Une prise notée ou corrigée ne fait jamais passer la dose suivante à un report seul.
  private checkNoPassedMove(from: Book, gesture: string): void {
    const already = this.passedMoves(from)
    const passed = [...this.passedMoves(this.book)].filter((id) => !already.has(id))
    if (passed.length > 0) this.fail(`${gesture} : un report seul passe la dose suivante`)
  }

  // Case décochée : seule la dose notée change, les suivantes gardent leur jour.
  private checkKeptDays(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    due: Due,
    gesture: string,
  ): void {
    const later = (schedule: TreatmentSchedule) =>
      pendingOf(schedule).filter(
        (other) => other.periodId === due.periodId && idOf(other) > idOf(due),
      )
    const [kept, now] = upToCommonHorizon(later(before), later(after))
    if (JSON.stringify(kept) !== JSON.stringify(now)) {
      this.fail(
        `${gesture} : les suivantes passent de ${JSON.stringify(kept)} à ${JSON.stringify(now)}`,
      )
    }
  }

  // N1, Q2 c : ni une dose non renseignée, ni la dose d'un report sans décalage ne proposent la case.
  private checkOffer(before: TreatmentSchedule, due: Due, givenOn: string, offered: boolean): void {
    const alone = before.doses.some(
      (move) =>
        move.status === 'postponed' &&
        move.periodId === due.periodId &&
        move.nextDueDate === due.dueOn &&
        !before.doses.some((shift) => shift.status === 'shift' && idOf(shift) === idOf(move)),
    )
    const unlogged = before.unloggedDoses.some((other) => idOf(other) === idOf(due))
    if (offered && (alone || unlogged || givenOn === due.dueOn)) {
      this.fail(`${this.book.today} case proposée pour ${idOf(due)} le ${givenOn}`)
    }
  }

  // La prochaine dose écrite sur la dernière prise est la première échéance en attente qui la suit :
  // c'est elle que le Carnet, l'accueil et les rappels lisent.
  private checkWritten(after: TreatmentSchedule, due: Due, nextDueDate: string, gesture: string) {
    const period = this.book.periods.find(({ id }) => id === due.periodId)
    const key = idOf(due)
    const later = (other: Due) => other.periodId === due.periodId && idOf(other) > key
    if (after.doses.some((dose) => isNote(dose) && later(dose))) return
    const expected = pendingOf(after).filter(later)[0]?.dueOn
    const end = period?.endsOn ?? null
    if (expected === undefined || (end !== null && nextDueDate > end)) return
    if (nextDueDate !== expected) {
      this.fail(
        `${gesture} : prochaine dose écrite au ${nextDueDate}, le calendrier dit ${expected}`,
      )
    }
  }

  // Prise en plus : rangée sous sa date réelle, un intervalle ou plus avant la dose visée, elle ne
  // change jamais le calendrier.
  private checkExtra(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    due: Due,
    extra: DoseFields,
    gesture: string,
  ): void {
    const period = this.book.periods.find(({ id }) => id === due.periodId)
    if (period === undefined) return this.fail('période inconnue')
    if (extra.givenOn === null || extra.dueOn !== extra.givenOn || extra.dueTime !== due.dueTime) {
      this.fail(`${gesture} : prise en plus mal rangée ${JSON.stringify(extra)}`)
    }
    if (period.times.length > 1) this.fail(`${gesture} : prise en plus à plusieurs heures`)
    if (shifted(extra.dueOn, period.frequency, 1) > due.dueOn) {
      this.fail(`${gesture} : prise en plus à moins d’un intervalle`)
    }
    if (calendarOf(after) !== calendarOf(before)) {
      this.fail(`${gesture} : le calendrier change, ${calendarOf(before)} → ${calendarOf(after)}`)
    }
    this.checkWritten(after, extra, extra.nextDueDate, gesture)
  }

  // « C'est fait » sur une dose à venir, aujourd'hui ou la veille : une prise en plus si elle est assez loin.
  private ahead(before: TreatmentSchedule): void {
    const [current] = before.currentDoses
    if (current === undefined || current.dueOn <= this.book.today) return
    const givenOn = plusDays(this.book.today, -int(this.extraRandom, 0, 1))
    if (givenOn >= current.dueOn) return
    let target: Due | null
    try {
      target = givenOn === this.book.today ? current : before.dueForDate(givenOn, current.dueTime)
    } catch (error) {
      return this.fail(`${this.book.today} viser une prise le ${givenOn} : ${String(error)}`)
    }
    if (target === null) return
    const isNoted = before.doses.some((dose) => isNote(dose) && idOf(dose) === idOf(target))
    if (!isNoted) this.note(before, target, 'given', givenOn)
  }

  // Changer la date d'une prise en plus, comme le repository : sa ligne réécrite, ou remplacée par
  // la ligne de l'échéance qu'elle vise désormais.
  private redateExtra(before: TreatmentSchedule): void {
    const extra = pick(
      this.extraRandom,
      before.doses.filter(({ status }) => status === 'extra'),
    )
    if (extra === undefined) return
    const givenOn = plusDays(this.book.today, -int(this.extraRandom, 0, 6))
    if (before.redateLimits(extra.id).takenDays.includes(givenOn)) {
      this.checkRefused(
        () => before.redate(extra.id, givenOn),
        `redater ${idOf(extra)} au ${givenOn}`,
      )
      return
    }
    const gesture = `${this.book.today} redater la prise en plus ${idOf(extra)} au ${givenOn}`
    this.log.push(gesture)
    let redated
    try {
      redated = before.redate(extra.id, givenOn)
    } catch (error) {
      return this.fail(`${gesture} : ${String(error)}`)
    }
    const { dose: fields, shift } = redated
    this.redated = true
    const book = { ...this.book, doses: this.book.doses.filter(({ id }) => id !== extra.id) }
    this.book = this.written(this.applied(book, shift), fields)
    this.checkProtected(before, this.schedule(), (due) => due.dueOn <= extra.dueOn, gesture)
  }

  private deleteExtra(before: TreatmentSchedule): void {
    const extra = pick(
      this.extraRandom,
      before.doses.filter(({ status }) => status === 'extra'),
    )
    if (extra === undefined) return
    const gesture = `${this.book.today} supprimer la prise en plus ${idOf(extra)}`
    this.log.push(gesture)
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => id !== extra.id) }
    if (calendarOf(this.schedule()) !== calendarOf(before)) {
      this.fail(`${gesture} : le calendrier change`)
    }
  }

  // Un décalage resté seul, ou une dose déplacée sans décalage : les doses suivantes gardent leur jour.
  private isMovedOnItsOwn(before: TreatmentSchedule, due: Due, wroteShift: boolean): boolean {
    const shiftOn = (line: Due) =>
      before.doses.some(
        (dose) =>
          dose.status === 'shift' && dose.periodId === line.periodId && dose.dueOn === line.dueOn,
      )
    const movedHere = before.doses.filter(
      (dose) =>
        dose.status === 'postponed' &&
        dose.periodId === due.periodId &&
        dose.nextDueDate === due.dueOn,
    )
    const period = this.book.periods.find(({ id }) => id === due.periodId)
    const offGrid = period !== undefined && isOffGridStart(period, due.dueOn)
    return (shiftOn(due) && !wroteShift) || movedHere.some((move) => !shiftOn(move)) || offGrid
  }

  // TR-18, Q8 : renseigner ne déplace ni la dose du moment ni les échéances à venir.
  private checkLogged(before: TreatmentSchedule, after: TreatmentSchedule, gesture: string): void {
    const current = (schedule: TreatmentSchedule) => JSON.stringify(schedule.currentDoses.map(idOf))
    const upcoming = (schedule: TreatmentSchedule) =>
      JSON.stringify(schedule.upcoming(60).map(idOf))
    if (current(before) !== current(after)) {
      this.fail(`${gesture} : la dose du moment passe de ${current(before)} à ${current(after)}`)
    }
    if (upcoming(before) !== upcoming(after)) {
      this.fail(
        `${gesture} : les échéances à venir passent de ${upcoming(before)} à ${upcoming(after)}`,
      )
    }
  }

  // TR-24 bis : la même date ne change ni la ligne ni le calendrier, période close comprise.
  private checkSameDate(before: TreatmentSchedule, dose: TreatmentDoseInput): void {
    if (dose.givenOn === null) return
    const gesture = `${this.book.today} redater ${idOf(dose)} à la même date`
    const { dose: fields, shift, postponement } = before.redate(dose.id, dose.givenOn)
    if (
      fields.nextDueDate !== dose.nextDueDate ||
      shift.action !== 'none' ||
      postponement !== null
    ) {
      this.fail(`${gesture} : ligne réécrite ${JSON.stringify({ fields, shift, postponement })}`)
    }
    const doses = this.book.doses.map((line) =>
      line.id === dose.id ? { ...line, ...fields } : line,
    )
    if (calendarOf(this.schedule({ ...this.book, doses })) !== calendarOf(before)) {
      this.fail(`${gesture} : le calendrier change`)
    }
  }

  // TR-24 bis, Q8 : redater une prise sans toucher à aucun décalage ni report ne déplace rien.
  private checkKeptSuite(before: TreatmentSchedule, untouched: boolean, gesture: string): void {
    if (!untouched) return
    const pending = (schedule: TreatmentSchedule) =>
      JSON.stringify([schedule.currentDoses.map(idOf), schedule.upcoming(60).map(idOf)])
    if (pending(this.schedule()) !== pending(before)) {
      this.fail(`${gesture} : la suite passe de ${pending(before)} à ${pending(this.schedule())}`)
    }
  }

  // (f) Hors déplacement, la dose qui suit une prise de la dose du moment est à un intervalle : ni avant, ni après.
  private checkGap(
    after: TreatmentSchedule,
    due: Due,
    givenOn: string,
    nextDueDate: string,
    gesture: string,
  ): void {
    const period = this.book.periods.find(({ id }) => id === due.periodId)
    if (period === undefined) return
    // Seule la dernière ligne fixe la suite ; un déplacement du même jour ou d'après est explicite.
    const key = idOf(due)
    const followed = after.doses.some(
      (dose) =>
        dose.periodId === due.periodId &&
        idOf(dose) !== key &&
        (dose.status === 'postponed' ? dose.dueOn >= due.dueOn : idOf(dose) > key),
    )
    if (followed) return
    const soonest = shifted(givenOn < due.dueOn ? givenOn : due.dueOn, period.frequency, 1)
    if (nextDueDate !== due.dueOn && nextDueDate < soonest) {
      this.fail(`${gesture} : prochaine dose écrite au ${nextDueDate}, avant le ${soonest}`)
    }
    const next = pendingOf(after).find(
      (other) => other.periodId === due.periodId && other.dueOn > due.dueOn,
    )
    if (next !== undefined && next.dueOn < soonest) {
      this.fail(`${gesture} : dose suivante le ${next.dueOn}, avant le ${soonest}`)
    }
    // En mois, le jour de référence (le 31) peut tomber jusqu'à trois jours après le même quantième.
    const slack = period.frequency.unit === 'month' ? 3 : 0
    const from = givenOn > due.dueOn ? givenOn : due.dueOn
    const latest = plusDays(shifted(from, period.frequency, 1), slack)
    if (nextDueDate !== due.dueOn && nextDueDate > latest) {
      this.fail(`${gesture} : prochaine dose écrite au ${nextDueDate}, après le ${latest}`)
    }
    if (next !== undefined && next.dueOn > latest) {
      this.fail(`${gesture} : dose suivante le ${next.dueOn}, après le ${latest}`)
    }
  }

  // (g) Une échéance n'a jamais deux lignes : ni une dose à donner sur l'échéance d'une ligne, ni un
  // déplacement sur place. Un décalage seul laisse son échéance d'origine à donner (§2.6, règle 2) ;
  // une prise en plus, rangée sous sa date réelle, ne couvre aucune échéance.
  private checkOneLinePerDue(): void {
    const schedule = this.schedule()
    const covering = schedule.doses.filter(({ status }) => status !== 'shift' && status !== 'extra')
    const lines = new Set(covering.map(idOf))
    const doubled = pendingOf(schedule).find((due) => lines.has(idOf(due)))
    if (doubled !== undefined)
      this.fail(`dose à donner sur une échéance déjà en ligne : ${idOf(doubled)}`)
    const still = schedule.doses.find(
      (dose) => dose.status === 'postponed' && dose.nextDueDate === dose.dueOn,
    )
    if (still !== undefined) this.fail(`déplacement sur place en vigueur : ${idOf(still)}`)
  }

  // TR-26 : une prise supprimée rend son échéance, à donner ou à renseigner.
  private delete(before: TreatmentSchedule): void {
    const line = pick(this.random, before.doses.filter(isNote))
    if (line === undefined) return
    const gesture = `${this.book.today} supprimer la prise ${idOf(line)}`
    this.log.push(gesture)
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => id !== line.id) }
    const after = this.schedule()
    const key = idOf(line)
    // La suite d'après se recalcule depuis la ligne précédente : seules les échéances d'avant sont tenues.
    this.checkProtected(
      before,
      after,
      (due) => due.periodId !== line.periodId || idOf(due) < key,
      gesture,
    )
    const period = this.book.periods.find(({ id }) => id === line.periodId)
    const last = this.book.periods.at(-1)
    const isOpen = period !== undefined && period === last && period.stoppedOn === null
    const moved = after.doses.some(
      (dose) => dose.status === 'postponed' && dose.periodId === line.periodId,
    )
    // Une prise dont la date a été corrigée peut laisser derrière elle une échéance hors de la suite.
    const wasRewritten = this.redated
    this.redated = true
    // Une prise donnée un autre jour a pu refixer la suite : l'échéance supprimée n'en fait plus forcément partie.
    const offDay = before.doses.some(
      (dose) =>
        dose.periodId === line.periodId && dose.givenOn !== null && dose.givenOn !== dose.dueOn,
    )
    if (!isOpen || moved || wasRewritten || offDay || this.book.periods.length > 1) return
    if (!pendingOf(after).some((due) => idOf(due) === idOf(line)) && !after.finished) {
      const horizon = after.upcoming(60).at(-1)
      if (horizon === undefined || horizon.dueOn >= line.dueOn) {
        this.fail(`${gesture} : l’échéance ne revient pas`)
      }
    }
  }

  // Q25 : « Supprimer ce report » est refusé dès que la dose d'arrivée est notée, accepté sinon.
  private unmove(before: TreatmentSchedule): void {
    const line = pick(
      this.random,
      before.doses.filter(({ status }) => status === 'postponed'),
    )
    if (line === undefined) return
    const gesture = `${this.book.today} supprimer le déplacement ${idOf(line)}`
    const arrivalLogged = before.doses.some(
      (dose) => isNote(dose) && dose.periodId === line.periodId && dose.dueOn === line.nextDueDate,
    )
    if (before.lockedMoveIds.includes(line.id) !== arrivalLogged) {
      this.fail(
        `${gesture} : verrou ${String(!arrivalLogged)} alors que l’arrivée est notée : ${String(arrivalLogged)}`,
      )
    }
    const tooClose = arrivalLogged ? null : this.tooClose(line)
    const refusal = before.moveRemovalRefusal(line.id)
    if (!arrivalLogged && JSON.stringify(refusal) !== JSON.stringify(tooClose)) {
      this.fail(
        `${gesture} : refus ${JSON.stringify(refusal)}, attendu ${JSON.stringify(tooClose)}`,
      )
    }
    let refused = false
    try {
      before.removeMove(line.id)
    } catch {
      refused = true
    }
    if (refused !== (arrivalLogged || tooClose !== null)) {
      this.fail(`${gesture} : refus ${String(refused)} inattendu`)
    }
    if (refused) return
    this.log.push(gesture)
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => id !== line.id) }
    this.checkProtected(
      before,
      this.schedule(),
      (due) => due.periodId !== line.periodId || due.dueOn !== line.nextDueDate,
      gesture,
    )
  }

  // Décision du 2026-10-05, recalculée à part sur le carnet sans la ligne : le report supprimé
  // ramènerait sa dose à moins d'une demi-fréquence de la suivante.
  private tooClose(move: TreatmentDoseInput): { dueOn: string; nextOn: string } | null {
    const without = this.schedule({
      ...this.book,
      doses: this.book.doses.filter(({ id }) => id !== move.id),
    })
    const days = [
      ...new Set(
        pendingOf(without)
          .filter((due) => due.periodId === move.periodId)
          .map(({ dueOn }) => dueOn),
      ),
    ].sort()
    if (!days.includes(move.dueOn)) return null
    const nextOn = days.find((day) => day > move.dueOn)
    const period = this.book.periods.find(({ id }) => id === move.periodId)
    if (nextOn === undefined || period === undefined) return null
    const gap = differenceInCalendarDays(parseISO(nextOn), parseISO(move.dueOn))
    const step = differenceInCalendarDays(
      parseISO(shifted(move.dueOn, period.frequency, 1)),
      parseISO(move.dueOn),
    )
    return 2 * gap < step ? { dueOn: move.dueOn, nextOn } : null
  }

  // N7, N8 : un décalage se supprime seul, sauf quand une dose plus loin est notée ou que son report
  // a dépassé la dose suivante ; ce qui précède sa journée d'origine reste.
  private unshift(before: TreatmentSchedule): void {
    const line = pick(
      this.shiftRandom,
      before.doses.filter((dose) => dose.status === 'shift'),
    )
    if (line === undefined) return
    const gesture = `${this.book.today} supprimer le décalage ${idOf(line)}`
    const report = before.doses.find(
      (dose) => dose.status === 'postponed' && idOf(dose) === idOf(line),
    )
    const laterNote = before.doses.some(
      (dose) =>
        isNote(dose) &&
        dose.periodId === line.periodId &&
        dose.dueOn > line.dueOn &&
        dose.dueOn !== report?.nextDueDate,
    )
    const afterRemoval = this.book.doses.filter(({ id }) => id !== line.id)
    // Q2 a, recalculée sur le carnet sans les lignes du report : il arrive au plus la veille de la suivante.
    const passes = (doses: TreatmentDoseInput[], move: TreatmentDoseInput) => {
      const without = this.schedule({
        ...this.book,
        doses: doses.filter((dose) => idOf(dose) !== idOf(move) || dose.status === 'extra'),
      })
      const nextOn = pendingOf(without).find(
        (due) => due.periodId === move.periodId && due.dueOn > move.dueOn,
      )?.dueOn
      return nextOn !== undefined && move.nextDueDate >= nextOn
    }
    const pastNext = before.doses.some(
      (move) =>
        move.status === 'postponed' &&
        move.periodId === line.periodId &&
        move.dueOn >= line.dueOn &&
        move.nextDueDate > move.dueOn &&
        !before.doses.some(
          (other) =>
            other.status === 'shift' &&
            other.id !== line.id &&
            other.periodId === move.periodId &&
            other.dueOn === move.dueOn,
        ) &&
        passes(afterRemoval, move) &&
        !(idOf(move) !== idOf(line) && passes(this.book.doses, move)),
    )
    // Graine 2157 : un report seul qui suit garde une échéance d'origine du rythme rétabli.
    const stranded = before.doses.some((move) => {
      if (move.status !== 'postponed' || move.periodId !== line.periodId) return false
      if (move.dueOn <= line.dueOn) return false
      const shifted = before.doses.some(
        (other) =>
          other.status === 'shift' &&
          other.periodId === move.periodId &&
          other.dueOn === move.dueOn,
      )
      if (shifted) return false
      const restored = this.schedule({
        ...this.book,
        doses: afterRemoval.filter((dose) => idOf(dose) !== idOf(move) || dose.status === 'extra'),
      })
      return !pendingOf(restored).some((due) => idOf(due) === idOf(move))
    })
    const expected = laterNote
      ? 'later-dose'
      : pastNext
        ? 'move-past-next'
        : stranded
          ? 'move-off-rhythm'
          : null
    const refusal = before.shiftRemovalRefusal(line.id)
    if (refusal !== expected) {
      this.fail(`${gesture} : refus ${String(refusal)}, attendu ${String(expected)}`)
    }
    if (refusal !== null) {
      let thrown = false
      try {
        before.removeShift(line.id)
      } catch {
        thrown = true
      }
      if (!thrown) this.fail(`${gesture} : refusé mais accepté`)
      return
    }
    this.log.push(gesture)
    this.book = this.applied(this.book, before.removeShift(line.id))
    this.checkProtected(
      before,
      this.schedule(),
      (due) => due.periodId !== line.periodId || due.dueOn <= line.dueOn,
      gesture,
    )
  }

  private stop(before: TreatmentSchedule): void {
    const { periods, today } = this.book
    const last = periods.at(-1)
    if (last === undefined || last.stoppedOn !== null || last.startsOn > today) return
    const gesture = `${today} arrêter`
    this.log.push(gesture)
    this.book = {
      ...this.book,
      periods: periods.map((period) =>
        period === last ? { ...period, stoppedOn: today } : period,
      ),
    }
    const after = this.schedule()
    if (after.phase !== 'stopped') this.fail(`${gesture} : le traitement n’est pas arrêté`)
    this.checkProtected(before, after, (due) => due.dueOn < today, gesture)
  }

  private resume(before: TreatmentSchedule): void {
    const { periods, today } = this.book
    if (before.phase !== 'stopped' || periods.length >= 4) return
    const firstDueOn = plusDays(today, int(this.random, 0, 3))
    const times = pick(this.random, TIMES) ?? []
    const period: TreatmentPeriodInput = {
      id: `p${periods.length + 1}`,
      startsOn: today,
      firstDueOn,
      referenceOn: firstDueOn,
      endsOn: this.random() < 0.2 ? plusDays(firstDueOn, int(this.random, 3, 40)) : null,
      stoppedOn: null,
      frequency: pick(this.random, FREQUENCIES) ?? { value: 1, unit: 'day' },
      times,
      createdAt: this.at(),
    }
    const gesture = `${today} reprendre ${JSON.stringify(period)}`
    this.log.push(gesture)
    this.book = { ...this.book, periods: [...periods, period] }
    const after = this.schedule()
    this.checkProtected(before, after, () => true, gesture)
    const hours = times.length > 0 ? times : [null]
    const pending = new Set(pendingOf(after).map(idOf))
    const missing = hours.find(
      (dueTime) => !pending.has(idOf({ periodId: period.id, dueOn: firstDueOn, dueTime })),
    )
    if (missing !== undefined)
      this.fail(`${gesture} : la première prise de ${missing ?? 'la reprise'} manque`)
  }

  private redate(before: TreatmentSchedule): void {
    const dose = pick(
      this.random,
      before.doses.filter(({ status }) => status === 'given'),
    )
    if (dose === undefined) return
    this.checkSameDate(before, dose)
    const givenOn = plusDays(this.book.today, -int(this.random, 0, 6))
    // M1 : une prise donnée ne devient jamais une prise en plus par « Changer la date ».
    const { lastExtraDay } = before.redateLimits(dose.id)
    if (lastExtraDay !== null && givenOn <= lastExtraDay) {
      this.checkRefused(
        () => before.redate(dose.id, givenOn),
        `redater ${idOf(dose)} au ${givenOn}`,
      )
      return
    }
    const unchecked = before.redateOffersShift(dose.id, givenOn) && this.unchecks()
    const box = unchecked ? ', case décochée' : ''
    const gesture = `${this.book.today} redater ${idOf(dose)} au ${givenOn}${box}`
    if (before.redateRefusal(dose.id, givenOn, !unchecked) !== null) {
      let thrown = false
      try {
        before.redate(dose.id, givenOn, !unchecked)
      } catch {
        thrown = true
      }
      if (!thrown) this.fail(`${gesture} : refusé mais accepté`)
      return
    }
    const redateFrom = this.book
    this.redated = true
    this.log.push(gesture)
    const { dose: fields, shift, postponement } = before.redate(dose.id, givenOn, !unchecked)
    const anchored =
      shift.action === 'create' ||
      (shift.action === 'rewrite' && shift.dose.nextDueDate === givenOn)
    if (unchecked && anchored) this.fail(`${gesture} : un décalage est ancré à la nouvelle date`)
    const dropped = postponement?.kept === false ? postponement.doseIds : []
    const at = this.at()
    const rewritten = (line: TreatmentDoseInput): TreatmentDoseInput => {
      if (line.id === dose.id) return { ...line, ...fields, updatedAt: at }
      if (postponement?.kept !== true) return line
      if (postponement.doseIds.includes(line.id)) {
        return { ...line, ...postponement.line, updatedAt: at }
      }
      return postponement.shiftIds.includes(line.id)
        ? { ...line, ...postponement.shiftLine, updatedAt: at }
        : line
    }
    this.book = this.applied(
      {
        ...this.book,
        doses: this.book.doses.filter(({ id }) => !dropped.includes(id)).map(rewritten),
      },
      shift,
    )
    this.checkKeptSuite(before, shift.action === 'none' && postponement === null, gesture)
    this.checkNoPassedMove(redateFrom, gesture)
    const suiteMoved =
      fields.nextDueDate !== dose.nextDueDate || shift.action !== 'none' || postponement !== null
    const key = `${dose.dueOn} ${dose.dueTime ?? ''}`
    this.checkProtected(
      before,
      this.schedule(),
      (due) =>
        !suiteMoved || due.periodId !== dose.periodId || `${due.dueOn} ${due.dueTime ?? ''}` < key,
      gesture,
    )
  }

  private newPeriod(before: TreatmentSchedule): void {
    const { periods } = this.book
    if (!before.currentPeriodHasDose || periods.length >= 4 || before.phase === 'stopped') return
    const picked = {
      frequency: pick(this.random, FREQUENCIES) ?? { value: 1, unit: 'day' as const },
      times: pick(this.random, TIMES) ?? [],
    }
    // G23 : la posologie seule changée quand la prochaine dose est l'arrivée d'un déplacement.
    const current = periods.at(-1)
    const keeps =
      current !== undefined && arrivesOnNextDose(before, current) && this.rhythmRandom() < 0.5
    const { frequency, times } = keeps ? current : picked
    const dates = before.newPeriod(frequency, times)
    const gesture = `${this.book.today} nouvelle période ${JSON.stringify({ ...dates, frequency })}`
    this.log.push(gesture)
    const period: TreatmentPeriodInput = {
      id: `p${periods.length + 1}`,
      ...dates,
      endsOn: this.random() < 0.2 ? plusDays(dates.firstDueOn, int(this.random, 3, 40)) : null,
      stoppedOn: null,
      frequency,
      times: [...times],
      createdAt: this.at(),
    }
    this.book = { ...this.book, periods: [...periods, period] }
    const after = this.schedule()
    this.checkProtected(before, after, (due) => due.dueOn < dates.startsOn, gesture)
    this.checkNewSetting(before, after, period, gesture)
    this.checkLoneArrivalKept(before, after, period, gesture)
    this.checkCalendarKept(before, after, period, gesture)
    this.checkFirstDueKept(after, period, gesture)
  }

  // G23 : au même rythme, la prochaine dose arrivée d'un report seul garde sa date, la suite son rythme.
  private checkLoneArrivalKept(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    period: TreatmentPeriodInput,
    gesture: string,
  ): void {
    const { today } = this.book
    const previous = this.book.periods.at(-2)
    const day = before.currentDoses[0]?.dueOn
    if (previous === undefined || day === undefined || day < today) return
    if (rhythmKey(previous) !== rhythmKey(period)) return
    const lone = loneArrivalOf(before, previous)
    if (lone === undefined) return
    const lines = before.doses.filter(
      ({ periodId, status }) =>
        periodId === previous.id && (status === 'postponed' || status === 'shift'),
    )
    const pendingDays = [
      ...new Set(
        pendingOf(before)
          .map(({ dueOn }) => dueOn)
          .filter((dueOn) => dueOn >= day),
      ),
    ].sort()
    const otherLines = lines
      .filter((line) => line !== lone)
      .flatMap(({ dueOn, nextDueDate }) => [dueOn, nextDueDate])
      .filter((other) => other >= day)
    const limits = [pendingDays[2], previous.endsOn, period.endsOn]
      .filter((limit) => limit !== null && limit !== undefined)
      .concat(otherLines.map((other) => plusDays(other, -1)))
      .sort()
    const horizon = limits[0] ?? pendingDays.at(-1) ?? day
    const slots = (schedule: TreatmentSchedule) =>
      pendingOf(schedule)
        .filter(({ dueOn }) => dueOn >= today && dueOn <= horizon)
        .map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`)
        .sort()
        .join()
    if (slots(before) === slots(after)) return
    if (isKnownLimit(slots(before), slots(after), period.frequency)) return
    this.fail(`${gesture} : le calendrier a changé (${slots(before)} → ${slots(after)})`)
  }

  // G23 : au même rythme, la prochaine dose gardée, les jours suivants le sont aussi, hors lignes plus
  // lointaines (G5).
  private checkCalendarKept(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    period: TreatmentPeriodInput,
    gesture: string,
  ): void {
    const previous = this.book.periods.at(-2)
    const day = before.currentDoses[0]?.dueOn
    if (previous === undefined || day === undefined || day < this.book.today) return
    if (rhythmKey(previous) !== rhythmKey(period) || period.firstDueOn !== day) return
    const farther = before.doses
      .filter(
        ({ periodId, status, nextDueDate }) =>
          periodId === previous.id &&
          (status === 'postponed' || status === 'shift') &&
          nextDueDate > day,
      )
      .flatMap(({ dueOn, nextDueDate }) => [dueOn, nextDueDate])
    const days = [...new Set(pendingOf(before).map(({ dueOn }) => dueOn))]
      .filter((dueOn) => dueOn >= day)
      .sort()
    const limits = [days[3], previous.endsOn, period.endsOn, ...farther.map((d) => plusDays(d, -1))]
      .filter((limit) => limit !== null && limit !== undefined)
      .sort()
    const horizon = limits[0] ?? days.at(-1) ?? day
    const slots = (schedule: TreatmentSchedule) =>
      pendingOf(schedule)
        .filter(({ dueOn }) => dueOn >= day && dueOn <= horizon)
        .map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`)
        .sort()
        .join()
    if (slots(before) === slots(after)) return
    if (isKnownLimit(slots(before), slots(after), period.frequency)) return
    this.fail(`${gesture} : la suite a changé (${slots(before)} → ${slots(after)})`)
  }

  // TR-7, Q8, G24 : rythme changé, la première échéance proposée garde une dose à donner ; aucune
  // prise d'une ancienne période ne la fait passer plus loin.
  private checkFirstDueKept(
    after: TreatmentSchedule,
    period: TreatmentPeriodInput,
    gesture: string,
  ): void {
    const previous = this.book.periods.at(-2)
    if (previous === undefined || rhythmKey(previous) === rhythmKey(period)) return
    if (period.firstDueOn < this.book.today) return
    // §11 : avant le début du traitement, la journée de départ suit Q24 même si elle a décalé la suite.
    if (period.startsOn > this.book.today) return
    // §11 : une prise d'une période plus ancienne que la précédente couvre encore ce jour (Q24).
    const covering = after.doses.filter(
      (dose) => isNote(dose) && dose.dueOn === period.firstDueOn && dose.periodId !== period.id,
    )
    if (covering.length > 0 && covering.every(({ periodId }) => periodId !== previous.id)) return
    const first = pendingOf(after).find((due) => due.periodId === period.id)
    if (first !== undefined && first.dueOn > period.firstDueOn) {
      this.fail(`${gesture} : première dose le ${first.dueOn}, après le ${period.firstDueOn}`)
    }
  }

  // Q24 : le nouveau réglage vaut tout de suite, les prises du jour comptent pour ses premières heures.
  private checkNewSetting(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    period: TreatmentPeriodInput,
    gesture: string,
  ): void {
    const { today } = this.book
    const previous = this.book.periods.at(-2)
    if (
      period.startsOn !==
      (previous !== undefined && previous.startsOn > today ? previous.startsOn : today)
    ) {
      this.fail(`${gesture} : la nouvelle période ne commence pas aujourd’hui`)
    }
    const pending = pendingOf(after)
    if (pending.some((due) => due.periodId !== period.id && due.dueOn >= period.startsOn)) {
      this.fail(`${gesture} : une dose de l’ancien réglage reste à donner`)
    }
    if (period.startsOn !== today) return
    // Une reprise garde sa première prise : seules comptent les prises notées depuis le dernier arrêt.
    const { periods } = this.book
    const lastStop = periods.map(({ stoppedOn }) => stoppedOn !== null).lastIndexOf(true)
    const stopped = new Set(periods.slice(0, lastStop + 1).map(({ id }) => id))
    const ofToday = before.doses.filter(
      (dose) => isNote(dose) && dose.dueOn === today && !stopped.has(dose.periodId),
    )
    const noted = ofToday.length
    const hours = Math.max(1, period.times.length)
    const left = pending.filter((due) => due.periodId === period.id && due.dueOn === today).length
    // Q8 : rythme changé, une journée de départ qui a décalé la suite ne couvre rien, sauf Q24 entamé.
    const changed = previous !== undefined && rhythmKey(previous) !== rhythmKey(period)
    const uncovered =
      changed &&
      noted >= period.times.length &&
      ofToday.some((dose) => refixesSuite(dose, before.doses))
    const expected =
      period.firstDueOn === today ? (uncovered ? hours : Math.max(0, hours - noted)) : 0
    if (left !== expected) {
      this.fail(`${gesture} : ${left} dose(s) à donner aujourd’hui, ${expected} attendue(s)`)
    }
    const movedAway = !pendingOf(before).some((due) => due.dueOn === today)
    if (noted > 0 && noted < hours && period.firstDueOn !== today && !movedAway) {
      this.fail(`${gesture} : les heures restantes du jour sont perdues`)
    }
    const dueToday = before.currentDoses.some((due) => due.dueOn === today)
    if (noted === 0 && dueToday && left !== hours) {
      this.fail(`${gesture} : rien noté pour aujourd’hui, ${left} dose(s) sur ${hours} restent`)
    }
    this.checkDayStartedAhead(before, after, period, stopped, gesture)
  }

  // G22 : au même rythme, une journée à venir entamée en avance garde ses heures restantes (G23).
  // G24 : heures ou fréquence changées, ses prises comptent pour les premières heures du nouveau réglage.
  private checkDayStartedAhead(
    before: TreatmentSchedule,
    after: TreatmentSchedule,
    period: TreatmentPeriodInput,
    stopped: Set<string>,
    gesture: string,
  ): void {
    const previous = this.book.periods.at(-2)
    const day = before.currentDoses[0]?.dueOn
    if (previous === undefined || day === undefined || day <= this.book.today) return
    const kept = rhythmKey(previous) === rhythmKey(period)
    // Q8 : rythme changé, une prise qui a décalé la suite compte à sa date réelle.
    const ofDay = before.doses.filter(
      (dose) => isNote(dose) && dose.dueOn === day && !stopped.has(dose.periodId),
    )
    const refixed = !kept && ofDay.some((dose) => refixesSuite(dose, before.doses))
    const noted = refixed ? 0 : ofDay.length
    if (noted === 0) return
    if (!kept && noted >= Math.max(1, period.times.length)) return
    if (!kept && period.firstDueOn !== day) {
      // Q24 d'abord : des prises d'aujourd'hui font partir le nouveau réglage d'aujourd'hui.
      const { startsOn } = period
      const startsToday = before.doses.some(
        (dose) => isNote(dose) && dose.dueOn === startsOn && !stopped.has(dose.periodId),
      )
      if (!startsToday && startsOn === this.book.today) {
        this.fail(`${gesture} : la journée du ${day} entamée en avance n’ouvre pas la période`)
      }
      return
    }
    const hours = Math.max(1, period.times.length)
    const left = pendingOf(after).filter(
      (due) => due.periodId === period.id && due.dueOn === day,
    ).length
    const expected = Math.max(0, hours - noted)
    if (left !== expected) {
      this.fail(`${gesture} : ${left} dose(s) à donner le ${day}, ${expected} attendue(s)`)
    }
  }

  // Q23 : une journée d'échéance n'est jamais coupée entre dose du moment et dose non renseignée.
  private checkWholeDay(): void {
    const schedule = this.schedule()
    const [first] = schedule.currentDoses
    if (first === undefined) return
    if (schedule.currentDoses.some((due) => due.dueOn !== first.dueOn)) {
      this.fail('les doses du moment sont sur plusieurs jours')
    }
    const split = schedule.unloggedDoses.find(
      (due) => due.periodId === first.periodId && due.dueOn >= first.dueOn,
    )
    if (split !== undefined) this.fail(`journée coupée : ${idOf(split)} non renseignée`)
    if (first.dueOn > this.book.today) return
    const day = schedule.upcoming(60).filter((due) => due.dueOn === first.dueOn)
    if (first.dueOn === this.book.today && day.length !== schedule.currentDoses.length) {
      this.fail('une dose du jour manque aux doses du moment')
    }
  }

  step(): void {
    const unshifted = this.book
    if (this.shiftRandom() < 0.08) this.unshift(this.schedule())
    this.checkUndo(unshifted)
    const extraGesture = this.extraRandom()
    const extraFrom = this.book
    if (extraGesture < 0.1) this.ahead(this.schedule())
    else if (extraGesture < 0.13) this.redateExtra(this.schedule())
    else if (extraGesture < 0.15) this.deleteExtra(this.schedule())
    this.checkUndo(extraFrom)
    const before = this.schedule()
    const { today } = this.book
    const start = this.book
    switch (pick(this.random, GESTURES)) {
      case 'give': {
        const due = pick(this.random, before.currentDoses)
        if (due === undefined) break
        const late = due.dueOn < today && this.random() < 0.5
        this.note(before, due, 'given', late ? due.dueOn : today)
        break
      }
      case 'miss': {
        const due = pick(this.random, before.currentDoses)
        if (due !== undefined && due.dueOn <= today) this.note(before, due, 'missed', due.dueOn)
        break
      }
      case 'delete':
        this.delete(before)
        break
      case 'stop':
        if (this.random() < 0.3) this.stop(before)
        break
      case 'resume':
        this.resume(before)
        break
      case 'log': {
        const due = pick(this.random, before.unloggedDoses)
        if (due === undefined) break
        this.note(before, due, this.random() < 0.7 ? 'given' : 'missed', due.dueOn)
        break
      }
      case 'otherDate': {
        const givenOn = plusDays(today, -int(this.random, 0, 8))
        const period = this.book.periods.at(-1)
        const time = pick(this.random, period?.times ?? []) ?? null
        const due = before.dueForDate(givenOn, time)
        const isNoted = before.doses.some((dose) => due !== null && idOf(dose) === idOf(due))
        if (due === null || isNoted) break
        const offered = before.offersShift(due, givenOn)
        this.checkOffer(before, due, givenOn, offered)
        if (!offered) {
          this.note(before, due, 'given', givenOn)
          break
        }
        const checked = !this.unchecks()
        if (checked && before.noteRefusal(due, givenOn) !== null) {
          let thrown = false
          try {
            before.doseFor({ kind: 'given', due, givenOn, shiftsFollowing: true })
          } catch {
            thrown = true
          }
          if (!thrown) this.fail(`${today} noter ${idOf(due)} le ${givenOn} : refusé mais accepté`)
          break
        }
        this.note(before, due, 'given', givenOn, checked)
        break
      }
      case 'move':
        this.move(before)
        break
      case 'redate':
        this.redate(before)
        break
      case 'newPeriod':
        this.newPeriod(before)
        break
      case 'unmove':
        this.unmove(before)
        break
      default:
        this.book = { ...this.book, today: plusDays(today, int(this.random, 1, 4)) }
    }
    if (this.book.periods === start.periods) this.checkUndo(start)
    this.checkFinished(this.book)
    this.purgeStale()
    this.checkWholeDay()
    this.checkOneLinePerDue()
    this.checkGhost()
  }

  // « Annuler », comme le repository : les lignes créées supprimées, les autres rétablies et datées
  // de l'annulation ; le calendrier redevient celui d'avant le geste.
  private checkUndo(start: Book): void {
    if (this.book.doses === start.doses || this.book.today !== start.today) return
    const at = this.at()
    const after = new Map(this.book.doses.map((line) => [line.id, JSON.stringify(line)]))
    const doses = start.doses.map((line) =>
      after.get(line.id) === JSON.stringify(line) ? line : { ...line, updatedAt: at },
    )
    const undone = this.schedule({ ...start, doses })
    const expected = this.schedule(start)
    const shown = (schedule: TreatmentSchedule) =>
      JSON.stringify({ calendar: calendarOf(schedule), next: schedule.nextDue })
    if (shown(undone) !== shown(expected)) {
      this.fail(`annuler ${this.log.at(-1) ?? ''} : ${shown(expected)} → ${shown(undone)}`)
    }
  }

  private checkRefused(gesture: () => unknown, label: string): void {
    try {
      gesture()
    } catch (error) {
      if (String(error).includes('prise en plus')) return
    }
    this.fail(`${label} : accepté, ou refusé pour une autre raison`)
  }

  // Fantôme : le carnet privé de ses prises en plus a le même calendrier, et les gestes y ont les
  // mêmes bornes.
  private checkGhost(): void {
    const ghost = {
      ...this.book,
      doses: this.book.doses.filter(({ status }) => status !== 'extra'),
    }
    if (ghost.doses.length === this.book.doses.length) return
    const [real, without] = [this.schedule(), this.schedule(ghost)]
    const gestures = (schedule: TreatmentSchedule) => {
      const [current] = schedule.currentDoses
      return JSON.stringify({
        calendar: calendarOf(schedule),
        bounds: current === undefined ? null : schedule.moveBounds(current),
        refusal: current === undefined ? null : schedule.moveRefusal(current),
        change: schedule.nextDoseChange,
        hasDose: schedule.currentPeriodHasDose,
        stale: schedule.staleDoseIds,
      })
    }
    if (gestures(real) !== gestures(without)) {
      this.fail(`fantôme : ${gestures(real)} ≠ ${gestures(without)}`)
    }
  }

  // Comme le repository : les déplacements sans effet partent avec l'écriture, sans toucher au calendrier.
  private purgeStale(): void {
    const before = this.schedule()
    const stale = before.staleDoseIds
    if (stale.length === 0) return
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => !stale.includes(id)) }
    const after = this.schedule()
    if (calendarOf(after) !== calendarOf(before)) {
      this.fail(`purge de ${stale.join(', ')} : ${calendarOf(before)} → ${calendarOf(after)}`)
    }
  }
}

describe('en mois, départs les 29, 30 et 31 (TR-7, TR-18)', () => {
  const STARTS = [
    '2026-01-29',
    '2026-01-30',
    '2026-01-31',
    '2026-03-31',
    '2026-05-31',
    '2026-07-30',
    '2026-07-31',
    '2027-01-31',
    '2028-01-29',
    '2028-01-30',
    '2028-01-31',
  ]
  const MONTHS = [1, 2, 3, 6, 12]

  it('noter une dose non renseignée à la date de son échéance ne change ni la dose du moment ni la suite', () => {
    const drifts: string[] = []
    for (const firstDueOn of STARTS) {
      for (const value of MONTHS) {
        const period: TreatmentPeriodInput = {
          id: 'p1',
          startsOn: firstDueOn,
          firstDueOn,
          referenceOn: firstDueOn,
          endsOn: null,
          stoppedOn: null,
          frequency: { value, unit: 'month' },
          times: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        }
        const book: Book = { periods: [period], doses: [], today: plusDays(firstDueOn, 1500) }
        const before = scheduleOf(book)
        for (const unlogged of before.unloggedDoses.slice(0, 4)) {
          const { dueOn } = unlogged
          const fields = before.doseFor({ kind: 'given', due: unlogged, givenOn: dueOn }).dose
          const at = '2026-01-01T00:00:01.000Z'
          const doses = [{ id: 'd1', ...fields, createdAt: at, updatedAt: at }]
          const after = scheduleOf({ ...book, doses })
          const same =
            JSON.stringify(after.currentDoses) === JSON.stringify(before.currentDoses) &&
            JSON.stringify(after.upcoming(24)) === JSON.stringify(before.upcoming(24))
          if (!same) drifts.push(`${firstDueOn}, tous les ${value} mois : ${dueOn}`)
        }
      }
    }

    expect(drifts).toEqual([])
  })
})

describe('invariants du moteur, sur des carnets et des gestes tirés au sort (graine fixe)', () => {
  it(
    'aucune dose ne disparaît sans bruit après un geste accepté',
    () => {
      const failures: string[] = []
      let played = 0
      for (let seed = FIRST_SEED; seed < FIRST_SEED + CARNETS; seed += 1) {
        played += 1
        const random = mulberry32(seed)
        const simulation = new Simulation(newBook(random), random, seed)
        try {
          for (let step = 0; step < STEPS; step += 1) simulation.step()
        } catch (error) {
          failures.push(String(error))
        }
      }

      console.warn(
        `Campagne : ${played} carnets × ${STEPS} gestes, graines ${FIRST_SEED} à ${FIRST_SEED + CARNETS - 1}`,
      )
      expect(played).toBe(CARNETS)
      expect(failures).toEqual([])
    },
    TIMEOUT,
  )
})
