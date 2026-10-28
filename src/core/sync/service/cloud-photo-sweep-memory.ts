import { errorSummary } from '@/shared/utils/error-summary'
import type { CloudPhotoSweepMemory } from './cloud-photo-sweep'

const STORAGE_KEY = 'memopatte.cloud-photo-sweep-at'

export const cloudPhotoSweepMemory: CloudPhotoSweepMemory = {
  read() {
    try {
      return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
    } catch {
      return null
    }
  },
  write(at) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, at)
    } catch (cause) {
      console.warn('Passage du ménage des photos du cloud non retenu :', errorSummary(cause))
    }
  },
}
