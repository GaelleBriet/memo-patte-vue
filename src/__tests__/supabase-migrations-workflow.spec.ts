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

function stepNamed(name: string): string {
  const start = positionOf(`- name: ${name}`)
  const next = workflow.indexOf('\n      - ', start + 1)
  return workflow.slice(start, next === -1 ? undefined : next)
}

const backupStep = () => stepNamed('Sauvegarder la base')
const pushStep = () => stepNamed('Appliquer les migrations en attente')

describe('workflow des migrations Supabase : durcissement', () => {
  it('épingle chaque action par SHA de commit', () => {
    const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1])

    expect(uses.length).toBeGreaterThan(0)
    for (const action of uses) {
      expect(action).toMatch(/@[0-9a-f]{40}$/)
    }
  })

  it('fige le CLI Supabase et garde les droits, l’environnement et la branche', () => {
    expect(workflow).toMatch(/version: \d+\.\d+\.\d+/)
    expect(workflow).not.toMatch(/version: latest/)
    expect(workflow).toMatch(/permissions:\n {2}contents: read\n\n/)
    expect(workflow).toContain('environment: production')
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'")
  })

  it('borne la durée du job', () => {
    expect(workflow).toMatch(/timeout-minutes: \d+/)
  })
})

describe('workflow des migrations Supabase : sauvegarde avant migration', () => {
  it('sauvegarde rôles, schéma et données dans une étape qui précède la migration', () => {
    const backup = backupStep()

    expect(backup).toMatch(/supabase db dump --db-url "\$db_url" --role-only -f/)
    expect(backup).toMatch(/supabase db dump --db-url "\$db_url" -f "\$backup_dir\/schema\.sql"/)
    expect(backup).toMatch(/supabase db dump --db-url "\$db_url" --data-only --use-copy/)
    expect(positionOf('- name: Sauvegarder la base')).toBeLessThan(
      positionOf('- name: Appliquer les migrations en attente'),
    )
    expect(pushStep()).not.toContain('supabase db dump')
  })

  it('exclut les tables vectorielles de Storage du vidage des données, comme la doc Supabase', () => {
    expect(backupStep()).toContain('-x "storage.buckets_vectors" -x "storage.vector_indexes"')
  })

  it('arrête le job à la première erreur et refuse un vidage vide', () => {
    const backup = backupStep()

    expect(backup).toContain('shell: bash')
    expect(backup.indexOf('set -euo pipefail')).toBeGreaterThanOrEqual(0)
    expect(backup.indexOf('set -euo pipefail')).toBeLessThan(backup.indexOf('supabase db dump'))
    for (const file of ['roles.sql', 'schema.sql', 'data.sql']) {
      expect(backup).toContain(`test -s "$backup_dir/${file}"`)
    }
    expect(pushStep()).toContain('shell: bash')
    expect(pushStep()).toContain('set -euo pipefail')
  })

  it('masque le mot de passe encodé avant de s’en servir, dans chaque étape', () => {
    for (const step of [backupStep(), pushStep()]) {
      const mask = step.indexOf('echo "::add-mask::$encoded_password"')

      expect(mask).toBeGreaterThanOrEqual(0)
      expect(mask).toBeLessThan(step.indexOf('db_url='))
    }
  })

  it('n’écrit jamais l’adresse de connexion dans les journaux', () => {
    expect(workflow).not.toMatch(/set -x|set -o xtrace|--debug|--dry-run/)
    expect(workflow).not.toMatch(/echo[^\n]*(db_url|SUPABASE_DB_PASSWORD|SUPABASE_POOLER_HOST)/)
    expect(workflow).not.toMatch(/GITHUB_ENV|GITHUB_OUTPUT/)
  })

  it('ne publie pas la sauvegarde tant que son stockage privé n’est pas tranché', () => {
    expect(workflow).not.toMatch(/upload-artifact|actions\/cache/)
  })
})
