import { dataExportService, type DataExportService } from '../service/data-export.service'
import {
  isSaved,
  type DeliveryMode,
  type DeliveryOutcome,
} from '../service/export-delivery.service'
import type { ExportFormat } from '../logic/export-format'
import { useExportRun, type ExportRunInterruption, type SaveAccessPort } from './use-export-run'
import { recordUsageSignal } from '@/core/usage/usage-signals'

export type ExportRunOutcome = DeliveryOutcome | ExportRunInterruption

export function useDataExport(
  service: Pick<DataExportService, 'exportData'> = dataExportService,
  access?: SaveAccessPort,
) {
  const exportRun = useExportRun(access)

  async function run(format: ExportFormat, mode: DeliveryMode): Promise<ExportRunOutcome> {
    const outcome = await exportRun.run(mode, () => service.exportData(format, mode))
    if (isSaved(outcome) || outcome === 'shared') recordUsageSignal('export')
    if (format === 'json' && outcome === 'shared') recordUsageSignal('jsonShare')
    return outcome
  }

  return { ...exportRun, run }
}
