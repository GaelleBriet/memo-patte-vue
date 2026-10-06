// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  emptyVaccinationFormValues,
  enteredInjectionDate,
  hasInjection,
  isPlannedDateAllowed,
  plannedDateHelp,
  validateVaccinationForm,
  vaccinationFormValuesFrom,
  withInjectionDate,
  withoutReminder,
  type VaccinationFormValues,
} from '../logic/vaccination-form'
import type { Vaccination } from '../schema/vaccination.schema'
import i18n from '@/core/i18n'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const TODAY = '2026-10-06'
const t = i18n.global.t

function valeurs(surcharges: Partial<VaccinationFormValues> = {}): VaccinationFormValues {
  return {
    ...emptyVaccinationFormValues(),
    name: 'Rage',
    lastInjectionDate: '2026-03-12',
    ...surcharges,
  }
}

function donnees(surcharges: Partial<VaccinationFormValues> = {}, currentPlannedDate?: string) {
  const resultat = validateVaccinationForm(valeurs(surcharges), {
    today: TODAY,
    currentPlannedDate,
  })

  if (!resultat.success) throw new Error(`Validation refusée : ${JSON.stringify(resultat.errors)}`)

  return resultat.data
}

function erreurs(surcharges: Partial<VaccinationFormValues> = {}) {
  const resultat = validateVaccinationForm(valeurs(surcharges), { today: TODAY })

  if (resultat.success) throw new Error('Validation acceptée alors qu’elle devait échouer')

  return resultat.errors
}

const RAGE: Vaccination = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: '11111111-1111-4111-8111-111111111111',
  name: 'Rage',
  lastInjectionDate: '2026-03-12',
  dueDate: '2027-03-12',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

describe('emptyVaccinationFormValues', () => {
  it('part de champs vides, sans rappel choisi', () => {
    expect(emptyVaccinationFormValues()).toEqual({
      name: '',
      lastInjectionDate: '',
      plannedDate: '',
      reminder: null,
    })
  })
})

describe('vaccinationFormValuesFrom — « Modifier »', () => {
  it('vaccin injecté : la dernière injection et son rappel coché en « Autre date »', () => {
    expect(vaccinationFormValuesFrom(RAGE)).toEqual({
      name: 'Rage',
      lastInjectionDate: '2026-03-12',
      plannedDate: '',
      reminder: { kind: 'otherDate', date: '2027-03-12' },
    })
  })

  it('vaccin injecté sans rappel : « Pas de rappel » coché', () => {
    expect(vaccinationFormValuesFrom({ ...RAGE, dueDate: null }).reminder).toEqual({ kind: 'none' })
  })

  it('vaccin prévu : son rendez-vous dans le champ date, sans injection', () => {
    expect(
      vaccinationFormValuesFrom({ ...RAGE, lastInjectionDate: null, dueDate: '2026-10-20' }),
    ).toEqual({ name: 'Rage', lastInjectionDate: '', plannedDate: '2026-10-20', reminder: null })
  })
})

describe('hasInjection et withoutReminder', () => {
  it('une date d’injection saisie fait passer le prochain rappel aux raccourcis', () => {
    expect(hasInjection(valeurs())).toBe(true)
    expect(hasInjection(valeurs({ lastInjectionDate: '  ' }))).toBe(false)
  })

  it('vide le prochain rappel, rendez-vous comme raccourci', () => {
    expect(
      withoutReminder(valeurs({ plannedDate: '2026-10-20', reminder: { kind: 'oneYear' } })),
    ).toEqual(valeurs())
  })
})

describe('withInjectionDate', () => {
  it('vide le prochain rappel quand l’injection apparaît ou disparaît, pas quand elle change', () => {
    const choisi = valeurs({ reminder: { kind: 'oneYear' } })

    expect(withInjectionDate(choisi, '2026-03-13').reminder).toEqual({ kind: 'oneYear' })
    expect(withInjectionDate(choisi, '')).toEqual(valeurs({ lastInjectionDate: '' }))
    expect(
      withInjectionDate(
        valeurs({ lastInjectionDate: '', plannedDate: '2026-10-20' }),
        '2026-03-12',
      ),
    ).toEqual(valeurs())
  })
})

