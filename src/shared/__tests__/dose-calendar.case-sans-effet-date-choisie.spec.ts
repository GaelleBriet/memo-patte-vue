// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  carnet,
  caseProposee,
  deplace,
  donne,
  echeance,
  jours,
  journees,
  modifie,
  semaines,
  vue,
  type Carnet,
  type Due,
} from './dose-calendar.recette.aides'

// Recette #756, constat B (Q84, avec #1373) : après une date choisie, la case « Décaler aussi les doses
// suivantes » n'est plus proposée quand elle ne change rien.

function luna(): Carnet {
  let c = carnet('2026-10-26', jours(1))
  c = donne(c, '2026-10-26', echeance(c, '2026-10-26'))
  c = donne(c, '2026-10-27', echeance(c, '2026-10-27'))
  c = deplace(c, '2026-10-28', echeance(c, '2026-10-28'), '2026-11-01', true)
  return modifie(c, '2026-10-28', semaines(2), [], '2026-11-07')
}

function doseDuMoment(c: Carnet, today: string): Due {
  const [due] = vue(c, today).currentDoses
  return { periodId: due!.settingId, dueOn: due!.dueOn, dueTime: due!.dueTime }
}

describe('Q84 B : la case qui ne change rien n’est pas proposée', () => {
  it('Luna, tous les jours, dose du 28 reportée au 1er nov. avec la case, toutes les 2 semaines dès le 7 nov. choisi : 1er, 7 et 21 nov.', () => {
    expect(journees(luna(), '2026-10-28', 3)).toEqual(['2026-11-01', '2026-11-07', '2026-11-21'])
  })

  it('« C’est fait » le 28 sur la dose du 1er nov. : la case n’est pas proposée', () => {
    const c = luna()
    expect(caseProposee(c, '2026-10-28', doseDuMoment(c, '2026-10-28'))).toBe(false)
  })

  it('avec ou sans la case, la suite est la même : le 7, puis le 21 nov.', () => {
    const c = luna()
    const due = doseDuMoment(c, '2026-10-28')
    const sans = donne(c, '2026-10-28', due, '2026-10-28', false)
    expect(journees(sans, '2026-10-28', 2)).toEqual(['2026-11-07', '2026-11-21'])
  })

  it('sans date choisie, la case reste proposée pour une dose donnée d’avance : chaque semaine, dose du 8 donnée le 6', () => {
    let c = carnet('2026-10-01', semaines(1))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
    expect(caseProposee(c, '2026-10-06', echeance(c, '2026-10-08'))).toBe(true)
  })
})
