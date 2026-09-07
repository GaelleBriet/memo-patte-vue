/**
 * Migrations versionnées de la base locale `memopatte`.
 *
 * Chaque évolution du schéma ajoute une entrée avec un `toVersion` incrémenté :
 * on ne modifie jamais une version déjà publiée. La liste est passée telle
 * quelle à `addUpgradeStatement` du plugin SQLite (cf. `sqlite.ts`).
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
        updated_at TEXT NOT NULL
      );`,
    ],
  },
]

/** Version cible de la base : la plus haute version connue des migrations. */
export const DATABASE_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.toVersion),
  0,
)
