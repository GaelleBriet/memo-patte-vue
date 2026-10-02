import { afterEach, describe, expect, it } from 'vitest'

import { pastDuesTexts } from '../logic/treatment-past-dues'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t as never
const PROCHAINES = { keep: '2026-10-15', drop: '2026-10-04' }
const TOUS_LES_2_JOURS = { frequency: { value: 2, unit: 'day' as const }, times: [] }

function dues(days: string[], times: (string | null)[] = [null]) {
  return days.flatMap((dueOn) => times.map((dueTime) => ({ periodId: 'p', dueOn, dueTime })))
}

function lisible(texts: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(texts).map(([key, text]) => [key, String(text).replaceAll('\u00a0', ' ')]),
  )
}

describe('pastDuesTexts', () => {
  afterEach(() => {
    applyLocale('fr')
  })

  it('annonce trois doses, leurs dates et l’ancien rythme', () => {
    expect(
      lisible(
        pastDuesTexts(
          t,
          dues(['2026-10-03', '2026-10-05', '2026-10-07']),
          TOUS_LES_2_JOURS,
          PROCHAINES,
        ),
      ),
    ).toEqual({
      title: '3 doses étaient prévues avant aujourd’hui',
      text: 'Les 3, 5 et 7 oct., au rythme « tous les 2 jours ».',
      keep: 'Elles restent à renseigner',
      keepHint: 'Le nouveau rythme commence aujourd’hui. Prochaine dose le 15 oct.',
      drop: 'Elles n’étaient pas à donner',
      dropHint: 'L’ancien réglage était une erreur. Prochaine dose le 4 oct.',
      cancel: 'Annuler',
    })
  })

  it('passe au singulier pour une seule dose', () => {
    expect(
      lisible(
        pastDuesTexts(
          t,
          dues(['2026-10-03']),
          { frequency: { value: 1, unit: 'week' }, times: [] },
          PROCHAINES,
        ),
      ),
    ).toMatchObject({
      title: '1 dose était prévue avant aujourd’hui',
      text: 'Le 3 oct., au rythme « toutes les semaines ».',
      keep: 'Elle reste à renseigner',
      drop: 'Elle n’était pas à donner',
    })
  })

  it('donne une plage au-delà de trois dates, et écrit le mois de chaque bout quand ils diffèrent', () => {
    const jours = ['2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-15']

    expect(lisible(pastDuesTexts(t, dues(jours), TOUS_LES_2_JOURS, PROCHAINES)).text).toBe(
      'Du 3 au 15 oct., au rythme « tous les 2 jours ».',
    )
    expect(
      lisible(pastDuesTexts(t, dues(['2026-09-27', ...jours]), TOUS_LES_2_JOURS, PROCHAINES)).text,
    ).toBe('Du 27 sept. au 15 oct., au rythme « tous les 2 jours ».')
    expect(
      lisible(pastDuesTexts(t, dues(['2026-09-29', '2026-10-01']), TOUS_LES_2_JOURS, PROCHAINES))
        .text,
    ).toBe('Les 29 sept. et 1 oct., au rythme « tous les 2 jours ».')
  })

  it('compte chaque heure, ne cite chaque jour qu’une fois, et dit les heures de l’ancien rythme', () => {
    const texts = lisible(
      pastDuesTexts(
        t,
        dues(['2026-10-03', '2026-10-05'], ['08:00', '20:00']),
        {
          ...TOUS_LES_2_JOURS,
          times: ['08:00', '20:00'],
        },
        PROCHAINES,
      ),
    )

    expect(texts.title).toBe('4 doses étaient prévues avant aujourd’hui')
    expect(texts.text).toBe('Les 3 et 5 oct., au rythme « tous les 2 jours · 8 h et 20 h ».')
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(
      lisible(
        pastDuesTexts(
          t,
          dues(['2026-10-03', '2026-10-05', '2026-10-07']),
          TOUS_LES_2_JOURS,
          PROCHAINES,
        ),
      ),
    ).toEqual({
      title: '3 doses were scheduled before today',
      text: 'On Oct 3, 5, and 7, on the “every 2 days” schedule.',
      keep: 'Keep them to log',
      keepHint: 'The new schedule starts today. Next dose on Oct 15.',
      drop: 'They weren’t meant to be given',
      dropHint: 'The previous setting was a mistake. Next dose on Oct 4.',
      cancel: 'Cancel',
    })
    expect(
      lisible(pastDuesTexts(t, dues(['2026-10-03']), TOUS_LES_2_JOURS, PROCHAINES)),
    ).toMatchObject({
      title: '1 dose was scheduled before today',
      text: 'On Oct 3, on the “every 2 days” schedule.',
      keep: 'Keep it to log',
      drop: 'It wasn’t meant to be given',
    })
  })
})
