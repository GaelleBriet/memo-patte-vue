// @vitest-environment node
import { differenceInCalendarDays, differenceInYears, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { animalInputSchema } from '@/features/animals/schema/animal.schema'
import { treatmentInputSchema } from '@/features/treatments/schema/treatment.schema'
import { vaccinationStatus } from '@/features/vaccinations/logic/vaccination-status'
import { vaccinationInputSchema } from '@/features/vaccinations/schema/vaccination.schema'
import { weightEntryInputSchema } from '@/features/weight/schema/weight.schema'
import { buildDemoCarnet, type DemoAnimal } from '../demo-carnet'

const TODAY = new Date(2026, 8, 13)
const today = format(TODAY, 'yyyy-MM-dd')
const ANIMAL_ID = '9b2a8c1e-3f4d-4e5a-8b6c-7d8e9f0a1b2c'

function find(name: string): DemoAnimal {
  const animal = buildDemoCarnet(TODAY).find((entry) => entry.animal.name === name)
  if (!animal) throw new Error(`animal de démo absent : ${name}`)
  return animal
}

describe('buildDemoCarnet', () => {
  it('décrit Milo et Luna, et rien d’autre', () => {
    expect(buildDemoCarnet(TODAY).map((entry) => entry.animal.name)).toEqual(['Milo', 'Luna'])
  })

  it('produit des entrées que les schémas Zod des repositories acceptent', () => {
    for (const { animal, vaccinations, treatments, weights } of buildDemoCarnet(TODAY)) {
      expect(() => animalInputSchema.parse(animal)).not.toThrow()
      for (const vaccination of vaccinations) {
        expect(() =>
          vaccinationInputSchema.parse({ ...vaccination, animalId: ANIMAL_ID }),
        ).not.toThrow()
      }
      for (const treatment of treatments) {
        expect(() =>
          treatmentInputSchema.parse({ ...treatment, animalId: ANIMAL_ID }),
        ).not.toThrow()
      }
      for (const weight of weights) {
        expect(() => weightEntryInputSchema.parse({ ...weight, animalId: ANIMAL_ID })).not.toThrow()
      }
    }
  })

  it('date Milo relativement à aujourd’hui : golden retriever de 4 ans', () => {
    const { animal } = find('Milo')

    expect(animal.species).toBe('dog')
    expect(animal.breed).toBe('Golden retriever')
    expect(animal.initialWeightKg).toBe(8.5)
    expect(differenceInYears(TODAY, parseISO(animal.birthDate as string))).toBe(4)
  })

  it('donne à Milo un vaccin en retard (CHPPi) et un vaccin à jour (Rage)', () => {
    const { vaccinations } = find('Milo')
    const chppi = vaccinations.find((vaccination) => vaccination.name === 'CHPPi')
    const rage = vaccinations.find((vaccination) => vaccination.name === 'Rage')

    expect(vaccinationStatus(chppi?.dueDate ?? null, today)).toBe('overdue')
    expect(differenceInCalendarDays(TODAY, parseISO(chppi?.dueDate as string))).toBe(45)
    expect(chppi?.lastInjectionDate).toBe('2025-07-30')
    expect(chppi?.dueDate).toBe('2026-07-30')
    expect(vaccinationStatus(rage?.dueDate ?? null, today)).toBe('up-to-date')
  })

  it('donne à Milo un antiparasitaire trimestriel dont la prochaine dose approche', () => {
    const bravecto = find('Milo').treatments.find(({ name }) => name === 'Bravecto')

    expect(bravecto).toMatchObject({
      type: 'antiparasitic',
      frequency: { value: 3, unit: 'month' },
    })
    const daysSinceLastDose = differenceInCalendarDays(
      TODAY,
      parseISO(bravecto?.lastDoseDate as string),
    )
    expect(daysSinceLastDose).toBeGreaterThan(60)
    expect(daysSinceLastDose).toBeLessThan(90)
  })

  it('donne à Milo six pesées mensuelles croissantes de 23,6 à 24,5 kg, la dernière ce mois-ci', () => {
    const { weights } = find('Milo')

    expect(weights).toHaveLength(6)
    expect(weights.map((weight) => weight.weightKg)).toEqual([23.6, 23.8, 24, 24.1, 24.3, 24.5])
    expect(weights.at(-1)?.measuredOn).toBe(today)
    expect(weights.at(0)?.measuredOn).toBe('2026-04-13')
  })

  it('donne à Milo un CHPPi de trois injections, les plus anciennes avant la dernière (F7)', () => {
    const chppi = find('Milo').vaccinations.find(({ name }) => name === 'CHPPi')

    expect(chppi?.history).toEqual([
      { injectedOn: '2024-07-30', nextDueDate: '2025-07-30' },
      { injectedOn: '2024-06-30', nextDueDate: '2024-07-30' },
    ])
  })

  it('donne à Milo un vermifuge mensuel de plus de 12 prises, sur deux années (F8)', () => {
    const drontal = find('Milo').treatments.find(({ name }) => name === 'Drontal')

    expect(drontal).toMatchObject({
      type: 'deworming',
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-08-24',
    })
    const history = drontal?.history ?? []
    expect(history).toHaveLength(14)
    expect(history[0]).toEqual({ givenOn: '2026-07-24', nextDueDate: '2026-08-24' })
    expect(history.at(-1)).toEqual({ givenOn: '2025-06-24', nextDueDate: '2025-07-24' })
    expect(drontal?.stoppedOn).toBeUndefined()
  })

  it('donne à Milo un traitement arrêté de deux prises, tous les 15 jours (F9 ter)', () => {
    const advocate = find('Milo').treatments.find(({ name }) => name === 'Advocate')

    expect(advocate).toMatchObject({
      type: 'antiparasitic',
      frequency: { value: 15, unit: 'day' },
      lastDoseDate: '2026-05-08',
      stoppedOn: '2026-05-13',
      history: [{ givenOn: '2026-04-23', nextDueDate: '2026-05-08' }],
    })
  })

  it('ne date aucune prise ni injection passée après la dernière, ni dans le futur', () => {
    for (const { vaccinations, treatments } of buildDemoCarnet(TODAY)) {
      for (const vaccination of vaccinations) {
        for (const { injectedOn } of vaccination.history ?? []) {
          expect(injectedOn < vaccination.lastInjectionDate).toBe(true)
        }
      }
      for (const treatment of treatments) {
        for (const { givenOn } of treatment.history ?? []) {
          expect(givenOn < treatment.lastDoseDate).toBe(true)
        }
        if (treatment.stoppedOn) expect(treatment.stoppedOn <= today).toBe(true)
      }
    }
  })

  it('date Luna relativement à aujourd’hui : chatte européenne de 3 ans, Typhus à jour', () => {
    const { animal, vaccinations, treatments, weights } = find('Luna')

    expect(animal.species).toBe('cat')
    expect(animal.initialWeightKg).toBe(0.9)
    expect(differenceInYears(TODAY, parseISO(animal.birthDate as string))).toBe(3)
    expect(vaccinations).toHaveLength(1)
    expect(vaccinations[0]?.name).toBe('Typhus')
    expect(vaccinationStatus(vaccinations[0]?.dueDate ?? null, today)).toBe('up-to-date')
    expect(treatments).toEqual([
      expect.objectContaining({
        name: 'Milbemax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
      }),
    ])
    expect(weights.map((weight) => weight.weightKg)).toEqual([3.8, 3.9, 4.1, 4.2])
  })
})
