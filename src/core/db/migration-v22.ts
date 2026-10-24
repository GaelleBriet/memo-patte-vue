import { requeuedOutboxTriggerStatement, type DbMigration } from './schema-statements'

const OUTBOX_COLUMNS = ['entity', 'entity_id', 'queued_at', 'attempts']

export const migrationV22: DbMigration = {
  toVersion: 22,
  statements: [
    'CREATE TABLE sync_outbox_v21 AS SELECT * FROM sync_outbox',
    'DROP TABLE sync_outbox',

    `CREATE TABLE IF NOT EXISTS sync_outbox (
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        queued_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        refused_at TEXT,
        PRIMARY KEY (entity, entity_id)
      );`,

    `INSERT INTO sync_outbox (${OUTBOX_COLUMNS.join(', ')})
     SELECT ${OUTBOX_COLUMNS.join(', ')} FROM sync_outbox_v21`,
    'DROP TABLE sync_outbox_v21',

    requeuedOutboxTriggerStatement(),
    'PRAGMA user_version = 22',
  ],
}
