import { ANIMAL_PHOTO_ENTITY, type DbMigration } from './schema-statements'

export const migrationV21: DbMigration = {
  toVersion: 21,
  statements: [
    // La v18 datait ces entrées par l'animal : `INSERT OR REPLACE` les redate sans `UPDATE`,
    // que le plugin Android ne joue pas pendant une mise à niveau.
    `INSERT OR REPLACE INTO sync_outbox (entity, entity_id, queued_at, attempts)
     SELECT entity, entity_id, max(queued_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), attempts
     FROM sync_outbox WHERE entity = '${ANIMAL_PHOTO_ENTITY}'`,
    'PRAGMA user_version = 21',
  ],
}
