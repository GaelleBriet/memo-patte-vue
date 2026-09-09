/** Une version déjà publiée ne se modifie plus : toute évolution ajoute un `toVersion`. */
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
  {
    toVersion: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS vaccination (
        id TEXT PRIMARY KEY NOT NULL,
        -- Un vaccin appartient toujours à un animal ; la purge éventuelle d'un
        -- animal emporte ses vaccins plutôt que de laisser des lignes orphelines.
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        -- Dates ISO 8601 locales (yyyy-MM-dd) : l'échéance reste facultative,
        -- un vaccin peut être consigné sans prochain rappel connu.
        last_injection_date TEXT NOT NULL,
        due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        -- Suppression logique (ISO 8601 UTC) : NULL tant que le vaccin existe.
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_vaccination_animal_id ON vaccination (animal_id);`,
    ],
  },
  {
    toVersion: 3,
    statements: [
      `CREATE TABLE IF NOT EXISTS weight_entry (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        weight_kg REAL NOT NULL,
        measured_on TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_weight_entry_animal_id ON weight_entry (animal_id);`,
    ],
  },
  {
    toVersion: 4,
    statements: [
      `CREATE TABLE IF NOT EXISTS treatment (
        id TEXT PRIMARY KEY NOT NULL,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('deworming', 'antiparasitic')),
        frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
        frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
        last_dose_date TEXT NOT NULL,
        next_due_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );`,
      `CREATE INDEX IF NOT EXISTS idx_treatment_animal_id ON treatment (animal_id);`,
    ],
  },
]

export const DATABASE_VERSION = migrations.reduce(
  (highest, migration) => Math.max(highest, migration.toVersion),
  0,
)
