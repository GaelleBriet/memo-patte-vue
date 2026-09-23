import { format } from 'date-fns'

import i18n from '@/core/i18n'
import { photoBase64DataUrl } from '@/core/photos/photo-storage'
import { dataExportService } from './data-export.service'
import {
  deliverExportFile,
  type DeliveryMode,
  type DeliveryOutcome,
} from '../logic/export-delivery'
import { buildCarnetPdfContent, pdfExportFileName } from '../logic/pdf-content'
import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { CarnetPdfContent } from '../logic/pdf-content'

export type PdfExportOutcome = DeliveryOutcome | 'not-found'

export type PdfExportDependencies = {
  collect: () => Promise<ExportData>
  render: (content: CarnetPdfContent, appVersion: string, photoDataUrl: string | null) => Uint8Array
  loadPhoto: (fileName: string) => Promise<string | null>
  deliver: (
    file: { name: string; content: Uint8Array },
    mode: DeliveryMode,
  ) => Promise<DeliveryOutcome>
  fileNamePrefix: () => string
  now: () => Date
  appVersion: string
}

export function createPdfExportService({
  collect,
  render,
  loadPhoto,
  deliver,
  fileNamePrefix,
  now,
  appVersion,
}: PdfExportDependencies) {
  return {
    async exportAnimalCarnetPdf(
      animalId: string,
      mode: DeliveryMode,
      exportedAt: Date = now(),
    ): Promise<PdfExportOutcome> {
      const data = await collect()
      const content = buildCarnetPdfContent(data, animalId, format(exportedAt, 'yyyy-MM-dd'))
      if (!content) return 'not-found'

      const photoDataUrl = content.animal.photoFileName
        ? await loadPhoto(content.animal.photoFileName)
        : null
      const bytes = render(content, appVersion, photoDataUrl)
      return deliver(
        {
          name: pdfExportFileName(fileNamePrefix(), content.animal.name, exportedAt),
          content: bytes,
        },
        mode,
      )
    },
  }
}

export type PdfExportService = ReturnType<typeof createPdfExportService>

export const pdfExportService = createPdfExportService({
  collect: dataExportService.collect,
  render: renderCarnetPdf,
  loadPhoto: (fileName) => photoBase64DataUrl(fileName).catch(() => null),
  deliver: (file, mode) => deliverExportFile(file, mode, i18n.global.t('settings.pdf.shareTitle')),
  fileNamePrefix: () => i18n.global.t('settings.pdf.fileNamePrefix'),
  now: () => new Date(),
  appVersion: import.meta.env.VITE_APP_VERSION,
})
