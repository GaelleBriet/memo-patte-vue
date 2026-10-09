import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCarnetCopyService } from '../service/carnet-copy.service'
import type { DataExportService } from '@/features/settings/service/data-export.service'
import { recordUsageSignal, type UsageSignal } from '@/core/usage/usage-signals'

vi.mock('@/features/settings/service/data-export.service', () => ({ dataExportService: {} }))
vi.mock('@/core/usage/usage-signals', () => ({
  recordUsageSignal: vi.fn<(signal: UsageSignal) => void>(),
}))

beforeEach(() => {
  vi.mocked(recordUsageSignal).mockClear()
})

describe('copie du carnet depuis l’accueil', () => {
  it('partage l’export JSON, comme « Exporter une copie » de Sauvegarde, et le compte', async () => {
    const exportData = vi.fn<DataExportService['exportData']>(async () => 'shared')

    await expect(createCarnetCopyService({ exportData }).share()).resolves.toBe('shared')

    expect(exportData).toHaveBeenCalledExactlyOnceWith('json', 'share')
    expect(vi.mocked(recordUsageSignal).mock.calls).toEqual([['export'], ['jsonShare']])
  })

  it('ne compte rien quand le partage est annulé', async () => {
    const service = createCarnetCopyService({ exportData: async () => 'cancelled' })

    await expect(service.share()).resolves.toBe('cancelled')
    expect(recordUsageSignal).not.toHaveBeenCalled()
  })

  it('rend « failed » sans lever quand l’export échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const service = createCarnetCopyService({
      exportData: async () => {
        throw new Error('base indisponible')
      },
    })

    await expect(service.share()).resolves.toBe('failed')
    expect(recordUsageSignal).not.toHaveBeenCalled()
  })
})
