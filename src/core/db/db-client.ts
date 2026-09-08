export interface DbClient {
  /** Renvoie le nombre de lignes modifiées. */
  run(sql: string, params?: SqlParam[]): Promise<number>
  query<T>(sql: string, params?: SqlParam[]): Promise<T[]>
  execute(sql: string): Promise<void>
}

export type SqlParam = string | number | null
