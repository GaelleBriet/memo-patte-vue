import {
  REFUSED_FOR_ITSELF,
  REFUSED_WITH_ANCESTOR,
  removedOutboxTriggerStatement,
  requeuedOutboxTriggerStatement,
  type DbMigration,
} from './schema-statements'

const OUTBOX_COLUMNS = ['entity', 'entity_id', 'queued_at', 'attempts', 'refused_at']

export const migrationV23: DbMigration = {
  toVersion: 23,
  statements: [
    'CREATE TABLE sync_outbox_v22 AS SELECT * FROM sync_outbox',
    'DROP TRIGGER IF EXISTS sync_outbox_requeued',
    'DROP TABLE sync_outbox',

    `CREATE TABLE IF NOT EXISTS sync_outbox (
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        queued_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        refused_at TEXT,
        refused_reason TEXT
          CHECK (refused_reason IN ('${REFUSED_FOR_ITSELF}', '${REFUSED_WITH_ANCESTOR}')),
        PRIMARY KEY (entity, entity_id),
        CHECK ((refused_at IS NULL) = (refused_reason IS NULL))
      );`,

    // Une marque de la v22 ne dit pas sa raison : « own » ne la lève jamais avec un parent.
    `INSERT INTO sync_outbox (${OUTBOX_COLUMNS.join(', ')}, refused_reason)
     SELECT ${OUTBOX_COLUMNS.join(', ')},
       CASE WHEN refused_at IS NOT NULL THEN '${REFUSED_FOR_ITSELF}' END
     FROM sync_outbox_v22`,
    'DROP TABLE sync_outbox_v22',

    requeuedOutboxTriggerStatement(),
    removedOutboxTriggerStatement(),
    'PRAGMA user_version = 23',
  ],
}
