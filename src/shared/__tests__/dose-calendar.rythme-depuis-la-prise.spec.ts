// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  carnet,
  deplace,
  donne,
  echeance,
  H,
  jours,
  journees,
  modifie,
  affiche,
  semaines,
  supprimeReport,
  corrige,
  vue,
  type Carnet,
  type Due,
} from './dose-calendar.recette.aides'

// #1373, Q76 : une dose donnée est une vraie prise ce jour-là ; quand le rythme change, il compte
// depuis la dernière prise réelle.

function milo(decale = true): Carnet {
  let c = carnet('2026-10-01', jours(3), ['09:00'])
  c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '09:00'))
  return donne(c, '2026-10-02', echeance(c, '2026-10-04', '09:00'), '2026-10-02', decale)
}

function miloProchaineDose(): Carnet {
  let c = carnet('2026-10-01', jours(3), ['09:00'])
  c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '09:00'))
  c = deplace(c, '2026-10-02', echeance(c, '2026-10-04', '09:00'), '2026-10-02', true)
  return donne(c, '2026-10-02', echeance(c, '2026-10-02', '09:00'))
}

const prisesDonnees = (c: Carnet) =>
  c.doses
    .filter(({ status }) => status === 'given')
    .map(({ dueOn, givenOn }) => `${dueOn} donnée le ${givenOn}`)
    .sort()

const sansEffet = (c: Carnet, today: string) =>
  vue(c, today)
    .history.filter(({ line, effect }) => line.status === 'given' && effect.kind === 'idle')
    .map(({ line }) => line.dueOn)

describe('#1373 : la dose du nouveau rythme, le jour de l’ancienne échéance, se donne à part', () => {
  it('dose du 4 donnée le 2 avec la case, tous les 2 jours le 3, la dose du 4 donnée le 4 : les deux prises restent, puis le 6', () => {
    let c = modifie(milo(), '2026-10-03', jours(2), ['09:00'])
    c = donne(c, '2026-10-04', echeance(c, '2026-10-04', '09:00'))
    expect(prisesDonnees(c)).toEqual([
      '2026-10-01 donnée le 2026-10-01',
      '2026-10-04 donnée le 2026-10-02',
      '2026-10-04 donnée le 2026-10-04',
    ])
    expect(sansEffet(c, '2026-10-04')).toEqual([])
    expect(journees(c, '2026-10-04', 2)).toEqual(['2026-10-06', '2026-10-08'])
  })

  it('« Prochaine dose » avec la case au 2, donnée le 2, tous les 2 jours le 3, la dose du 4 donnée le 4 : les deux prises restent, puis le 6', () => {
    let c = modifie(miloProchaineDose(), '2026-10-03', jours(2), ['09:00'])
    c = donne(c, '2026-10-04', echeance(c, '2026-10-04', '09:00'))
    expect(prisesDonnees(c)).toEqual([
      '2026-10-01 donnée le 2026-10-01',
      '2026-10-02 donnée le 2026-10-02',
      '2026-10-04 donnée le 2026-10-04',
    ])
    expect(sansEffet(c, '2026-10-04')).toEqual([])
    expect(journees(c, '2026-10-04', 2)).toEqual(['2026-10-06', '2026-10-08'])
  })

  it('la prise du 2 n’est jamais sans effet après le changement de rythme', () => {
    const c = modifie(milo(), '2026-10-03', jours(2), ['09:00'])
    expect(sansEffet(c, '2026-10-03')).toEqual([])
  })

  it('dose du 4 de nouveau donnée d’avance le 3 avec la case : la prise du 2 reste, puis le 5', () => {
    let c = modifie(milo(), '2026-10-03', jours(2), ['09:00'])
    c = donne(c, '2026-10-03', echeance(c, '2026-10-04', '09:00'), '2026-10-03', true)
    expect(prisesDonnees(c)).toContain('2026-10-04 donnée le 2026-10-02')
    expect(prisesDonnees(c)).toContain('2026-10-04 donnée le 2026-10-03')
    expect(sansEffet(c, '2026-10-03')).toEqual([])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-05', '2026-10-07'])
  })

  it('dose du 4 du nouveau rythme reportée au 5 sans la case : la prise du 2 reste, le 5, puis le 6', () => {
    let c = modifie(milo(), '2026-10-03', jours(2), ['09:00'])
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-04', '09:00'), '2026-10-05', false)
    expect(sansEffet(c, '2026-10-03')).toEqual([])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-05', '2026-10-06'])
  })
})

describe('#1373 : le nouveau rythme compte depuis la prise réelle', () => {
  it('le changement de rythme le jour même de la prise : le 4, puis le 6', () => {
    const c = modifie(milo(), '2026-10-02', jours(2), ['09:00'])
    expect(journees(c, '2026-10-02', 2)).toEqual(['2026-10-04', '2026-10-06'])
  })

  it('chaque semaine, dose du 8 donnée le 6 avec la case, toutes les 2 semaines le 7 : le 20 (6 + 14)', () => {
    let c = carnet('2026-10-01', semaines(1), ['09:00'])
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '09:00'))
    c = donne(c, '2026-10-06', echeance(c, '2026-10-08', '09:00'), '2026-10-06', true)
    c = modifie(c, '2026-10-07', semaines(2), ['09:00'])
    expect(journees(c, '2026-10-07', 2)).toEqual(['2026-10-20', '2026-11-03'])
  })
})

