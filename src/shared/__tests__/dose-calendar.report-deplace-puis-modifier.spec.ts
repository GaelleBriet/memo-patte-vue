// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import { edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { DAY, MONTH, keys, setting } from './dose-calendar.v2.aides'

const TWO_WEEKS: Frequency = { value: 2, unit: 'week' }
const SIX_WEEKS: Frequency = { value: 6, unit: 'week' }

const journee = (input: TreatmentViewInput, day: string) =>
  treatmentView(input)
    .slots(day, day)
    .map(({ due, state }) => `${due.dueOn} ${due.dueTime ?? 'sans heure'} ${state}`)

const echeances = (input: TreatmentViewInput, count: number) =>
  treatmentView(input)
    .upcoming({ limit: count })
    .map(({ dueOn }) => dueOn)

describe('Report déplacé deux fois avec la case, puis « Modifier » : la date choisie montre une dose (#1195)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 2, 12, 10, 0) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Milo, chaque jour sans heure depuis le 6 mars ; le 9, la dose du 10 reportée au 21 avec la case ;
  // le 12, ramenée au 17 avec la case ; le même jour, « Modifier » : toutes les 2 semaines, « Prochaine
  // dose » le 21 mars.
  it('graine 12200000727 : la fiche montre une échéance le 21 mars, la date choisie', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-06', DAY)],
      lines: [],
      today: '2026-03-09',
    }
    input = moved(input, '2026-03-10', null, '2026-03-21')
    input = moved(on(input, '2026-03-12'), '2026-03-21', null, '2026-03-17')
    input = edited(input, {
      frequency: TWO_WEEKS,
      times: [],
      endsOn: null,
      firstDueOn: '2026-03-21',
    })

    expect(journee(input, '2026-03-21')).toEqual(['2026-03-21 sans heure pending'])
    expect(echeances(input, 3)).toContain('2026-03-21')
  })

  // Même carnet : le report parti du 10 est sur une journée que la grille repartie du 21 (toutes les 2
  // semaines) n'a pas (R9, R11, #1231).
  it('graine 12200000727 : le report ramené au 17 est sans effet, la fiche montre le 21 mars puis le 4 avril', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-06', DAY)],
      lines: [],
      today: '2026-03-09',
    }
    input = moved(input, '2026-03-10', null, '2026-03-21')
    input = moved(on(input, '2026-03-12'), '2026-03-21', null, '2026-03-17')
    input = edited(input, {
      frequency: TWO_WEEKS,
      times: [],
      endsOn: null,
      firstDueOn: '2026-03-21',
    })
    const view = treatmentView(input)
    const report = input.lines.find(({ status }) => status === 'postponed')!
    const { moteur, reference } = readings(input)

    expect(view.history.find(({ line }) => line.id === report.id)?.effect).toMatchObject({
      kind: 'idle',
    })
    expect(keys(view.currentDoses)).not.toContain('2026-03-17')
    expect(echeances(input, 2)).toEqual(['2026-03-21', '2026-04-04'])
    expect(reference).toEqual(moteur)
  })

  // Le même carnet ; le 13, la dose du 17 reportée au 19 avec la case : le 21, date choisie après le
  // premier report, reste une échéance.
  it('graine 12200000727, suite : la dose du 17 reportée au 19 avec la case, puis le 21 mars, le 4 et le 18 avril', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-06', DAY)],
      lines: [],
      today: '2026-03-09',
    }
    input = moved(input, '2026-03-10', null, '2026-03-21')
    input = moved(on(input, '2026-03-12'), '2026-03-21', null, '2026-03-17')
    input = edited(input, {
      frequency: TWO_WEEKS,
      times: [],
      endsOn: null,
      firstDueOn: '2026-03-21',
    })
    input = moved(on(input, '2026-03-13'), '2026-03-17', null, '2026-03-19')

    expect(echeances(input, 4)).toEqual(['2026-03-19', '2026-03-21', '2026-04-04', '2026-04-18'])
  })

  // Milo, chaque jour sans heure depuis le 7 mars ; le 7, la dose du 8 reportée au 20 avec la case,
  // puis ramenée au 13 avec la case ; le 15, « Modifier » : même rythme, fin le 16 avril, « Prochaine
  // dose » le 20 mars ; puis une heure ajoutée, 6 h.
  it('graine 681000629 : la journée passée du 13 mars reste « à donner » sans heure quand 6 h s’ajoute (R7)', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-07', DAY)],
      lines: [],
      today: '2026-03-07',
    }
    input = moved(input, '2026-03-08', null, '2026-03-20')
    input = moved(input, '2026-03-20', null, '2026-03-13')
    const every = (times: string[]) => ({ frequency: DAY, times, endsOn: '2026-04-16' })
    input = edited(on(input, '2026-03-15'), { ...every([]), firstDueOn: '2026-03-20' })
    const before = journee(input, '2026-03-13')

    expect(before).toEqual(['2026-03-13 sans heure pending'])
    expect(journee(edited(input, every(['06:00'])), '2026-03-13')).toEqual(before)
  })

  // Milo, toutes les 6 semaines sans heure, première dose le 27 mars ; le 26, la dose du 27 reportée au
  // 2 avril, puis au 5, puis ramenée au 4, chaque fois avec la case ; le 28, « C'est fait » sur la dose
  // du 4 avril ; le 5 avril, « Modifier » : tous les mois, « Prochaine dose » le 5 ; puis 6 h ajoutée.
  it('graine 210000343 : la journée passée du 4 avril reste « donnée » sans heure quand 6 h s’ajoute (R4)', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-27', SIX_WEEKS, [], { startsOn: '2026-03-26' })],
      lines: [],
      today: '2026-03-26',
    }
    input = moved(input, '2026-03-27', null, '2026-04-02')
    input = moved(input, '2026-04-02', null, '2026-04-05')
    input = moved(input, '2026-04-05', null, '2026-04-04')
    input = given(on(input, '2026-03-28'), '2026-04-04', null)
    const monthly = (times: string[]) => ({ frequency: MONTH, times, endsOn: null })
    input = edited(on(input, '2026-04-05'), { ...monthly([]), firstDueOn: '2026-04-05' })
    const before = journee(input, '2026-04-04')

    expect(before).toEqual(['2026-04-04 sans heure given'])
    expect(journee(edited(input, monthly(['06:00'])), '2026-04-04')).toEqual(before)
  })
})
