import type { SyncPullPage, SyncableTable } from './syncable-table'

const EPOCH = '1970-01-01T00:00:00.000Z'

/** Toutes les lignes du compte dans la table, tombstones compris, page après page non vide. */
export async function* remotePages(
  table: Pick<SyncableTable, 'pullPage'>,
  userId: string,
  pageSize: number,
): AsyncGenerator<SyncPullPage & { cursor: string }> {
  let since = EPOCH
  let afterId: string | undefined
  for (;;) {
    const page = await table.pullPage(userId, since, pageSize, afterId)
    const lastRow = page.rows.at(-1)
    if (!lastRow || page.cursor === null) return
    yield { ...page, cursor: page.cursor }
    if (page.rows.length < pageSize) return
    since = page.cursor
    afterId = lastRow.id
  }
}
