import { removedOutboxTriggerStatement, type DbMigration } from './schema-statements'

export const migrationV23: DbMigration = {
  toVersion: 23,
  statements: [removedOutboxTriggerStatement(), 'PRAGMA user_version = 23'],
}
