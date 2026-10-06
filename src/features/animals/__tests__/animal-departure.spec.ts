// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  departureFormValuesFrom,
  hasDepartureDetails,
  validateDepartureForm,
} from '../logic/animal-departure'

const TODAY = '2026-09-30'

describe('departureFormValuesFrom', () => {
  it('reprend le motif et la date déjà notés', () => {
    expect(
      departureFormValuesFrom({ departureReason: 'rehomed', departureDate: '2026-09-28' }),
    ).toEqual({ departureReason: 'rehomed', departureDate: '2026-09-28' })
  })

  it('part de champs vides sans départ noté', () => {
    expect(departureFormValuesFrom({ departureReason: null, departureDate: null })).toEqual({
      departureReason: null,
      departureDate: '',
    })
  })
})

describe('hasDepartureDetails', () => {
  it('Q5 : « Modifier la date » dès qu’un motif ou une date est noté', () => {
    expect(hasDepartureDetails({ departureReason: null, departureDate: null })).toBe(false)
    expect(hasDepartureDetails({ departureReason: 'death', departureDate: null })).toBe(true)
    expect(hasDepartureDetails({ departureReason: null, departureDate: '2026-09-28' })).toBe(true)
  })
})

describe('validateDepartureForm', () => {
  it('AN-10 : tout est facultatif', () => {
    expect(validateDepartureForm({ departureReason: null, departureDate: '' }, TODAY)).toEqual({
      success: true,
      data: { departureReason: null, departureDate: null },
    })
  })

  it('accepte un motif et une date d’aujourd’hui au plus tard', () => {
    expect(
      validateDepartureForm({ departureReason: 'other', departureDate: TODAY }, TODAY),
    ).toEqual({ success: true, data: { departureReason: 'other', departureDate: TODAY } })
  })

  it('AN-10 : refuse une date future, jugée par rapport au jour du formulaire', () => {
    expect(
      validateDepartureForm({ departureReason: null, departureDate: '2026-10-01' }, TODAY),
    ).toEqual({
      success: false,
      errors: { departureDate: 'animals.departure.errors.future' },
    })
  })

  it('refuse une date illisible', () => {
    expect(
      validateDepartureForm({ departureReason: null, departureDate: '2026-02-31' }, TODAY),
    ).toEqual({
      success: false,
      errors: { departureDate: 'animals.departure.errors.invalid' },
    })
  })
})
