// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  affiche,
  carnet,
  cle,
  corrige,
  deplace,
  donne,
  echeance,
  H,
  jours,
  journees,
  lecture,
  ligne,
  modifie,
  mois,
  semaines,
  supprime,
  supprimeReport,
  type Carnet,
} from './dose-calendar.recette.aides'

// Jeu de recette du moteur v2 (épic #758) : gestes sur la fiche, deux appareils, temps qui passe.

function vendredis(endsOn: string | null = null) {
  let c = carnet('2026-10-02', semaines(1), [], endsOn)
  c = donne(c, '2026-10-02', echeance(c, '2026-10-02'))
  return donne(c, '2026-10-09', echeance(c, '2026-10-09'))
}

describe('R6 : décalage, report seul, date de fin (vendredis d’octobre)', () => {
  it('G18 : dose du 16 avancée au 13 avec décalage, puis donnée le 12 : prochaine dose le 19', () => {
    let c = deplace(vendredis(), '2026-10-10', echeance(vendredis(), '2026-10-16'), '2026-10-13')
    c = donne(c, '2026-10-13', echeance(c, '2026-10-13'), '2026-10-12')
    expect(journees(c, '2026-10-13', 2)).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('G20 : fin le 30, dose du 16 donnée le lundi 19 ; cochée : le 26 ; décochée : le 23 et le 30', () => {
    const c = vendredis('2026-10-30')
    const due = echeance(c, '2026-10-16')
    expect(journees(donne(c, '2026-10-19', due, '2026-10-19', true), '2026-10-19')).toEqual([
      '2026-10-26',
    ])
    expect(journees(donne(c, '2026-10-19', due, '2026-10-19', false), '2026-10-19')).toEqual([
      '2026-10-23',
      '2026-10-30',
    ])
  })

  it('G19, G21 : dose du 26 reportée seule au 30 ; prise corrigée au 17 : avancée au 30 ; au 16 : 23 en retard, puis 30', () => {
    let c = donne(
      vendredis(),
      '2026-10-19',
      echeance(vendredis(), '2026-10-16'),
      '2026-10-19',
      true,
    )
    expect(journees(c, '2026-10-19', 2)).toEqual(['2026-10-26', '2026-11-02'])
    c = deplace(c, '2026-10-20', echeance(c, '2026-10-26'), '2026-10-30', false)
    const prise = ligne(c, '2026-10-16', null, 'given').id
    const au17 = corrige(c, '2026-10-27', prise, '2026-10-17')
    const report = au17.doses.find(({ status }) => status === 'postponed')
    expect([report?.dueOn, report?.nextDueDate]).toEqual(['2026-10-31', '2026-10-30'])
    expect(journees(au17, '2026-10-27', 3)).toEqual(['2026-10-24', '2026-10-30', '2026-11-07'])
    const au16 = corrige(c, '2026-10-27', prise, '2026-10-16')
    expect(journees(au16, '2026-10-27', 2)).toEqual(['2026-10-23', '2026-10-30'])
  })
})

describe('R5, R6 : prise en plus, correction de date', () => {
  it('R5 : dose du 16 donnée le mercredi 7, un intervalle avant : prise en plus, le 16 reste dû', () => {
    const c = vendredis()
    const schedule = lecture(c, '2026-10-10')
    const due = schedule.dueForDate('2026-10-07')!
    expect(due.dueOn).toBe('2026-10-16')
    const noted = schedule.doseFor({ kind: 'given', due, givenOn: '2026-10-07' })
    expect([noted.dose.status, noted.dose.dueOn, noted.shift]).toEqual([
      'extra',
      '2026-10-07',
      null,
    ])
    expect(journees(donne(c, '2026-10-10', due, '2026-10-07'), '2026-10-10', 3)).toEqual([
      '2026-10-16',
      '2026-10-23',
      '2026-10-30',
    ])
  })

  it.fails(
    'Q-C1 : dose du 16 notée le 16, corrigée le 25 « donnée le 24 », case cochée : 31 oct., 7 nov.',
    () => {
      const c = donne(vendredis(), '2026-10-16', echeance(vendredis(), '2026-10-16'))
      const corrigee = corrige(
        c,
        '2026-10-25',
        ligne(c, '2026-10-16', null, 'given').id,
        '2026-10-24',
      )
      const schedule = lecture(corrigee, '2026-10-25')
      expect({
        current: schedule.currentDoses.map(cle),
        unlogged: schedule.unloggedDoses.map(cle),
        next: schedule.upcoming(2).map(cle),
      }).toEqual({ current: ['2026-10-31'], unlogged: [], next: ['2026-10-31', '2026-11-07'] })
    },
  )

  it.fails(
    'Q-C1 : la correction et « Fait à une autre date » le 24 donnent le même calendrier',
    () => {
      const c = donne(vendredis(), '2026-10-16', echeance(vendredis(), '2026-10-16'))
      const corrigee = corrige(
        c,
        '2026-10-25',
        ligne(c, '2026-10-16', null, 'given').id,
        '2026-10-24',
      )
      expect(lecture(corrigee, '2026-10-25').phase).toBe('upcoming')
      expect(journees(corrigee, '2026-10-25', 2)).toEqual(['2026-10-31', '2026-11-07'])
      const autre = lecture(vendredis(), '2026-10-25').dueForDate('2026-10-24')!
      expect(
        journees(donne(vendredis(), '2026-10-25', autre, '2026-10-24', true), '2026-10-25', 2),
      ).toEqual(['2026-10-31', '2026-11-07'])
    },
  )

  it('N6 : dose du 16 donnée le 19 avec décalage, prise supprimée : le 16 revient, la suite reste décalée', () => {
    let c = donne(
      vendredis(),
      '2026-10-19',
      echeance(vendredis(), '2026-10-16'),
      '2026-10-19',
      true,
    )
    c = supprime(c, ligne(c, '2026-10-16', null, 'given').id)
    const schedule = lecture(c, '2026-10-20')
    expect(schedule.currentDoses.map(cle)).toEqual(['2026-10-16'])
    expect(schedule.upcoming(2).map(cle)).toEqual(['2026-10-26', '2026-11-02'])
    expect(schedule.unloggedDoses).toEqual([])
  })
})

describe('R7, R11 : un report reste une ligne du traitement', () => {
  it('#719 : hebdo, dose du 15 reportée au 17 avec décalage, posologie changée le 9 : 17, 24, 31', () => {
    let c = carnet('2026-10-01', semaines(1))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
    c = donne(c, '2026-10-08', echeance(c, '2026-10-08'))
    c = deplace(c, '2026-10-09', echeance(c, '2026-10-15'), '2026-10-17', true)
    expect(journees(c, '2026-10-09', 3)).toEqual(['2026-10-17', '2026-10-24', '2026-10-31'])
    c = modifie(c, '2026-10-09', semaines(1), [])
    expect(journees(c, '2026-10-09', 3)).toEqual(['2026-10-17', '2026-10-24', '2026-10-31'])
  })

  it('#719 : hebdo, le 2, dose du 15 reportée seule au 17 pendant que le 8 est à venir, posologie changée : 8, 17, 22', () => {
    let c = carnet('2026-10-01', semaines(1))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
    c = deplace(c, '2026-10-02', echeance(c, '2026-10-15'), '2026-10-17', false)
    expect(journees(c, '2026-10-02', 3)).toEqual(['2026-10-08', '2026-10-17', '2026-10-22'])
    c = modifie(c, '2026-10-02', semaines(1), [])
    expect(journees(c, '2026-10-02', 3)).toEqual(['2026-10-08', '2026-10-17', '2026-10-22'])
  })

  it('#734 (voisin), Q-purge : journée du 3 reportée seule au 4, posologie changée le 3, « Supprimer ce report » : le 3 revient', () => {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'), '2026-10-04', false)
    c = modifie(c, '2026-10-03', jours(2), H)
    c = supprimeReport(c, '2026-10-03', ligne(c, '2026-10-03', '08:00', 'postponed').id)
    expect(affiche(c, '2026-10-03', 4)).toEqual([
      '2026-10-03 08:00',
      '2026-10-03 20:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
    ])
  })
})

describe('TR-25, R11 : deux appareils', () => {
  function fusion(a: Carnet, b: Carnet): Carnet {
    return {
      periods: a.periods,
      doses: [...a.doses, ...b.doses.filter((dose) => !a.doses.includes(dose))],
    }
  }

  it('Q-purge : A note la dose du 16, B la reporte seule au 19 : la prise gagne, le report reste, sans effet', () => {
    const c = vendredis()
    const parA = donne(c, '2026-10-16', echeance(c, '2026-10-16'))
    const parB = deplace(c, '2026-10-16', echeance(c, '2026-10-16'), '2026-10-19', false)
    const fusionne = fusion(parA, parB)
    expect(journees(fusionne, '2026-10-17', 2)).toEqual(['2026-10-23', '2026-10-30'])
    const ensuite = donne(fusionne, '2026-10-23', echeance(fusionne, '2026-10-23'))
    const report = ensuite.doses.find(
      ({ dueOn, status }) => dueOn === '2026-10-16' && status === 'postponed',
    )
    expect(report?.nextDueDate).toBe('2026-10-19')
  })

  it('A et B notent la même dose à deux dates : la plus récente gagne', () => {
    const debut = carnet('2026-10-02', semaines(1))
    const c = donne(debut, '2026-10-02', echeance(debut, '2026-10-02'))
    const parA = donne(c, '2026-10-10', echeance(c, '2026-10-09'), '2026-10-09')
    const parB = donne(c, '2026-10-11', echeance(c, '2026-10-09'), '2026-10-11', true)
    expect(journees(fusion(parA, parB), '2026-10-12', 2)).toEqual(['2026-10-18', '2026-10-25'])
  })
})

describe('le temps qui passe ne change que les étiquettes, jamais le calendrier', () => {
  function echeances(c: Carnet, today: string, horizon: string): string[] {
    const schedule = lecture(c, today)
    const all = [...schedule.unloggedDoses, ...schedule.currentDoses, ...schedule.upcoming(200)]
    return [...new Set(all.map(cle))].filter((key) => key.slice(0, 10) <= horizon).sort()
  }

  // Les jours où l'ensemble des échéances jusqu'à l'horizon n'est plus celui d'aujourd'hui.
  function changements(c: Carnet, today: string, horizon: string): string[] {
    const base = JSON.stringify(echeances(c, today, horizon))
    return [1, 2, 3, 5, 8, 13, 21, 34]
      .map((days) => {
        const later = new Date(`${today}T12:00:00Z`)
        later.setUTCDate(later.getUTCDate() + days)
        return later.toISOString().slice(0, 10)
      })
      .filter((day) => day <= horizon && JSON.stringify(echeances(c, day, horizon)) !== base)
  }

  function base2() {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    return donne(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'))
  }

  it('quotidien à 8 h et 20 h', () => {
    let c = carnet('2026-10-01', jours(1), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    expect(
      changements(
        donne(c, '2026-10-02', echeance(c, '2026-10-02', '08:00')),
        '2026-10-02',
        '2026-11-15',
      ),
    ).toEqual([])
  })

  it('tous les 2 jours : report seul, posologie changée, décalage', () => {
    let c = modifie(
      deplace(base2(), '2026-10-03', echeance(base2(), '2026-10-03', '20:00'), '2026-10-04', false),
      '2026-10-04',
      jours(2),
      H,
    )
    expect(changements(c, '2026-10-04', '2026-11-15')).toEqual([])
    c = donne(c, '2026-10-06', echeance(c, '2026-10-05', '08:00'), '2026-10-06', true)
    expect(changements(c, '2026-10-06', '2026-11-15')).toEqual([])
  })

  it('mensuel du 31 avec une dose avancée seule', () => {
    let c = carnet('2026-01-31', mois(1))
    c = donne(c, '2026-01-31', echeance(c, '2026-01-31'))
    c = deplace(c, '2026-02-10', echeance(c, '2026-02-28'), '2026-02-25', false)
    expect(changements(c, '2026-02-10', '2026-08-31')).toEqual([])
  })
})
