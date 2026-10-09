import {
  pdfExportService,
  type PdfExportOutcome,
  type PdfExportRequest,
  type PdfExportService,
} from '../service/pdf-export.service'
import type { DeliveryMode } from '../service/export-delivery.service'
import { useExportRun, type ExportRunInterruption, type SaveAccessPort } from './use-export-run'

export type PdfExportRunOutcome = PdfExportOutcome | ExportRunInterruption

export function usePdfExport(
  service: Pick<PdfExportService, 'exportCarnetPdf'> = pdfExportService,
  access?: SaveAccessPort,
) {
  const exportRun = useExportRun(access)

  function run(request: PdfExportRequest, mode: DeliveryMode): Promise<PdfExportRunOutcome> {
    return exportRun.run(mode, () => service.exportCarnetPdf(request, mode))
  }

  return { ...exportRun, run }
}
