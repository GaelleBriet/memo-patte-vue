// @vitest-environment node
import { describe, expect, it } from 'vitest'

import * as reference from './dose-calendar.reference.aides'
import {
  aRenseigner,
  carnet,
  cle,
  donne,
  echeance,
  jours,
  ligne,
  modifie,
  oublie,
  vue,
  type Carnet,
} from './dose-calendar.recette.aides'

// R4, R11, décision de Gaelle du 14 octobre 2026 : un oubli est une note sur une seule échéance ;
// reçu d'un autre appareil sur un jour qui n'en est plus une, il ne couvre aucune autre dose.

const synchronise = (a: Carnet, b: Carnet): Carnet => ({
  periods: b.periods,
  doses: [...b.doses, ...a.doses.filter(({ id }) => !b.doses.some((dose) => dose.id === id))],
})

describe('Milo tous les 2 jours à 8 h depuis le 2 oct., doses du 2 et du 4 données ; le 5, le téléphone B passe à tous les 3 jours dès le 7, le téléphone A hors ligne marque la dose du 6 oubliée', () => {
  function carnets() {
    let c = carnet('2026-10-02', jours(2), ['08:00'])
    c = donne(c, '2026-10-02', echeance(c, '2026-10-02', '08:00'))
    c = donne(c, '2026-10-04', echeance(c, '2026-10-04', '08:00'))
    const b = modifie(c, '2026-10-05', jours(3), ['08:00'], '2026-10-07')
    const a = oublie(c, '2026-10-06', echeance(c, '2026-10-06', '08:00'))
    return synchronise(a, b)
  }

  it('après la synchro, le 7, la dose du 7 reste demandée', () => {
    const read = vue(carnets(), '2026-10-07')
    expect([read.phase, read.currentDoses.map(cle)]).toEqual(['today', ['2026-10-07 08:00']])
    expect(aRenseigner(carnets(), '2026-10-07')).toEqual([])
  })

  it('l’oubli du 6 est sans effet dans l’historique', () => {
    const c = carnets()
    const missed = ligne(c, '2026-10-06', '08:00', 'missed')
    expect(vue(c, '2026-10-07').history.find((each) => each.line.id === missed.id)!.effect).toEqual(
      { kind: 'idle', reason: 'nothing-to-cover' },
    )
  })

  it('le modèle de référence demande aussi la dose du 7', () => {
    const before = reference.setting('p1', '2026-10-02', reference.TWO_DAYS, ['08:00'])
    const after = reference.setting('p2', '2026-10-07', { value: 3, unit: 'day' }, ['08:00'], {
      startsOn: '2026-10-05',
    })
    const lines = [
      reference.line('p1', 'given', '2026-10-02', '08:00'),
      reference.line('p1', 'given', '2026-10-04', '08:00'),
      reference.line('p1', 'missed', '2026-10-06', '08:00'),
    ]
    expect(reference.next([before, after], lines, '2026-10-07', 1)).toEqual(['2026-10-07 08:00'])
  })
})
