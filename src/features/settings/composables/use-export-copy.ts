import { useI18n } from 'vue-i18n'

import { showToast } from '@/shared/utils/toast'
import { useDataExport } from './use-data-export'
import { useExportAvailability } from './use-export-availability'

/** « Exporter une copie » : l'export JSON part droit dans le partage d'Android. */
export function useExportCopy() {
  const { t } = useI18n()
  const availability = useExportAvailability()
  const { isPreparing, run } = useDataExport()

  async function exportCopy(): Promise<void> {
    if (availability.hasLoadFailed.value) {
      availability.retryLoad()
      return
    }
    const outcome = await run('json', 'share')
    if (outcome === 'shared') showToast(t('settings.export.success'))
    else if (outcome === 'failed') showToast(t('settings.export.error'), { tone: 'error' })
  }

  return { ...availability, isPreparing, exportCopy }
}
