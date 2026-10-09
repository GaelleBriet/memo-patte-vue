import { getTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { getVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { backfillCareSignal, isCareBackfillDone } from '@/core/usage/usage-signals'

type Provider<T> = () => T | Promise<T>
type CareRows = { listAll: () => Promise<{ createdAt: string }[]> }

export function createCareSignalBackfill(deps: {
  vaccinations: Provider<CareRows>
  treatments: Provider<CareRows>
}): () => Promise<void> {
  return async () => {
    if (isCareBackfillDone()) return
    try {
      const [vaccinations, treatments] = await Promise.all([deps.vaccinations(), deps.treatments()])
      const rows = (await Promise.all([vaccinations.listAll(), treatments.listAll()])).flat()
      const oldest = rows.map((row) => row.createdAt).sort()[0] ?? null
      backfillCareSignal(oldest)
    } catch (cause) {
      console.warn('Rattrapage du premier soin impossible :', cause)
    }
  }
}

/** Au démarrage : date le premier soin d'un carnet rempli avant le signal `care`. Ne lève pas. */
export const backfillCareSignalOnLaunch = createCareSignalBackfill({
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
})
