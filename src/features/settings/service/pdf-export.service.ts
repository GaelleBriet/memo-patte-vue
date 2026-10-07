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
import type { CarnetPdfPart } from '../logic/render-carnet-pdf'

export type PdfExportOutcome = DeliveryOutcome | 'not-found'

export type PdfExportDependencies = {
  collect: () => Promise<ExportData>
  render: (parts: CarnetPdfPart[], appVersion: string) => Uint8Array
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
    async exportCarnetPdf(
      animalIds: readonly string[],
      mode: DeliveryMode,
      exportedAt: Date = now(),
    ): Promise<PdfExportOutcome> {
      const data = await collect()
      const today = format(exportedAt, 'yyyy-MM-dd')
      const contents = animalIds.flatMap((id) => buildCarnetPdfContent(data, id, today) ?? [])
      if (contents.length === 0) return 'not-found'

      const parts = await Promise.all(
        contents.map(async (content) => ({
          content,
          photoDataUrl: content.animal.photoFileName
            ? await loadPhoto(content.animal.photoFileName)
            : null,
        })),
      )
      const names = contents.map(({ animal }) => animal.name)
      return deliver(
        {
          name: pdfExportFileName(fileNamePrefix(), names, exportedAt),
          content: render(parts, appVersion),
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
