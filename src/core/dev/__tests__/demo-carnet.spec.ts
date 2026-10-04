// @vitest-environment node
import { differenceInCalendarDays, differenceInYears, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { animalInputSchema } from '@/features/animals/schema/animal.schema'
import { vaccinationStatus } from '@/features/vaccinations/logic/vaccination-status'
import { vaccinationInputSchema } from '@/features/vaccinations/schema/vaccination.schema'
import { weightEntryInputSchema } from '@/features/weight/schema/weight.schema'
import { buildDemoCarnet, type DemoAnimal, type DemoTreatment } from '../demo-carnet'

const TODAY = new Date(2026, 8, 13)
const today = format(TODAY, 'yyyy-MM-dd')
const ANIMAL_ID = '9b2a8c1e-3f4d-4e5a-8b6c-7d8e9f0a1b2c'

function find(name: string): DemoAnimal {
  const animal = buildDemoCarnet(TODAY).find((entry) => entry.animal.name === name)
  if (!animal) throw new Error(`animal de démo absent : ${name}`)
  return animal
}

function treatment(animal: string, name: string): DemoTreatment {
  const found = find(animal).treatments.find((entry) => entry.name === name)
  if (!found) throw new Error(`traitement de démo absent : ${name}`)
  return found
}

function allTreatments(): DemoTreatment[] {
  return buildDemoCarnet(TODAY).flatMap(({ treatments }) => treatments)
}

describe('buildDemoCarnet', () => {
  it('décrit Milo et Luna, et rien d’autre', () => {
    expect(buildDemoCarnet(TODAY).map((entry) => entry.animal.name)).toEqual(['Milo', 'Luna'])
  })

  it('produit des entrées que les schémas Zod des repositories acceptent', () => {
    for (const { animal, vaccinations, weights } of buildDemoCarnet(TODAY)) {
      expect(() => animalInputSchema.parse(animal)).not.toThrow()
      for (const vaccination of vaccinations) {
        expect(() =>
          vaccinationInputSchema.parse({ ...vaccination, animalId: ANIMAL_ID }),
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
    const bravecto = treatment('Milo', 'Bravecto')

    expect(bravecto.type).toBe('antiparasitic')
    expect(bravecto.periods).toEqual([
      {
        startsOn: '2026-06-28',
        frequency: { value: 3, unit: 'month' },
        doses: [
          {
            dueOn: '2026-06-28',
            dueTime: null,
            givenOn: '2026-06-28',
            status: 'given',
            nextDueDate: '2026-09-28',
          },
        ],
      },
    ])
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
    const drontal = treatment('Milo', 'Drontal')
    const [period] = drontal.periods

    expect(drontal.type).toBe('deworming')
    expect(drontal.periods).toHaveLength(1)
    expect(period).toMatchObject({ startsOn: '2025-06-24', frequency: { value: 1, unit: 'month' } })
    expect(period?.stoppedOn).toBeUndefined()
    expect(period?.doses).toHaveLength(15)
    expect(period?.doses[0]).toMatchObject({ givenOn: '2025-06-24', nextDueDate: '2025-07-24' })
    expect(period?.doses.at(-1)).toMatchObject({ givenOn: '2026-08-24', nextDueDate: '2026-09-24' })
    expect(period?.doses.every(({ status }) => status === 'given')).toBe(true)
  })

  it('donne à Milo un traitement arrêté de deux prises, tous les 15 jours (F9 ter)', () => {
    const advocate = treatment('Milo', 'Advocate')

    expect(advocate.type).toBe('antiparasitic')
    expect(advocate.periods).toEqual([
      expect.objectContaining({
        frequency: { value: 15, unit: 'day' },
        stoppedOn: '2026-05-13',
        doses: [
          expect.objectContaining({ givenOn: '2026-04-23', nextDueDate: '2026-05-08' }),
          expect.objectContaining({ givenOn: '2026-05-08', nextDueDate: '2026-05-23' }),
        ],
      }),
    ])
  })

  it('donne à Milo un traitement quotidien à deux heures, avec des doses non renseignées', () => {
    const [period] = treatment('Milo', 'Panacur').periods

    expect(period).toMatchObject({
      startsOn: '2026-09-08',
      endsOn: '2026-09-17',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 1,
      doseUnit: 'sachet',
      reminderOffsetMinutes: 15,
    })
    const dues = Array.from(
      { length: 6 },
      (_, index) => `2026-09-${String(8 + index).padStart(2, '0')}`,
    ).flatMap((dueOn) => period!.times!.map((dueTime) => `${dueOn} ${dueTime}`))
    const noted = period!.doses.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`)
    expect(noted).toEqual([
      '2026-09-08 08:00',
      '2026-09-08 20:00',
      '2026-09-09 08:00',
      '2026-09-09 20:00',
      '2026-09-11 08:00',
    ])
    expect(dues.filter((due) => !noted.includes(due))).toEqual([
      '2026-09-10 08:00',
      '2026-09-10 20:00',
      '2026-09-11 20:00',
      '2026-09-12 08:00',
      '2026-09-12 20:00',
      '2026-09-13 08:00',
      '2026-09-13 20:00',
    ])
    expect(period!.doses.map(({ status }) => status)).toEqual([
      'given',
      'given',
      'given',
      'missed',
      'given',
    ])
  })

  it('fixe après chaque dose du traitement quotidien l’échéance suivante : le soir, puis le lendemain', () => {
    const [period] = treatment('Milo', 'Panacur').periods

    expect(period!.doses.map(({ dueTime, nextDueDate }) => [dueTime, nextDueDate])).toEqual([
      ['08:00', '2026-09-08'],
      ['20:00', '2026-09-09'],
      ['08:00', '2026-09-09'],
      ['20:00', '2026-09-10'],
      ['08:00', '2026-09-11'],
    ])
  })

  it('donne à Luna un traitement arrêté puis repris : deux périodes, la première seule arrêtée', () => {
    const milbemax = treatment('Luna', 'Milbemax')

    expect(milbemax.type).toBe('deworming')
    expect(
      milbemax.periods.map(({ startsOn, stoppedOn, doses }) => [startsOn, stoppedOn, doses.length]),
    ).toEqual([
      ['2025-08-13', '2026-01-13', 2],
      ['2026-08-13', undefined, 1],
    ])
    expect(milbemax.periods[1]).toMatchObject({
      frequency: { value: 3, unit: 'month' },
      doses: [expect.objectContaining({ givenOn: '2026-08-13', nextDueDate: '2026-11-13' })],
    })
  })

  it('donne à Luna un traitement avec une date de fin, dont une dose a été reportée puis donnée', () => {
    const [period] = treatment('Luna', 'Frontline').periods

    expect(period).toMatchObject({
      startsOn: '2026-07-13',
      endsOn: '2027-01-13',
      frequency: { value: 1, unit: 'month' },
      doseQuantity: 1,
      doseUnit: 'pipette',
      reminderTime: '18:00',
    })
    expect(period!.doses).toEqual([
      expect.objectContaining({ dueOn: '2026-07-13', status: 'given', nextDueDate: '2026-08-13' }),
      {
        dueOn: '2026-08-13',
        dueTime: null,
        givenOn: null,
        status: 'postponed',
        nextDueDate: '2026-08-16',
      },
      {
        dueOn: '2026-08-13',
        dueTime: null,
        givenOn: null,
        status: 'shift',
        nextDueDate: '2026-08-16',
      },
      expect.objectContaining({
        dueOn: '2026-08-16',
        givenOn: '2026-08-16',
        status: 'given',
        nextDueDate: '2026-09-16',
      }),
    ])
  })

  it('range les périodes d’un traitement et les lignes d’une période de la plus ancienne à la plus récente', () => {
    for (const { periods } of allTreatments()) {
      expect(periods.map(({ startsOn }) => startsOn)).toEqual(
        periods.map(({ startsOn }) => startsOn).sort(),
      )
      for (const { doses } of periods) {
        const keys = doses.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`)
        expect(keys).toEqual([...keys].sort())
        const lines = doses.map(({ status }, index) => `${keys[index]} ${status}`)
        expect(new Set(lines).size).toBe(lines.length)
      }
    }
  })

  it('ne date aucune prise ni injection dans le futur, ni avant le début de sa période', () => {
    for (const { vaccinations, treatments } of buildDemoCarnet(TODAY)) {
      for (const vaccination of vaccinations) {
        for (const { injectedOn } of vaccination.history ?? []) {
          expect(injectedOn < vaccination.lastInjectionDate).toBe(true)
        }
      }
      for (const { periods } of treatments) {
        for (const period of periods) {
          expect((period.stoppedOn ?? today) <= today).toBe(true)
          for (const dose of period.doses) {
            expect(dose.dueOn >= period.startsOn).toBe(true)
            expect((dose.givenOn ?? today) <= today).toBe(true)
            expect(dose.status === 'given').toBe(dose.givenOn !== null)
          }
        }
      }
    }
  })

  it('date Luna relativement à aujourd’hui : chatte européenne de 3 ans, Typhus à jour', () => {
    const { animal, vaccinations, weights } = find('Luna')

    expect(animal.species).toBe('cat')
    expect(differenceInYears(TODAY, parseISO(animal.birthDate as string))).toBe(3)
    expect(vaccinations).toHaveLength(1)
    expect(vaccinations[0]?.name).toBe('Typhus')
    expect(vaccinationStatus(vaccinations[0]?.dueDate ?? null, today)).toBe('up-to-date')
    expect(weights.map((weight) => weight.weightKg)).toEqual([3.8, 3.9, 4.1, 4.2])
  })
})
