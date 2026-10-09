import { format } from 'date-fns'

import i18n from '@/core/i18n'
import { photoBase64DataUrl } from '@/core/photos/photo-storage'
import { dataExportService } from './data-export.service'
import {
  deliverExportFile,
  type DeliveryMode,
  type DeliveryOutcome,
} from './export-delivery.service'
import { buildCarnetPdfContent, type CarnetPdfContent } from '../logic/pdf-content'
import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { CarnetPdfPart, CarnetPdfParts } from '../logic/render-carnet-pdf'

export type PdfExportOutcome = DeliveryOutcome | 'not-found'

export type PdfExportDependencies = {
  collect: () => Promise<ExportData>
  render: (parts: CarnetPdfParts, appVersion: string) => Uint8Array
  loadPhoto: (fileName: string) => Promise<string | null>
  deliver: (
    file: { name: string; content: Uint8Array },
    mode: DeliveryMode,
  ) => Promise<DeliveryOutcome>
  appVersion: string
}

export type PdfExportRequest = {
  animalIds: readonly string[]
  fileName: string
  exportedAt: Date
}

export function createPdfExportService({
  collect,
  render,
  loadPhoto,
  deliver,
  appVersion,
}: PdfExportDependencies) {
  return {
    async exportCarnetPdf(
      { animalIds, fileName, exportedAt }: PdfExportRequest,
      mode: DeliveryMode,
    ): Promise<PdfExportOutcome> {
      const data = await collect()
      const today = format(exportedAt, 'yyyy-MM-dd')
      const [first, ...others] = animalIds.flatMap(
        (id) => buildCarnetPdfContent(data, id, today) ?? [],
      )
      if (!first) return 'not-found'

      const withPhoto = async (content: CarnetPdfContent): Promise<CarnetPdfPart> => ({
        content,
        photoDataUrl: content.animal.photoFileName
          ? await loadPhoto(content.animal.photoFileName)
          : null,
      })
      const parts = await Promise.all([withPhoto(first), ...others.map(withPhoto)] as const)
      return deliver({ name: fileName, content: render(parts, appVersion) }, mode)
    },
  }
}

export type PdfExportService = ReturnType<typeof createPdfExportService>

export const pdfExportService = createPdfExportService({
  collect: dataExportService.collect,
  render: renderCarnetPdf,
  loadPhoto: (fileName) => photoBase64DataUrl(fileName).catch(() => null),
  deliver: (file, mode) => deliverExportFile(file, mode, i18n.global.t('settings.pdf.shareTitle')),
  appVersion: import.meta.env.VITE_APP_VERSION,
})
