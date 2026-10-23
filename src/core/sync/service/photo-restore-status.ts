import { computed, shallowRef, type Ref } from 'vue'

const provided = shallowRef<{ isRunning: Readonly<Ref<boolean>> } | null>(null)

/** Branché au démarrage avec la synchro (`app/sync.ts`). */
export function providePhotoRestoreStatus(isRunning: Readonly<Ref<boolean>> | null): void {
  provided.value = isRunning === null ? null : { isRunning }
}

/** Vrai tant que les photos du carnet se téléchargent ; faux tant que la synchro n'est pas branchée. */
export function usePhotosDownloading() {
  return computed(() => provided.value?.isRunning.value ?? false)
}
