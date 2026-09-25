import { ref } from 'vue'

import {
  dataImportService,
  ImportRefusedError,
  MAX_IMPORT_FILE_BYTES,
  parseExportFile,
  type DataImportService,
  type ImportFile,
  type ImportFileError,
  type ImportMode,
  type ImportRefusal,
} from '../service/data-import.service'

export type ImportStep = 'idle' | 'choice' | 'confirm' | 'error'
export type ImportError = ImportFileError | ImportRefusal | 'failed'

export function useDataImport(
  service: Pick<DataImportService, 'hasLocalData' | 'importData'> = dataImportService,
  onImported: () => void = () => undefined,
) {
  const step = ref<ImportStep>('idle')
  const error = ref<ImportError | null>(null)
  const isImporting = ref(false)
  let pending: ImportFile | null = null

  function fail(reason: ImportError): void {
    pending = null
    error.value = reason
    step.value = 'error'
  }

  async function write(file: ImportFile, mode: ImportMode): Promise<void> {
    try {
      await service.importData(file, mode)
      pending = null
      step.value = 'idle'
      onImported()
    } catch (cause) {
      if (cause instanceof ImportRefusedError) return fail(cause.reason)
      console.warn('Import impossible :', cause)
      fail('failed')
    }
  }

  async function busy(task: () => Promise<void>): Promise<void> {
    if (isImporting.value) return
    isImporting.value = true
    try {
      await task()
    } finally {
      isImporting.value = false
    }
  }

  async function readAndImport(file: File): Promise<void> {
    error.value = null
    if (file.size > MAX_IMPORT_FILE_BYTES) return fail('invalid')
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

    if (!hasData) return write(parsed.file, 'replace')
    pending = parsed.file
    step.value = 'choice'
  }

  function selectFile(file: File): Promise<void> {
    return busy(() => readAndImport(file))
  }

  async function choose(mode: ImportMode): Promise<void> {
    if (isImporting.value || pending === null || step.value !== 'choice') return
    if (mode === 'replace') {
      step.value = 'confirm'
      return
    }
    const file = pending
    await busy(() => write(file, 'merge'))
  }

  async function confirmReplace(): Promise<void> {
    if (isImporting.value || pending === null || step.value !== 'confirm') return
    const file = pending
    step.value = 'choice'
    await busy(() => write(file, 'replace'))
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
