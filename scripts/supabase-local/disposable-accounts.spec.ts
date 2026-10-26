import { describe, expect, it } from 'vitest'

import { disposableAccounts } from './disposable-accounts'

describe('garde de la pile locale', () => {
  it.each(['http://127.0.0.1:54321', 'http://localhost:54321'])('accepte %s', (url) => {
    expect(() => disposableAccounts(url)).not.toThrow()
  })

  it('ne vérifie rien quand aucune pile n’est visée', () => {
    expect(() => disposableAccounts(undefined)).not.toThrow()
  })

  it('refuse un projet distant', () => {
    expect(() => disposableAccounts('https://xxx.supabase.co')).toThrow(
      'Pile locale seulement, refusé : xxx.supabase.co',
    )
  })

  it('refuse un hôte qui ne fait que commencer comme un hôte local', () => {
    expect(() => disposableAccounts('http://localhost.evil.test')).toThrow('Pile locale seulement')
  })

  it('refuse une URL illisible', () => {
    expect(() => disposableAccounts('pas une url')).toThrow('Pile locale seulement')
  })
})
