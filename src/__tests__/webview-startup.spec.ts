// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import config from '../../capacitor.config'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path)
    return /\.(vue|ts|scss|css)$/.test(entry.name) ? [path] : []
  })
}

describe('démarrage de la WebView sans erreur de console', () => {
  it('ne réclame pas /favicon.ico, que Capacitor sert en réponse vide (404)', () => {
    const html = readFileSync('index.html', 'utf8')
    const href = /<link rel="icon" href="([^"]+)"/.exec(html)?.[1]

    expect(href).toBeDefined()
    expect(href).not.toMatch(/favicon\.ico$/i)
    expect(existsSync(join('public', href!))).toBe(true)
  })

  it('laisse SystemBars sans injection CSS, car aucun style ne lit --safe-area-inset-*', () => {
    const readers = [...sourceFiles('src'), 'index.html'].filter((file) =>
      readFileSync(file, 'utf8').includes('--safe-area-inset'),
    )

    expect(readers).toEqual([])
    expect(config.plugins?.SystemBars?.insetsHandling).toBe('native')
  })
})