describe('validateVaccinationForm — avec une injection (V10 ter)', () => {
  it('ne contient jamais d’animal', () => {
    expect(donnees()).not.toHaveProperty('animalId')
  })

  it('supprime les espaces autour du nom', () => {
    expect(donnees({ name: '  Rage  ' }).name).toBe('Rage')
  })

  it('compte les raccourcis depuis la date d’injection saisie', () => {
    expect(donnees({ reminder: { kind: 'oneMonth' } }).dueDate).toBe('2026-04-12')
    expect(donnees({ reminder: { kind: 'oneYear' } }).dueDate).toBe('2027-03-12')
    expect(donnees({ reminder: { kind: 'threeYears' } }).dueDate).toBe('2029-03-12')
    expect(donnees({ reminder: { kind: 'otherDate', date: '2026-12-01' } }).dueDate).toBe(
      '2026-12-01',
    )
  })

  it('le prochain rappel reste facultatif : rien de choisi ou « Pas de rappel », aucun rappel', () => {
    expect(donnees()).toEqual({ name: 'Rage', lastInjectionDate: '2026-03-12', dueDate: null })
    expect(donnees({ reminder: { kind: 'none' } }).dueDate).toBeNull()
  })

  it('ignore un rendez-vous resté d’avant la saisie de l’injection', () => {
    expect(donnees({ plannedDate: '2026-10-20' }).dueDate).toBeNull()
  })

  it('refuse une date d’injection dans le futur, avec un message distinct', () => {
    expect(erreurs({ lastInjectionDate: '2026-10-07' }).lastInjectionDate).toBe(
      'vaccinations.form.errors.lastInjectionDateFuture',
    )
  })

  it('accepte la date du jour', () => {
    expect(donnees({ lastInjectionDate: TODAY }).lastInjectionDate).toBe(TODAY)
  })
})

describe('validateVaccinationForm — vaccin prévu (V10 bis)', () => {
  const prevu = { lastInjectionDate: '', plannedDate: '2026-10-20' }

  it('le rendez-vous devient le prochain rappel, sans injection', () => {
    expect(donnees(prevu)).toEqual({ name: 'Rage', lastInjectionDate: null, dueDate: '2026-10-20' })
  })

  it('ignore un raccourci resté d’avant l’effacement de l’injection', () => {
    expect(donnees({ ...prevu, reminder: { kind: 'none' } }).dueDate).toBe('2026-10-20')
  })

  it('exige la date du rendez-vous', () => {
    expect(erreurs({ lastInjectionDate: '' }).plannedDate).toBe(
      'vaccinations.form.errors.plannedDate',
    )
  })

  it('refuse un rendez-vous passé, accepte aujourd’hui', () => {
    expect(erreurs({ ...prevu, plannedDate: '2026-10-05' }).plannedDate).toBe(
      'vaccinations.form.errors.plannedDatePast',
    )
    expect(donnees({ ...prevu, plannedDate: TODAY }).dueDate).toBe(TODAY)
  })

  it('garde en modification le rendez-vous déjà enregistré, même passé', () => {
    expect(donnees({ ...prevu, plannedDate: '2026-10-05' }, '2026-10-05').dueDate).toBe(
      '2026-10-05',
    )
  })
})

describe('isPlannedDateAllowed', () => {
  it('à partir d’aujourd’hui, ou le rendez-vous déjà enregistré', () => {
    expect(isPlannedDateAllowed('2026-10-06', { today: TODAY })).toBe(true)
    expect(isPlannedDateAllowed('2026-10-05', { today: TODAY })).toBe(false)
    expect(
      isPlannedDateAllowed('2026-10-05', { today: TODAY, currentPlannedDate: '2026-10-05' }),
    ).toBe(true)
  })
})

describe('validateVaccinationForm — nom', () => {
  it('refuse un nom vide ou fait d’espaces', () => {
    expect(erreurs({ name: '' }).name).toBe('vaccinations.form.errors.name')
    expect(erreurs({ name: '   ' }).name).toBe('vaccinations.form.errors.name')
  })

  it('accepte 80 caractères, refuse 81 avec un message distinct', () => {
    const limite = 'a'.repeat(MAX_NAME_LENGTH)

    expect(donnees({ name: limite }).name).toBe(limite)
    expect(erreurs({ name: `${limite}a` }).name).toBe('vaccinations.form.errors.nameMax')
  })
})

describe('validateVaccinationForm — plusieurs erreurs', () => {
  it('signale le nom vide et le rendez-vous manquant en même temps', () => {
    expect(erreurs({ name: '', lastInjectionDate: '' })).toEqual({
      name: 'vaccinations.form.errors.name',
      plannedDate: 'vaccinations.form.errors.plannedDate',
    })
  })
})

describe('enteredInjectionDate', () => {
  it('rend la date saisie si elle est passée ou du jour, null sinon', () => {
    expect(enteredInjectionDate(valeurs())).toBe('2026-03-12')
    expect(enteredInjectionDate(valeurs({ lastInjectionDate: '' }))).toBeNull()
  })
})

describe('plannedDateHelp', () => {
  it('annonce « Prévu le … » pour un rendez-vous saisi, rien sinon', () => {
    expect(plannedDateHelp(t, '2026-10-20', TODAY)?.replace(/\s/gu, ' ')).toBe(
      'Rendez-vous prévu : le vaccin sera « Prévu le 20 oct. ».',
    )
    expect(plannedDateHelp(t, '', TODAY)).toBeNull()
  })
})
