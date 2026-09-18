import { format } from 'date-fns'

import i18n from '@/core/i18n'
import { photoBase64DataUrl } from '@/core/photos/photo-storage'
import { dataExportService } from './data-export.service'
import { deliverExportFile, type DeliveryOutcome } from './export-delivery'
import { buildCarnetPdfContent, pdfExportFileName } from './pdf-content'
import { renderCarnetPdf } from './render-carnet-pdf'
import type { ExportData } from '@/shared/carnet-data'
import type { CarnetPdfContent } from './pdf-content'

export type PdfExportOutcome = DeliveryOutcome | 'not-found'

export type PdfExportDependencies = {
  collect: () => Promise<ExportData>
  render: (content: CarnetPdfContent, appVersion: string, photoDataUrl: string | null) => Uint8Array
  loadPhoto: (fileName: string) => Promise<string | null>
  deliver: (file: { name: string; content: Uint8Array }) => Promise<DeliveryOutcome>
  now: () => Date
  appVersion: string
}

export function createPdfExportService({
  collect,
  render,
  loadPhoto,
  deliver,
  now,
  appVersion,
}: PdfExportDependencies) {
  return {
    async exportAnimalCarnetPdf(animalId: string): Promise<PdfExportOutcome> {
      const data = await collect()
      const exportedAt = now()
      const content = buildCarnetPdfContent(data, animalId, format(exportedAt, 'yyyy-MM-dd'))
      if (!content) return 'not-found'

      const photoDataUrl = content.animal.photoFileName
        ? await loadPhoto(content.animal.photoFileName)
        : null
      const bytes = render(content, appVersion, photoDataUrl)
      return deliver({ name: pdfExportFileName(content.animal.name, exportedAt), content: bytes })
    },
  }
}

export type PdfExportService = ReturnType<typeof createPdfExportService>

export const pdfExportService = createPdfExportService({
  collect: dataExportService.collect,
  render: renderCarnetPdf,
  loadPhoto: (fileName) => photoBase64DataUrl(fileName).catch(() => null),
  deliver: (file) => deliverExportFile(file, i18n.global.t('settings.pdf.shareTitle')),
  now: () => new Date(),
  appVersion: import.meta.env.VITE_APP_VERSION,
})
