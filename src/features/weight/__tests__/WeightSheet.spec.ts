import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import WeightSheet from '../views/WeightSheet.vue'
import type { WeightEntry, WeightEntryInput } from '../schema/weight.schema'
import { useWeightStore } from '../store/weight.store'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import { getMsIconPath } from '@/core/theme/icons'
import vuetify from '@/core/theme/vuetify'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastMessage,
  toastTone,
} from '@/shared/utils/toast'

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

const A_CORRIGER: WeightEntry = { ...PESEE, weightKg: 2.45, measuredOn: '2026-08-25' }

let loadAnimals: MockInstance
let create: MockInstance<(input: WeightEntryInput) => Promise<WeightEntry>>
let update: MockInstance
let remove: MockInstance
let undoRemove: MockInstance
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
  const weight = useWeightStore()
  create = vi.spyOn(weight, 'create').mockResolvedValue(PESEE)
  update = vi.spyOn(weight, 'update').mockResolvedValue(PESEE)
  remove = vi.spyOn(weight, 'remove').mockResolvedValue()
  undoRemove = vi.spyOn(weight, 'undoRemove').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  dismissToast()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// La feuille est téléportée hors du composant : on interroge le document.
function feuille(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.weight-sheet .bottom-sheet__panel')
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

async function monterEnCorrection(entry: WeightEntry = A_CORRIGER) {
  wrapper = mount(WeightSheet, {
    props: { modelValue: true, animalId: entry.animalId, entry, 'onUpdate:modelValue': () => {} },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function supprimer() {
  const bouton = feuille().querySelector<HTMLButtonElement>('.weight-sheet__delete')
  if (!bouton) throw new Error('« Supprimer cette pesée » absent')
  bouton.click()
  return flushPromises()
}

describe('WeightSheet — animal identifié (P1)', () => {
  it('titre, sous-titre « Pour Milo », ni croix ni sélecteur', async () => {
    await monter(MILO.id)

    expect(texte('.bottom-sheet__title')).toBe('Ajouter une pesée')
    expect(texte('.bottom-sheet__subtitle')).toBe('Pour Milo')
    expect(feuille().querySelector('.bottom-sheet__close')).toBeNull()
    expect(feuille().querySelector('.animal-chip-selector')).toBeNull()
  })

  it('se nomme par son titre pour les lecteurs d’écran', async () => {
    await monter(MILO.id)

    const dialogue = document.body.querySelector('.weight-sheet[role="dialog"]')
    const titre = document.getElementById(dialogue?.getAttribute('aria-labelledby') ?? '')
    expect(titre?.textContent?.trim()).toBe('Ajouter une pesée')
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

  it('n’offre pas de suppression pour une pesée à ajouter', async () => {
    await monter(MILO.id)

    expect(feuille().querySelector('.weight-sheet__delete')).toBeNull()
  })

  it('offre une poignée qui ferme la feuille', async () => {
    const wrapper = await monter(MILO.id)

    feuille().querySelector<HTMLButtonElement>('.bottom-sheet__handle')?.click()
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
    expect(feuille().querySelector('.bottom-sheet__subtitle')).toBeNull()
    expect(feuille().querySelector('.bottom-sheet__close')).not.toBeNull()
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

    expect(messages()).toEqual(['Choisis un animal.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('sans animal choisi, amène le lecteur d’écran sur le sélecteur refusé', async () => {
    await monter(null)

    await soumettre()

    const selecteur = feuille().querySelector('.animal-chip-selector__group')
    expect(selecteur?.contains(document.activeElement)).toBe(true)
  })

  it('une fois l’animal choisi, les erreurs du poids suivent la validation', async () => {
    await monter(null)
    await soumettre()

    feuille().querySelectorAll<HTMLElement>('.animal-chip')[0]?.click()
    await flushPromises()

    expect(messages()).toEqual(['Le poids doit être supérieur à 0 kg.'])
    expect(champ('weight-sheet-kg').getAttribute('aria-invalid')).toBe('true')

    await saisir('weight-sheet-kg', '24,7')

    expect(messages()).toEqual([])
  })

  it('dit la borne haute quand le poids saisi sort de l’échelle', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '2000')

    await soumettre()

    expect(messages()).toEqual(['Le poids doit être de 200 kg maximum.'])
  })

  it('relie le sélecteur d’animal à « Choisis un animal. » et le marque invalide', async () => {
    await monter(null)
    const groupe = () => feuille().querySelector('.animal-chip-selector__group')!

    await soumettre()

    const idErreur = groupe().getAttribute('aria-describedby')
    expect(idErreur).toBeTruthy()
    expect(feuille().querySelector(`#${idErreur}`)?.textContent?.trim()).toBe('Choisis un animal.')
    expect(groupe().getAttribute('aria-invalid')).toBe('true')

    feuille().querySelectorAll<HTMLElement>('.animal-chip')[0]?.click()
    await flushPromises()

    expect(groupe().getAttribute('aria-invalid')).toBeNull()
    expect(groupe().getAttribute('aria-describedby')).toBeNull()
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

    feuille().querySelector<HTMLButtonElement>('.bottom-sheet__close')?.click()
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

  it('amène le lecteur d’écran sur le champ refusé : la date effacée', async () => {
    await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')
    await saisir('weight-sheet-date', '')
    champ('weight-sheet-kg').focus()

    await soumettre()

    expect(document.activeElement).toBe(champ('weight-sheet-date'))
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
  it('annonce la pesée ajoutée, pour que l’écran montre sa page', async () => {
    const wrapper = await monter(MILO.id)
    await saisir('weight-sheet-kg', '24,7')

    await soumettre()

    expect(wrapper.emitted('created')).toEqual([[PESEE]])
  })

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
  afterEach(() => {
    vi.useRealTimers()
  })

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
  })

  it('recale la borne de date au retour au premier plan, feuille ouverte', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 13, 23, 59))
    await monter(MILO.id)
    expect(champ('weight-sheet-date').getAttribute('max')).toBe('2026-09-13')

    vi.setSystemTime(new Date(2026, 8, 14, 0, 1))
    simulateWebResume()
    await flushPromises()

    expect(champ('weight-sheet-date').getAttribute('max')).toBe('2026-09-14')
    expect(champ('weight-sheet-date').value).toBe('2026-09-13')
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

describe('WeightSheet — corriger une pesée', () => {
  it('titre « Modifier la pesée » pour l’animal, poids et date de la pesée pré-remplis', async () => {
    await monterEnCorrection()

    expect(texte('.bottom-sheet__title')).toBe('Modifier la pesée')
    expect(texte('.bottom-sheet__subtitle')).toBe('Pour Milo')
    expect(feuille().querySelector('.animal-chip-selector')).toBeNull()
    expect(champ('weight-sheet-kg').value).toBe('2,45')
    expect(champ('weight-sheet-date').value).toBe('2026-08-25')
    expect(champ('weight-sheet-date').getAttribute('max')).toBe(todayIsoDate())
    expect(texte('.weight-sheet__submit')).toBe('Enregistrer')
  })

  it('n’ouvre pas le clavier : on peut venir pour la date ou pour supprimer', async () => {
    await monterEnCorrection()

    expect(document.activeElement).not.toBe(champ('weight-sheet-kg'))
  })

  it('corrige la pesée par le store, sans en créer, puis ferme la feuille', async () => {
    const wrapper = await monterEnCorrection()
    await saisir('weight-sheet-kg', '24,5')

    await soumettre()

    expect(update).toHaveBeenCalledExactlyOnceWith(A_CORRIGER.id, {
      weightKg: 24.5,
      measuredOn: '2026-08-25',
    })
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.emitted('created')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('refuse une date future et un poids hors bornes, comme à l’ajout', async () => {
    await monterEnCorrection()
    await saisir('weight-sheet-kg', '2000')
    await saisir('weight-sheet-date', '2999-01-01')

    await soumettre()

    expect(messages()).toEqual([
      'Le poids doit être de 200 kg maximum.',
      'La date ne peut pas être dans le futur.',
    ])
    expect(update).not.toHaveBeenCalled()
  })

  it('reste ouverte et prévient quand la correction échoue', async () => {
    update.mockRejectedValueOnce(new Error('Pesée introuvable'))
    const wrapper = await monterEnCorrection()

    await soumettre()

    expect(texte('.weight-sheet__save-error')).toBe(
      'La pesée n’a pas pu être enregistrée. Réessaie.',
    )
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('repart de la pesée enregistrée à chaque ouverture', async () => {
    const wrapper = await monterEnCorrection()
    await saisir('weight-sheet-kg', '0')
    await soumettre()

    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    await wrapper.setProps({ modelValue: true })
    await flushPromises()

    expect(champ('weight-sheet-kg').value).toBe('2,45')
    expect(messages()).toEqual([])
  })
})

describe('WeightSheet — supprimer une pesée', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 25, 10, 0))
  })

  it('offre « Supprimer cette pesée » en bas de la feuille, sous « Enregistrer »', async () => {
    await monterEnCorrection()

    const bouton = feuille().querySelector('.weight-sheet__delete')
    expect(bouton?.textContent?.trim()).toBe('Supprimer cette pesée')
    expect(feuille().querySelector('.weight-sheet__submit')?.compareDocumentPosition(bouton!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('supprime sans dialogue, ferme la feuille et le confirme par un toast', async () => {
    const wrapper = await monterEnCorrection()

    await supprimer()

    expect(remove).toHaveBeenCalledExactlyOnceWith(A_CORRIGER.id)
    expect(document.body.querySelector('.confirm-dialog')).toBeNull()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Pesée du 25 août supprimée')
    expect(toastAction.value?.label).toBe('Annuler')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la suppression de la pesée du 25 août')
  })

  it('date la pesée d’une autre année avec son année', async () => {
    await monterEnCorrection({ ...A_CORRIGER, measuredOn: '2025-12-20' })

    await supprimer()

    expect(toastMessage.value).toBe('Pesée du 20 déc. 2025 supprimée')
  })

  it('remet la pesée par « Annuler »', async () => {
    await monterEnCorrection()
    await supprimer()

    runToastAction()
    await flushPromises()

    expect(undoRemove).toHaveBeenCalledExactlyOnceWith(A_CORRIGER.id)
  })

  it('dit que l’annulation n’a pas abouti', async () => {
    undoRemove.mockRejectedValueOnce(new Error('base verrouillée'))
    await monterEnCorrection()
    await supprimer()

    runToastAction()
    await flushPromises()

    expect(toastMessage.value).toBe('L’annulation n’a pas abouti.')
    expect(toastTone.value).toBe('error')
  })

  it('désactive la feuille le temps de la suppression, sans « Enregistrement… »', async () => {
    remove.mockReturnValueOnce(new Promise(() => {}))
    await monterEnCorrection()

    await supprimer()

    const enregistrer = feuille().querySelector<HTMLButtonElement>('.weight-sheet__submit')
    expect(enregistrer?.disabled).toBe(true)
    expect(enregistrer?.textContent?.trim()).toBe('Enregistrer')
    expect(feuille().querySelector<HTMLButtonElement>('.weight-sheet__delete')?.disabled).toBe(true)
  })

  it('reste ouverte et prévient quand la suppression échoue, sans toast', async () => {
    remove.mockRejectedValueOnce(new Error('base verrouillée'))
    const wrapper = await monterEnCorrection()

    await supprimer()

    expect(texte('.weight-sheet__save-error')).toBe('La pesée n’a pas pu être supprimée. Réessaie.')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(toastMessage.value).toBeNull()
  })
})
