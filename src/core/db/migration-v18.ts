import {
  LIVE_ANIMAL_PHOTOS_SELECT,
  photoOutboxTriggerStatements,
  type DbMigration,
} from './schema-statements'

export const migrationV18: DbMigration = {
  toVersion: 18,
  statements: [
    ...photoOutboxTriggerStatements(),
    `INSERT OR IGNORE INTO sync_outbox (entity, entity_id, queued_at)
     ${LIVE_ANIMAL_PHOTOS_SELECT} AND (SELECT enabled FROM sync_state WHERE id = 1) = 1`,
    'PRAGMA user_version = 18',
  ],
}
