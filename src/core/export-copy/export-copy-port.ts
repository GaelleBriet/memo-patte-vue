import type { Ref } from 'vue'

export type ExportCopyAction = {
  isPreparing: Ref<boolean>
  exportCopy(): Promise<void>
}

export type ExportCopyProvider = () => ExportCopyAction

let provider: ExportCopyProvider | null = null

export function provideExportCopy(next: ExportCopyProvider | null): void {
  provider = next
}

export function useExportCopyAction(): ExportCopyAction {
  if (!provider) throw new Error('Export d’une copie absent : appelle provideExportCopy().')
  return provider()
}
