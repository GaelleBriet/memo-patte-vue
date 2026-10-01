import type { InMemoryDb } from './in-memory-db'

/** Schéma d'une base v8 telle qu'installée sur les téléphones, relevé dans `sqlite_master`. */
const SCHEMA_V8 = [
  `CREATE TABLE animal (
id TEXT PRIMARY KEY NOT NULL,
name TEXT NOT NULL,
species TEXT NOT NULL CHECK (species IN ('dog', 'cat')),
breed TEXT,
birth_date TEXT,
initial_weight_kg REAL,
photo_path TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
)`,
  `CREATE TABLE weight_entry (
id TEXT PRIMARY KEY NOT NULL,
animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
weight_kg REAL NOT NULL,
measured_on TEXT NOT NULL,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
)`,
  `CREATE INDEX idx_weight_entry_animal_id ON weight_entry (animal_id)`,
  `CREATE TABLE sync_outbox (
entity TEXT NOT NULL,
entity_id TEXT NOT NULL,
queued_at TEXT NOT NULL,
attempts INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (entity, entity_id)
)`,
  `CREATE TABLE sync_state (
id INTEGER PRIMARY KEY CHECK (id = 1),
enabled INTEGER NOT NULL DEFAULT 0,
last_pulled_at TEXT,
restoring INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE TRIGGER animal_outbox_insert AFTER INSERT ON animal
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('animal', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER animal_outbox_update AFTER UPDATE ON animal
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('animal', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER weight_entry_outbox_insert AFTER INSERT ON weight_entry
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('weight_entry', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER weight_entry_outbox_update AFTER UPDATE ON weight_entry
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('weight_entry', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TABLE vaccination (
id TEXT PRIMARY KEY NOT NULL,
animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
name TEXT NOT NULL,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
)`,
  `CREATE TABLE vaccination_injection (
id TEXT PRIMARY KEY NOT NULL,
vaccination_id TEXT NOT NULL REFERENCES vaccination(id) ON DELETE CASCADE,
animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
injected_on TEXT NOT NULL,
next_due_date TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
)`,
  `CREATE TABLE treatment (
id TEXT PRIMARY KEY NOT NULL,
animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
name TEXT NOT NULL,
type TEXT NOT NULL CHECK (type IN ('deworming', 'antiparasitic')),
frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
stopped_on TEXT,
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
)`,
  `CREATE TABLE treatment_dose (
id TEXT PRIMARY KEY NOT NULL,
treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
given_on TEXT NOT NULL,
next_due_date TEXT NOT NULL,
frequency_value INTEGER NOT NULL CHECK (frequency_value > 0),
frequency_unit TEXT NOT NULL CHECK (frequency_unit IN ('day', 'week', 'month')),
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL,
deleted_at TEXT
)`,
  `CREATE INDEX idx_vaccination_animal_id ON vaccination (animal_id)`,
  `CREATE INDEX idx_vaccination_injection_vaccination
ON vaccination_injection (vaccination_id, injected_on)`,
  `CREATE INDEX idx_vaccination_injection_animal_id
ON vaccination_injection (animal_id)`,
  `CREATE INDEX idx_treatment_animal_id ON treatment (animal_id)`,
  `CREATE INDEX idx_treatment_dose_treatment
ON treatment_dose (treatment_id, given_on)`,
  `CREATE INDEX idx_treatment_dose_animal_id ON treatment_dose (animal_id)`,
  `CREATE TRIGGER vaccination_outbox_insert AFTER INSERT ON vaccination
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('vaccination', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER vaccination_outbox_update AFTER UPDATE ON vaccination
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('vaccination', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER vaccination_injection_outbox_insert AFTER INSERT ON vaccination_injection
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('vaccination_injection', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER vaccination_injection_outbox_update AFTER UPDATE ON vaccination_injection
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('vaccination_injection', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER treatment_outbox_insert AFTER INSERT ON treatment
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('treatment', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER treatment_outbox_update AFTER UPDATE ON treatment
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('treatment', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER treatment_dose_outbox_insert AFTER INSERT ON treatment_dose
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('treatment_dose', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TRIGGER treatment_dose_outbox_update AFTER UPDATE ON treatment_dose
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
INSERT INTO sync_outbox (entity, entity_id, queued_at)
VALUES ('treatment_dose', NEW.id, NEW.updated_at)
ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END`,
  `CREATE TABLE sync_pull_cursor (
entity TEXT PRIMARY KEY NOT NULL,
last_pulled_at TEXT NOT NULL
)`,
  `CREATE TRIGGER animal_name_length_insert BEFORE INSERT ON animal
WHEN length(NEW.name) > 80 OR length(NEW.breed) > 80
BEGIN SELECT RAISE(ABORT, 'animal: text longer than 80 characters'); END`,
  `CREATE TRIGGER animal_name_length_update BEFORE UPDATE OF name, breed ON animal
WHEN length(NEW.name) > 80 OR length(NEW.breed) > 80
BEGIN SELECT RAISE(ABORT, 'animal: text longer than 80 characters'); END`,
  `CREATE TRIGGER vaccination_name_length_insert BEFORE INSERT ON vaccination
WHEN length(NEW.name) > 80
BEGIN SELECT RAISE(ABORT, 'vaccination: text longer than 80 characters'); END`,
  `CREATE TRIGGER vaccination_name_length_update BEFORE UPDATE OF name ON vaccination
WHEN length(NEW.name) > 80
BEGIN SELECT RAISE(ABORT, 'vaccination: text longer than 80 characters'); END`,
  `CREATE TRIGGER treatment_name_length_insert BEFORE INSERT ON treatment
WHEN length(NEW.name) > 80
BEGIN SELECT RAISE(ABORT, 'treatment: text longer than 80 characters'); END`,
  `CREATE TRIGGER treatment_name_length_update BEFORE UPDATE OF name ON treatment
WHEN length(NEW.name) > 80
BEGIN SELECT RAISE(ABORT, 'treatment: text longer than 80 characters'); END`,
]

export async function createVersion8Schema(db: InMemoryDb): Promise<void> {
  await db.runMany([
    ...SCHEMA_V8.map((sql) => ({ sql })),
    {
      sql: 'INSERT INTO sync_state (id, enabled, last_pulled_at, restoring) VALUES (1, 0, NULL, 0)',
    },
  ])
  await db.execute('PRAGMA user_version = 8')
}
