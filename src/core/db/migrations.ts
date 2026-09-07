/**
 * Migrations versionnées de la base locale `memopatte`.
 *
 * Chaque évolution du schéma ajoute une entrée avec un `toVersion` incrémenté :
 * on ne modifie jamais une version déjà publiée. La liste est passée telle
 * quelle à `addUpgradeStatement` du plugin SQLite (cf. `sqlite.ts`).
 *
 * Exception assumée : la version 1 a été amendée (ajout de `animal.deleted_at`)
 * avant toute release — aucune base installée n'est encore en version 1, une
 * migration v2 n'aurait donc mis à jour aucun appareil réel.
 */
export interface DbMigration {
  toVersion: number
  statements: string[]
}

export const migrations: DbMigration[] = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS animal (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
        breed TEXT,
        birth_date TEXT,
        initial_weight_kg REAL,
        photo_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        -- Suppression logique (ISO 8601 UTC) : NULL tant que l'animal existe.
        -- La synchronisation Plus doit pouvoir propager une suppression entre
        -- appareils ; la purge des lignes marquées viendra après la synchro.
        deleted_at TEXT
      );`,
    ],
  },
]

/** Version cible de la base : la plus haute version connue des migrations. */
export const DATABASE_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.toVersion),
  0,
)
