import { episodeLines } from '../lines'
import { episodeIdsOf, episodeOf, spanOf } from '../settings'
import type { Line, TreatmentViewInput } from '../types'
import { buildView } from '../view'

/** TR-25 : les décalages d'une journée, dans sa période, venus d'un appareil ou de l'autre. */
export function shiftsOfDay(input: TreatmentViewInput, of: Line): Line[] {
  const period = episodeIdsOf(input.settings, of.settingId)
  return input.lines.filter(
    (line) => line.status === 'shift' && line.dueOn === of.dueOn && period.has(line.settingId),
  )
}

/**
 * TR-25 : les autres lignes que la fiche montre comme une seule, dans sa période (deux appareils) :
 * prises de la même dose, reports de la même dose, décalages de la même journée ; aucune pour une
 * ligne sans effet ni pour une ligne d'une autre période (#822).
 */
export function doseLines(input: TreatmentViewInput, shown: Line): Line[] {
  const effect = buildView(input).history.find(({ line }) => line.id === shown.id)!.effect
  if (effect.kind === 'idle' || shown.status === 'extra') return []
  if (shown.status === 'shift') return shiftsOfDay(input, shown).filter(({ id }) => id !== shown.id)
  const episode = episodeOf(input.settings, shown.settingId)
  const period = new Set(episode.map(({ id }) => id))
  const { doseKey } = episodeLines(input.lines, spanOf(episode, input.lines))
  return input.lines.filter(
    (line) =>
      line.id !== shown.id && period.has(line.settingId) && doseKey(line) === doseKey(shown),
  )
}
