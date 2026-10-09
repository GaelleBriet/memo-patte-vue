import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'

import { confirmUndoable, useGuardedGestures } from '../composables/use-guarded-gestures'
import i18n from '@/core/i18n'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastAnnouncement,
  toastMessage,
  toastTone,
} from '../utils/toast'

afterEach(() => {
  dismissToast()
  vi.useRealTimers()
})

function gestures(options?: Parameters<typeof useGuardedGestures>[0]) {
  let result: ReturnType<typeof useGuardedGestures> | undefined
  mount(
    defineComponent({
      setup() {
        result = useGuardedGestures(options)
        return () => null
      },
    }),
    { global: { plugins: [i18n] } },
  )
  return result!
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

describe('useGuardedGestures : un geste à la fois', () => {
  it('occupe pendant le geste, puis rend la main', async () => {
    const { isBusy, guarded } = gestures()
    const write = deferred()

    const done = guarded(() => write.promise)
    expect(isBusy.value).toBe(true)

    write.resolve()
    expect(await done).toBe(true)
    expect(isBusy.value).toBe(false)
  })

  it('ne lance pas un second geste pendant le premier', async () => {
    const { guarded } = gestures()
    const write = deferred()
    const second = vi.fn<() => Promise<void>>(async () => {})

    const first = guarded(() => write.promise)
    expect(await guarded(second)).toBe(false)
    expect(second).not.toHaveBeenCalled()

    write.resolve()
    await first
  })

  it('dit l’échec en toast quand son texte est donné', async () => {
    const { isBusy, guarded } = gestures()

    const done = await guarded(() => Promise.reject(new Error('base')), 'Échec de Milbemax')

    expect(done).toBe(false)
    expect(isBusy.value).toBe(false)
    expect(toastMessage.value).toBe('Échec de Milbemax')
    expect(toastTone.value).toBe('error')
  })

  it('échoue sans toast quand aucun texte d’échec n’est donné', async () => {
    const { guarded } = gestures()

    expect(await guarded(() => Promise.reject(new Error('base')))).toBe(false)
    expect(toastMessage.value).toBeNull()
  })

  it('rend le résultat du geste, et faux sans le lancer si un geste est en cours', async () => {
    const { isBusy, oneAtATime } = gestures()
    const write = deferred()

    const first = oneAtATime(async () => {
      await write.promise
      return 'enregistré'
    })
    expect(await oneAtATime(async () => 'second')).toBe(false)

    write.resolve()
    expect(await first).toBe('enregistré')
    expect(isBusy.value).toBe(false)
  })

  it('laisse remonter l’erreur du geste et rend la main', async () => {
    const { isBusy, oneAtATime } = gestures()

    await expect(oneAtATime(() => Promise.reject(new Error('base')))).rejects.toThrow('base')
    expect(isBusy.value).toBe(false)
  })
})

describe('useGuardedGestures : toast « Annuler »', () => {
  it('confirme le geste avec le libellé « Annuler » commun', () => {
    const { undoable } = gestures()

    undoable('Milbemax supprimé', {
      ariaLabel: 'Annuler la suppression de Milbemax',
      undo: async () => {},
    })

    expect(toastMessage.value).toBe('Milbemax supprimé')
    expect(toastAction.value?.label).toBe('Annuler')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la suppression de Milbemax')
  })

  it('relit l’écran après l’annulation quand `afterUndo` est donné', async () => {
    const afterUndo = vi.fn<() => void>()
    const undo = vi.fn<() => Promise<void>>(async () => {})
    const { undoable } = gestures({ afterUndo })

    undoable('Milbemax supprimé', { ariaLabel: 'Annuler', undo })
    runToastAction()
    await flushPromises()

    expect(undo).toHaveBeenCalledOnce()
    expect(afterUndo).toHaveBeenCalledOnce()
  })

  it('dit l’échec de l’annulation, puis relit l’écran quand `afterUndo` est donné', async () => {
    const afterUndo = vi.fn<() => void>()
    const { undoable } = gestures({ afterUndo })

    undoable('Milbemax supprimé', {
      ariaLabel: 'Annuler',
      undo: () => Promise.reject(new Error('base')),
    })
    runToastAction()
    await flushPromises()

    expect(toastMessage.value).toBe('L’annulation n’a pas abouti.')
    expect(toastTone.value).toBe('error')
    expect(afterUndo).toHaveBeenCalledOnce()
  })

  it('préfère le `onUndone` du geste à `afterUndo`', async () => {
    const afterUndo = vi.fn<() => void>()
    const onUndone = vi.fn<() => void>()
    const { undoable } = gestures({ afterUndo })

    undoable('Milo ne fait plus partie du suivi', {
      ariaLabel: 'Annuler',
      undo: async () => {},
      onUndone,
    })
    runToastAction()
    await flushPromises()

    expect(onUndone).toHaveBeenCalledOnce()
    expect(afterUndo).not.toHaveBeenCalled()
  })

  it('n’appelle rien après l’échec de l’annulation sans `afterUndo` ni `onFailed`', async () => {
    const onUndone = vi.fn<() => void>()
    const { undoable } = gestures()

    undoable('Milo supprimé', {
      ariaLabel: 'Annuler',
      undo: () => Promise.reject(new Error('base')),
      onUndone,
    })
    runToastAction()
    await flushPromises()

    expect(toastMessage.value).toBe('L’annulation n’a pas abouti.')
    expect(onUndone).not.toHaveBeenCalled()
  })
})

describe('confirmUndoable', () => {
  it('annonce le texte donné et prévient quand le toast se ferme sans « Annuler »', () => {
    vi.useFakeTimers()
    const onExpired = vi.fn<() => void>()

    confirmUndoable(i18n.global.t, 'Supprimé', {
      ariaLabel: 'Annuler la suppression de Milo',
      undo: async () => {},
      announcement: 'Milo supprimé',
      onExpired,
    })
    vi.advanceTimersByTime(100)
    expect(toastAnnouncement.value).toBe('Milo supprimé')

    vi.runAllTimers()
    expect(toastMessage.value).toBeNull()
    expect(onExpired).toHaveBeenCalledOnce()
  })
})
