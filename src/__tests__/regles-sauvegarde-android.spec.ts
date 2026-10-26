import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(__dirname, `../../android/app/${path}`), 'utf8')
const xml = (name: string) => read(`src/main/res/xml/${name}`)

const section = (source: string, tag: string) =>
  new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`).exec(source)?.[0] ?? ''

const excludes = (domain: string, path: string) =>
  new RegExp(`<exclude\\s+domain="${domain}"\\s+path="${path}"\\s*/>`)

const EXCLUSIONS = [
  ['file', 'photos/'],
  ['root', 'app_webview/'],
  ['sharedpref', 'CapacitorStorage\\.xml'],
] as const

const SECTIONS = [
  ['backup_rules.xml', 'full-backup-content'],
  ['data_extraction_rules.xml', 'cloud-backup'],
  ['data_extraction_rules.xml', 'device-transfer'],
] as const

describe('règles de sauvegarde Android', () => {
  it.each(SECTIONS)('%s, section %s : photos, WebView et préférences exclus', (file, tag) => {
    const body = section(xml(file), tag)

    expect(body).not.toBe('')
    for (const [domain, path] of EXCLUSIONS) {
      expect(body).toMatch(excludes(domain, path))
    }
  })

  it('le lint n’écarte que le message des exclusions hors inclusion', () => {
    const lint = read('lint.xml')

    expect(lint.match(/<issue\b/g)).toHaveLength(1)
    expect(lint).toMatch(/<issue\s+id="FullBackupContent"/)
    expect(lint.match(/<ignore\b/g)).toHaveLength(1)
    expect(lint).toMatch(/<ignore\s+regexp="is not in an included path"\s*\/>/)
  })

  it('aucun fichier de règles n’ignore le lint par tools:ignore', () => {
    expect(xml('backup_rules.xml')).not.toContain('tools:ignore')
    expect(xml('data_extraction_rules.xml')).not.toContain('tools:ignore')
  })
})
