import { describe, expect, it } from 'vitest'

import { EXPORT_SCHEMA_VERSION } from '../logic/export-format'
import { parseExportFile } from '../service/data-import.service'

/** Un vrai fichier par format publié : un nouveau format s'ajoute ici, aucun ne s'en retire. */
const PUBLISHED_EXPORTS = import.meta.glob<string>('./fixtures/export-v*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const IMPORTEUR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function versionOf(text: string): number {
  return (JSON.parse(text) as { schemaVersion: number }).schemaVersion
}

describe('formats d’export connus', () => {
  it('garde un fichier de chaque format, du premier au format courant', () => {
    const versions = Object.values(PUBLISHED_EXPORTS).map(versionOf)

    expect([...new Set(versions)].sort()).toEqual(
      Array.from({ length: EXPORT_SCHEMA_VERSION }, (_, index) => index + 1),
    )
  })

  it.each(Object.entries(PUBLISHED_EXPORTS))('relit %s sans rien perdre', (_, text) => {
    const result = parseExportFile(text, () => IMPORTEUR)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.data.animals.length).toBeGreaterThan(0)
    expect(Object.values(result.lost ?? {}).every((count) => count === 0)).toBe(true)
  })
})
