import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const racine = resolve(__dirname, '../..')

function estIgnore(chemin: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', chemin], { cwd: racine })
    return true
  } catch {
    return false
  }
}

describe('signature de la version publiée', () => {
  it.each([
    'memopatte-envoi.jks',
    'android/app/memopatte-envoi.jks',
    'memopatte-envoi.keystore',
    'android/app/memopatte-envoi.keystore',
    'keystore.properties',
    'android/keystore.properties',
  ])('git ignore %s', (chemin) => {
    expect(estIgnore(chemin)).toBe(true)
  })

  it('ne met aucun secret dans build.gradle : tout vient de variables d’environnement', () => {
    const gradle = readFileSync(resolve(racine, 'android/app/build.gradle'), 'utf8')

    expect(gradle).toMatch(/System\.getenv\('MEMOPATTE_KEYSTORE_FILE'\)/)
    expect(gradle).toMatch(/System\.getenv\('MEMOPATTE_KEYSTORE_PASSWORD'\)/)
    expect(gradle).not.toMatch(/(storePassword|keyPassword)\s*=?\s*['"]/)
  })

  it('exige les quatre variables ensemble et n’y met aucune valeur par défaut', () => {
    const gradle = readFileSync(resolve(racine, 'android/app/build.gradle'), 'utf8')

    expect(gradle).toMatch(/def releaseSigning = signingEnv\.values\(\)\.every \{ it \}/)
    expect(gradle.match(/System\.getenv\(/g)).toHaveLength(4)
    expect(gradle).not.toMatch(/System\.getenv\([^)]*\)\s*(\?:|\|\||\?\s)/)
  })

  it('ne signe la version release que si la configuration est complète', () => {
    const gradle = readFileSync(resolve(racine, 'android/app/build.gradle'), 'utf8')

    expect(gradle).toMatch(/if \(releaseSigning\)\s*\{\s*signingConfig signingConfigs\.release/)
  })

  it('joint les symboles natifs à la version release', () => {
    const gradle = readFileSync(resolve(racine, 'android/app/build.gradle'), 'utf8')

    expect(gradle).toMatch(/release\s*\{[\s\S]*?ndk\s*\{\s*debugSymbolLevel '(SYMBOL_TABLE|FULL)'/)
  })
})
