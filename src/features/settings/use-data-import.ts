import { ref } from 'vue'

import { dataImportService, type DataImportService, type ImportMode } from './data-import.service'
import type { ExportData } from './export-format'
import { parseExportFile, type ImportFileError } from './import-format'

export type ImportStep = 'idle' | 'choice' | 'confirm' | 'error'
export type ImportError = ImportFileError | 'failed'

export function useDataImport(
  service: Pick<DataImportService, 'hasLocalData' | 'importData'> = dataImportService,
  onImported: () => void = () => undefined,
) {
  const step = ref<ImportStep>('idle')
  const error = ref<ImportError | null>(null)
  const isImporting = ref(false)
  let pending: ExportData | null = null

  function fail(reason: ImportError): void {
    pending = null
    error.value = reason
    step.value = 'error'
  }

  async function write(data: ExportData, mode: ImportMode): Promise<void> {
    isImporting.value = true
    try {
      await service.importData(data, mode)
      pending = null
      step.value = 'idle'
      onImported()
    } catch (cause) {
      console.warn('Import impossible :', cause)
      fail('failed')
    } finally {
      isImporting.value = false
    }
  }

  async function selectFile(file: File): Promise<void> {
    if (isImporting.value) return
    error.value = null
    let text: string
    try {
      text = await file.text()
    } catch {
      return fail('invalid')
    }

    const parsed = parseExportFile(text)
    if (!parsed.ok) return fail(parsed.reason)

    let hasData: boolean
    try {
      hasData = await service.hasLocalData()
    } catch (cause) {
      console.warn('Import impossible :', cause)
      return fail('failed')
    }

    if (!hasData) return write(parsed.data, 'replace')
    pending = parsed.data
    step.value = 'choice'
  }

  async function choose(mode: ImportMode): Promise<void> {
    if (isImporting.value || pending === null || step.value !== 'choice') return
    if (mode === 'replace') {
      step.value = 'confirm'
      return
    }
    await write(pending, 'merge')
  }

  async function confirmReplace(): Promise<void> {
    if (isImporting.value || pending === null || step.value !== 'confirm') return
    step.value = 'choice'
    await write(pending, 'replace')
  }

  function cancelReplace(): void {
    if (step.value === 'confirm') step.value = 'choice'
  }

  function close(): void {
    if (isImporting.value) return
    pending = null
    error.value = null
    step.value = 'idle'
  }

  return { step, error, isImporting, selectFile, choose, confirmReplace, cancelReplace, close }
}
