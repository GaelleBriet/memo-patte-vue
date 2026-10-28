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

    const steps = [
      undefined,
      'idle',
      'checking',
      'no-answer',
      'restoring',
      'waiting-network',
      'done',
    ] as const
    for (const step of steps) {
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

  it('un retour à rien d’attendu oublie aussi la restauration lancée', () => {
    const prompt = createRestorePrompt()
    prompt.shouldOpen('restoring', () => home, null)
    prompt.shouldOpen('idle', () => home, null)

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(true)
  })

  it('un choix reproposé le jour même rouvre à la prochaine arrivée sur l’accueil', () => {
    const prompt = createRestorePrompt()
    expect(prompt.shouldOpen('choice', () => home, null)).toBe(true)
    prompt.shouldOpen('restoring', () => home, null)

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(false)
    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(true)
  })

  it('un choix reproposé vu sur l’écran de restauration compte pour la journée', () => {
    const prompt = createRestorePrompt()
    prompt.shouldOpen('restoring', () => restoreScreen, null)
    prompt.shouldOpen('choice', () => restoreScreen, null)

    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(false)
  })

  it('revenir de l’écran de restauration sur l’accueil ne le rouvre pas', () => {
    const prompt = createRestorePrompt()

    expect(prompt.shouldOpen('choice', () => home, { arrived: true, leftRestore: true })).toBe(
      false,
    )
  })

  it('une navigation qui n’est pas une arrivée sur l’accueil n’ouvre rien', () => {
    const prompt = createRestorePrompt()

    expect(prompt.shouldOpen('choice', () => home, { arrived: false, leftRestore: false })).toBe(
      false,
    )
  })

  it('un choix reproposé après une restauration lancée attend une arrivée sur l’accueil', () => {
    const prompt = createRestorePrompt()
    prompt.shouldOpen('restoring', () => home, null)

    expect(prompt.shouldOpen('choice', () => home, null)).toBe(false)
    expect(prompt.shouldOpen('choice', () => home, arrival)).toBe(true)
  })
})
