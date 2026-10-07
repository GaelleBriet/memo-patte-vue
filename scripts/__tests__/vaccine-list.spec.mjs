import { describe, expect, it } from 'vitest'

import { deriveVaccineList, diseasesOf } from '../vaccine-list.mjs'

function product(
  name,
  { species = ['Chien'], substances = [], atc = ['QI07AD02'], status = 'AMM' } = {},
) {
  return { name, species, substances, atc, status }
}

const EXPORT = '2026-10-01T09:30:01'

describe('diseasesOf', () => {
  it('relie les substances actives à leurs maladies, sans le solvant', () => {
    const nobivacChp = product('NOBIVAC CHP LYOPHILISAT', {
      substances: [
        'eau pour préparation injectable',
        'Canine adenovirus 2, strain Manhattan LPV3, Live',
        'Canine parvovirus, strain INT154, Live',
        'Canine distemper virus, strain Onderstepoort, Live',
      ],
    })

    expect(diseasesOf(nobivacChp, 'dog')).toEqual(['distemper', 'hepatitis', 'parvovirus'])
  })

  it('range Bordetella et la parainfluenza qui l’accompagne sous la toux du chenil du chien', () => {
    const kc = product('NOBIVAC KC GOUTTES NASALES', {
      substances: [
        'Canine parainfluenza virus, strain Cornell, Live',
        'Bordetella bronchiseptica, strain 92 B, Live',
      ],
    })

    expect(diseasesOf(kc, 'dog')).toEqual(['kennelCough'])
  })

  it('garde ensemble les deux composantes du coryza du chat', () => {
    const feligen = product('FELIGEN CRP LYOPHILISAT', {
      species: ['Chat'],
      substances: [
        'Feline calicivirus, strain F9, Live',
        'Felid herpesvirus 1, strain F2, Live',
        'Feline panleucopenia virus, strain LR 72, Live',
      ],
    })

    expect(diseasesOf(feligen, 'cat')).toEqual(['panleukopenia', 'catFlu'])
  })

  it('lit la composition dans la table écrite à la main quand l’export ne la donne pas', () => {
    const purevax = product('PUREVAX RCP FeLV', {
      species: ['Chat'],
      substances: ['A DEFINIR IMMUNO UPD'],
    })
    const versican = product('VERSICAN PLUS DHPPI/L4R LYOPHILISAT ET SOLVANT')

    expect(diseasesOf(purevax, 'cat')).toEqual(['panleukopenia', 'catFlu', 'felineLeukaemia'])
    expect(diseasesOf(versican, 'dog')).toEqual([
      'distemper',
      'hepatitis',
      'parvovirus',
      'parainfluenza',
      'leptospirosis',
      'rabies',
    ])
  })

  it('refuse un produit sans composition connue', () => {
    const unknown = product('NOUVEAU VACCIN', { substances: ['A DEFINIR IMMUNO UPD'] })

    expect(() => diseasesOf(unknown, 'dog')).toThrow(/NOUVEAU VACCIN/)
  })

  it('refuse une substance qu’aucune maladie ne reconnaît', () => {
    const unknown = product('AUTRE VACCIN', { substances: ['Canine coronavirus, Inactivated'] })

    expect(() => diseasesOf(unknown, 'dog')).toThrow(/Canine coronavirus/)
  })
})

describe('deriveVaccineList', () => {
  const chp = (name) =>
    product(name, {
      substances: ['Canine distemper virus', 'Canine adenovirus 2', 'Canine parvovirus'],
    })
  const rabies = (name, species) =>
    product(name, { species, atc: ['QI07AA02'], substances: ['Rabies virus, Inactivated'] })

  it('ne garde que les combinaisons d’au moins deux produits, par espèce', () => {
    const list = deriveVaccineList(
      [
        chp('NOBIVAC CHP'),
        chp('CANIGEN CHP'),
        rabies('RABISIN', ['Chien', 'Chat', 'Bovins']),
        rabies('RABIGEN MONO', ['Chien', 'Chat']),
        product('CANIGEN LR', { substances: ['Leptospira interrogans', 'Rabies virus'] }),
      ],
      EXPORT,
    )

    expect(list).toEqual({
      exportedOn: '2026-10-01',
      combinations: [
        { species: 'dog', diseases: ['rabies'], products: 2 },
        { species: 'dog', diseases: ['distemper', 'hepatitis', 'parvovirus'], products: 2 },
        { species: 'cat', diseases: ['rabies'], products: 2 },
      ],
    })
  })

  it('ignore les médicaments qui ne sont ni des vaccins du chien ou du chat, ni autorisés', () => {
    const list = deriveVaccineList(
      [
        chp('NOBIVAC CHP'),
        chp('CANIGEN CHP'),
        product('ANTIBIOTIQUE', { atc: ['QJ01RA01'], substances: ['Amoxicilline'] }),
        product('VACCIN BOVIN', {
          species: ['Bovins'],
          atc: ['QI02AA'],
          substances: ['Rabies virus'],
        }),
        { ...chp('EURICAN DAP'), status: 'Supprimée' },
        product('UNISOLVE SOLUTION INJECTABLE', {
          atc: ['QI07AX'],
          substances: ['eau pour préparation injectable'],
        }),
      ],
      EXPORT,
    )

    expect(list.combinations).toEqual([
      { species: 'dog', diseases: ['distemper', 'hepatitis', 'parvovirus'], products: 2 },
    ])
  })
})
