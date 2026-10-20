import { dayCoverage } from './calendar-coverage'
import { notDueArrivals } from './calendar-not-due'
import { moveReports } from './calendar-reports'
import { keepAnsweredNotes, keepGivenNotes, keepSkippedDays, noteEffects } from './calendar-notes'
import { keyOf, plusDays } from './grid'
import { journeys, type Gap } from './journeys'
import type { EpisodeLines } from './lines'
import type { Span } from './settings'
import type { Day, Due, Line, LineEffect, Setting } from './types'

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
  const notDue = notDueArrivals(effects)
  const journey = journeys(input, effects)
  const { days, translated, left, rhythmFrom, replaced } = journey
  const byDay = new Map<Day, Line[]>()
  for (const note of [...lines.notes, ...borrowed]) {
    byDay.set(note.dueOn, [...(byDay.get(note.dueOn) ?? []), note])
  }
  const isBorrowed = new Set(borrowed)
  const noted = new Set(
    [...lines.notes, ...borrowed].map((note) => keyOf(note.dueOn, note.dueTime)),
  )
  const matched = new Set<Line>()
  const held = new Map<Line, string>()
  const { coveredOn, settle } = dayCoverage({
    notes: [...lines.notes, ...borrowed],
    borrowed,
    reports: lines.reports,
    translated,
    settingOf,
    matched,
  })

  const { fallen, moved } = moveReports({
    span,
    lines,
    settingOf,
    journey,
    effects,
    notDue,
    coveredOn,
    noted,
    byDay,
    isBorrowed,
    matched,
    held,
  })
  settle()

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
    const covered = coveredOn(day, journey)
    // #873 : une dose « pas à donner » n'est nulle part ; une journée qui n'a plus qu'elles n'est pas arrivée.
    const hours = notDue.hoursOf(day, journey.hours, covered, held, byDay.get(day) ?? [])
    if (hours.length > 0) fallen.add(day)
    for (const hour of hours) {
      const note = covered.get(hour) ?? null
      const exact =
        note !== null && note.dueTime === hour && note.dueOn === day && !isBorrowed.has(note)
      const due = { settingId: journey.setting.id, dueOn: day, dueTime: hour }
      slots.push({ due, key: keyOf(day, hour), coveredBy: note, exact })
    }
  }
  const unread = [...journey.skipped].filter((day) => !days.has(day) && !left.has(day))
  keepSkippedDays(lines.notes, new Set(unread), slots, held)
  keepGivenNotes(lines.notes, slots, held, { yielded, closedFrom: span.closedFrom })
  keepAnsweredNotes(lines.notes, slots, held, settingOf)
  noteEffects(lines, borrowed, slots, held, effects)
  notDue.settle()
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
