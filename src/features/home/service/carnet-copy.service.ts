import {
  dataExportService,
  type DataExportService,
} from '@/features/settings/service/data-export.service'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

export type CarnetCopyOutcome = 'shared' | 'cancelled' | 'failed'

export function createCarnetCopyService(exporter: Pick<DataExportService, 'exportData'>) {
  return {
    /** Ne lève pas. */
    async share(): Promise<CarnetCopyOutcome> {
      try {
        if ((await exporter.exportData('json', 'share')) !== 'shared') return 'cancelled'
      } catch (cause) {
        console.warn('Copie du carnet impossible :', cause)
        return 'failed'
      }
      recordUsageSignal('export')
      recordUsageSignal('jsonShare')
      return 'shared'
    },
  }
}

export type CarnetCopyService = ReturnType<typeof createCarnetCopyService>

export const carnetCopyService = createCarnetCopyService(dataExportService)
