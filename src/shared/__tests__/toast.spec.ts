import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dismissToast,
  pauseToast,
  resumeToast,
  runToastAction,
  showToast,
  showUndoableToast,
  toastAction,
  toastAnnouncement,
  toastMessage,
  toastTone,
} from '../utils/toast'

const ANNONCE_MS = 100

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  dismissToast()
  vi.useRealTimers()
})

describe('annonce du toast', () => {
  it('n’annonce que le dernier message quand il en remplace un autre avant son annonce', () => {
    showToast('Rappels activés')
    vi.advanceTimersByTime(ANNONCE_MS / 2)
    showToast('Données exportées')

    vi.advanceTimersByTime(ANNONCE_MS / 2 + 10)
    expect(toastAnnouncement.value).toBe('')

    vi.advanceTimersByTime(ANNONCE_MS)
    expect(toastAnnouncement.value).toBe('Données exportées')
  })

  it('n’annonce rien et ne laisse aucun minuteur quand le toast est fermé avant son annonce', () => {
    showToast('Rappels activés')
    vi.advanceTimersByTime(ANNONCE_MS / 2)

    dismissToast()

    expect(toastAnnouncement.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('vide la région annoncée quand le toast se ferme', () => {
    showToast('Rappels activés')
    vi.advanceTimersByTime(ANNONCE_MS)
    expect(toastAnnouncement.value).toBe('Rappels activés')

    dismissToast()

    expect(toastAnnouncement.value).toBe('')
  })
})

describe('action du toast', () => {
  it('garde l’action affichée avec son message, 4 s par défaut', () => {
    const run = vi.fn<() => void>()
    showToast('Prise de Bravecto notée pour Boree', {
      action: { label: 'Annuler', ariaLabel: 'Annuler la prise de Bravecto', run },
    })

    expect(toastAction.value?.label).toBe('Annuler')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la prise de Bravecto')
    vi.advanceTimersByTime(3900)
    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')
    vi.advanceTimersByTime(200)
    expect(toastMessage.value).toBeNull()
    expect(toastAction.value).toBeNull()
  })

  it('ferme le toast et joue l’action une seule fois, même touchée deux fois', () => {
    const run = vi.fn<() => void>()
    showToast('Prise de Bravecto notée pour Boree', { action: { label: 'Annuler', run } })

    runToastAction()
    runToastAction()

    expect(run).toHaveBeenCalledOnce()
    expect(toastMessage.value).toBeNull()
  })

  it('ne vaut que pour la dernière action : un nouveau toast remplace ou retire la précédente', () => {
    const premiere = vi.fn<() => void>()
    const seconde = vi.fn<() => void>()
    showToast('Prise de Bravecto notée pour Boree', { action: { label: 'Annuler', run: premiere } })
    showToast('Injection de Carré notée pour Boree', { action: { label: 'Annuler', run: seconde } })

    runToastAction()

    expect(premiere).not.toHaveBeenCalled()
    expect(seconde).toHaveBeenCalledOnce()

    showToast('Prise de Bravecto notée pour Boree', { action: { label: 'Annuler', run: premiere } })
    showToast('Pesée enregistrée')
    expect(toastAction.value).toBeNull()
  })

  it('suspend la fermeture tant que l’action a le focus, puis repart pour sa durée complète', () => {
    showToast('Prise de Bravecto notée pour Boree', {
      action: { label: 'Annuler', run: vi.fn<() => void>() },
    })
    vi.advanceTimersByTime(3000)

    pauseToast()
    vi.advanceTimersByTime(60_000)
    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')

    resumeToast()
    vi.advanceTimersByTime(3900)
    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')
    vi.advanceTimersByTime(200)
    expect(toastMessage.value).toBeNull()
  })

  it('annule un geste réversible puis prévient l’écran, ou affiche l’échec de l’annulation', async () => {
    const onUndone = vi.fn<() => void>()
    const options = {
      label: 'Annuler',
      ariaLabel: 'Annuler la prise de Bravecto',
      undo: vi.fn<() => Promise<void>>().mockResolvedValue(),
      onUndone,
      failedMessage: 'L’annulation n’a pas abouti.',
    }
    showUndoableToast('Prise de Bravecto notée pour Boree', options)

    runToastAction()
    await vi.runAllTimersAsync()

    expect(options.undo).toHaveBeenCalledOnce()
    expect(onUndone).toHaveBeenCalledOnce()

    options.undo.mockRejectedValue(new Error('base verrouillée'))
    showUndoableToast('Prise de Bravecto notée pour Boree', options)
    runToastAction()
    await Promise.resolve()
    await Promise.resolve()

    expect(onUndone).toHaveBeenCalledOnce()
    expect(toastMessage.value).toBe('L’annulation n’a pas abouti.')
    expect(toastTone.value).toBe('error')
  })

  it('ne rouvre rien quand le focus quitte un toast déjà fermé', () => {
    showToast('Prise de Bravecto notée pour Boree', {
      action: { label: 'Annuler', run: vi.fn<() => void>() },
    })
    pauseToast()
    dismissToast()

    resumeToast()

    expect(vi.getTimerCount()).toBe(0)
    expect(toastMessage.value).toBeNull()
  })
})
