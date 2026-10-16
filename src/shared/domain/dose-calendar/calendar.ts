import { coverOrphans, noteEffects } from './calendar-notes'
import { hoursOf, keyOf, plusDays, sameHours } from './grid'
import { journeys, type Gap, type Journey } from './journeys'
import { isMoreRecent, type EpisodeLines } from './lines'
import type { Span } from './settings'
import type { Day, Due, Hour, Line, LineEffect, Setting } from './types'

/** Une échéance du calendrier, et la prise qui la couvre ; `exact` : la prise vise cette échéance. */
export type Slot = { due: Due; key: string; coveredBy: Line | null; exact: boolean }

export type EpisodeCalendar = {
  slots: Slot[]
  /** Journées arrivées : celles du calendrier et celles qu'un report a vidées en partant plus tard. */
  fallen: Set<Day>
  /** Échéance retirée par un report → ce report. */
  moved: Map<string, Line>
  effects: Map<string, LineEffect>
  /** R9, Q-retard : premier jour du rythme en vigueur, que les réglages de même fréquence continuent. */
  rhythmFrom: Day
  /** Dernier jour où l'épisode peut avoir une échéance, quelle que soit `reach` ; `null` : sans fin. */
  lastPossibleDay: Day | null
  /** Dernière journée de la grille du dernier réglage, quelle que soit `reach` ; `null` : sans fin. */
  lastGridDay: Day | null
  /** Une dose du moment remplacée (TR-9) se juge au-delà de `reach` ou dans `gap` : la grille calculée ne suffit pas. */
  reachTooShort: boolean
}

export type EpisodeInput = {
  settingOf: (id: string) => Setting
  span: Span
  lines: EpisodeLines
  /** R8, Q-G3 : prises d'avant l'arrêt le jour de la reprise, qui couvrent sa première journée. */
  borrowed: readonly Line[]
  /** R1, R8 : échéances du jour de l'arrêt que lisent les reprises, gardées par elles seules. */
  yielded: ReadonlySet<string>
  /** Dernier jour de la grille calculée. */
  reach: Day
  gap?: Gap
}

