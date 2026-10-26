import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  resolve(__dirname, '../../.github/workflows/supabase-migrations.yml'),
  'utf8',
)

function positionOf(fragment: string): number {
  const index = workflow.indexOf(fragment)
  expect(index, `absent du workflow : ${fragment}`).toBeGreaterThanOrEqual(0)
  return index
}

describe('workflow des migrations Supabase', () => {
  it('sauvegarde rôles, schéma et données avant d’appliquer les migrations', () => {
    const push = positionOf('supabase db push')

    for (const dump of [
      'supabase db dump --db-url "$SUPABASE_DB_URL" --role-only',
      'supabase db dump --db-url "$SUPABASE_DB_URL" -f',
      'supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy',
    ]) {
      expect(positionOf(dump)).toBeLessThan(push)
    }
  })

  it('masque le mot de passe encodé avant toute commande qui s’en sert', () => {
    const mask = positionOf('::add-mask::${encoded_password}')

    expect(mask).toBeLessThan(positionOf('SUPABASE_DB_URL='))
    expect(mask).toBeLessThan(positionOf('supabase db dump'))
  })

  it('ne publie pas la sauvegarde : elle contient les comptes et le dépôt est public', () => {
    expect(workflow).not.toMatch(/upload-artifact|actions\/cache/)
  })
})
