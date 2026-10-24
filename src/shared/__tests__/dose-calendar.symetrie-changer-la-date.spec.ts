// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Random } from '../../../scripts/dose-engine/carnet'
import { symmetry, symmetryAhead } from '../../../scripts/dose-engine/v2-invariants-readings'
import {
  noteDose,
  redateDose,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, H, line, setting, WEEK } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof redateDose | typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

/** Les tirages de la symétrie : la date réelle (aujourd'hui moins 0 à 6 jours), puis la case. */
const drawing = (daysBack: number, checked: boolean): Random => {
  const values = [(daysBack + 0.5) / 7, checked ? 0.1 : 0.9]
  return () => values.shift() ?? 0.5
}

describe('symétrie de « Changer la date » et « Fait à une autre date » pour une dose à venir (R6, Q38)', () => {
  // Milbemax chaque vendredi : 2, 9, 16, 23 ; 2 et 9 donnés. Le 16, la dose du 16 notée ; le 20,
  // « C'est fait » sur la dose du 23 (donnée en avance) ; le 20, « Supprimer » sur la prise du 16.
  const milbemax = setting('p1', '2026-10-02', WEEK)
  const avant = [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')]
  const prise23 = { ...line('p1', 'given', '2026-10-23'), givenOn: '2026-10-20' }
  const le20: TreatmentViewInput = { settings: [milbemax], lines: avant, today: '2026-10-20' }

  it.fails(
    'résidu #1242 : la prise du 23 changée au 18 propose la case ; « Fait à une autre date » du 23 au 18, non (la dose du moment est le 16)',
    () => {
      const redated = accepted(
        redateDose(
          { ...le20, lines: [...avant, prise23] },
          { lineId: prise23.id, givenOn: '2026-10-18', shiftsFollowing: true },
        ),
      )
      const noted = accepted(
        noteDose(le20, {
          due: { settingId: 'p1', dueOn: '2026-10-23', dueTime: null },
          status: 'given',
          givenOn: '2026-10-18',
          shiftsFollowing: true,
        }),
      )

      expect(redated.offersShift).toBe(noted.offersShift)
    },
  )

  it('la campagne exclut le résidu #1242 : case cochée, la symétrie se juge case décochée', () => {
    expect(symmetryAhead(le20, drawing(2, true))).toBeNull()
    expect(symmetryAhead(le20, drawing(2, false))).toBeNull()
  })

  it('le 20, le 16 donné : la dose du 23, dose du moment, donnée au 18, case cochée ou non : symétrique', () => {
    const lines = [...avant, line('p1', 'given', '2026-10-16')]
    expect(symmetryAhead({ ...le20, lines }, drawing(2, true))).toBeNull()
    expect(symmetryAhead({ ...le20, lines }, drawing(2, false))).toBeNull()
  })
})

describe('symétrie de « Changer la date » et « Fait à une autre date » quand la journée porte déjà un décalage (R6, Q38)', () => {
  // Métacam tous les jours à 8 h et 20 h du lundi 9 mars ; le 9, la dose de 20 h reportée au 5 avr.
  // avec « Décaler aussi » ; le vendredi 13, la dose de 8 h du 9 est la dose du moment, en retard.
  const metacam = setting('s1', '2026-03-09', DAY, H)
  const report = line('s1', 'postponed', '2026-03-09', '20:00', '2026-04-05')
  const decalage = line('s1', 'shift', '2026-03-09', '20:00', '2026-04-05')
  const le13: TreatmentViewInput = {
    settings: [metacam],
    lines: [report, decalage],
    today: '2026-03-13',
  }
  const dose8h = { settingId: 's1', dueOn: '2026-03-09', dueTime: '08:00' }

  it.fails(
    'résidu #1255 : « Fait à une autre date » au 10 propose la case ; « C’est fait » puis « Changer la date » au 10, non',
    () => {
      const prise = { ...line('s1', 'given', '2026-03-09', '08:00'), givenOn: '2026-03-13' }
      const redated = accepted(
        redateDose(
          { ...le13, lines: [...le13.lines, prise] },
          { lineId: prise.id, givenOn: '2026-03-10', shiftsFollowing: true },
        ),
      )
      const noted = accepted(
        noteDose(le13, {
          due: dose8h,
          status: 'given',
          givenOn: '2026-03-10',
          shiftsFollowing: true,
        }),
      )

      expect(redated.offersShift).toBe(noted.offersShift)
    },
  )

  it('la campagne exclut le résidu #1255 : case cochée, la symétrie se juge case décochée', () => {
    expect(symmetry(le13, drawing(3, true))).toBeNull()
    expect(symmetry(le13, drawing(3, false))).toBeNull()
  })
})
