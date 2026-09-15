import { describe, expect, it, vi } from 'vitest'

import type { DataExportService } from '../data-export.service'
import { useDataExport } from '../use-data-export'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok
    reject = ko
  })
  return { promise, resolve, reject }
}

describe('useDataExport', () => {
  it('signale la préparation pendant l’export et renvoie son issue', async () => {
    const pending = deferred<'shared'>()
    const exportData = vi.fn<DataExportService['exportData']>(() => pending.promise)
    const { isPreparing, hasFailed, run } = useDataExport({ exportData })

    const result = run('csv')
    expect(isPreparing.value).toBe(true)
    expect(exportData).toHaveBeenCalledWith('csv')

    pending.resolve('shared')
    await expect(result).resolves.toBe('shared')
    expect(isPreparing.value).toBe(false)
    expect(hasFailed.value).toBe(false)
  })

  it('ignore un second export lancé pendant la préparation', async () => {
    const pending = deferred<'shared'>()
    const exportData = vi.fn<DataExportService['exportData']>(() => pending.promise)
    const { run } = useDataExport({ exportData })

    void run('json')
    await expect(run('json')).resolves.toBe('busy')
    expect(exportData).toHaveBeenCalledTimes(1)
    pending.resolve('shared')
  })

  it('retient l’échec sans lever, et l’oublie au nouvel essai', async () => {
    const exportData = vi
      .fn<DataExportService['exportData']>()
      .mockRejectedValueOnce(new Error('base fermée'))
      .mockResolvedValueOnce('cancelled')
    const { hasFailed, run, reset } = useDataExport({ exportData })

    await expect(run('json')).resolves.toBe('failed')
    expect(hasFailed.value).toBe(true)

    const retry = run('json')
    expect(hasFailed.value).toBe(false)
    await expect(retry).resolves.toBe('cancelled')

    hasFailed.value = true
    reset()
    expect(hasFailed.value).toBe(false)
  })
})
