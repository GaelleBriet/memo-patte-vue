import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DataExportService } from '../service/data-export.service'
import type { SaveAccessPort } from '../composables/use-export-run'
import { useDataExport } from '../composables/use-data-export'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

vi.mock('@/core/app-lifecycle/app-resume', () => ({ useAppResume: () => {} }))
vi.mock('@/shared/utils/usage-signals', () => ({
  recordUsageSignal: vi.fn<(signal: string) => void>(),
}))

function port(request: Awaited<ReturnType<SaveAccessPort['request']>>): SaveAccessPort {
  return { check: async () => 'granted', request: async () => request }
}

beforeEach(() => {
  vi.mocked(recordUsageSignal).mockClear()
})

describe('useDataExport', () => {
  it('prépare le format choisi pour l’action choisie et renvoie son issue', async () => {
    const saved = { status: 'saved', file: null } as const
    const exportData = vi.fn<DataExportService['exportData']>(async () => saved)
    const { run } = useDataExport({ exportData }, port('granted'))

    await expect(run('csv', 'save')).resolves.toBe(saved)
    expect(exportData).toHaveBeenCalledExactlyOnceWith('csv', 'save')
  })

  it.each([
    ['enregistré', 'save', { status: 'saved', file: null }],
    ['partagé', 'share', 'shared'],
  ] as const)('compte un export %s', async (_, mode, outcome) => {
    const { run } = useDataExport({ exportData: async () => outcome }, port('granted'))

    await run('json', mode)

    expect(recordUsageSignal).toHaveBeenCalledExactlyOnceWith('export')
  })

  it('ne compte ni un partage annulé ni un enregistrement sans accès', async () => {
    const { run } = useDataExport({ exportData: async () => 'cancelled' }, port('refused'))

    await expect(run('json', 'share')).resolves.toBe('cancelled')
    await expect(run('json', 'save')).resolves.toBe('no-access')

    expect(recordUsageSignal).not.toHaveBeenCalled()
  })
})
