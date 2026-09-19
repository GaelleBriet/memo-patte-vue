import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { EXPORTS_DIR } from '../logic/export-delivery'

const filePaths = readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8')

describe('file_paths.xml', () => {
  it('n’ouvre au partage que le dossier où l’export est écrit', () => {
    expect(filePaths).toContain(`<cache-path name="exports" path="${EXPORTS_DIR}/" />`)
  })

  it('n’expose ni la racine du cache ni le stockage externe', () => {
    expect(filePaths).not.toMatch(/path="\.?"/)
    expect(filePaths).not.toContain('external-path')
  })
})
