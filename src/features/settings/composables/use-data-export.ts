import { dataExportService, type DataExportService } from '../service/data-export.service'
import type { DeliveryMode, DeliveryOutcome } from '../logic/export-delivery'
import type { ExportFormat } from '../logic/export-format'
import { useExportRun, type ExportRunInterruption, type SaveAccessPort } from './use-export-run'
import { recordUsageSignal } from '@/shared/utils/usage-signals'

export type ExportRunOutcome = DeliveryOutcome | ExportRunInterruption

export function useDataExport(
  service: Pick<DataExportService, 'exportData'> = dataExportService,
  access?: SaveAccessPort,
) {
  const exportRun = useExportRun(access)

  async function run(format: ExportFormat, mode: DeliveryMode): Promise<ExportRunOutcome> {
    const outcome = await exportRun.run(mode, () => service.exportData(format, mode))
    if (outcome === 'saved' || outcome === 'shared') recordUsageSignal('export')
    return outcome
  }

  return { ...exportRun, run }
}
