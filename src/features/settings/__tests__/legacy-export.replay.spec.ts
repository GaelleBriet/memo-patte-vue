import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { parseExportFile } from '../logic/parse-export-file'
import exportV2 from './fixtures/export-v2-0.1.48.json?raw'
import { shiftDate, type Frequency } from '@/shared/domain/treatment-frequency'
import { treatmentReading } from '@/shared/domain/treatment-reading'

const IMPORTEUR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TREATMENT = '0b6f7f2e-3a8d-4f0e-9a1c-5d2b7e8f9a01'
const CARNETS = 200
const LAST_DAY = '2026-09-01'

type DatedRow = { injectedOn?: string; measuredOn?: string; createdAt?: string }
type Dose = { givenOn: string; nextDueDate: string }

const plusDays = (day: string, count: number) => format(addDays(parseISO(day), count), 'yyyy-MM-dd')

function random(seed: number) {
  let state = seed
  return (max: number) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    return state % max
  }
}

/** L'app de la 0.1.48 : chaque prise refixe la suite, la prochaine dose se choisit aussi à la main. */
function oldCarnet(seed: number): { frequency: Frequency; doses: Dose[]; today: string } {
  const pick = random(seed)
  const unit = (['day', 'week', 'month'] as const)[pick(3)]!
  const frequency = { unit, value: 1 + pick(unit === 'day' ? 30 : unit === 'week' ? 8 : 6) }
  const doses: Dose[] = []
  let nextDue = plusDays('2024-01-01', pick(700))
  let last: string | null = null
  for (let count = 1 + pick(12); count > 0 && nextDue < LAST_DAY; count -= 1) {
    const gesture = pick(5)
    let givenOn = nextDue
    if (gesture === 1) givenOn = plusDays(nextDue, 1 + pick(20))
    if (gesture === 2) givenOn = plusDays(nextDue, -(1 + pick(6)))
    if (gesture === 3 && last !== null) givenOn = last
    if (last !== null && givenOn < last) givenOn = last
    const dose = { givenOn, nextDueDate: shiftDate(givenOn, frequency, 1) }
    if (gesture === 4) dose.nextDueDate = plusDays(dose.nextDueDate, 1 + pick(30))
    doses.push(dose)
    last = givenOn
    nextDue = dose.nextDueDate
  }
  return { frequency, doses, today: plusDays(last!, pick(3)) }
}

function exportOf({ frequency, doses }: ReturnType<typeof oldCarnet>): string {
  const file = JSON.parse(exportV2) as Record<string, unknown>
  const luna = (file.animals as { id: string }[])[0]!.id
  const at = '2025-01-01T08:00:00.000Z'
  for (const row of [
    ...(file.animals as DatedRow[]),
    ...(file.vaccinationInjections as DatedRow[]),
    ...(file.weightEntries as DatedRow[]),
  ]) {
    if (row.createdAt) row.createdAt = '2023-12-31T08:00:00.000Z'
    if (row.injectedOn) row.injectedOn = '2023-12-31'
    if (row.measuredOn) row.measuredOn = '2023-12-31'
  }
  file.treatments = [
    {
      id: TREATMENT,
      animalId: luna,
      name: 'Stronghold',
      type: 'antiparasitic',
      frequency,
      stoppedOn: null,
      createdAt: at,
      updatedAt: at,
    },
  ]
  file.treatmentDoses = doses.map(({ givenOn, nextDueDate }, index) => {
    const createdAt = `${givenOn}T08:00:${String(index).padStart(2, '0')}.000Z`
    return {
      id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`,
      treatmentId: TREATMENT,
      animalId: luna,
      givenOn,
      nextDueDate,
      frequency,
      createdAt,
      updatedAt: createdAt,
    }
  })
  return JSON.stringify(file)
}

describe('anciennes prises rejouées par le moteur, contre l’app de la 0.1.48', () => {
  it(`annonce la même prochaine dose, sans dose à renseigner avant elle, sur ${CARNETS} carnets`, () => {
    const gaps: string[] = []
    const shortMonths: string[] = []
    for (let seed = 1; seed <= CARNETS; seed += 1) {
      const carnet = oldCarnet(seed)
      const parsed = parseExportFile(exportOf(carnet), IMPORTEUR, carnet.today)
      if (!parsed.ok) {
        gaps.push(`${seed} refusé ${parsed.reason}`)
        continue
      }
      const { data } = parsed.file
      const [period] = data.treatmentPeriods.filter(({ treatmentId }) => treatmentId === TREATMENT)
      const view = treatmentReading(
        {
          periods: [period!],
          doses: data.treatmentDoses.filter(({ treatmentId }) => treatmentId === TREATMENT),
        },
        carnet.today,
      )!
      const [next] = view.upcoming({
        from: period!.firstDueOn,
        to: plusDays(carnet.today, 800),
        limit: 1,
      })
      const announced = carnet.doses.at(-1)!.nextDueDate
      const invented = view.unloggedDoses.filter(({ dueOn }) => dueOn < announced)
      if (invented.length > 0) gaps.push(`${seed} : doses à renseigner avant ${announced}`)
      if (next === undefined) gaps.push(`${seed} : aucune dose à venir`)
      const days = next
        ? Math.abs(differenceInCalendarDays(parseISO(next.dueOn), parseISO(announced)))
        : 0
      if (days > 0) shortMonths.push(`${seed} ${carnet.frequency.unit} ${days} j`)
    }

    expect(gaps).toEqual([])
    expect(shortMonths.filter((gap) => !/ month [1-3] j$/.test(gap))).toEqual([])
  }, 60_000)
})
