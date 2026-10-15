import { hoursOf, sameHours } from './grid'
import type { Journey } from './journeys'
import type { Day, Hour, Line, Setting } from './types'

export type CoverageInput = {
  byDay: ReadonlyMap<Day, Line[]>
  borrowed: ReadonlySet<Line>
  translated: ReadonlySet<Day>
  settingOf: (id: string) => Setting
}

/**
 * R4 : une prise couvre son échéance ; un jour que le calendrier traduit, celles qui visaient d'autres
 * heures couvrent les premières heures, à hauteur de leur nombre ; une prise donnée d'avant l'arrêt
 * couvre toute la première journée de la reprise, un oubli sa seule échéance (R8, Q-G3). `matched` :
 * les prises qui ont trouvé leur journée.
 */
export function coverageOf({ byDay, borrowed, translated, settingOf }: CoverageInput) {
  const isLent = (note: Line) => borrowed.has(note) && note.status === 'given'
  return (matched: Set<Line>) =>
    (day: Day, journey: Journey): Map<Hour, Line> => {
      const ofDay = byDay.get(day) ?? []
      const exact = ofDay.filter(
        (note) =>
          borrowed.has(note) ||
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
          (note) =>
            !exact.includes(note) || (isLent(note) && !journey.hours.includes(note.dueTime)),
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
}
