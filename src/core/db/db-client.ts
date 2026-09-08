export interface DbClient {
  /** Renvoie le nombre de lignes modifiées. */
  run(sql: string, params?: SqlParam[]): Promise<number>
  /** Applique toutes les instructions, ou aucune. */
  runMany(statements: SqlStatement[]): Promise<void>
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]>
  execute(sql: string): Promise<void>
}

export interface SqlStatement {
  sql: string
  params?: SqlParam[]
}

export type SqlParam = string | number | null
