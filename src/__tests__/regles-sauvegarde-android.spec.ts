import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) =>
  readFileSync(resolve(__dirname, `../../android/app/src/main/res/xml/${name}`), 'utf8')

const EXCLUSIONS = [
  '<exclude domain="file" path="photos/" />',
  '<exclude domain="root" path="app_webview/" />',
  '<exclude domain="sharedpref" path="CapacitorStorage.xml" />',
]

describe('règles de sauvegarde Android', () => {
  it.each([
    ['backup_rules.xml', 1],
    ['data_extraction_rules.xml', 2],
  ])('%s exclut photos, WebView et préférences Capacitor', (name, sections) => {
    const xml = read(name)

    for (const exclusion of EXCLUSIONS) {
      expect(xml.split(exclusion).length - 1).toBe(sections)
    }
  })
})
