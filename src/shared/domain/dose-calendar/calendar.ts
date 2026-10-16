import { coverOrphans, noteEffects } from './calendar-notes'
import { hoursOf, keyOf, plusDays, sameHours } from './grid'
import { journeys, type Gap, type Journey } from './journeys'
import type { EpisodeLines } from './lines'
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

  // R4 : une prise couvre son échéance ; le jour où les heures changent, celles qui visaient
  // l'ancien réglage couvrent les premières heures du nouveau, à hauteur de leur nombre ; une prise
  // donnée d'avant l'arrêt couvre toute la première journée de la reprise, un oubli sa seule
  // échéance (R8, Q-G3).
  const coveredOn = (day: Day, journey: Journey): Map<Hour, Line> => {
    const ofDay = byDay.get(day) ?? []
    const exact = ofDay.filter(
      (note) =>
        isBorrowed.has(note) ||
        !translated.has(day) ||
        sameHours(settingOf(note.settingId), journey.setting),
    )
    for (const note of ofDay) {
      if (!exact.includes(note) || journey.hours.includes(note.dueTime)) matched.add(note)
    }
    const covered = new Map<Hour, Line>()
    for (const hour of journey.hours) {
      const note = exact.find(({ dueTime }) => dueTime === hour)
      if (note !== undefined) covered.set(hour, note)
    }
    const elsewhere = ofDay
      .filter(
        (note) => !exact.includes(note) || (isLent(note) && !journey.hours.includes(note.dueTime)),
      )
      .sort((a, b) => (a.dueTime ?? '').localeCompare(b.dueTime ?? ''))
    const last = elsewhere.at(-1) ?? ofDay.find(isLent)
    const whole =
      ofDay.some(isLent) ||
      elsewhere.some((note) =>
        hoursOf(settingOf(note.settingId).times).every((hour) =>
          ofDay.some((other) => other.settingId === note.settingId && other.dueTime === hour),
        ),
      )
    for (const hour of journey.hours.filter((each) => !covered.has(each))) {
      const note = elsewhere.shift() ?? (whole ? last : undefined)
      if (note !== undefined) covered.set(hour, note)
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
    // R4, R7 : écrit sous un autre réglage que celui du jour où les heures changent, un report se juge
    // sur les prises écrites sous ses heures, et le jour de départ perd autant de doses qu'il en emporte.
    const reread = translated.has(dueOn) && written.id !== from.id
    const source = reread ? written : from
    const ownNoted = new Set(
      (byDay.get(dueOn) ?? [])
        .filter((note) => sameHours(settingOf(note.settingId), written))
        .map((note) => note.dueTime),
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
        : hoursOf(written.times).filter((hour) => after(hour) && !ownNoted.has(hour))
    const earlier = free.filter((hour) => !after(hour))
    const short = Math.max(0, bringing.length - following.length)
    const leaving = [...earlier.slice(Math.max(0, earlier.length - short)), ...following]
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
    // la date choisie qui emmène le report (#796) en porte autant, aux dernières heures de son réglage.
    const chosen = lines.chosenArrivals.get(report)
    const under = chosen ?? source
    const own = sameHours(arrival, under) ? arrival : under
    const arriving = chosen ? hoursOf(chosen.times).slice(-bringing.length) : bringing
    const day = into.get(targetOn!) ?? { setting: own, hours: [] }
    // R7, R9.2 : un nouveau rythme qui part du jour d'arrivée d'un report lui laisse ses seules heures.
    if (openings.delete(targetOn!)) {
      day.hours = []
      effects.set(report.id, { kind: 'moves', keys, arrival: targetOn, opensRhythm: true })
    }
    if (day.hours.length === 0) day.setting = own
    // TR-9, #796 : une journée d'échéance à d'autres heures porte la dose qui y arrive, sans en ajouter.
    if (sameHours(day.setting, under)) day.hours = [...new Set([...day.hours, ...arriving])].sort()
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

// TR-9 : la dernière journée arrivée avant le réglage, dose du moment qu'une date choisie remplace.
function lastFallen(fallen: ReadonlySet<Day>, { from, to }: { from: Day; to: Day }) {
  return [...fallen]
    .filter((day) => day >= from && day < to)
    .sort()
    .at(-1)
}
