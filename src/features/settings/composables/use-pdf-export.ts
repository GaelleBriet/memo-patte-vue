import {
  pdfExportService,
  type PdfExportOutcome,
  type PdfExportService,
} from '../service/pdf-export.service'
import type { DeliveryMode } from '../logic/export-delivery'
import { useExportRun, type ExportRunInterruption, type SaveAccessPort } from './use-export-run'

export type PdfExportRunOutcome = PdfExportOutcome | ExportRunInterruption

export function usePdfExport(
  service: Pick<PdfExportService, 'exportAnimalCarnetPdf'> = pdfExportService,
  access?: SaveAccessPort,
) {
  const exportRun = useExportRun(access)

  function run(animalId: string, mode: DeliveryMode): Promise<PdfExportRunOutcome> {
    return exportRun.run(mode, () => service.exportAnimalCarnetPdf(animalId, mode))
  }

  return { ...exportRun, run }
}
