import { episodeLines, isNote } from '../lines'
import { episodeOf, spanOf } from '../settings'
import type { Line, TreatmentViewInput } from '../types'
import { buildView } from '../view'

/**
 * TR-25 : les autres lignes de la dose que la fiche montre comme une seule, dans sa période (deux
 * appareils) ; aucune pour une ligne sans effet ni pour une prise d'une autre période (#822).
 */
export function doseLines(input: TreatmentViewInput, shown: Line): Line[] {
  const effect = buildView(input).history.find(({ line }) => line.id === shown.id)!.effect
  if (!isNote(shown) || effect.kind === 'idle') return []
  const episode = episodeOf(input.settings, shown.settingId)
  const period = new Set(episode.map(({ id }) => id))
  const { doseKey } = episodeLines(input.lines, spanOf(episode, input.lines))
  return input.lines.filter(
    (line) =>
      line.id !== shown.id &&
      period.has(line.settingId) &&
      isNote(line) &&
      doseKey(line) === doseKey(shown),
  )
}
