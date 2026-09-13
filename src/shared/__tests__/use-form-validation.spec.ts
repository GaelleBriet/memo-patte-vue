import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useFormValidation } from '../form/use-form-validation'

interface Valeurs {
  name: string
  weight: string
}

type Erreurs = Partial<Record<keyof Valeurs, string>>

function valider(values: Valeurs) {
  const errors: Erreurs = {}
  if (values.name.trim() === '') errors.name = 'errors.name'
  if (values.weight === '0') errors.weight = 'errors.weightZero'
  else if (values.weight === '') errors.weight = 'errors.weight'

  return Object.keys(errors).length === 0
    ? { success: true as const, data: { ...values } }
    : { success: false as const, errors }
}

function monter(initiales: Valeurs = { name: '', weight: '' }) {
  const values = ref(initiales)
  return { values, ...useFormValidation(values, valider) }
}

describe('useFormValidation', () => {
  it('n’affiche aucune erreur avant le premier envoi, même sur une saisie invalide', async () => {
    const { values, errors } = monter()

    values.value.weight = '0'
    await nextTick()

    expect(errors.value).toEqual({})
  })

  it('renvoie le résultat de la validation et expose ses erreurs à l’envoi', () => {
    const { validate, errors } = monter()

    const result = validate()

    expect(result.success).toBe(false)
    expect(errors.value).toEqual({ name: 'errors.name', weight: 'errors.weight' })
  })

  it('renvoie les données validées et aucune erreur quand tout est valide', () => {
    const { validate, errors } = monter({ name: 'Milo', weight: '8' })

    expect(validate()).toEqual({ success: true, data: { name: 'Milo', weight: '8' } })
    expect(errors.value).toEqual({})
  })

  it('après un envoi, retire l’erreur d’un champ dès qu’il devient valide', async () => {
    const { values, validate, errors } = monter()
    validate()

    values.value.name = 'Milo'
    await nextTick()

    expect(errors.value).toEqual({ weight: 'errors.weight' })
  })

  it('après un envoi, change le message quand le motif de l’erreur change', async () => {
    const { values, validate, errors } = monter()
    validate()

    values.value.weight = '0'
    await nextTick()

    expect(errors.value.weight).toBe('errors.weightZero')
  })

  it('suit un remplacement complet des valeurs', async () => {
    const { values, validate, errors } = monter()
    validate()

    values.value = { name: 'Milo', weight: '8' }
    await nextTick()

    expect(errors.value).toEqual({})
  })

  it('revient à l’état « jamais envoyé » après reset', async () => {
    const { values, validate, reset, errors } = monter()
    validate()

    reset()
    values.value.weight = '0'
    await nextTick()

    expect(errors.value).toEqual({})
  })

  it('ne recalcule pas la validation avant le premier envoi', () => {
    const espion = vi.fn<typeof valider>(valider)
    const values = ref<Valeurs>({ name: '', weight: '' })
    const { errors } = useFormValidation(values, espion)

    expect(errors.value).toEqual({})
    expect(espion).not.toHaveBeenCalled()
  })
})
