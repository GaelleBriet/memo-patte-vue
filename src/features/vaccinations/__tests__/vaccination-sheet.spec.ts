import { describe, expect, it, vi } from 'vitest'

import { earliestOtherDate, loadSheetVaccination } from '../logic/vaccination-sheet'
import i18n from '@/core/i18n'

const t = i18n.global.t

describe('earliestOtherDate', () => {
  it('est le lendemain du jour donné, quel que soit le fuseau de l’appareil', () => {
    expect(earliestOtherDate('2026-10-23')).toBe('2026-10-24')
  })

  it('passe le changement de mois et d’année', () => {
    expect(earliestOtherDate('2026-10-31')).toBe('2026-11-01')
    expect(earliestOtherDate('2026-12-31')).toBe('2027-01-01')
  })
})

describe('loadSheetVaccination — ce qui empêche d’ouvrir la feuille', () => {
  const carre = { id: 'v1', name: 'Carré' } as never

  it('rend le vaccin lu', async () => {
    const load = vi.fn().mockResolvedValue(carre)

    expect(await loadSheetVaccination(t, 'v1', load)).toEqual({ vaccination: carre })
    expect(load).toHaveBeenCalledWith('v1')
  })

  it('vaccin supprimé : « introuvable »', async () => {
    expect(await loadSheetVaccination(t, 'v1', async () => null)).toEqual({
      failure: 'Ce vaccin est introuvable.',
    })
  })

  it('lecture en erreur : « n’a pas pu être chargé », tracée', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(await loadSheetVaccination(t, 'v1', vi.fn().mockRejectedValue(new Error('x')))).toEqual({
      failure: 'Ce vaccin n’a pas pu être chargé. Réessaie.',
    })
    expect(warn).toHaveBeenCalledWith('Chargement du vaccin impossible :', 'Error')
    warn.mockRestore()
  })

  it('sans identifiant : « n’a pas pu être chargé », rien n’est lu', async () => {
    const load = vi.fn()

    expect(await loadSheetVaccination(t, null, load)).toEqual({
      failure: 'Ce vaccin n’a pas pu être chargé. Réessaie.',
    })
    expect(load).not.toHaveBeenCalled()
  })
})
