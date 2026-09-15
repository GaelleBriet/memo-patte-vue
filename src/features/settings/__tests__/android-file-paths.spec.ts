import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const filePaths = readFileSync('android/app/src/main/res/xml/file_paths.xml', 'utf8')

describe('file_paths.xml', () => {
  it('n’ouvre au partage que le dossier des exports', () => {
    expect(filePaths).toContain('<cache-path name="exports" path="exports/" />')
    expect(filePaths).not.toContain('path="."')
  })

  it('n’expose rien du stockage externe : aucun fichier de l’app n’y vit', () => {
    expect(filePaths).not.toContain('external-path')
  })
})
