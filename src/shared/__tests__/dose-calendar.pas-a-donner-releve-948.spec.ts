// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { listedInput } from '../../../scripts/dose-engine/listed-answers'
import { treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import cases from './fixtures/dose-calendar-pas-a-donner-releve-948.json'

// Carnets relevés par les relectures de la PR #948, convertis en lignes « pas à donner » : seules les
// doses listées sortent, et une dose listée ne se montre plus à donner.

type Case = { name: string; carnet: TreatmentViewInput }

const key = (due: { dueOn: string; dueTime: string | null }) =>
  due.dueTime === null ? due.dueOn : `${due.dueOn} ${due.dueTime}`

const listedOf = ({ lines }: TreatmentViewInput) =>
  new Set(lines.filter(({ status }) => status === 'not-due').map(key))

describe('relectures de la PR #948 : carnets figés, lignes « pas à donner »', () => {
  it.each((cases as Case[]).map((each) => [each.name, each.carnet] as const))(
    'graine %s : seules les doses listées sortent, aucune ne revient à donner',
    (_, carnet) => {
      const found = listedInput(carnet, listedOf(carnet))
      expect(found.unlisted).toEqual([])
      expect(found.reshown).toEqual([])
      const view = treatmentView(carnet)
      const reference = referenceReading({ ...carnet, until: '2026-06-30' })
      expect(view.unloggedDoses.map(key)).toEqual(reference.unlogged)
      expect(view.currentDoses.map(key)).toEqual(reference.current)
    },
  )

  it('graine 9850000047, pas 15 (C2) : le 17 mars, toutes ses doses listées, sort en entier ; les quatre lignes restent en vigueur', () => {
    const { carnet } = (cases as Case[])[0]!
    const view = treatmentView(carnet)
    expect(view.slots('2026-03-17', '2026-03-17')).toEqual([])
    expect(
      view.history.filter(({ line }) => line.status === 'not-due').map(({ effect }) => effect.kind),
    ).toEqual(['covers', 'covers', 'covers', 'covers'])
  })

  it('graine 9760000253 : la prise de 14 h du 7 avril supprimée, la dose revient ; 20 h, listée, reste retirée', () => {
    const { carnet } = (cases as Case[])[1]!
    const shown = treatmentView(carnet)
      .slots('2026-04-07', '2026-04-07')
      .map(({ due, state }) => `${key(due)} ${state}`)
    expect(shown).toContain('2026-04-07 14:00 pending')
    expect(shown.some((each) => each.startsWith('2026-04-07 20:00'))).toBe(false)
  })
})
