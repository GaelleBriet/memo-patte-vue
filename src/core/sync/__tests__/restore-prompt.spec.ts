import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createRestorePrompt, type RestorePromptScreen } from '../service/restore-prompt'

const home: RestorePromptScreen = { onRestore: false, onHome: true, sheetShown: () => false }
const elsewhere: RestorePromptScreen = { onRestore: false, onHome: false, sheetShown: () => false }
const restoreScreen: RestorePromptScreen = {
  onRestore: true,
  onHome: false,
  sheetShown: () => false,
}
const arrival = { arrived: true, leftRestore: false }
const leftRestore = { arrived: false, leftRestore: true }

describe('createRestorePrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 27, 10, 0) })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ouvre dès que la sauvegarde est trouvée sur l’accueil sans feuille', () => {
    const prompt = createRestorePrompt()

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(true)
  })

  it('n’ouvre rien hors de l’accueil, ni devant une feuille', () => {
    const prompt = createRestorePrompt()

    expect(prompt.shouldOpen('choice', () => elsewhere, null)).toBe(false)
    expect(prompt.shouldOpen('choice', () => ({ ...home, sheetShown: () => true }), null)).toBe(
      false,
    )
  })

  it('n’ouvre que tant que la sauvegarde attend un choix', () => {
    const prompt = createRestorePrompt()

    for (const step of [undefined, 'idle', 'checking', 'no-answer', 'restoring', 'done'] as const) {
      expect(prompt.shouldOpen(step, () => home, arrival)).toBe(false)
    }
  })

  it('l’écran déjà ouvert compte comme proposé pour la journée', () => {
    const prompt = createRestorePrompt()
    prompt.shouldOpen('choice', () => restoreScreen, null)

    expect(prompt.shouldOpen('choice', () => home, leftRestore)).toBe(false)
    expect(prompt.shouldOpen('choice', () => home, null)).toBe(false)
  })

  it('une fois par jour local : revient à la première arrivée sur l’accueil après minuit', () => {
    const prompt = createRestorePrompt()
    expect(prompt.shouldOpen('choice', () => home, null)).toBe(true)
    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(false)

    vi.setSystemTime(new Date(2026, 9, 28, 0, 5))

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(false)
    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(true)
    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(false)
  })

  it('repart de zéro quand la sauvegarde n’attend plus rien', () => {
    const prompt = createRestorePrompt()
    expect(prompt.shouldOpen('choice', () => home, null)).toBe(true)

    prompt.shouldOpen('idle', () => home, null)

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(true)
  })

  it('un choix reproposé après une restauration lancée attend une arrivée sur l’accueil', () => {
    const prompt = createRestorePrompt()
    prompt.shouldOpen('restoring', () => home, null)

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(false)
    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(true)
  })
})