describe('#1373 : « Prochaine dose » après une prise réelle', () => {
  it('tous les 5 jours le 3 : proposé le 7 (2 + 5)', () => {
    const c = modifie(milo(), '2026-10-03', jours(5), ['09:00'])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-07', '2026-10-12'])
  })

  it('tous les 5 jours le 3, « Prochaine dose » le 8 : la prise du 2 n’est pas une dose notée plus loin', () => {
    const c = modifie(milo(), '2026-10-03', jours(5), ['09:00'], '2026-10-08')
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-08', '2026-10-13'])
  })
})

describe('#1373 : ce que la règle ne change pas', () => {
  it('heures seules après la prise avec la case : le calendrier décalé ne bouge pas, le 5, puis le 8', () => {
    const c = modifie(milo(), '2026-10-03', jours(3), ['10:00'])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-05', '2026-10-08'])
  })

  it('dose du 4 donnée le 2 sans la case, tous les 2 jours le 3 : le 4 reste entamé, le 6, puis le 8 (R9.2)', () => {
    const c = modifie(milo(false), '2026-10-03', jours(2), ['09:00'])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-06', '2026-10-08'])
  })

  it('tous les 3 jours à 8 h et 20 h, 8 h du 4 seule donnée le 2 sans la case, tous les 2 jours le 3 : le 4 reste entamé, 20 h à donner (R9.2)', () => {
    let c = carnet('2026-10-01', jours(3), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = donne(c, '2026-10-02', echeance(c, '2026-10-04', '08:00'), '2026-10-02', false)
    expect(affiche(modifie(c, '2026-10-03', jours(2), H), '2026-10-03', 2)).toEqual([
      '2026-10-04 20:00',
      '2026-10-06 08:00',
    ])
  })
})

describe('#1373 : supprimer une ligne du nouveau rythme ne touche pas l’ancien', () => {
  it('dose du 4 du nouveau rythme reportée au 5 avec la case puis le report supprimé : la prise du 2 reste, le 4, puis le 6', () => {
    let c = modifie(milo(), '2026-10-03', jours(2), ['09:00'])
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-04', '09:00'), '2026-10-05', true)
    const report = c.doses.find(
      ({ status, periodId }) => status === 'postponed' && periodId === 'p2',
    )!
    c = supprimeReport(c, '2026-10-03', report.id)
    expect(
      c.doses.filter(({ status }) => status === 'shift').map(({ periodId }) => periodId),
    ).toEqual(['p1'])
    expect(sansEffet(c, '2026-10-03')).toEqual([])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-04', '2026-10-06'])
  })
})

describe('#1373 : une prise notée après le changement de rythme compte dans le nouveau', () => {
  function miloAuSix(heures: string[]): Carnet {
    let c = carnet('2026-10-01', jours(3), ['09:00'])
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '09:00'))
    c = deplace(c, '2026-10-02', echeance(c, '2026-10-04', '09:00'), '2026-10-06', true)
    return modifie(c, '2026-10-05', jours(2), heures)
  }

  const doseDuMoment = (c: Carnet, today: string): Due => {
    const { settingId, dueOn, dueTime } = vue(c, today).currentDoses[0]!
    return { periodId: settingId, dueOn, dueTime }
  }

  it.each([[[]], [['20:00']]])(
    'dose du 4 au 6 avec la case, tous les 2 jours le 5 (heures %j), « Fait à une autre date » le 5 avec la case : plus de 6 à donner, le 8, puis le 10',
    (heures: string[]) => {
      const c = miloAuSix(heures)
      expect(affiche(c, '2026-10-06', 1)).toEqual(['2026-10-06 09:00'])
      const apres = donne(c, '2026-10-06', doseDuMoment(c, '2026-10-06'), '2026-10-05', true)
      expect(journees(apres, '2026-10-06', 3)).toEqual(['2026-10-08', '2026-10-10', '2026-10-12'])
    },
  )

  it('même geste par « C’est fait » le 6 puis « Changer la date » au 5 avec la case : accepté, le 8, puis le 10', () => {
    let c = miloAuSix([])
    c = donne(c, '2026-10-06', doseDuMoment(c, '2026-10-06'))
    const prise = c.doses.find(
      ({ status, givenOn }) => status === 'given' && givenOn === '2026-10-06',
    )!
    c = corrige(c, '2026-10-06', prise.id, '2026-10-05', true)
    expect(journees(c, '2026-10-06', 3)).toEqual(['2026-10-08', '2026-10-10', '2026-10-12'])
  })
})
