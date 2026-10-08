import { describe, expect, it } from 'vitest'

import {
  endsOnHelpText,
  formErrorParams,
  frequencyUnitCount,
  nextDoseHelpText,
  resumeInfoText,
} from '../logic/treatment-form-texts'
import i18n from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const t = i18n.global.t
const TODAY = '2026-10-08'
const PREVIOUS = {
  startedOn: '2026-09-01',
  endedOn: '2026-09-10',
  durationDays: 10,
  earliestOn: '2026-09-11',
}

describe('nextDoseHelpText', () => {
  it('ne dit rien sans aide', () => {
    expect(plain(nextDoseHelpText(t, null, TODAY))).toBeNull()
  })

  it('dit la date calculée, la date prévue et aujourd’hui proposé', () => {
    expect(plain(nextDoseHelpText(t, { kind: 'calculated', on: '2026-10-12' }, TODAY))).toBe(
      'Calculée d’après la dernière prise : 12 oct. Modifiable.',
    )
    expect(plain(nextDoseHelpText(t, { kind: 'scheduled', on: '2026-10-12' }, TODAY))).toBe(
      'Prochaine dose prévue : 12 oct. Modifiable.',
    )
    expect(plain(nextDoseHelpText(t, { kind: 'today' }, TODAY))).toBe(
      'Aujourd’hui est proposé. Modifiable.',
    )
  })

  it('compte les doses qui ne seront plus à renseigner', () => {
    expect(plain(nextDoseHelpText(t, { kind: 'dropped', count: 1 }, TODAY))).toBe(
      'La dose prévue avant cette date ne sera plus à renseigner.',
    )
    expect(plain(nextDoseHelpText(t, { kind: 'dropped', count: 3 }, TODAY))).toBe(
      'Les 3 doses prévues avant cette date ne seront plus à renseigner.',
    )
  })

  it('dit le refus du moteur', () => {
    expect(plain(nextDoseHelpText(t, { kind: 'refused', refusal: 'later-dose' }, TODAY))).toBe(
      'Une dose plus lointaine est déjà notée.',
    )
  })
})

describe('resumeInfoText', () => {
  it('rappelle les dates de la dernière période', () => {
    expect(plain(resumeInfoText(t, PREVIOUS, TODAY))).toBe(
      'Réglages de la dernière période, du 1er sept. au 10 sept. Tout reste modifiable.',
    )
  })

  it('ne dit rien sans période précédente finie', () => {
    expect(plain(resumeInfoText(t, null, TODAY))).toBeNull()
    expect(plain(resumeInfoText(t, { ...PREVIOUS, endedOn: null }, TODAY))).toBeNull()
  })
})

describe('endsOnHelpText', () => {
  it('propose la même durée tant que la date de fin n’est pas touchée', () => {
    expect(plain(endsOnHelpText(t, PREVIOUS, { endsOn: '', touched: false }))).toBe(
      'Même durée que la dernière fois : 10 jours.',
    )
    expect(plain(endsOnHelpText(t, PREVIOUS, { endsOn: '2026-10-20', touched: false }))).toBe(
      '10 jours, comme la dernière fois. Aucune dose ne sera prévue après cette date.',
    )
  })

  it('revient à l’aide générale une fois la date touchée, ou sans durée', () => {
    const help = 'Aucune dose ne sera prévue après cette date.'
    expect(plain(endsOnHelpText(t, PREVIOUS, { endsOn: '', touched: true }))).toBe(help)
    expect(plain(endsOnHelpText(t, null, { endsOn: '', touched: false }))).toBe(help)
  })
})

describe('formErrorParams', () => {
  it('laisse vides les dates inconnues', () => {
    expect(plain(formErrorParams(null, null, TODAY))).toMatchObject({
      date: '',
      latest: '',
      from: '',
      arrival: '',
    })
  })

  it('cite la première date de reprise et l’arrivée du report le plus lointain', () => {
    const params = formErrorParams(
      { nextDose: null, farthestMove: { doseId: 'd', arrivesOn: '2026-10-20', advanced: false } },
      PREVIOUS,
      TODAY,
    )

    expect(plain(params)).toMatchObject({ from: '11 sept', arrival: '20 oct' })
  })
})

describe('frequencyUnitCount', () => {
  it('rend le nombre saisi, 1 tant que la saisie n’est pas un entier positif', () => {
    expect(frequencyUnitCount('3')).toBe(3)
    expect(frequencyUnitCount('')).toBe(1)
    expect(frequencyUnitCount('0')).toBe(1)
    expect(frequencyUnitCount('1,5')).toBe(1)
  })
})
