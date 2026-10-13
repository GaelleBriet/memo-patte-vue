/** Une version déjà publiée ne se modifie plus : toute évolution ajoute un `toVersion`. */
export interface DbMigration {
  toVersion: number
  statements: string[]
}

export const TREATMENT_TYPES = ['deworming', 'antiparasitic', 'medication']

export const DOSE_UNITS = [
  'tablet',
  'capsule',
  'pipette',
  'collar',
  'ml',
  'drop',
  'g',
  'sachet',
  'spray',
  'application',
  'dose',
]

/**
 * `DO UPDATE`, jamais `DO NOTHING` : une ligne déjà en file qui change une deuxième fois doit
 * avancer `queued_at`, sinon la garde de fin d'entrée ne verrait pas la nouvelle modification.
 */
export function outboxTriggerStatements(table: string): string[] {
  const upsert = `
      INSERT INTO sync_outbox (entity, entity_id, queued_at)
      VALUES ('${table}', NEW.id, NEW.updated_at)
      ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;`

  return [
    `CREATE TRIGGER ${table}_outbox_insert AFTER INSERT ON ${table}
     WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
     BEGIN${upsert}
     END;`,
    `CREATE TRIGGER ${table}_outbox_update AFTER UPDATE ON ${table}
     WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
     BEGIN${upsert}
     END;`,
  ]
}

export function nameLengthTriggerStatements(table: string, columns: string[]): string[] {
  const tooLong = columns.map((column) => `length(NEW.${column}) > 80`).join(' OR ')
  const abort = `BEGIN SELECT RAISE(ABORT, '${table}: text longer than 80 characters'); END;`

  return [
    `CREATE TRIGGER ${table}_name_length_insert BEFORE INSERT ON ${table}
     WHEN ${tooLong}
     ${abort}`,
    `CREATE TRIGGER ${table}_name_length_update BEFORE UPDATE OF ${columns.join(', ')} ON ${table}
     WHEN ${tooLong}
     ${abort}`,
  ]
}

/** Une liste appelée à grandir : une valeur s'ajoute en recréant le déclencheur, sans toucher la table. */
export function allowedValuesTriggerStatements(
  table: string,
  column: string,
  values: string[],
): string[] {
  const outside = `NEW.${column} NOT IN (${values.map((value) => `'${value}'`).join(', ')})`
  const abort = `BEGIN SELECT RAISE(ABORT, '${table}: ${column} not allowed'); END;`

  return [
    `CREATE TRIGGER ${table}_${column}_insert BEFORE INSERT ON ${table}
     WHEN ${outside}
     ${abort}`,
    `CREATE TRIGGER ${table}_${column}_update BEFORE UPDATE OF ${column} ON ${table}
     WHEN ${outside}
     ${abort}`,
  ]
}
