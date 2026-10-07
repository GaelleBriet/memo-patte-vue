import { describe, expect, it } from 'vitest'

import { given, givenDays, monthlyFrom, period, treatment, vaccination } from './home-sources'
import { todoItems } from '../logic/todo-items'

const TODAY = '2026-10-06'
const BOTH = ['08:00', '20:00']

/** Quotidien à 8 h et 20 h depuis le 1er oct., tout noté jusqu'au 4 et le 5 à 8 h. */
const METACAM = treatment({
  periods: [period({ firstDueOn: '2026-10-01', times: BOTH })],
  doses: [...givenDays('2026-10-01', '2026-10-04', BOTH), given('2026-10-05', '08:00')],
})

describe('todoItems — traitements lus par le moteur d’échéances', () => {
  it('quotidien à deux heures, 20 h d’hier non notée : les deux prises du jour, et une dose à renseigner, sans retard', () => {
    expect(todoItems([METACAM], TODAY)).toEqual([
      expect.objectContaining({
        group: 'due',
        key: 'treatment:t1:2026-10-06T08:00',
        status: 'today',
        daysUntil: 0,
        dueOn: TODAY,
        dueTime: '08:00',
      }),
      expect.objectContaining({
        group: 'due',
        key: 'treatment:t1:2026-10-06T20:00',
        status: 'today',
        dueTime: '20:00',
      }),
      expect.objectContaining({
        group: 'to-log',
        key: 'treatment:t1:unlogged',
        unlogged: 1,
        oldest: { dueOn: '2026-10-05', dueTime: '20:00' },
      }),
    ])
  })

  it('la prise de 8 h notée, la ligne de 8 h disparaît et celle de 20 h reste (Accueil §4, critère 3)', () => {
    const noted = { ...METACAM, doses: [...METACAM.doses, given(TODAY, '08:00')] }

    expect(todoItems([noted], TODAY).map(({ key }) => key)).toEqual([
      'treatment:t1:2026-10-06T20:00',
      'treatment:t1:unlogged',
    ])
  })

  it('garde l’heure d’une prise du jour passée : jamais en retard le jour même (TR-11)', () => {
    const items = todoItems([METACAM], TODAY)

    expect(items.filter((item) => item.group === 'due' && item.status === 'overdue')).toEqual([])
  })

  it('journée passée en retard à deux heures : une ligne par heure, chacune en retard d’un jour (Q5)', () => {
    const hebdo = treatment({
      periods: [
        period({ firstDueOn: '2026-10-05', frequency: { value: 1, unit: 'week' }, times: BOTH }),
      ],
    })

    expect(todoItems([hebdo], TODAY)).toEqual([
      expect.objectContaining({ status: 'overdue', daysUntil: -1, dueTime: '08:00' }),
      expect.objectContaining({ status: 'overdue', daysUntil: -1, dueTime: '20:00' }),
    ])
  })

  it('en retard de six jours, une seule ligne', () => {
    const advocate = treatment({
      label: 'Advocate',
      treatmentType: 'antiparasitic',
      periods: [period({ firstDueOn: '2026-09-30', frequency: { value: 1, unit: 'month' } })],
    })

    expect(todoItems([advocate], TODAY)).toEqual([
      expect.objectContaining({
        group: 'due',
        key: 'treatment:t1:2026-09-30',
        status: 'overdue',
        daysUntil: -6,
        dueTime: null,
        label: 'Advocate',
        treatmentType: 'antiparasitic',
        animalId: 'luna',
      }),
    ])
  })

  it('une seule ligne au-delà d’aujourd’hui, même à plusieurs heures', () => {
    const demain = treatment({ periods: [period({ firstDueOn: '2026-10-07', times: BOTH })] })

    expect(todoItems([demain], TODAY)).toEqual([
      expect.objectContaining({ status: 'tomorrow', daysUntil: 1, dueOn: '2026-10-07' }),
    ])
  })

  it('date de fin passée et deux doses non renseignées : seulement « À renseigner » (Traitements §8, critère 8)', () => {
    const fini = treatment({
      periods: [period({ firstDueOn: '2026-09-28', endsOn: '2026-10-03' })],
      doses: givenDays('2026-09-28', '2026-10-01'),
    })

    expect(todoItems([fini], TODAY)).toEqual([
      expect.objectContaining({
        group: 'to-log',
        unlogged: 2,
        oldest: { dueOn: '2026-10-02', dueTime: null },
      }),
    ])
  })

  it('rien après la date de fin quand tout est noté', () => {
    const fini = treatment({
      periods: [period({ firstDueOn: '2026-09-28', endsOn: '2026-10-03' })],
      doses: givenDays('2026-09-28', '2026-10-03'),
    })

    expect(todoItems([fini], TODAY)).toEqual([])
  })

  it('n’affiche pas de dose au-delà de la date de fin', () => {
    const finitDemain = treatment({
      periods: [period({ firstDueOn: '2026-09-28', endsOn: TODAY })],
      doses: givenDays('2026-09-28', TODAY),
    })

    expect(todoItems([finitDemain], TODAY)).toEqual([])
  })

  it('arrêté avec des doses non renseignées : il reste, en « À renseigner » seulement', () => {
    const arrete = treatment({
      periods: [period({ firstDueOn: '2026-10-01', stoppedOn: '2026-10-05' })],
      doses: givenDays('2026-10-01', '2026-10-03'),
    })

    expect(todoItems([arrete], TODAY)).toEqual([
      expect.objectContaining({ group: 'to-log', oldest: { dueOn: '2026-10-04', dueTime: null } }),
    ])
  })

  it('arrêté sans rien à renseigner : plus rien', () => {
    const arrete = treatment({
      periods: [period({ firstDueOn: '2026-10-01', stoppedOn: '2026-10-03' })],
      doses: givenDays('2026-10-01', '2026-10-03'),
    })

    expect(todoItems([arrete], TODAY)).toEqual([])
  })

  it('en cours, prochaine dose hors de la fenêtre et des doses à renseigner : la ligne de dose et « À renseigner »', () => {
    const trimestriel = treatment({
      periods: [period({ firstDueOn: '2026-07-10', frequency: { value: 3, unit: 'month' } })],
      doses: [given('2026-07-10')],
    })
    const loin = treatment({
      periods: [period({ firstDueOn: '2026-07-10', frequency: { value: 2, unit: 'month' } })],
      doses: [given('2026-09-10')],
    })

    expect(todoItems([trimestriel], TODAY)).toEqual([
      expect.objectContaining({ group: 'due', dueOn: '2026-10-10', daysUntil: 4 }),
    ])
    expect(todoItems([loin], TODAY)).toEqual([
      expect.objectContaining({ group: 'due', dueOn: '2026-11-10', daysUntil: 35 }),
      expect.objectContaining({ group: 'to-log', unlogged: 1 }),
    ])
  })

  it('traitement illisible : une ligne « Donnée illisible », sans échéance (Q40)', () => {
    const illisible = treatment({
      periods: [period({ frequency: { value: 0, unit: 'day' } })],
    })

    expect(todoItems([illisible], TODAY)).toEqual([
      expect.objectContaining({ group: 'unreadable', key: 'treatment:t1', label: 'Métacam' }),
    ])
  })
})

