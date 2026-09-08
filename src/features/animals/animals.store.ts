import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Animal, AnimalInput } from './animal.schema'
import type { AnimalsRepository } from './animals.repository'

/**
 * Fournit le repository au store : l'application injecte celui qui parle à
 * SQLite, les tests un double en mémoire.
 */
export type AnimalsRepositoryProvider = () => AnimalsRepository | Promise<AnimalsRepository>

let provider: AnimalsRepositoryProvider | null = null

/**
 * Branche le store sur son repository, une fois au démarrage de l'application.
 *
 * Le store ne construit pas son repository lui-même : seuls `core/db/` et les
 * repositories ont le droit d'ouvrir la base (cf. CLAUDE.md et la règle ESLint
 * `app/repository-only-data-access`). Passer `null` débranche le store.
 */
export function provideAnimalsRepository(next: AnimalsRepositoryProvider | null): void {
  provider = next
}

/**
 * État « animaux » partagé par les écrans.
 *
 * Seul point de consommation d'`animals.repository.ts` côté UI : aucun
 * composant ne parle au repository, et le store ne connaît ni SQL ni Supabase.
 * Il délègue, puis relit la liste pour rester aligné sur le filtrage et l'ordre
 * du repository (animaux vivants, triés par nom).
 *
 * Les actions ne lèvent jamais : une erreur du repository est rangée dans
 * `error` et l'appelant la reconnaît au retour (`null` ou `false`), pour qu'un
 * échec de base ne casse pas l'écran qui l'a déclenché.
 */
export const useAnimalsStore = defineStore('animals', () => {
  /** Animaux vivants, dans l'ordre donné par le repository (nom, casse ignorée). */
  const animals = ref<Animal[]>([])
  /** `null` = « tous les animaux » : l'accueil s'en sert de filtre, le Carnet garde toujours un animal actif. */
  const selectedAnimalId = ref<string | null>(null)
  /** Vrai pendant toute opération, chargement comme écriture. */
  const isLoading = ref(false)
  /** Vrai dès qu'un chargement a abouti : distingue « pas encore chargé » de « aucun animal ». */
  const hasLoaded = ref(false)
  /** Dernière erreur du repository, remise à `null` au début de l'opération suivante. */
  const error = ref<Error | null>(null)

  const selectedAnimal = computed(
    () => animals.value.find((animal) => animal.id === selectedAnimalId.value) ?? null,
  )

  /** Exécute une opération puis relit la liste ; toute erreur atterrit dans `error`. */
  async function run<T>(
    operation: (repository: AnimalsRepository) => Promise<T>,
  ): Promise<T | null> {
    isLoading.value = true
    error.value = null
    try {
      if (!provider) {
        throw new Error('Repository des animaux absent : appelle provideAnimalsRepository().')
      }
      const repository = await provider()
      const result = await operation(repository)
      animals.value = await repository.list()
      hasLoaded.value = true
      forgetSelectionIfGone()
      return result
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
      return null
    } finally {
      isLoading.value = false
    }
  }

  /** Un animal disparu de la liste ne doit pas rester « sélectionné » dans le vide. */
  function forgetSelectionIfGone(): void {
    if (selectedAnimal.value === null) {
      selectedAnimalId.value = null
    }
  }

  return {
    animals,
    selectedAnimalId,
    selectedAnimal,
    isLoading,
    hasLoaded,
    error,

    /** Charge (ou recharge) la liste. Renvoie `false` si le repository a échoué. */
    async load(): Promise<boolean> {
      return (await run(async () => true)) ?? false
    },

    /** Crée un animal et rafraîchit la liste. Renvoie `null` en cas d'échec. */
    async create(input: AnimalInput): Promise<Animal | null> {
      return run((repository) => repository.create(input))
    },

    /** Met à jour un animal et rafraîchit la liste. Renvoie `null` en cas d'échec. */
    async update(id: string, input: AnimalInput): Promise<Animal | null> {
      return run((repository) => repository.update(id, input))
    },

    /** Supprime (logiquement) un animal et rafraîchit la liste. */
    async remove(id: string): Promise<boolean> {
      const removed = await run(async (repository) => {
        await repository.remove(id)
        return true
      })
      return removed ?? false
    },

    /** Change l'animal courant ; `null` signifie « tous les animaux ». */
    select(id: string | null): void {
      selectedAnimalId.value = id
    },
  }
})
