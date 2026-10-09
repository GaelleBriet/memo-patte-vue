import type { z } from 'zod'

type IssueCode = z.core.$ZodIssue['code']

/** Clé de message d'un champ ; le motif porté par le message l'emporte sur le code de l'erreur. */
export interface FieldErrorKeys {
  key: string
  byCode?: Partial<Record<IssueCode, string>>
  byMessage?: Readonly<Record<string, string>>
}

export interface FieldErrorsOptions<F extends string> {
  /** Sans table, le chemin de l'erreur est le nom du champ. */
  fieldOfPath?: Readonly<Record<string, F>>
}

function keyOf({ key, byCode, byMessage }: FieldErrorKeys, issue: z.core.$ZodIssue): string {
  const reason =
    byMessage !== undefined && Object.hasOwn(byMessage, issue.message)
      ? byMessage[issue.message]
      : undefined

  return reason ?? byCode?.[issue.code] ?? key
}

function fieldOf<F extends string>(
  path: string,
  rules: Readonly<Record<F, FieldErrorKeys>>,
  fieldOfPath: Readonly<Record<string, F>> | undefined,
): F | undefined {
  if (fieldOfPath === undefined) return Object.hasOwn(rules, path) ? (path as F) : undefined

  return Object.hasOwn(fieldOfPath, path) ? fieldOfPath[path] : undefined
}

export function fieldErrorsOf<F extends string>(
  issues: readonly z.core.$ZodIssue[],
  rules: Readonly<Record<F, FieldErrorKeys>>,
  { fieldOfPath }: FieldErrorsOptions<F> = {},
): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {}

  for (const issue of issues) {
    const field = fieldOf(String(issue.path[0]), rules, fieldOfPath)
    if (field === undefined) continue

    errors[field] ??= keyOf(rules[field], issue)
  }

  return errors
}
