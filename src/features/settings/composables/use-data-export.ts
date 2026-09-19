import { ref } from 'vue'

import { dataExportService, type DataExportService } from '../service/data-export.service'
import type { DeliveryOutcome } from '../logic/export-delivery'
import type { ExportFormat } from '../logic/export-format'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

export type ExportRunOutcome = DeliveryOutcome | 'failed' | 'busy'

export function useDataExport(service: Pick<DataExportService, 'exportData'> = dataExportService) {
  const isPreparing = ref(false)
  const hasFailed = ref(false)

  async function run(format: ExportFormat): Promise<ExportRunOutcome> {
    if (isPreparing.value) return 'busy'
    isPreparing.value = true
    hasFailed.value = false
    try {
      const outcome = await service.exportData(format)
      if (outcome === 'shared') recordUsageSignal('export')
      return outcome
    } catch (cause) {
      console.warn('Export impossible :', cause)
      hasFailed.value = true
      return 'failed'
    } finally {
      isPreparing.value = false
    }
  }

  function reset(): void {
    hasFailed.value = false
  }

  return { isPreparing, hasFailed, run, reset }
}
