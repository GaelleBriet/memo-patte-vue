import { episodeCalendar, type EpisodeCalendar, type EpisodeInput } from './calendar'
import { dayOfKey, plusDays } from './grid'
import type { Gap } from './journeys'
import type { Moment } from './moment'
import type { Day, Setting } from './types'

export const UPCOMING_DAYS = 400

export type Part = Pick<EpisodeInput, 'span' | 'lines' | 'borrowed'>

type Built = { reach: Day; calendars: EpisodeCalendar[] }

export type ReadingInput = {
  parts: readonly Part[]
  settingOf: (id: string) => Setting
  settingDays: readonly Day[]
  /** Dernier jour connu parmi aujourd'hui, les lignes et les réglages des 400 prochains jours. */
  nearDay: Day
  /** Dernier jour connu parmi aujourd'hui, les lignes et tous les réglages. */
  lastKnownDay: Day
  step: number
  momentFrom(calendars: readonly EpisodeCalendar[]): Moment
  /** Vrai : la dose du moment et la suivante ne dépendent pas de journées plus lointaines. */
  settles(moment: Moment): boolean
}

/** Les calendriers de la dose du moment, et ceux qui lisent exactement d'autres journées. */
export type Reading = Built & {
  moment: Moment
  /** Calendriers exacts sur toutes les journées jusqu'à `day`. */
  calendarsUntil(day: Day): EpisodeCalendar[]
  /** Calendriers exacts sur les journées de `from` à `to`. */
  calendarsOver(from: Day, to: Day): EpisodeCalendar[]
}

// R1, R4, R8 : les échéances que les reprises lisent le jour de l'arrêt, une seule fois chacune.
function readOn(later: readonly EpisodeCalendar[], day: Day | null): Set<string> {
  if (day === null) return new Set()
  return new Set(
    later.flatMap(({ slots, effects }) => [
      ...slots.filter(({ due }) => due.dueOn === day).map(({ key }) => key),
      ...[...effects.values()].flatMap((effect) =>
        effect.kind === 'covers' && dayOfKey(effect.key) === day ? [effect.key] : [],
      ),
    ]),
  )
}

const exact = (calendars: readonly EpisodeCalendar[]) =>
  !calendars.some(({ reachTooShort }) => reachTooShort)

const rhythmFrom = (calendars: readonly EpisodeCalendar[]) => calendars.at(-1)?.rhythmFrom ?? ''

// Dérouler la grille jusqu'à un réglage lointain coûte cher ; sans ligne ni réglage, les journées
// d'avant lui peuvent rester hors de la grille.
export function readingOf(input: ReadingInput): Reading {
  const { parts, settingOf, settingDays, step, momentFrom, settles } = input
  const build = (reach: Day, gap?: Gap): EpisodeCalendar[] => {
    const built: EpisodeCalendar[] = []
    for (const part of [...parts].reverse()) {
      const yielded = readOn(built, part.span.live.at(-1)!.stoppedOn)
      built.unshift(episodeCalendar({ ...part, settingOf, reach, yielded, gap }))
    }
    return built
  }
  const read = (reach: Day, gap?: Gap) => {
    const calendars = build(reach, gap)
    const moment = momentFrom(calendars)
    return { reach, calendars, moment, settled: exact(calendars) && settles(moment) }
  }
  const base = plusDays(input.lastKnownDay, 2 * step)
  const near = read(plusDays(input.nearDay, 2 * step))
  const farDay = settingDays.filter((day) => day > near.reach).sort()[0]
  const gap = farDay === undefined ? undefined : { after: near.reach, before: farDay }
  let gapped: Built | null | undefined
  const chosen = () => {
    if (near.settled || near.reach === base) return { picked: near, widest: near }
    if (gap !== undefined) {
      const far = read(base, gap)
      gapped = exact(far.calendars) ? far : null
      // R9 : le rythme en vigueur part après le trou, la dose du moment n'y lit aucune journée.
      if (far.settled && rhythmFrom(far.calendars) >= gap.before) {
        return { picked: far, widest: near }
      }
    }
    const full = read(base)
    return { picked: full, widest: full }
  }
  const { picked, widest: first } = chosen()
  let widest: Built = first
  const calendarsUntil = (day: Day): EpisodeCalendar[] => {
    if (day > widest.reach) {
      const reach = plusDays(day, UPCOMING_DAYS)
      widest = { reach, calendars: build(reach) }
    }
    return widest.calendars
  }
  const calendarsOver = (from: Day, to: Day): EpisodeCalendar[] => {
    if (gap === undefined || from < gap.before || to <= widest.reach) return calendarsUntil(to)
    if (gapped === undefined || (gapped !== null && to > gapped.reach)) {
      const reach = plusDays(to, UPCOMING_DAYS)
      const calendars = build(reach, gap)
      gapped = exact(calendars) ? { reach, calendars } : null
    }
    return gapped === null ? calendarsUntil(to) : gapped.calendars
  }
  const { reach, calendars, moment } = picked
  return { reach, calendars, moment, calendarsUntil, calendarsOver }
}
