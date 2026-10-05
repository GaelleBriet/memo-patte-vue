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
// Défauts connus du moteur, antérieurs à la prise en plus : #523.
const KNOWN_FAILURES = new Set([1663, 3180, 14529])
const TIMEOUT = 30_000 + CARNETS * STEPS * 5

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

class Simulation {
  private stamp = 0
  private redated = false
  readonly log: string[] = []
  // Tirages à part : les graines déjà connues rejouent les mêmes gestes.
  private readonly shiftRandom: Random
  private readonly extraRandom: Random

  constructor(
    public book: Book,
    private readonly random: Random,
    private readonly seed: number,
  ) {
    this.shiftRandom = mulberry32(seed ^ 0x5f3759df)
    this.extraRandom = mulberry32(seed ^ 0x2545f491)
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

  private afterMove(due: Due, to: string): Book {
    const { report, shift } = scheduleOf(this.book).move(due, to)
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
      [
        before.currentDoses[0],
        before.currentDoses[0],
        before.currentDoses[0],
        before.nextDue,
      ].filter((item) => item !== null && item !== undefined),
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
    let wroteShift = false
    try {
      const noted =
        kind === 'given' ? before.doseFor({ kind, due, givenOn }) : before.doseFor({ kind, due })
      fields = noted.dose
      wroteShift = noted.shift !== null
      if (noted.shift !== null) this.book = this.written(this.book, noted.shift)
    } catch (error) {
      return this.fail(`${gesture} : ${String(error)}`)
    }
    this.book = this.written(this.book, fields)
    const after = this.schedule()
    this.checkProtected(before, after, () => true, gesture)
    if (fields.status === 'extra') return this.checkExtra(before, after, due, fields, gesture)
    this.checkWritten(after, due, fields.nextDueDate, gesture)
    const unit = this.book.periods.find(({ id }) => id === due.periodId)?.frequency.unit
    const mayCoincide = unit === 'month' && kind === 'given' && givenOn !== due.dueOn
    const wasUnlogged = before.unloggedDoses.some((unlogged) => idOf(unlogged) === idOf(due))
    if (wasUnlogged && !mayCoincide) this.checkLogged(before, after, gesture)
    if (
      kind === 'given' &&
      before.currentDoses.some((current) => idOf(current) === idOf(due)) &&
      !this.isMovedOnItsOwn(before, due, wroteShift)
    ) {
      this.checkGap(after, due, givenOn, fields.nextDueDate, gesture)
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
    const gesture = `${this.book.today} redater la prise en plus ${idOf(extra)} au ${givenOn}`
    this.log.push(gesture)
    let redated
    try {
      redated = before.redate(extra.id, givenOn)
    } catch (error) {
      if (error instanceof RangeError && String(error).includes('Aucune dose à viser')) return
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
    return (shiftOn(due) && !wroteShift) || movedHere.some((move) => !shiftOn(move))
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
    let refused = false
    try {
      before.removeMove(line.id)
    } catch {
      refused = true
    }
    if (refused !== arrivalLogged) this.fail(`${gesture} : refus ${String(refused)} inattendu`)
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

  // N6, N7 : un décalage se supprime seul ; ce qui précède sa journée d'origine reste.
  private unshift(before: TreatmentSchedule): void {
    // « Supprimer ce décalage » et ses refus viennent avec #505 : seul un décalage resté seul, sans
    // aucune ligne plus loin dans sa période, est tiré ici.
    const isAlone = (shift: TreatmentDoseInput) =>
      !before.doses.some(
        (dose) =>
          dose.periodId === shift.periodId &&
          dose.id !== shift.id &&
          (dose.dueOn > shift.dueOn || (dose.status === 'postponed' && idOf(dose) === idOf(shift))),
      )
    const line = pick(
      this.shiftRandom,
      before.doses.filter((dose) => dose.status === 'shift' && isAlone(dose)),
    )
    if (line === undefined) return
    const gesture = `${this.book.today} supprimer le décalage ${idOf(line)}`
    this.log.push(gesture)
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => id !== line.id) }
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
    const gesture = `${this.book.today} redater ${idOf(dose)} au ${givenOn}`
    this.redated = true
    this.log.push(gesture)
    const { dose: fields, shift, postponement } = before.redate(dose.id, givenOn)
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
    const frequency = pick(this.random, FREQUENCIES) ?? { value: 1, unit: 'day' }
    const times = pick(this.random, TIMES) ?? []
    const dates = before.newPeriod(frequency, times)
    const gesture = `${this.book.today} nouvelle période ${JSON.stringify({ ...dates, frequency })}`
    this.log.push(gesture)
    const period: TreatmentPeriodInput = {
      id: `p${periods.length + 1}`,
      ...dates,
      endsOn: this.random() < 0.2 ? plusDays(dates.firstDueOn, int(this.random, 3, 40)) : null,
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
    // Une reprise garde sa première prise : seules comptent les prises notées depuis le dernier arrêt.
    const { periods } = this.book
    const lastStop = periods.map(({ stoppedOn }) => stoppedOn !== null).lastIndexOf(true)
    const stopped = new Set(periods.slice(0, lastStop + 1).map(({ id }) => id))
    const noted = before.doses.filter(
      (dose) => isNote(dose) && dose.dueOn === today && !stopped.has(dose.periodId),
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
    const dueToday = before.currentDoses.some((due) => due.dueOn === today)
    if (noted === 0 && dueToday && left !== hours) {
      this.fail(`${gesture} : rien noté pour aujourd’hui, ${left} dose(s) sur ${hours} restent`)
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
    if (this.shiftRandom() < 0.08) this.unshift(this.schedule())
    const extraGesture = this.extraRandom()
    if (extraGesture < 0.1) this.ahead(this.schedule())
    else if (extraGesture < 0.13) this.redateExtra(this.schedule())
    else if (extraGesture < 0.15) this.deleteExtra(this.schedule())
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
      case 'unmove':
        this.unmove(before)
        break
      default:
        this.book = { ...this.book, today: plusDays(today, int(this.random, 1, 4)) }
    }
    this.checkFinished(this.book)
    this.purgeStale()
    this.checkWholeDay()
    this.checkOneLinePerDue()
  }

  // Comme le repository : les déplacements sans effet partent avec l'écriture.
  private purgeStale(): void {
    const stale = this.schedule().staleDoseIds
    if (stale.length === 0) return
    this.book = { ...this.book, doses: this.book.doses.filter(({ id }) => !stale.includes(id)) }
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
      for (let seed = FIRST_SEED; seed < FIRST_SEED + CARNETS; seed += 1) {
        if (KNOWN_FAILURES.has(seed)) continue
        const random = mulberry32(seed)
        const simulation = new Simulation(newBook(random), random, seed)
        try {
          for (let step = 0; step < STEPS; step += 1) simulation.step()
        } catch (error) {
          failures.push(String(error))
        }
      }

      expect(failures).toEqual([])
    },
    TIMEOUT,
  )
})
