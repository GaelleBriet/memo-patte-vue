import { outboxTriggerStatements, type DbMigration } from './schema-statements'

const DOSE_COLUMNS = [
  'id',
  'period_id',
  'treatment_id',
  'animal_id',
  'due_on',
  'due_time',
  'given_on',
  'status',
  'target_on',
  'created_at',
  'updated_at',
  'deleted_at',
  'created_by_device',
  'updated_by_device',
]

// Heures `HH:mm` jointes par une virgule : la position de l'heure dans le texte donne son rang.
const RANK_OF_REPORT = `CASE WHEN old.status <> 'postponed' THEN NULL
       WHEN period.times IS NULL AND old.due_time IS NULL THEN 1
       WHEN old.due_time IS NOT NULL AND instr(period.times, old.due_time) > 0
         THEN (instr(period.times, old.due_time) - 1) / 6 + 1
       ELSE NULL END`

export const migrationV16: DbMigration = {
  toVersion: 16,
  statements: [
    'CREATE TABLE treatment_dose_v15 AS SELECT * FROM treatment_dose',
    'DROP TABLE treatment_dose',

    `CREATE TABLE IF NOT EXISTS treatment_dose (
        id TEXT PRIMARY KEY NOT NULL,
        period_id TEXT NOT NULL REFERENCES treatment_period(id) ON DELETE CASCADE,
        treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
        animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
        due_on TEXT NOT NULL,
        due_time TEXT,
        given_on TEXT,
        status TEXT NOT NULL
          CHECK (status IN ('given', 'missed', 'postponed', 'extra', 'shift', 'not-due')),
        target_on TEXT,
        previous_target_on TEXT,
        previous_target_time TEXT,
        due_rank INTEGER CHECK (due_rank IS NULL OR due_rank >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        created_by_device TEXT NOT NULL,
        updated_by_device TEXT NOT NULL
      );`,

    // L'ancienne arrivée d'un report existant est inconnue ; son rang se lit dans les heures de son réglage.
    `INSERT INTO treatment_dose (${DOSE_COLUMNS.join(', ')}, due_rank)
     SELECT ${DOSE_COLUMNS.map((column) => `old.${column}`).join(', ')}, ${RANK_OF_REPORT}
     FROM treatment_dose_v15 old
     LEFT JOIN treatment_period period ON period.id = old.period_id`,
    'DROP TABLE treatment_dose_v15',

    `CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment
         ON treatment_dose (treatment_id, due_on, due_time);`,
    'CREATE INDEX IF NOT EXISTS idx_treatment_dose_period_id ON treatment_dose (period_id);',
    'CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);',

    ...outboxTriggerStatements('treatment_dose'),
    'PRAGMA user_version = 16',
  ],
}
