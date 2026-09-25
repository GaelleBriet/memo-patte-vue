import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { EXPORTS_DIR, SAVED_EXPORTS_DIR } from '../logic/export-delivery'

const filePaths = readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8')

describe('file_paths.xml', () => {
  it('n’ouvre au partage que le dossier où l’export est écrit', () => {
    expect(filePaths).toContain(`<cache-path name="exports" path="${EXPORTS_DIR}/" />`)
  })

  it('n’expose du stockage externe que le dossier des exports enregistrés, pour « Ouvrir »', () => {
    expect(filePaths.match(/<external-[^>]*>/g)).toEqual([
      `<external-path name="saved-exports" path="Documents/${SAVED_EXPORTS_DIR}/" />`,
    ])
  })

  it('n’expose ni la racine du cache ni celle du stockage', () => {
    expect(filePaths).not.toMatch(/path="\.?\/?"/)
    expect(filePaths).not.toContain('root-path')
  })
})
