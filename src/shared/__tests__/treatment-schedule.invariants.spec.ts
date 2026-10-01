// @vitest-environment node
import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import {
  treatmentSchedule,
  type Due,
  type Frequency,
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
  { value: 1, unit: 'month' },
]
const TIMES = [[], ['08:00', '20:00'], ['08:00', '14:00', '20:00']]
const GESTURES = [
  'give',
  'give',
  'give',
  'log',
  'otherDate',
  'move',
  'move',
  'redate',
  'newPeriod',
  'unmove',
  'wait',
  'wait',
] as const
const CARNETS = 150
const STEPS = 24

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

function scheduleOf({ periods, doses, today }: Book): TreatmentSchedule {
  return treatmentSchedule({ periods, doses, today })
}

function pendingOf(schedule: TreatmentSchedule): Due[] {
  const all = [...schedule.unloggedDoses, ...schedule.currentDoses, ...schedule.upcoming(60)]
  return [...new Map(all.map((due) => [idOf(due), due])).values()]
}

function newBook(random: Random): Book {
  const firstDueOn = plusDays('2026-03-01', int(random, 0, 40))
  const period: TreatmentPeriodInput = {
    id: 'p1',
    startsOn: firstDueOn,
    firstDueOn,
    endsOn: random() < 0.3 ? plusDays(firstDueOn, int(random, 3, 60)) : null,
    stoppedOn: null,
    frequency: pick(random, FREQUENCIES) ?? { value: 1, unit: 'day' },
    times: pick(random, TIMES) ?? [],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  return { periods: [period], doses: [], today: plusDays(firstDueOn, int(random, -2, 3)) }
}

class Simulation {
  private stamp = 0
  readonly log: string[] = []

  constructor(
    public book: Book,
    private readonly random: Random,
    private readonly seed: number,
  ) {}

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

  private written(
    book: Book,
    fields: Omit<TreatmentDoseInput, 'id' | 'createdAt' | 'updatedAt'>,
  ): Book {
    const at = this.at()
    const existing = book.doses.find((dose) => idOf(dose) === idOf(fields))
    const doses = existing
      ? book.doses.map((dose) => (dose === existing ? { ...dose, ...fields, updatedAt: at } : dose))
      : [...book.doses, { id: `d${this.stamp}`, ...fields, createdAt: at, updatedAt: at }]
    return { ...book, doses }
  }

  private afterMove(due: Due, to: string): Book {
    const moved = scheduleOf(this.book).move(due, to)
    const { doses } = this.book
    switch (moved.action) {
      case 'none':
        return this.book
      case 'create':
        return this.written(this.book, moved.dose)
      case 'delete':
        return { ...this.book, doses: doses.filter(({ id }) => id !== moved.doseId) }
      case 'rewrite': {
        const at = this.at()
        return {
          ...this.book,
          doses: doses.map((line) =>
            line.id === moved.doseId ? { ...line, ...moved.dose, updatedAt: at } : line,
          ),
        }
      }
    }
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
    const noted = new Set(after.doses.filter(({ status }) => status !== 'postponed').map(idOf))
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
    if (leftBehind.length > 0 && !landsOn(to, due.dueOn, period.frequency)) {
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
      [before.currentDoses[0], before.nextDue].filter(
        (item) => item !== null && item !== undefined,
      ),
    )
    if (due === undefined) return
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

  private note(
    before: TreatmentSchedule,
    due: Due,
    kind: 'given' | 'missed',
    givenOn: string,
  ): void {
    const gesture = `${this.book.today} ${kind} ${idOf(due)} le ${givenOn}`
    this.log.push(gesture)
    let fields
    try {
      fields =
        kind === 'given' ? before.doseFor({ kind, due, givenOn }) : before.doseFor({ kind, due })
    } catch (error) {
      return this.fail(`${gesture} : ${String(error)}`)
    }
    this.book = this.written(this.book, fields)
    this.checkProtected(before, this.schedule(), () => true, gesture)
  }

  private redate(before: TreatmentSchedule): void {
    const dose = pick(
      this.random,
      before.doses.filter(({ status }) => status === 'given'),
    )
    if (dose === undefined) return
    const givenOn = plusDays(this.book.today, -int(this.random, 0, 6))
    const gesture = `${this.book.today} redater ${idOf(dose)} au ${givenOn}`
    this.log.push(gesture)
    const { dose: fields, postponement } = before.redate(dose.id, givenOn)
    const dropped = postponement?.kept === false ? postponement.doseIds : []
    const at = this.at()
    this.book = {
      ...this.book,
      doses: this.book.doses
        .filter(({ id }) => !dropped.includes(id))
        .map((line) => (line.id === dose.id ? { ...line, ...fields, updatedAt: at } : line)),
    }
    const suiteMoved = fields.nextDueDate !== dose.nextDueDate || dropped.length > 0
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
    if (!before.currentPeriodHasDose || periods.length >= 3 || before.phase === 'stopped') return
    const frequency = pick(this.random, FREQUENCIES) ?? { value: 1, unit: 'day' }
    const times = pick(this.random, TIMES) ?? []
    const dates = before.newPeriod(frequency, times)
    const gesture = `${this.book.today} nouvelle période ${JSON.stringify({ ...dates, frequency })}`
    this.log.push(gesture)
    const period: TreatmentPeriodInput = {
      id: `p${periods.length + 1}`,
      ...dates,
      endsOn: null,
      stoppedOn: null,
      frequency,
      times,
      createdAt: this.at(),
    }
    this.book = { ...this.book, periods: [...periods, period] }
    const after = this.schedule()
    this.checkProtected(before, after, (due) => due.dueOn < dates.startsOn, gesture)
    this.checkNewSetting(before, after, period, gesture)
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
    const noted = before.doses.filter(
      ({ status, dueOn }) => status !== 'postponed' && dueOn === today,
    ).length
    const hours = Math.max(1, period.times.length)
    const left = pending.filter((due) => due.periodId === period.id && due.dueOn === today).length
    const expected = period.firstDueOn === today ? Math.max(0, hours - noted) : 0
    if (left !== expected) {
      this.fail(`${gesture} : ${left} dose(s) à donner aujourd’hui, ${expected} attendue(s)`)
    }
    if (noted > 0 && noted < hours && period.firstDueOn !== today) {
      this.fail(`${gesture} : les heures restantes du jour sont perdues`)
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
    const before = this.schedule()
    const { today } = this.book
    switch (pick(this.random, GESTURES)) {
      case 'give': {
        const due = pick(this.random, before.currentDoses)
        if (due === undefined) break
        const late = due.dueOn < today && this.random() < 0.5
        this.note(before, due, 'given', late ? due.dueOn : today)
        break
      }
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
        if (due !== null && !isNoted) this.note(before, due, 'given', givenOn)
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
      case 'unmove': {
        const line = pick(
          this.random,
          this.book.doses.filter(({ status }) => status === 'postponed'),
        )
        if (line === undefined) break
        this.log.push(`${today} supprimer le déplacement ${idOf(line)}`)
        this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => id !== line.id) }
        break
      }
      default:
        this.book = { ...this.book, today: plusDays(today, int(this.random, 1, 4)) }
    }
    this.checkFinished(this.book)
    this.purgeStale()
    this.checkWholeDay()
  }

  // Comme le repository : les déplacements sans effet partent avec l'écriture.
  private purgeStale(): void {
    const stale = this.schedule().staleDoseIds
    if (stale.length === 0) return
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => !stale.includes(id)) }
  }
}

describe('invariants du moteur, sur des carnets et des gestes tirés au sort (graine fixe)', () => {
  it('aucune dose ne disparaît sans bruit après un geste accepté', () => {
    const failures: string[] = []
    for (let seed = 1; seed <= CARNETS; seed += 1) {
      const random = mulberry32(seed)
      const simulation = new Simulation(newBook(random), random, seed)
      try {
        for (let step = 0; step < STEPS; step += 1) simulation.step()
      } catch (error) {
        failures.push(String(error))
      }
    }

    expect(failures).toEqual([])
  }, 30_000)
})
