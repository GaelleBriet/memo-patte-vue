import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { EXPORTS_DIR, SAVED_EXPORTS_DIR } from '../logic/export-delivery'

const filePaths = readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8')

function exposedPaths(): string[] {
  const body = filePaths.match(/<paths[^>]*>([\s\S]*)<\/paths>/)?.[1] ?? ''
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

describe('file_paths.xml', () => {
  it('n’expose que le dossier du partage et celui des exports enregistrés, pour « Ouvrir »', () => {
    expect(exposedPaths()).toEqual([
      `<cache-path name="exports" path="${EXPORTS_DIR}/" />`,
      `<external-path name="saved-exports" path="Documents/${SAVED_EXPORTS_DIR}/" />`,
    ])
  })
})
