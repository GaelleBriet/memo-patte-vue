import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Animal, AnimalInput } from './animal.schema'
import type { AnimalsRepository } from './animals.repository'

/**
 * Fournit le repository au store : l'application injecte celui qui parle à
 * SQLite (`getAnimalsRepository`), les tests un double en mémoire.
 */
export type AnimalsRepositoryProvider = () => AnimalsRepository | Promise<AnimalsRepository>

let provider: AnimalsRepositoryProvider | null = null

/**
 * Branche le store sur son repository, une fois au démarrage de l'application
 * (`main.ts`). Passer `null` le débranche.
 *
 * Le store ne construit pas son repository lui-même : seuls `core/db/` et les
 * repositories ont le droit d'ouvrir la base (cf. CLAUDE.md et la règle ESLint
 * `app/repository-only-data-access`).
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
 * Deux contrats d'erreur, décidés le 2026-09-08 :
 *
 * - `load()` ne lève pas. C'est un appel au montage : l'écran veut afficher une
 *   bannière, pas encadrer son `onMounted` d'un `try/catch`. L'échec se lit
 *   dans `error`.
 * - `create()`, `update()` et `remove()` lèvent. TypeScript n'oblige jamais à
 *   lire une valeur de retour : `await store.create(input); router.back()`
 *   compilait et naviguait sur un échec. Et `error` est un état global : avec
 *   deux opérations en vol, l'écran risquait d'afficher l'erreur de l'autre.
 *   Les écrans de formulaire ont de toute façon leur `try/catch` pour rester
 *   sur le formulaire.
 *
 * `error` ne raconte donc qu'une histoire : celle de la liste affichée.
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
  /** Échec du dernier chargement de la liste. Les écritures lèvent, elles ne passent pas par ici. */
  const error = ref<Error | null>(null)

  const selectedAnimal = computed(
    () => animals.value.find((animal) => animal.id === selectedAnimalId.value) ?? null,
  )

  function requireRepository(): Promise<AnimalsRepository> {
    if (!provider) {
      throw new Error('Repository des animaux absent : appelle provideAnimalsRepository().')
    }
    return Promise.resolve(provider())
  }

  /** Relit la liste : le seul moment où l'état affiché redevient sain, donc où `error` s'efface. */
  async function refresh(repository: AnimalsRepository): Promise<void> {
    animals.value = await repository.list()
    hasLoaded.value = true
    forgetSelectionIfGone()
    error.value = null
  }

  /** Exécute une écriture puis rafraîchit la liste ; l'erreur revient à l'appelant. */
  async function write<T>(operation: (repository: AnimalsRepository) => Promise<T>): Promise<T> {
    isLoading.value = true
    try {
      const repository = await requireRepository()
      const result = await operation(repository)
      await refresh(repository)
      return result
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

    /** Charge (ou recharge) la liste. Ne lève pas : renvoie `false` et renseigne `error`. */
    async load(): Promise<boolean> {
      isLoading.value = true
      try {
        await refresh(await requireRepository())
        return true
      } catch (cause) {
        error.value = cause instanceof Error ? cause : new Error(String(cause))
        return false
      } finally {
        isLoading.value = false
      }
    },

    /** Crée un animal et rafraîchit la liste. Lève si le repository échoue. */
    async create(input: AnimalInput): Promise<Animal> {
      return write((repository) => repository.create(input))
    },

    /** Met à jour un animal et rafraîchit la liste. Lève si le repository échoue. */
    async update(id: string, input: AnimalInput): Promise<Animal> {
      return write((repository) => repository.update(id, input))
    },

    /** Supprime (logiquement) un animal et rafraîchit la liste. Lève si le repository échoue. */
    async remove(id: string): Promise<void> {
      await write((repository) => repository.remove(id))
    },

    /** Change l'animal courant ; `null` signifie « tous les animaux ». */
    select(id: string | null): void {
      selectedAnimalId.value = id
    },
  }
})
