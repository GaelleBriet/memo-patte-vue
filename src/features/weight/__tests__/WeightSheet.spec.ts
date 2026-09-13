import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import WeightSheet from '../WeightSheet.vue'
import { todayIsoDate } from '../weight-form'
import type { WeightEntry, WeightEntryInput } from '../weight.schema'
import { useWeightStore } from '../weight.store'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'
import i18n from '@/core/i18n'
import { getMsIconPath } from '@/core/theme/icons'
import vuetify from '@/core/theme/vuetify'

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

const LUNA: Animal = { ...MILO, id: '33333333-3333-4333-8333-333333333333', name: 'Luna' }

const PESEE: WeightEntry = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: MILO.id,
  weightKg: 24.7,
  measuredOn: '2026-09-01',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

let loadAnimals: MockInstance
let create: MockInstance<(input: WeightEntryInput) => Promise<WeightEntry>>
let wrapper: VueWrapper | null = null

// jsdom ne fournit pas `visualViewport`, que VDialog écoute pour suivre le clavier.
function stubVisualViewport() {
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
}

beforeEach(() => {
  stubVisualViewport()
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  loadAnimals = vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO, LUNA]
    animals.hasLoaded = true
    return true
  })
  create = vi.spyOn(useWeightStore(), 'create').mockResolvedValue(PESEE)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// La feuille est téléportée hors du composant : on interroge le document.
function feuille(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.weight-sheet__panel')
  if (!element) throw new Error('Feuille absente du document')
  return element
}

function texte(selector: string): string | null {
  return feuille().querySelector(selector)?.textContent?.trim() ?? null
}

function champ(id: string): HTMLInputElement {
  const input = feuille().querySelector<HTMLInputElement>(`#${id}`)
  if (!input) throw new Error(`Champ ${id} absent`)
  return input
}

function messages(): string[] {
  return Array.from(feuille().querySelectorAll('.weight-sheet__error')).map(
    (noeud) => noeud.textContent?.trim() ?? '',
  )
}

