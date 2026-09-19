import { ref } from 'vue'

import { pdfExportService, type PdfExportService } from '../service/pdf-export.service'

export type PdfExportRunOutcome = 'shared' | 'cancelled' | 'not-found' | 'failed' | 'busy'

export function usePdfExport(
  service: Pick<PdfExportService, 'exportAnimalCarnetPdf'> = pdfExportService,
) {
  const isPreparing = ref(false)
  const hasFailed = ref(false)

  async function run(animalId: string): Promise<PdfExportRunOutcome> {
    if (isPreparing.value) return 'busy'
    isPreparing.value = true
    hasFailed.value = false
    try {
      return await service.exportAnimalCarnetPdf(animalId)
    } catch (cause) {
      console.warn('Export PDF impossible :', cause)
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
