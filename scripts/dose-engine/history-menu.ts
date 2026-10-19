import {
  treatmentHistory,
  type DoseLineAction,
} from '@/features/treatments/logic/treatment-history'
import { lineAction } from '@/features/treatments/logic/treatment-line-actions'
import { carnetReadingOf } from '@/features/treatments/logic/treatment-reading-adapter'
import type { TreatmentWithHistory } from '@/features/treatments/schema/treatment-with-history.schema'
import {
  play,
  type Line,
  type Setting,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import i18n from '@/core/i18n'

import { startV2Walk, v2Step } from './v2-walk'

const AT = '2026-01-01T00:00:00.000Z'

const periodOf = (setting: Setting): TreatmentWithHistory['periods'][number] => ({
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
  deletedAt: null,
})

const doseOf = ({ settingId, updatedAt, createdByDevice, ...line }: Line) => ({
  ...line,
  periodId: settingId,
  treatmentId: 't',
  animalId: 'a',
  createdAt: AT,
  updatedAt,
  deletedAt: null,
  ...(createdByDevice === undefined ? {} : { createdByDevice }),
})

/** Les gestes du menu ⋮ que le moteur joue sans date à choisir ; « Changer la date » attend un jour. */
const PLAYED: readonly DoseLineAction[] = [
  'mark-missed',
  'mark-given',
  'remove',
  'remove-move',
  'remove-shift',
]

/** Chaque geste du menu ⋮ (non grisé) de l'historique, joué par le moteur : ceux qu'il refuse ou qui lèvent. */
export function refusedOffers(input: TreatmentViewInput): { offered: number; refused: string[] } {
  const book = { periods: input.settings.map(periodOf), doses: input.lines.map(doseOf) }
  const history = treatmentHistory(i18n.global.t, book, carnetReadingOf(input), input.today)
  const rows = history.periods
    .flatMap(({ lines }) => lines)
    .flatMap((line) => (line.kind === 'missed' ? line.rows : [line]))
  let offered = 0
  const refused: string[] = []
  for (const row of rows) {
    for (const choice of history.menuOf(row)) {
      if (!PLAYED.includes(choice) || row.refused?.[choice] !== undefined) continue
      offered += 1
      const action = lineAction(row.dose, choice, input.today)!
      const gesture =
        action.kind === 'note' ? action.gesture : { kind: 'remove' as const, lineId: row.dose.id }
      try {
        const result = play(input, gesture)
        if ('refusal' in result) refused.push(`${choice} ${row.dose.id} : ${result.refusal.reason}`)
      } catch (error) {
        refused.push(`${choice} ${row.dose.id} : ${(error as Error).message}`)
      }
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