async function saisir(id: string, valeur: string) {
  const input = champ(id)
  input.value = valeur
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function soumettre() {
  feuille().querySelector<HTMLButtonElement>('.weight-sheet__submit')?.click()
  await flushPromises()
}

// Vuetify ferme sur « mousedown puis click » hors du contenu, traité au tick suivant.
async function taperLeVoile() {
  const voile = document.body.querySelector<HTMLElement>('.weight-sheet .v-overlay__scrim')
  if (!voile) throw new Error('Voile absent')
  voile.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  voile.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function monter(animalId?: string | null) {
  wrapper = mount(WeightSheet, {
    props: { modelValue: true, animalId, 'onUpdate:modelValue': () => {} },
    // Transitions réelles : sans elles, le voile de Vuetify ne reconnaît pas le tap qui le vise.
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

describe('WeightSheet — animal identifié (P1)', () => {
  it('titre, sous-titre « Pour Milo », ni croix ni sélecteur', async () => {
    await monter(MILO.id)

    expect(texte('.weight-sheet__title')).toBe('Ajouter une pesée')
    expect(texte('.weight-sheet__subtitle')).toBe('Pour Milo')
    expect(feuille().querySelector('.weight-sheet__close')).toBeNull()
    expect(feuille().querySelector('.animal-chip-selector')).toBeNull()
  })

  it('offre le poids en décimal avec « kg », la date pré-remplie à aujourd’hui et bornée', async () => {
    await monter(MILO.id)

    expect(champ('weight-sheet-kg').getAttribute('inputmode')).toBe('decimal')
    expect(texte('.weight-sheet__field--kg .v-text-field__suffix')).toBe('kg')
    expect(champ('weight-sheet-date').type).toBe('date')
    expect(champ('weight-sheet-date').value).toBe(todayIsoDate())
    expect(champ('weight-sheet-date').getAttribute('max')).toBe(todayIsoDate())
  })

  it('ne propose qu’« Enregistrer », sans bouton « Annuler »', async () => {
    await monter(MILO.id)

    expect(texte('.weight-sheet__submit')).toBe('Enregistrer')
    expect(feuille().querySelectorAll('button.v-btn')).toHaveLength(1)
  })

  it('place le focus sur le champ Poids dès l’ouverture : deux taps, pas trois', async () => {
    await monter(MILO.id)

    expect(document.activeElement).toBe(champ('weight-sheet-kg'))
  })

  it('offre une poignée qui ferme la feuille', async () => {
    const wrapper = await monter(MILO.id)

    feuille().querySelector<HTMLButtonElement>('.weight-sheet__handle')?.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})

describe('WeightSheet — sans animal (P2)', () => {
  it('pose le sélecteur sans chip « + » ni débord de header', async () => {
    await monter(null)

    const selecteur = feuille().querySelector('.weight-sheet__field--animal .animal-chip-selector')
    expect(selecteur?.classList).toContain('animal-chip-selector--inline')
    expect(selecteur?.querySelector('.animal-chip-selector__add')).toBeNull()
  })

  it('affiche la croix et le sélecteur, sans sous-titre', async () => {
    await monter(null)

    expect(loadAnimals).toHaveBeenCalledOnce()
    expect(feuille().querySelector('.weight-sheet__subtitle')).toBeNull()
    expect(feuille().querySelector('.weight-sheet__close')).not.toBeNull()
    expect(texte('.weight-sheet__field--animal .weight-sheet__label span')).toBe('Animal')
    expect(
      feuille().querySelector('.weight-sheet__field--animal .weight-sheet__required'),
    ).not.toBeNull()
    expect(
      Array.from(feuille().querySelectorAll('.animal-chip__name')).map((n) => n.textContent),
    ).toEqual(['Milo', 'Luna'])
  })

  it('grise les champs tant qu’aucun animal n’est choisi', async () => {
    await monter(null)

    expect(feuille().querySelector('.weight-sheet__fields--locked')).not.toBeNull()
    expect(champ('weight-sheet-kg').disabled).toBe(true)
    expect(champ('weight-sheet-date').disabled).toBe(true)
  })

  it('ne pose le focus sur aucun champ verrouillé', async () => {
    await monter(null)

    expect(document.activeElement).not.toBe(champ('weight-sheet-kg'))
    expect(document.activeElement).not.toBe(champ('weight-sheet-date'))
  })

  it('refuse l’envoi sans animal : « Choisis un animal. »', async () => {
    await monter(null)

    await soumettre()

    expect(messages()).toContain('Choisis un animal.')
    expect(create).not.toHaveBeenCalled()
  })

  it('libère les champs une fois un animal choisi et enregistre pour lui', async () => {
    await monter(null)

    feuille().querySelectorAll<HTMLElement>('.animal-chip')[1]?.click()
    await flushPromises()

    expect(feuille().querySelector('.weight-sheet__fields--locked')).toBeNull()
    expect(champ('weight-sheet-kg').disabled).toBe(false)

    await saisir('weight-sheet-kg', '4,2')
    await soumettre()

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: LUNA.id,
      weightKg: 4.2,
      measuredOn: todayIsoDate(),
    })
  })

  it('efface « Choisis un animal. » dès qu’un animal est choisi, sans attendre l’envoi', async () => {
    await monter(null)
    await soumettre()
    expect(messages()).toContain('Choisis un animal.')

    feuille().querySelectorAll<HTMLElement>('.animal-chip')[0]?.click()
    await flushPromises()

    expect(messages()).not.toContain('Choisis un animal.')
  })

  it('la croix ferme la feuille', async () => {
    const wrapper = await monter(null)

    feuille().querySelector<HTMLButtonElement>('.weight-sheet__close')?.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })
})

describe('WeightSheet — validation (P3)', () => {
  it('refuse un poids à 0 et n’écrit rien', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '0')

    await soumettre()

    expect(messages()).toEqual(['Le poids doit être supérieur à 0 kg.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse une date effacée', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')
    await saisir('weight-sheet-date', '')

    await soumettre()

    expect(messages()).toEqual(['La date est obligatoire.'])
  })

  it('efface les messages dès que le formulaire redevient valide', async () => {
    await monter(MILO.id)
    await soumettre()
    expect(messages()).not.toEqual([])

    await saisir('weight-sheet-kg', '24,7')
    await soumettre()

    expect(messages()).toEqual([])
  })
})

describe('WeightSheet — revalidation après envoi', () => {
  it('n’affiche aucune erreur pendant la saisie avant tout envoi', async () => {
    await monter(MILO.id)

    await saisir('weight-sheet-kg', '0')

    expect(messages()).toEqual([])
    expect(champ('weight-sheet-kg').getAttribute('aria-invalid')).toBe('false')
  })

  it('efface l’erreur du poids dès qu’il est corrigé, sans nouvel envoi', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '0')
    await soumettre()

    await saisir('weight-sheet-kg', '24,7')

    expect(messages()).toEqual([])
    expect(champ('weight-sheet-kg').getAttribute('aria-invalid')).toBe('false')
    expect(champ('weight-sheet-kg').getAttribute('aria-describedby')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('change le message quand le motif de l’erreur change', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')
    await saisir('weight-sheet-date', '')
    await soumettre()
    expect(messages()).toEqual(['La date est obligatoire.'])

    await saisir('weight-sheet-date', '2999-01-01')

    expect(messages()).toEqual(['La date ne peut pas être dans le futur.'])
  })

  it('relie chaque champ en erreur à son message et le marque invalide', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-date', '')

    await soumettre()

    for (const id of ['weight-sheet-kg', 'weight-sheet-date']) {
      const idErreur = champ(id).getAttribute('aria-describedby')
      expect(idErreur).toBeTruthy()
      expect(feuille().querySelector(`#${idErreur}`)?.classList).toContain('weight-sheet__error')
      expect(champ(id).getAttribute('aria-invalid')).toBe('true')
    }
  })
})

describe('WeightSheet — message d’erreur', () => {
  it('précède le message de l’icône d’erreur remplie', async () => {
    await monter(MILO.id)

    await soumettre()

    expect(feuille().querySelector('.weight-sheet__error path')?.getAttribute('d')).toBe(
      getMsIconPath('error_fill')?.path,
    )
  })
})

describe('WeightSheet — enregistrement (P4)', () => {
  it('écrit par le store avec l’animal du contexte puis ferme la feuille', async () => {
    const wrapper = await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')
    await saisir('weight-sheet-date', '2026-09-01')

    await soumettre()

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      weightKg: 24.7,
      measuredOn: '2026-09-01',
    })
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('désactive le bouton et affiche « Enregistrement… » pendant l’écriture', async () => {
    let terminer: (entry: WeightEntry) => void = () => {}
    create.mockReturnValueOnce(
      new Promise<WeightEntry>((resolve) => {
        terminer = resolve
      }),
    )
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')

    await soumettre()

    const bouton = feuille().querySelector<HTMLButtonElement>('.weight-sheet__submit')
    expect(bouton?.textContent?.trim()).toBe('Enregistrement…')
    expect(bouton?.disabled).toBe(true)
    expect(feuille().querySelector('.v-progress-circular')).not.toBeNull()

    terminer(PESEE)
    await flushPromises()
  })

  it('ne se ferme pas sur un tap du voile pendant l’écriture, mais se ferme hors écriture', async () => {
    let terminer: (entry: WeightEntry) => void = () => {}
    create.mockReturnValueOnce(
      new Promise<WeightEntry>((resolve) => {
        terminer = resolve
      }),
    )
    const wrapper = await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')
    await soumettre()

    await taperLeVoile()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    terminer(PESEE)
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se ferme sur un tap du voile hors écriture', async () => {
    const wrapper = await monter(MILO.id)

    await taperLeVoile()

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('n’écrit qu’une fois même si on tape deux fois sur « Enregistrer »', async () => {
    create.mockReturnValueOnce(new Promise<WeightEntry>(() => {}))
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')

    const bouton = feuille().querySelector<HTMLButtonElement>('.weight-sheet__submit')
    bouton?.click()
    bouton?.click()
    await flushPromises()

    expect(create).toHaveBeenCalledOnce()
  })

  it('reste ouverte et prévient quand l’écriture échoue', async () => {
    create.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')

    await soumettre()

    expect(texte('.weight-sheet__save-error')).toBe(
      'La pesée n’a pas pu être enregistrée. Réessaie.',
    )
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(feuille().querySelector<HTMLButtonElement>('.weight-sheet__submit')?.disabled).toBe(
      false,
    )
  })
})

describe('WeightSheet — réouverture', () => {
  it('recale la date et sa borne sur le jour de l’ouverture, pas du montage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 13, 23, 59))
    const wrapper = await monter(MILO.id)
    expect(champ('weight-sheet-date').getAttribute('max')).toBe('2026-09-13')

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    vi.setSystemTime(new Date(2026, 8, 14, 0, 1))
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(champ('weight-sheet-date').getAttribute('max')).toBe('2026-09-14')
    expect(champ('weight-sheet-date').value).toBe('2026-09-14')
    vi.useRealTimers()
  })

  it('repart d’un formulaire vierge à chaque ouverture', async () => {
    const wrapper = await monter(MILO.id)
    await saisir('weight-sheet-kg', '0')
    await soumettre()
    expect(messages()).toHaveLength(1)

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(champ('weight-sheet-kg').value).toBe('')
    expect(messages()).toEqual([])
  })
})
