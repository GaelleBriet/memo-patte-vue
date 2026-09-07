/**
 * Interface minimale d'accès à la base SQLite locale.
 *
 * Les repositories dépendent uniquement de cette interface, jamais de
 * `@capacitor-community/sqlite` : cela garde le plugin confiné dans `core/db/`
 * et permet de tester les repositories sur un vrai moteur SQL en mémoire.
 */
export interface DbClient {
  /** Exécute une instruction paramétrée (INSERT/UPDATE/DELETE) et renvoie le nombre de lignes modifiées. */
  run(sql: string, params?: SqlParam[]): Promise<number>
  /** Exécute une requête paramétrée et renvoie les lignes brutes (colonnes en snake_case). */
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]>
  /** Exécute une ou plusieurs instructions sans paramètre (migrations, PRAGMA). */
  execute(sql: string): Promise<void>
}

/** Types de valeurs acceptés comme paramètres liés d'une requête. */
export type SqlParam = string | number | null
