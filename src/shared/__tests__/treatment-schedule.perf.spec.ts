// @vitest-environment node
import { addMonths, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import {
  treatmentSchedule,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
} from '../domain/treatment-schedule'
import { days, period } from './treatment-schedule-fixtures'

const TWO_YEARS = days('2024-10-01', '2026-09-30')

function givenAt(day: string, dueTime: string, nextDueDate: string): TreatmentDoseInput {
  const at = `${day}T12:00:00.000Z`
  return {
    id: `${day}-${dueTime}`,
    periodId: 'p1',
    dueOn: day,
    dueTime,
    givenOn: day,
    status: 'given',
    nextDueDate,
    createdAt: at,
    updatedAt: at,
  }
}

const doses = TWO_YEARS.flatMap((day, index) => [
  givenAt(day, '08:00', day),
  givenAt(day, '20:00', TWO_YEARS[index + 1] ?? '2026-10-01'),
])

const input = {
  periods: [period({ firstDueOn: '2024-10-01', times: ['08:00', '20:00'] })],
  doses,
  today: '2026-09-30',
}

// Meilleur de trois essais : écarte le bruit de la machine, garde visible une régression.
function fastest<T>(run: () => T): { result: T; elapsed: number } {
  let best = { result: run(), elapsed: Infinity }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = performance.now()
    const result = run()
    const elapsed = performance.now() - start
    if (elapsed < best.elapsed) best = { result, elapsed }
  }
  return best
}

describe('performance', () => {
  it('un traitement quotidien à deux heures, sur deux ans, se calcule en moins de 100 ms', () => {
    const { result: schedule, elapsed } = fastest(() => {
      const computed = treatmentSchedule(input)
      computed.upcoming(400)
      return computed
    })

    expect(doses).toHaveLength(1460)
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([
      { periodId: 'p1', dueOn: '2026-10-01', dueTime: '08:00' },
    ])
    expect(elapsed).toBeLessThan(100)
  })

  it('le même traitement sans aucune prise notée aussi', () => {
    const { result: schedule, elapsed } = fastest(() => treatmentSchedule({ ...input, doses: [] }))

    expect(schedule.unloggedDoses).toHaveLength(1458)
    expect(elapsed).toBeLessThan(100)
  })

  it('« Toutes données » sur deux ans à deux heures s’écrit en moins de 200 ms', () => {
    const { result: written, elapsed } = fastest(() => {
      const schedule = treatmentSchedule({ ...input, doses: [] })
      return schedule.unloggedDoses.map((due) =>
        schedule.doseFor({ kind: 'given', due, givenOn: due.dueOn }),
      )
    })

    expect(written).toHaveLength(1458)
    const after = treatmentSchedule({
      ...input,
      doses: written.map((fields, index) => ({
        id: `dose-${index}`,
        ...fields,
        createdAt: '2026-09-30T12:00:00.000Z',
        updatedAt: '2026-09-30T12:00:00.000Z',
      })),
    })
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses).toHaveLength(2)
    expect(elapsed).toBeLessThan(200)
  })

  it('« Toutes données » entre une prise ancienne et une ligne récente, sur un an à deux heures, s’écrit en moins de 150 ms', () => {
    const gapped = {
      periods: [period({ firstDueOn: '2025-10-01', times: ['08:00', '20:00'] })],
      doses: [
        givenAt('2025-10-01', '08:00', '2025-10-01'),
        givenAt('2026-09-29', '20:00', '2026-09-30'),
      ],
      today: '2026-09-30',
    }

    const { result: written, elapsed } = fastest(() => {
      const schedule = treatmentSchedule(gapped)
      return schedule.unloggedDoses.map((due) =>
        schedule.doseFor({ kind: 'given', due, givenOn: due.dueOn }),
      )
    })

    expect(written).toHaveLength(726)
    const after = treatmentSchedule({
      ...gapped,
      doses: [
        ...gapped.doses,
        ...written.map((fields, index) => ({
          id: `dose-${index}`,
          ...fields,
          createdAt: '2026-09-30T12:00:00.000Z',
          updatedAt: '2026-09-30T12:00:00.000Z',
        })),
      ],
    })
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses).toHaveLength(2)
    expect(elapsed).toBeLessThan(150)
  })

  it('une prochaine échéance en 9999 est refusée sans rien calculer', () => {
    const forged = { ...givenAt('2026-09-01', '08:00', '2026-09-01'), nextDueDate: '9999-12-31' }

    const start = performance.now()
    expect(() => treatmentSchedule({ ...input, doses: [forged] })).toThrow(
      /Calendrier de traitement invalide/,
    )
    expect(performance.now() - start).toBeLessThan(50)
  })
})

