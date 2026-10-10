// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  H,
  jours,
  journees,
  modifie,
  proposition,
  sansPrise,
  semaines,
  type Carnet,
} from './dose-calendar.recette.aides'

// Jeu de recette du moteur v2 (épic #758) : carnets de la campagne d'invariants du 2026-10-10, pris
// juste avant le changement de réglage fautif (dossier d'analyse, annexe « campagne »).

type Graine = Carnet & { today: string }

const GRAINES = JSON.parse(
  readFileSync(new URL('./fixtures/dose-calendar-graines.json', import.meta.url), 'utf8'),
) as Record<string, Graine>

function graine(seed: number): Graine {
  const found = GRAINES[String(seed)]
  if (found === undefined) throw new Error(`graine ${seed} absente des fixtures`)
  return found
}

function rienLe(c: Carnet, day: string): string[] {
  return sansPrise(c, day).filter((key) => key.startsWith(day))
}

describe('R4, R9 : réglage changé le jour d’arrivée d’un report rangé deux réglages plus tôt', () => {
  it.fails(
    'graine 500000856 : 20 h du 24 notée oubliée, toutes les 2 semaines à 8 h et 20 h le 24 : rien le 24',
    () => {
      const { today, ...c } = graine(500000856)
      expect(rienLe(modifie(c, today, semaines(2), H), today)).toEqual([])
    },
  )

  it.fails(
    'graine 510000010 : dose reportée donnée, tous les jours à 6, 12, 18, 23 h le 8 : rien le 8',
    () => {
      const { today, ...c } = graine(510000010)
      const changed = modifie(c, today, jours(1), ['06:00', '12:00', '18:00', '23:00'])
      expect(rienLe(changed, today)).toEqual([])
    },
  )

  it.fails(
    'graine 500001712 : dose du 15 donnée, tous les jours à 8, 14, 20 h le 15 : rien le 15',
    () => {
      const { today, ...c } = graine(500001712)
      const changed = modifie(c, today, jours(1), ['08:00', '14:00', '20:00'])
      expect(rienLe(changed, today)).toEqual([])
    },
  )
})

describe('R3, R12 : la posologie ne change pas le calendrier, la proposition est le résultat', () => {
  it('graine 520002718 : toutes les 2 semaines à 20 h, posologie changée le 11 mars : 13, 19 mars, 5 avr.', () => {
    const { today, ...c } = graine(520002718)
    expect(journees(c, today, 3)).toEqual(['2026-03-13', '2026-03-19', '2026-04-05'])
    const changed = modifie(c, today, semaines(2), ['20:00'])
    expect(journees(changed, today, 3)).toEqual(['2026-03-13', '2026-03-19', '2026-04-05'])
  })

  it('graine 510001190 : tous les jours à 8 h et 20 h le 19 avr. : la première dose proposée est celle du calendrier', () => {
    const { today, ...c } = graine(510001190)
    const proposed = proposition(c, today, jours(1), H)
    const changed = modifie(c, today, jours(1), H)
    expect(journees(changed, today, 1)).toEqual([proposed])
  })
})
