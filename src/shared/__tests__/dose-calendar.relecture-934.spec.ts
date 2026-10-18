// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import cases from './fixtures/dose-calendar-relecture-934.json'

// Carnets relevés par la relecture de la PR #934 : un réglage créé plus tard, ou une grille héritée,
// ne déclenchent pas la règle de #867 ; la fiche se lit comme sur `main` (lecture gardée dans le fichier).

type Case = {
  name: string
  carnet: TreatmentViewInput
  main: { upcoming: string[]; current: string[]; unlogged: string[]; effects: string[] }
}

const key = (due: { dueOn: string; dueTime: string | null }) =>
  due.dueTime === null ? due.dueOn : `${due.dueOn} ${due.dueTime}`

describe('relecture de la PR #934 : un seul téléphone et réglages créés ensuite', () => {
  it.each((cases as Case[]).map((each) => [each.name, each] as const))(
    'graine %s : même fiche que main, référence comprise',
    (_, { carnet, main }) => {
      const view = treatmentView(carnet)
      expect({
        upcoming: view.upcoming({ limit: 12 }).map(key),
        current: view.currentDoses.map(key),
        unlogged: view.unloggedDoses.map(key),
        effects: view.history
          .filter(({ line }) => line.status === 'postponed' || line.status === 'shift')
          .map(({ line, effect }) => `${line.id} ${effect.kind}`),
      }).toEqual(main)
      const reference = referenceReading({ ...carnet, until: '2027-12-31' })
      expect(reference.upcoming.slice(0, 12)).toEqual(main.upcoming)
    },
  )
})