describe('lignes sans effet sur des échéances à renseigner (fichier forgé)', () => {
  it('« Toutes données » ne recalcule pas le calendrier à chaque dose', () => {
    const neutral = TWO_YEARS.map((day) => ({
      ...givenAt(day, '08:00', day),
      id: `neutre-${day}`,
      givenOn: null,
      status: 'postponed' as const,
    }))

    const { result: written, elapsed } = fastest(() => {
      const schedule = treatmentSchedule({ ...input, doses: neutral })
      return schedule.unloggedDoses.map((due) =>
        schedule.doseFor({ kind: 'given', due, givenOn: due.dueOn }),
      )
    })

    expect(written).toHaveLength(1458)
    expect(elapsed).toBeLessThan(300)
  })
})

describe('période suivante très lointaine (fichier forgé)', () => {
  it('une période à 24 heures par jour suivie d’une période en 2199 se calcule sans rien dérouler', () => {
    const everyHour = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
    const forged = {
      periods: [
        period({ firstDueOn: '2026-09-01', times: everyHour }),
        period({ id: 'p2', startsOn: '2199-12-30', firstDueOn: '2199-12-30' }),
      ],
      doses: [],
      today: '2026-09-28',
    }

    const { result: schedule, elapsed } = fastest(() => {
      const computed = treatmentSchedule(forged)
      computed.upcoming(400)
      return computed
    })

    expect(schedule.unloggedDoses).toHaveLength(27 * 24)
    expect(schedule.currentDoses).toEqual([{ periodId: 'p2', dueOn: '2199-12-30', dueTime: null }])
    expect(elapsed).toBeLessThan(100)
  })
})

// Une période par ajustement de posologie, toutes les prises données à leur jour.
function adjustedTreatment(start: string, months: number, count: number, times: string[]) {
  const starts = Array.from({ length: count + 1 }, (_, index) =>
    format(addMonths(parseISO(start), index * months), 'yyyy-MM-dd'),
  )
  const periods: TreatmentPeriodInput[] = starts.slice(0, count).map((startsOn, index) =>
    period({
      id: `p${index}`,
      startsOn,
      firstDueOn: startsOn,
      times,
      createdAt: `${startsOn}T08:00:00.000Z`,
    }),
  )
  const end = starts[count] ?? start
  const allDays = days(start, end).slice(0, -1)
  const doses = allDays.flatMap((day, index) => {
    const periodId = `p${starts.filter((startsOn) => startsOn <= day).length - 1}`
    const slots = times.length > 0 ? times : [null]
    return slots.map((dueTime, slot) => {
      const nextDueDate = slot < slots.length - 1 ? day : (allDays[index + 1] ?? end)
      const at = `${day}T20:00:00.000Z`
      return {
        id: `${day}-${slot}`,
        periodId,
        dueOn: day,
        dueTime,
        givenOn: day,
        status: 'given' as const,
        nextDueDate,
        createdAt: at,
        updatedAt: at,
      }
    })
  })
  return { periods, doses, today: allDays.at(-1) ?? start }
}

describe('traitements longs ordinaires, acceptés et calculés vite', () => {
  it.each([
    [
      'à 2 heures sur 8 ans, posologie ajustée tous les 4 mois (24 périodes)',
      4,
      24,
      ['08:00', '20:00'],
    ],
    ['sans heure sur 10 ans, posologie ajustée tous les 3 mois (40 périodes)', 3, 40, []],
  ])('%s', (_, months, count, times) => {
    const long = adjustedTreatment('2016-10-01', months, count, times)

    const { result: schedule, elapsed } = fastest(() => treatmentSchedule(long))

    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentPeriodId).toBe(`p${count - 1}`)
    expect(elapsed).toBeLessThan(500)
  })
})
