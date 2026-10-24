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

/**
 * Une entrée par photo à envoyer ou à effacer du cloud, désignée par son nom de fichier, qui est
 * aussi son nom dans le cloud.
 */
export const ANIMAL_PHOTO_ENTITY = 'animal_photo'

const LIVE_ANIMAL_PHOTO = `(SELECT enabled FROM sync_state WHERE id = 1) = 1
     AND NEW.photo_path IS NOT NULL AND NEW.deleted_at IS NULL`

/** Les photos que le carnet désigne : celles des animaux non supprimés. */
export const LIVE_ANIMAL_PHOTOS_FROM =
  'FROM animal WHERE photo_path IS NOT NULL AND deleted_at IS NULL'

/** Photos des animaux non supprimés, mises en file par la migration v18. */
export const LIVE_ANIMAL_PHOTOS_SELECT = `SELECT '${ANIMAL_PHOTO_ENTITY}', photo_path, updated_at
     ${LIVE_ANIMAL_PHOTOS_FROM}`

export function photoOutboxTriggerStatements(): string[] {
  const upsert = `
      INSERT INTO sync_outbox (entity, entity_id, queued_at)
      VALUES ('${ANIMAL_PHOTO_ENTITY}', NEW.photo_path, NEW.updated_at)
      ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;`

  return [
    `CREATE TRIGGER ${ANIMAL_PHOTO_ENTITY}_outbox_insert AFTER INSERT ON animal
     WHEN ${LIVE_ANIMAL_PHOTO}
     BEGIN${upsert}
     END;`,
    `CREATE TRIGGER ${ANIMAL_PHOTO_ENTITY}_outbox_update AFTER UPDATE OF photo_path ON animal
     WHEN ${LIVE_ANIMAL_PHOTO} AND NEW.photo_path IS NOT OLD.photo_path
     BEGIN${upsert}
     END;`,
  ]
}

/** La photo remplacée ou retirée d'un animal non supprimé repart en file, pour sortir du cloud. */
export function replacedPhotoOutboxTriggerStatement(): string {
  return `CREATE TRIGGER ${ANIMAL_PHOTO_ENTITY}_outbox_replaced AFTER UPDATE OF photo_path ON animal
     WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
       AND OLD.photo_path IS NOT NULL AND NEW.deleted_at IS NULL
       AND NEW.photo_path IS NOT OLD.photo_path
     BEGIN
      INSERT INTO sync_outbox (entity, entity_id, queued_at)
      VALUES ('${ANIMAL_PHOTO_ENTITY}', OLD.photo_path, NEW.updated_at)
      ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
     END;`
}

/** Chaque ancêtre d'une ligne synchronisée, par sa colonne : les clés étrangères du schéma. */
export const SYNC_PARENT_COLUMNS: Record<string, Record<string, string>> = {
  vaccination: { animal_id: 'animal' },
  vaccination_injection: { vaccination_id: 'vaccination', animal_id: 'animal' },
  treatment: { animal_id: 'animal' },
  treatment_period: { treatment_id: 'treatment', animal_id: 'animal' },
  treatment_dose: { period_id: 'treatment_period', treatment_id: 'treatment', animal_id: 'animal' },
  weight_entry: { animal_id: 'animal' },
}

/** Une entrée remise en file n'est plus refusée, ni ses descendants : ils repartent avec elle. */
export function requeuedOutboxTriggerStatement(): string {
  const descendants = Object.entries(SYNC_PARENT_COLUMNS)
    .flatMap(([child, parents]) =>
      Object.entries(parents).map(
        ([column, parent]) => `(NEW.entity = '${parent}' AND entity = '${child}'
          AND entity_id IN (SELECT id FROM ${child} WHERE ${column} = NEW.entity_id))`,
      ),
    )
    .join(' OR ')
  return `CREATE TRIGGER sync_outbox_requeued AFTER UPDATE OF queued_at ON sync_outbox
     WHEN NEW.refused_at IS NOT NULL AND NEW.queued_at IS NOT OLD.queued_at
     BEGIN
      UPDATE sync_outbox SET refused_at = NULL
      WHERE (entity = NEW.entity AND entity_id = NEW.entity_id)
        OR (refused_at IS NOT NULL AND (${descendants}));
     END;`
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
