// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, type SettingsRequest } from '../domain/dose-calendar'
import { settingsApplied } from '../domain/dose-calendar/gestures/changes'
import type { SettingsPlan, TreatmentViewInput } from '../domain/dose-calendar/types'
import { buildView } from '../domain/dose-calendar/view'
import { keys, line, setting, TWO_DAYS } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' as const }

const facts = ({ setting: { firstDueChosen, pastDosesStayUnlogged } }: SettingsPlan) => ({
  firstDueChosen,
  pastDosesStayUnlogged,
})

function planOf(input: TreatmentViewInput, request: SettingsRequest): SettingsPlan {
  const result = newSettings(input, request)
  if (!('plan' in result)) throw new Error(JSON.stringify(result))
  return result.plan
}

describe('#836 : le réglage écrit dit si sa première dose a été choisie dans « Prochaine dose »', () => {
  const milo = setting('p1', '2026-10-03', THREE_DAYS, ['08:00'])
  const input = {
    settings: [milo],
    lines: [line('p1', 'given', '2026-10-03', '08:00')],
    today: '2026-10-07',
  }
  const everyTwo = { frequency: TWO_DAYS, times: ['08:00'], endsOn: null }

  it('tous les 3 jours depuis le 3 oct. ; le 7, tous les 2 jours à la date proposée : date non choisie', () => {
    const plan = planOf(input, everyTwo)
    expect(facts(plan)).toEqual({ firstDueChosen: false, pastDosesStayUnlogged: false })
    expect(facts(planOf(input, { ...everyTwo, firstDueOn: plan.setting.firstDueOn }))).toEqual(
      facts(plan),
    )
  })

  it('même carnet, « Prochaine dose » le 10 : date choisie', () => {
    expect(facts(planOf(input, { ...everyTwo, firstDueOn: '2026-10-10' }))).toEqual({
      firstDueChosen: true,
      pastDosesStayUnlogged: false,
    })
  })

  it('même carnet, heures seules changées, « Prochaine dose » le 8 : date choisie', () => {
    const request = {
      frequency: THREE_DAYS,
      times: ['09:00'],
      endsOn: null,
      firstDueOn: '2026-10-08',
    }
    expect(planOf(input, request).setting).toMatchObject({
      gridOriginOn: '2026-10-08',
      firstDueChosen: true,
    })
  })
})

describe('#817, Q38 : seule « Elles restent à renseigner » écrit que les doses passées restent à renseigner', () => {
  const everyTwo = setting('t1', '2026-10-01', TWO_DAYS, ['08:00'])
  const input = { settings: [everyTwo], lines: [], today: '2026-10-06' }
  const request = { frequency: TWO_DAYS, times: ['09:00'], endsOn: null }

  it.each([
    ['à la date proposée', {}, false],
    ['« Prochaine dose » le 8', { firstDueOn: '2026-10-08' }, true],
  ])(
    'tous les 2 jours à 8 h dès le 1er, rien de noté ; le 6, 9 h %s',
    (_, chosen, firstDueChosen) => {
      const result = newSettings(input, { ...request, ...chosen })
      if (!('question' in result) || 'refusal' in result.question.correct) {
        throw new Error(JSON.stringify(result))
      }
      expect(facts(result.question.keep)).toEqual({ firstDueChosen, pastDosesStayUnlogged: true })
      expect(facts(result.question.correct)).toEqual({
        firstDueChosen,
        pastDosesStayUnlogged: false,
      })
    },
  )

  it('un réglage gardé à renseigner, corrigé le même jour sans question, garde la réponse', () => {
    const kept = setting('t2', '2026-10-06', TWO_DAYS, ['09:00'], {
      firstDueOn: '2026-10-08',
      gridOriginOn: '2026-10-08',
      pastDosesStayUnlogged: true,
    })
    const later = { ...input, settings: [everyTwo, kept] }
    const plan = planOf(later, { ...request, endsOn: '2026-12-31' })
    expect(plan).toMatchObject({ action: 'rewrite', id: 't2' })
    expect(plan.setting.pastDosesStayUnlogged).toBe(true)
  })
})

describe('#836, lecture à confirmer par Gaelle : « Elles n’étaient pas à donner » sans date choisie ne remplace plus la dose du moment', () => {
  it('tous les 2 jours à 8 h depuis le 1er oct., dose du 1er donnée, du 3 non ; le 4, 9 h ; le 6, dose du 5 non donnée, 10 h, « Elles n’étaient pas à donner » : la dose du 3 est en retard, puis 7, 9', () => {
    const first = setting('t0', '2026-10-01', TWO_DAYS, ['08:00'])
    const nine = setting('t1', '2026-10-05', TWO_DAYS, ['09:00'], {
      startsOn: '2026-10-04',
      gridOriginOn: null,
    })
    const input = {
      settings: [first, nine],
      lines: [line('t0', 'given', '2026-10-01', '08:00')],
      today: '2026-10-06',
    }
    const result = newSettings(input, { frequency: TWO_DAYS, times: ['10:00'], endsOn: null })
    if (!('question' in result) || 'refusal' in result.question.correct) {
      throw new Error(JSON.stringify(result))
    }
    const read = buildView(settingsApplied(input, result.question.correct))
    expect(read.phase).toBe('overdue')
    expect(keys(read.currentDoses)).toEqual(['2026-10-03 08:00'])
    expect(keys(read.unloggedDoses)).toEqual([])
    expect(keys(read.upcoming().slice(0, 2))).toEqual(['2026-10-07 10:00', '2026-10-09 10:00'])
  })
})
