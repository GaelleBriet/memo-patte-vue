import { describe, expect, it } from 'vitest'
import { byDueDate, vaccinationStatus } from '../logic/vaccination-status'

const TODAY = '2026-09-09'

describe('vaccinationStatus', () => {
  it('est en retard la veille de today et avant', () => {
    expect(vaccinationStatus('2026-09-08', TODAY)).toBe('overdue')
    expect(vaccinationStatus('2024-01-01', TODAY)).toBe('overdue')
  })

  it('est à jour le jour même et après', () => {
    expect(vaccinationStatus(TODAY, TODAY)).toBe('up-to-date')
    expect(vaccinationStatus('2026-09-10', TODAY)).toBe('up-to-date')
    expect(vaccinationStatus('2026-12-01', TODAY)).toBe('up-to-date')
  })

  it('n’a pas de rappel sans échéance : ni à jour, ni en retard', () => {
    expect(vaccinationStatus(null, TODAY)).toBe('none')
  })
})

describe('byDueDate', () => {
  function trier(entrees: { id: string; name: string; dueDate: string | null }[]): string[] {
    return [...entrees].sort(byDueDate).map((entree) => entree.id)
  }

  it('met l’échéance la plus proche en tête, passée d’abord', () => {
    expect(
      trier([
        { id: 'rage', name: 'Rage', dueDate: '2026-12-12' },
        { id: 'chppi', name: 'CHPPi', dueDate: '2026-09-08' },
        { id: 'lepto', name: 'Leptospirose', dueDate: '2026-07-01' },
      ]),
    ).toEqual(['lepto', 'chppi', 'rage'])
  })

  it('renvoie en fin de liste un vaccin sans rappel programmé', () => {
    expect(
      trier([
        { id: 'toux', name: 'Toux du chenil', dueDate: null },
        { id: 'rage', name: 'Rage', dueDate: '2027-01-10' },
      ]),
    ).toEqual(['rage', 'toux'])
  })

  // Deux vaccins de même échéance doivent tomber dans le même ordre que sur
  // l'accueil, où `buildReminders` départage par libellé puis par identifiant.
  it('départage deux échéances égales par nom, puis par identifiant', () => {
    const memeJour = '2026-10-01'

    expect(
      trier([
        { id: 'b', name: 'Typhus', dueDate: memeJour },
        { id: 'a', name: 'CHPPi', dueDate: memeJour },
      ]),
    ).toEqual(['a', 'b'])

    expect(
      trier([
        { id: 'z', name: 'Rage', dueDate: memeJour },
        { id: 'a', name: 'Rage', dueDate: memeJour },
      ]),
    ).toEqual(['a', 'z'])
  })
})
