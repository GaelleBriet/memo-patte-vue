import { computed, onMounted } from 'vue'

import { useAnimalsStore } from '@/features/animals/store/animals.store'

export function useExportAvailability() {
  const animals = useAnimalsStore()

  onMounted(() => {
    if (!animals.hasLoaded) void animals.load()
  })

  return {
    hasLoadFailed: computed(() => animals.error !== null),
    hasNothingToExport: computed(() => animals.hasLoaded && animals.animals.length === 0),
    canExport: computed(() => animals.hasLoaded && animals.animals.length > 0),
    retryLoad: () => void animals.load(),
  }
}
