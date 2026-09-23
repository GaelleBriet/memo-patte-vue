import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SaveAccess } from '../logic/export-storage-access'
import { useExportRun, type SaveAccessPort } from '../composables/use-export-run'

const resumeListeners = vi.hoisted(() => [] as (() => void)[])

vi.mock('@/core/app-lifecycle/app-resume', () => ({
  useAppResume: (listener: () => void) => resumeListeners.push(listener),
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((ok) => (resolve = ok))
  return { promise, resolve }
}

function port(check: SaveAccess = 'granted', request: SaveAccess = 'granted') {
  return {
    check: vi.fn<SaveAccessPort['check']>(async () => check),
    request: vi.fn<SaveAccessPort['request']>(async () => request),
  }
}

function resume(): void {
  for (const listener of resumeListeners) listener()
}

beforeEach(() => {
  resumeListeners.length = 0
})

describe('useExportRun', () => {
  it('partage sans jamais demander l’accès au stockage', async () => {
    const access = port('blocked')
    const { run } = useExportRun(access)

    await expect(run('share', async () => 'shared')).resolves.toBe('shared')
    expect(access.request).not.toHaveBeenCalled()
  })

  it('demande l’accès avant de préparer un enregistrement', async () => {
    const access = port()
    const deliver = vi.fn<() => Promise<'saved'>>(async () => 'saved')
    const { run, saveAccess } = useExportRun(access)

    await expect(run('save', deliver)).resolves.toBe('saved')
    expect(access.request.mock.invocationCallOrder[0]!).toBeLessThan(
      deliver.mock.invocationCallOrder[0]!,
    )
    expect(saveAccess.value).toBe('granted')
  })

  it.each(['refused', 'blocked'] as const)(
    'n’enregistre rien quand l’accès est %s, sans le compter comme un échec',
    async (answer) => {
      const deliver = vi.fn<() => Promise<'saved'>>(async () => 'saved')
      const { run, saveAccess, hasFailed } = useExportRun(port('unasked', answer))

      await expect(run('save', deliver)).resolves.toBe('no-access')
      expect(deliver).not.toHaveBeenCalled()
      expect(saveAccess.value).toBe(answer)
      expect(hasFailed.value).toBe(false)
    },
  )

  it('indique le bouton en préparation, et ignore un second export lancé pendant ce temps', async () => {
    const pending = deferred<'saved'>()
    const deliver = vi.fn<() => Promise<'saved'>>(() => pending.promise)
    const { run, pendingMode, isPreparing } = useExportRun(port())

    const first = run('save', deliver)
    expect(pendingMode.value).toBe('save')
    expect(isPreparing.value).toBe(true)
    await expect(run('share', async () => 'shared')).resolves.toBe('busy')

    await vi.waitFor(() => expect(deliver).toHaveBeenCalledOnce())
    pending.resolve('saved')
    await expect(first).resolves.toBe('saved')
    expect(pendingMode.value).toBeNull()
  })

  it('retient l’échec sans lever, et l’oublie au nouvel essai comme à la réouverture', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { run, hasFailed, reset } = useExportRun(port())

    await expect(
      run('save', async () => {
        throw new Error('disque plein')
      }),
    ).resolves.toBe('failed')
    expect(hasFailed.value).toBe(true)

    const retry = run('share', async () => 'cancelled')
    expect(hasFailed.value).toBe(false)
    await expect(retry).resolves.toBe('cancelled')

    hasFailed.value = true
    reset()
    expect(hasFailed.value).toBe(false)
  })

  it('traite une demande d’accès en panne comme un échec', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const access = port()
    access.request.mockRejectedValue(new Error('not implemented'))
    const { run, hasFailed } = useExportRun(access)

    await expect(run('save', async () => 'saved')).resolves.toBe('failed')
    expect(hasFailed.value).toBe(true)
  })

  it('relit l’accès à la réouverture', async () => {
    const { reset, saveAccess } = useExportRun(port('blocked'))

    reset()

    await vi.waitFor(() => expect(saveAccess.value).toBe('blocked'))
  })

  it('relit l’accès au retour des réglages de l’app', async () => {
    const access = port('blocked')
    const { reset, saveAccess } = useExportRun(access)
    reset()
    await vi.waitFor(() => expect(saveAccess.value).toBe('blocked'))

    access.check.mockResolvedValue('granted')
    resume()

    await vi.waitFor(() => expect(saveAccess.value).toBe('granted'))
  })

  it('ne relit pas l’accès au retour de la demande d’Android, dont la réponse fait foi', async () => {
    const answer = deferred<SaveAccess>()
    const access = port('unasked')
    access.request.mockReturnValue(answer.promise)
    const { run, saveAccess } = useExportRun(access)

    const saving = run('save', async () => 'saved')
    resume()
    answer.resolve('refused')

    await expect(saving).resolves.toBe('no-access')
    expect(access.check).not.toHaveBeenCalled()
    expect(saveAccess.value).toBe('refused')
  })

  it('écarte une lecture de l’accès partie avant la demande', async () => {
    const stale = deferred<SaveAccess>()
    const access = port()
    access.check.mockReturnValue(stale.promise)
    access.request.mockResolvedValue('refused')
    const { reset, run, saveAccess } = useExportRun(access)

    reset()
    await run('save', async () => 'saved')
    stale.resolve('unasked')
    await new Promise((settle) => setTimeout(settle))

    expect(saveAccess.value).toBe('refused')
  })
})
