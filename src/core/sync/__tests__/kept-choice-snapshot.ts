import type { RestoreChoiceSnapshot } from '../service/restore-choice-snapshot'

export function keptChoiceSnapshot(): RestoreChoiceSnapshot {
  let kept: string | null = null
  return {
    read: () => kept,
    save: (fingerprint) => {
      kept = fingerprint
    },
    clear: () => {
      kept = null
    },
  }
}
