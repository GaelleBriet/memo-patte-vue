import { replacedPhotoOutboxTriggerStatement, type DbMigration } from './schema-statements'

export const migrationV19: DbMigration = {
  toVersion: 19,
  statements: [replacedPhotoOutboxTriggerStatement(), 'PRAGMA user_version = 19'],
}