/** R4, R7, R11 : le calendrier d'un épisode, une passe par étape, du réglage à la couverture. */
export function episodeCalendar(input: EpisodeInput): EpisodeCalendar {
  const { settingOf, span, lines, borrowed, yielded } = input
  const effects = new Map<string, LineEffect>()
  const journey = journeys(input, effects)
  const { days, translated, left, openings, rhythmFrom, replaced, restarts, chosenRestarts } =
    journey
  const byDay = new Map<Day, Line[]>()
  for (const note of [...lines.notes, ...borrowed]) {
    byDay.set(note.dueOn, [...(byDay.get(note.dueOn) ?? []), note])
  }
  const isBorrowed = new Set(borrowed)
  const isLent = (note: Line) => isBorrowed.has(note) && note.status === 'given'
  const noted = new Set(
    [...lines.notes, ...borrowed].map((note) => keyOf(note.dueOn, note.dueTime)),
  )
  const matched = new Set<Line>()
  const held = new Map<Line, string>()

  // R4 : une prise couvre son échéance quel que soit son réglage, sinon la première échéance libre qui
  // la suit ; une journée de l'ancien réglage toute notée, ou une prise d'avant l'arrêt (R8), couvre tout.
  const coveredOn = (day: Day, journey: Journey, read = matched): Map<Hour, Line> => {
    const ofDay = byDay.get(day) ?? []
    const foreign = (note: Line) =>
      !isBorrowed.has(note) &&
      translated.has(day) &&
      !sameHours(settingOf(note.settingId), journey.setting)
    const covered = new Map<Hour, Line>()
    // TR-25 : deux prises de la même heure, la plus récente la couvre ; l'autre ne se perd pas.
    for (const hour of journey.hours) {
      const note = ofDay
        .filter(({ dueTime }) => dueTime === hour)
        .reduce<Line | undefined>(
          (kept, each) => (kept && !isMoreRecent(each, kept) ? kept : each),
          undefined,
        )
      if (note !== undefined) covered.set(hour, note)
    }
    const used = new Set(covered.values())
    const elsewhere = ofDay.filter((note) => !used.has(note)).sort(byTime)
    for (const note of ofDay) {
      if (foreign(note) || journey.hours.includes(note.dueTime)) read.add(note)
    }
    for (const note of elsewhere) {
      if (note.status !== 'given') continue
      const free = journey.hours.filter((each) => !covered.has(each))
      // R4 : le jour où les heures changent, une prise du jour reste à ce jour, plus tôt s'il le faut,
      // et ne couvre jamais un autre jour.
      const hour =
        free.find((each) => follows(each, note.dueTime)) ?? (foreign(note) ? free[0] : undefined)
      if (hour === undefined) continue
      covered.set(hour, note)
      read.add(note)
    }
    const last =
      elsewhere.filter(foreign).sort(byTime).at(-1) ??
      ofDay.filter(foreign).sort(byTime).at(-1) ??
      ofDay.find(isLent)
    const whole =
      ofDay.some(isLent) ||
      ofDay.some(
        (note) =>
          foreign(note) &&
          hoursOf(settingOf(note.settingId).times).every((hour) =>
            ofDay.some((other) => other.settingId === note.settingId && other.dueTime === hour),
          ),
      )
    for (const hour of journey.hours.filter((each) => !covered.has(each))) {
      if (whole && last !== undefined) covered.set(hour, last)
    }
    return covered
  }

  // R7 : un report emporte son heure et les suivantes encore sans prise ; les reports qui arrivent
  // sur sa journée passent d'abord.
  const fallen = new Set<Day>()
  const moved = new Map<string, Line>()
  const waiting = [...lines.reports]
  while (waiting.length > 0) {
    const ready = waiting.findIndex(
      (report) => !waiting.some((other) => other.targetOn === report.dueOn),
    )
    const report = waiting.splice(Math.max(0, ready), 1)[0]!
    const { dueOn, dueTime, targetOn } = report
    const origin = days.get(dueOn) ?? left.get(dueOn)
    const from = origin?.setting ?? settingOf(report.settingId)
    const hours = origin?.hours ?? hoursOf(from.times)
    // R8 : au-delà de l'arrêt, une prise ne garde pas son échéance, la reprise seule la porte.
    if (origin === undefined && (span.closedFrom === null || dueOn < span.closedFrom)) {
      for (const note of byDay.get(dueOn) ?? []) {
        if (!isBorrowed.has(note) && hours.includes(note.dueTime)) {
          matched.add(note)
          held.set(note, keyOf(note.dueOn, note.dueTime))
        }
      }
    }
    // R6, TR-9 : hors de sa grille, un report est sans effet, sauf s'il porte la date choisie,
    // arrive sur la première échéance d'une origine écrite (TR-28) ou ouvre un rythme (R9.2).
    const at = span.settingAt(dueOn)?.id ?? ''
    const restartOn = restarts.get(at)
    const chosenOn = chosenRestarts.get(at)
    const carries = targetOn === restartOn || targetOn === chosenOn || openings.has(targetOn!)
    const carried =
      chosenOn !== undefined &&
      dueOn === chosenOn &&
      chosenRestarts.get(report.settingId) !== chosenOn
    if (carried || (chosenOn !== undefined && origin === undefined && !carries)) {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
      continue
    }
    const covered =
      origin === undefined
        ? new Set(hours.filter((hour) => noted.has(keyOf(dueOn, hour))))
        : new Set(coveredOn(dueOn, origin).keys())
    const written = settingOf(report.settingId)
    // R4, R7 : le jour où les heures changent, écrit sous d'autres heures ou avant le réglage qui relit
    // sa journée, un report se juge sur ses prises et le jour de départ perd autant qu'il emporte.
    const relit = from.id === span.settingAt(dueOn)?.id && written.id !== from.id
    const reread = translated.has(dueOn) && (!sameHours(written, from) || relit)
    const source = reread ? written : from
    const writtenHours = hoursOf(written.times)
    // R4, R7, #860 : le report garde ses heures, où les prises du jour se posent avant lui.
    const ownNoted = new Set(
      coveredOn(dueOn, { setting: written, hours: writtenHours }, new Set()).keys(),
    )
    if (source === from ? covered.has(dueTime) : ownNoted.has(dueTime)) {
      effects.set(report.id, { kind: 'idle', reason: 'beaten' })
      continue
    }
    if (targetOn! > dueOn) fallen.add(dueOn)
    const after = (hour: Hour) => hour === null || hour >= (dueTime ?? '')
    const free = hours.filter((hour) => !covered.has(hour))
    const following = free.filter(after)
    const bringing =
      source === from
        ? following
        : writtenHours.filter((hour) => after(hour) && !ownNoted.has(hour))
    // R4, R7 : relu aux nouvelles heures, le jour de départ perd celles qui suivent la dose reportée et
    // autant qu'elle emporte, sans perdre les doses qui restaient à donner avant elle.
    const earlier = free.filter((hour) => !after(hour))
    const stillBefore = writtenHours.filter((hour) => !after(hour) && !ownNoted.has(hour)).length
    const stays = Math.max(
      0,
      stillBefore,
      earlier.length - Math.max(0, bringing.length - following.length),
    )
    const leaving = source === from ? following : free.slice(stays)
    if (origin !== undefined) origin.hours = origin.hours.filter((hour) => !leaving.includes(hour))
    const keys = bringing.map((hour) => keyOf(dueOn, hour))
    for (const key of [...leaving.map((hour) => keyOf(dueOn, hour)), ...keys])
      moved.set(key, report)
    const stopDay = span.stoppedAt(targetOn!)
    const arrival = span.settingAt(targetOn!) ?? stopDay
    const into = stopDay === undefined ? days : left
    if (bringing.length === 0) {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
      continue
    }
    effects.set(report.id, {
      kind: 'moves',
      keys,
      arrival: arrival === undefined ? null : targetOn,
    })
    if (arrival === undefined) continue
    // R7 : le jour d'arrivée ne reçoit que les heures reportées, telles qu'elles étaient au départ ;
    // la date choisie qui emmène le report (#796) reçoit la journée entière de son réglage.
    const chosen = lines.chosenArrivals.get(report)
    const under = chosen ?? source
    const own = sameHours(arrival, under) ? arrival : under
    const arriving = chosen ? hoursOf(chosen.times) : bringing
    const day = into.get(targetOn!) ?? { setting: own, hours: [] }
    // R7, R9.2 : un nouveau rythme qui part du jour d'arrivée d'un report lui laisse ses seules heures.
    if (openings.delete(targetOn!)) {
      day.hours = []
      effects.set(report.id, { kind: 'moves', keys, arrival: targetOn, opensRhythm: true })
    }
    if (day.hours.length === 0) day.setting = own
    // R7 : une journée d'échéance garde ses doses et y ajoute celles qui arrivent, une heure une fois.
    day.hours = [...new Set([...day.hours, ...arriving])].sort()
    into.set(targetOn!, day)
  }

  // R1, R4 : sortie du calendrier, une journée garde ses prises sur ses échéances, traduction comprise,
  // sauf celles qu'une reprise lit le jour de l'arrêt (R8).
  left.forEach((journey, day) => {
    if (days.has(day)) return
    coveredOn(day, journey).forEach((note, hour) => {
      const key = keyOf(day, hour)
      if (!isBorrowed.has(note) && !yielded.has(key)) held.set(note, key)
    })
  })

  const slots: Slot[] = []
  for (const [day, journey] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    if (journey.hours.length > 0) fallen.add(day)
    const covered = coveredOn(day, journey)
    for (const hour of journey.hours) {
      const note = covered.get(hour) ?? null
      const exact =
        note !== null && note.dueTime === hour && note.dueOn === day && !isBorrowed.has(note)
      const due = { settingId: journey.setting.id, dueOn: day, dueTime: hour }
      slots.push({ due, key: keyOf(day, hour), coveredBy: note, exact })
    }
  }
  coverOrphans(lines.notes, matched, slots, settingOf)
  noteEffects(lines, borrowed, slots, held, effects)
  const lateDays = new Set(
    replaced.filter(({ onDueDay }) => !onDueDay).map((range) => lastFallen(fallen, range)),
  )
  // TR-9 : un premier jour qui est une échéance portait la dose du moment ; les doses plus anciennes
  // restent à renseigner.
  replaced.filter(({ onDueDay }) => onDueDay).forEach(({ to }) => fallen.add(to))
  const kept = slots.filter(({ due, coveredBy }) => coveredBy !== null || !lateDays.has(due.dueOn))
  return {
    slots: kept,
    fallen,
    moved,
    effects,
    rhythmFrom,
    lastPossibleDay: journey.lastPossibleDay,
    lastGridDay: journey.lastGridDay,
    reachTooShort: replaced.some(
      ({ onDueDay, to }) => !onDueDay && plusDays(to, -1) > (input.gap?.after ?? input.reach),
    ),
  }
}

const byTime = (a: Line, b: Line) =>
  (a.dueTime ?? '').localeCompare(b.dueTime ?? '') || a.id.localeCompare(b.id)

const follows = (hour: Hour, after: Hour) => hour === null || after === null || hour > after

// TR-9 : la dernière journée arrivée avant le réglage, dose du moment qu'une date choisie remplace.
function lastFallen(fallen: ReadonlySet<Day>, { from, to }: { from: Day; to: Day }) {
  return [...fallen]
    .filter((day) => day >= from && day < to)
    .sort()
    .at(-1)
}
