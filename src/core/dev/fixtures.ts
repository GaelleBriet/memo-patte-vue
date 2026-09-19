import { clearAllTables } from '@/core/db/clear-all-tables'
import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { getWeightRepository, type WeightRepository } from '@/features/weight/weight.repository'
import { buildDemoCarnet, DEMO_CARNET_MARKER } from './demo-carnet'

/**
 * Fixtures de développement : un point de départ commun entre `pnpm dev`
 * (navigateur) et `pnpm dev:mobile` (téléphone), qui suit le même serveur.
 *
 * Le mode est porté par `VITE_FIXTURES`, posée par le script npm avec un jeton
 * unique par démarrage (`maquettes-<horodatage>`). À chaque chargement de page
 * le jeton est comparé à celui mémorisé en `localStorage` : différent → la base
 * est vidée puis peuplée si le mode est « maquettes » ; identique → rien. Un F5
 * ne détruit donc jamais ce qu'on a saisi à la main pendant la session.
 *
 * Ce module n'est importé que derrière `import.meta.env.DEV` (`main.ts`) : il
 * tombe au build de production, un test le prouve. Il ne passe pas par i18n :
 * aucun texte n'est vu par un utilisateur.
 */

export const FIXTURES_STORAGE_KEY = 'memo-patte:fixtures-token'

/**
 * Jeton mémorisé quand la variable est absente. Constant et non horodaté pour
 * que « `pnpm dev:data` puis `pnpm dev` » vide bien la base (jeton différent),
 * mais qu'un second `pnpm dev`, ou un F5, ne la vide pas à nouveau (jeton égal).
 */
export const EMPTY_FIXTURES_TOKEN = 'empty'

const DEMO_TOKEN_PREFIX = 'maquettes'

/** Seule la création est nécessaire : le module ne lit ni ne modifie rien. */
export interface FixturesRepositories {
  animals: Pick<AnimalsRepository, 'create'>
  vaccinations: Pick<VaccinationsRepository, 'create'>
  treatments: Pick<TreatmentsRepository, 'create'>
  weight: Pick<WeightRepository, 'create'>
}

export interface ApplyFixturesOptions {
  /** Valeur de `VITE_FIXTURES`, `undefined` quand la variable est absente. */
  token: string | undefined
  storage: Pick<Storage, 'getItem' | 'setItem'>
  db: DbClient
  repositories: FixturesRepositories
  today?: Date
}

export type FixturesOutcome = 'unchanged' | 'reset' | 'seeded'

export async function applyFixtures({
  token,
  storage,
  db,
  repositories,
  today = new Date(),
}: ApplyFixturesOptions): Promise<FixturesOutcome> {
  const requested = token ?? EMPTY_FIXTURES_TOKEN
  if (storage.getItem(FIXTURES_STORAGE_KEY) === requested) return 'unchanged'

  await clearAllTables(db)
  const seed = requested.startsWith(DEMO_TOKEN_PREFIX)
  if (seed) await seedDemoCarnet(repositories, today)

  // Mémorisé en dernier : un échec plus haut laisse l'ancien jeton, et le
  // prochain chargement réessaie au lieu de croire la base prête.
  // Si `setItem` lève (stockage plein ou bloqué), la base est déjà prête mais le
  // jeton n'est pas gardé : le prochain chargement la remet à zéro et la repeuple.
  storage.setItem(FIXTURES_STORAGE_KEY, requested)
  return seed ? 'seeded' : 'reset'
}

/** Peuple par les repositories, jamais par SQL direct : les schémas Zod valident le jeu. */
async function seedDemoCarnet(repositories: FixturesRepositories, today: Date): Promise<void> {
  for (const { animal, vaccinations, treatments, weights } of buildDemoCarnet(today)) {
    const { id: animalId } = await repositories.animals.create(animal)
    for (const vaccination of vaccinations) {
      await repositories.vaccinations.create({ ...vaccination, animalId })
    }
    for (const treatment of treatments) {
      await repositories.treatments.create({ ...treatment, animalId })
    }
    for (const weight of weights) {
      await repositories.weight.create({ ...weight, animalId })
    }
  }
}

/**
 * Câblage pour `main.ts`, avant `app.mount` : les stores lisent une base déjà
 * prête. Un échec est journalisé sans être propagé, l'app se monte quand même.
 */
export async function applyDevFixtures(): Promise<void> {
  try {
    const [db, animals, vaccinations, treatments, weight] = await Promise.all([
      getDb(),
      getAnimalsRepository(),
      getVaccinationsRepository(),
      getTreatmentsRepository(),
      getWeightRepository(),
    ])
    await applyFixtures({
      token: import.meta.env.VITE_FIXTURES,
      storage: localStorage,
      db,
      repositories: { animals, vaccinations, treatments, weight },
    })
  } catch (error) {
    console.error(`[${DEMO_CARNET_MARKER}] Fixtures de développement non appliquées :`, error)
  }
}
