import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { errorSummary } from '@/shared/utils/error-summary'
import { showToast } from '@/shared/utils/toast'
import {
  deviceEraseService,
  type DeviceEraseService,
  type DeviceEraseSituation,
} from '../service/device-erase.service'

/** Écran d'avant, puis deux confirmations : la seconde seule lance l'effacement. */
export function useDeviceErase(service: DeviceEraseService = deviceEraseService) {
  const { t } = useI18n()
  const situation = ref<DeviceEraseSituation | null>(null)
  const isConfirmOpen = ref(false)
  const isFinalOpen = ref(false)
  const isErasing = ref(false)

  onMounted(async () => {
    situation.value = await service.situation()
  })

  function proceed(): void {
    if (situation.value === null || isErasing.value) return
    isConfirmOpen.value = true
  }

  function confirmFirst(): void {
    isFinalOpen.value = true
  }

  async function confirmFinal(): Promise<void> {
    if (isErasing.value) return
    isErasing.value = true
    try {
      await service.erase()
    } catch (cause) {
      console.warn('Effacement interrompu :', errorSummary(cause))
      showToast(t('settings.erase.error'), { tone: 'error' })
      isErasing.value = false
    }
  }

  return { situation, isConfirmOpen, isFinalOpen, isErasing, proceed, confirmFirst, confirmFinal }
}
