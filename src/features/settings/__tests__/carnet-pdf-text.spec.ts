import { afterEach, describe, expect, it } from 'vitest'

import { carnetPdfText, pdfFooterText, pdfPageNumberText } from '../logic/carnet-pdf-text'
import { buildCarnetPdfContent, type CarnetPdfContent } from '../logic/pdf-content'
import { EXPORT_FIXTURE, LUNA_ID, MILO_ID } from './export-fixture'
import i18n, { applyLocale } from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const TODAY = '2026-09-15'

afterEach(() => applyLocale('fr'))

function content(animalId: string): CarnetPdfContent {
  return buildCarnetPdfContent(EXPORT_FIXTURE, animalId, TODAY)!
}

function text(animalId: string) {
  return plain(carnetPdfText(content(animalId), i18n.global.t))
}

describe('carnetPdfText', () => {
  it('écrit l’en-tête, les lignes et l’historique de chaque section', () => {
    expect(text(LUNA_ID)).toEqual({
      animalName: 'Luna',
      identity:
        'Chat · Européen ; tigrée "Mimi" · Date de naissance : environ 2 mars 2019 · estimé 7 ans',
      vaccinations: {
        title: 'Vaccins',
        rows: [
          ['Leucose', '02/11/2026', 'Prévu le 2 nov.'],
          ['Typhus; coryza', 'Pas de rappel', 'Pas de rappel'],
        ],
        emptyLabel: 'Aucun vaccin enregistré.',
        details: [[], [{ text: 'Injections : 20/05/2024', level: 0 }]],
      },
      treatments: {
        title: 'Traitements',
        rows: [['Milbémax', '15/09/2026', 'À jour']],
        emptyLabel: 'Aucun traitement enregistré.',
        details: [
          [
            { text: 'Dernière prise : 15/06/2026', level: 0 },
            { text: 'Depuis le 15/03/2026 · Tous les 3 mois', level: 0 },
            { text: 'Prises : 15/06/2026 · 15/03/2026', level: 1 },
          ],
        ],
      },
      weight: {
        title: 'Poids',
        emptyLabel: 'Aucune pesée enregistrée.',
        rows: [['24/12/2025', '4,3 kg']],
      },
    })
  })

  it('laisse vides échéance et statut d’un animal qu’on ne suit plus, historique compris', () => {
    const milo = text(MILO_ID)

    expect(milo.identity).toBe('Chien · jusqu’au 12 sept. 2026')
    expect(milo.vaccinations.rows).toEqual([['CHPPiL', '', '']])
    expect(milo.treatments.rows).toEqual([['Panacur', '', '']])
    expect(milo.treatments.details[0]).toEqual([
      { text: 'Dernière prise : 10/09/2026', level: 0 },
      { text: 'Du 10/09/2026 au 20/09/2026 · Tous les jours · 8 h et 20 h · ½ comprimé', level: 0 },
      { text: 'Non renseigné du 11/09/2026 au 14/09/2026', level: 1 },
      { text: 'Oubliée : 10/09/2026 à 20 h', level: 1 },
      { text: 'Prise : 10/09/2026 à 8 h', level: 1 },
    ])
  })

  it('suit la langue de l’app au moment de l’appel', () => {
    applyLocale('en')

    const milo = text(MILO_ID)

    expect(milo.identity).toBe('Dog · until Sep 12, 2026')
    expect(milo.treatments.title).toBe('Treatments')
    expect(milo.weight.rows).toEqual([['08/30/2026', '12.0 kg']])
  })

  it('remplace un nom illisible par un tiret', () => {
    const luna = content(LUNA_ID)

    expect(
      carnetPdfText({ ...luna, animal: { ...luna.animal, name: '🐶' } }, i18n.global.t).animalName,
    ).toBe('—')
  })
})

describe('pied de page', () => {
  it('donne la date de génération, la version et le numéro de page', () => {
    expect(plain(pdfFooterText(TODAY, '0.1.9', i18n.global.t))).toBe(
      'Généré le 15 sept. 2026 — MémoPatte 0.1.9',
    )
    expect(pdfPageNumberText(2, 3, i18n.global.t)).toBe('2 / 3')
  })
})