describe('todoItems — vaccins', () => {
  it('une ligne à leur échéance, sans heure', () => {
    expect(todoItems([vaccination({ dueDate: '2026-10-04' })], TODAY)).toEqual([
      {
        group: 'due',
        key: 'vaccination:v1',
        kind: 'vaccination',
        id: 'v1',
        animalId: 'milo',
        label: 'CHPPiL',
        treatmentType: null,
        firstVaccine: false,
        status: 'overdue',
        daysUntil: -2,
        dueOn: '2026-10-04',
        dueTime: null,
      },
    ])
  })

  it('marque un vaccin jamais fait, et lui seul (Vaccins Q1 bis)', () => {
    const items = todoItems(
      [
        vaccination({ id: 'prevu', lastInjectionDate: null, dueDate: '2026-10-11' }),
        vaccination({ id: 'rappel', dueDate: '2026-10-11' }),
        monthlyFrom(TODAY, { id: 'traitement' }),
      ],
      TODAY,
    )

    expect(items.map((item) => [item.id, item.firstVaccine])).toEqual([
      ['prevu', true],
      ['rappel', false],
      ['traitement', false],
    ])
  })

  it('ignore un vaccin sans échéance', () => {
    expect(todoItems([vaccination({ dueDate: null })], TODAY)).toEqual([])
  })

  it('distingue demain et plus tard', () => {
    const items = todoItems(
      [
        vaccination({ id: 'a', dueDate: '2026-10-07' }),
        vaccination({ id: 'b', dueDate: '2026-10-18' }),
        monthlyFrom(TODAY, { id: 'c' }),
      ],
      TODAY,
    )

    expect(items.map((item) => item.group === 'due' && item.status)).toEqual([
      'tomorrow',
      'later',
      'today',
    ])
  })
})
