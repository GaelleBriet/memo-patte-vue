import { treatmentHistory } from '@/features/treatments/logic/treatment-history'
import { lineAction } from '@/features/treatments/logic/treatment-line-actions'
import { carnetReadingOf } from '@/features/treatments/logic/treatment-reading-adapter'
import type { TreatmentWithPeriods } from '@/features/treatments/schema/treatment-with-periods.schema'
import {
  play,
  type Gesture,
  type Line,
  type Setting,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import i18n from '@/core/i18n'

import { startV2Walk, v2Step } from './v2-walk'

const AT = '2026-01-01T00:00:00.000Z'

const periodOf = (setting: Setting): TreatmentWithPeriods['periods'][number] => ({
  ...setting,
  times: [...setting.times],
  treatmentId: 't',
  animalId: 'a',
  doseQuantity: null,
  doseUnit: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  updatedAt: setting.updatedAt ?? setting.createdAt,
  settingsWrittenAt: setting.updatedAt ?? setting.createdAt,
  gridWrittenAt: setting.gridWrittenAt ?? setting.updatedAt ?? setting.createdAt,
  deletedAt: null,
})

const doseOf = ({ settingId, updatedAt, createdByDevice, ...line }: Line) => ({
  ...line,
  previousTargetOn: line.previousTargetOn ?? null,
  previousTargetTime: line.previousTargetTime ?? null,
  dueRank: line.dueRank ?? null,
  periodId: settingId,
  treatmentId: 't',
  animalId: 'a',
  createdAt: AT,
  updatedAt,
  deletedAt: null,
  ...(createdByDevice === undefined ? {} : { createdByDevice }),
})

function verdict(input: TreatmentViewInput, gesture: Gesture): string | null {
  try {
    const result = play(input, gesture)
    return 'refusal' in result ? result.refusal.reason : null
  } catch (error) {
    return (error as Error).message
  }
}

/**
 * Chaque choix du menu ⋮ de l'historique, joué par le moteur : une note ou un « Supprimer » actif
 * qu'il refuse ou qui lève, un « Supprimer » grisé qu'il accepte.
 */
export function refusedOffers(input: TreatmentViewInput): { offered: number; refused: string[] } {
  const book = { periods: input.settings.map(periodOf), doses: input.lines.map(doseOf) }
  const history = treatmentHistory(i18n.global.t, book, carnetReadingOf(input), input.today)
  const rows = history.periods
    .flatMap(({ lines }) => lines)
    .flatMap((line) => (line.kind === 'missed' ? line.rows : [line]))
  let offered = 0
  const refused: string[] = []
  for (const row of rows) {
    for (const { action: choice, hint } of history.menuOf(row)) {
      const action = lineAction(row.dose, choice, input.today)
      if (action?.kind !== 'note' && action?.kind !== 'remove') continue
      const gesture: Gesture =
        action.kind === 'note' ? action.gesture : { kind: 'remove', lineId: action.lineId }
      const grayed = hint !== undefined
      offered += 1
      const reason = verdict(input, gesture)
      if (!grayed && reason !== null) refused.push(`${choice} ${row.dose.id} : ${reason}`)
      if (grayed && reason === null) refused.push(`${choice} ${row.dose.id} grisé : accepté`)
    }
  }
  return { offered, refused }
}

export type MenuReport = { offered: number; refused: string[] }

/** Un carnet mené par les gestes de v2 ; à chaque pas, le menu de l'historique contre le moteur. */
export function historyMenuReport(seed: number, steps: number): MenuReport {
  const walk = startV2Walk(seed)
  const report: MenuReport = { offered: 0, refused: [] }
  const check = (input: TreatmentViewInput) => {
    const { offered, refused } = refusedOffers(input)
    report.offered += offered
    report.refused.push(...refused.map((text) => `graine ${seed}, ${input.today}, ${text}`))
  }
  check(walk.input)
  for (let step = 0; step < steps; step += 1) v2Step(walk, ({ after }) => check(after))
  return report
}
