export type WriteQueue = <T>(task: () => Promise<T>) => Promise<T>

/** Une écriture à la fois : chacune relit ce que la précédente a écrit, qu'elle ait réussi ou non. */
export function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve()
  return (task) => {
    const result = tail.then(task)
    tail = result.catch(() => undefined)
    return result
  }
}

/** Partagée par les gestes et leurs « Annuler », fiche comme notification. */
export const treatmentWriteQueue = createWriteQueue()
