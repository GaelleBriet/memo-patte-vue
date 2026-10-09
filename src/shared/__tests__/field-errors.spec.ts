import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { fieldErrorsOf } from '../form/field-errors'

function issuesOf(schema: z.ZodType, input: unknown): z.core.$ZodIssue[] {
  const result = schema.safeParse(input)
  return result.success ? [] : result.error.issues
}

describe('fieldErrorsOf', () => {
  it('donne la clé du champ pour chaque erreur', () => {
    const issues = issuesOf(z.object({ name: z.string().min(1), age: z.number() }), {
      name: '',
      age: 'x',
    })

    expect(fieldErrorsOf(issues, { name: { key: 'name' }, age: { key: 'age' } })).toEqual({
      name: 'name',
      age: 'age',
    })
  })

  it('ignore une erreur hors des champs connus, à la racine comme sur une propriété héritée', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: ['other'], message: 'x', input: undefined },
      { code: 'custom', path: [], message: 'x', input: undefined },
      { code: 'custom', path: ['toString'], message: 'x', input: undefined },
    ]

    expect(fieldErrorsOf(issues, { name: { key: 'name' } })).toEqual({})
  })

  it('choisit la clé du code de l’erreur', () => {
    const issues = issuesOf(z.object({ name: z.string().max(2) }), { name: 'abc' })

    expect(
      fieldErrorsOf(issues, { name: { key: 'name', byCode: { too_big: 'nameMax' } } }),
    ).toEqual({ name: 'nameMax' })
  })

  it('préfère la clé du message à celle du code', () => {
    const issues: z.core.$ZodIssue[] = [
      {
        code: 'too_big',
        path: ['endsOn'],
        message: 'tooEarly',
        origin: 'number',
        maximum: 1,
        input: 2,
      },
    ]

    expect(
      fieldErrorsOf(issues, {
        endsOn: { key: 'endsOn', byCode: { too_big: 'max' }, byMessage: { tooEarly: 'early' } },
      }),
    ).toEqual({ endsOn: 'early' })
  })

  it('retombe sur la clé du champ quand ni le message ni le code ne sont prévus', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: ['endsOn'], message: 'inconnu', input: undefined },
    ]

    expect(
      fieldErrorsOf(issues, { endsOn: { key: 'endsOn', byMessage: { tooEarly: 'early' } } }),
    ).toEqual({ endsOn: 'endsOn' })
  })

  it('garde la première erreur d’un champ', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: ['name'], message: 'x', input: undefined },
      { code: 'too_big', path: ['name'], message: 'x', origin: 'string', maximum: 1, input: 'ab' },
    ]
    const rules = { name: { key: 'name', byCode: { too_big: 'nameMax' } } }

    expect(fieldErrorsOf(issues, rules)).toEqual({ name: 'name' })
  })

  it('ignore un message qui porte le nom d’une propriété héritée', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: ['endsOn'], message: 'toString', input: undefined },
    ]

    expect(
      fieldErrorsOf(issues, { endsOn: { key: 'endsOn', byMessage: { tooEarly: 'early' } } }),
    ).toEqual({ endsOn: 'endsOn' })
  })

  it('rattache plusieurs chemins au même champ', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: ['doseUnit'], message: 'incomplete', input: undefined },
      { code: 'custom', path: ['doseQuantity'], message: 'x', input: undefined },
    ]

    expect(
      fieldErrorsOf(
        issues,
        { dosage: { key: 'dosage', byMessage: { incomplete: 'dosageIncomplete' } } },
        { fieldOfPath: { doseQuantity: 'dosage', doseUnit: 'dosage' } },
      ),
    ).toEqual({ dosage: 'dosageIncomplete' })
  })

  it('ignore un chemin absent de la table de rattachement, même s’il porte le nom d’un champ', () => {
    const issues: z.core.$ZodIssue[] = [
      { code: 'custom', path: ['dosage'], message: 'x', input: undefined },
    ]

    expect(
      fieldErrorsOf(issues, { dosage: { key: 'dosage' } }, { fieldOfPath: { doseUnit: 'dosage' } }),
    ).toEqual({})
  })
})
