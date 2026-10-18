// @vitest-environment node
import { addMonths, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { newSettings, treatmentView } from '../domain/dose-calendar'
import type { Line, Setting, TreatmentViewInput } from '../domain/dose-calendar/types'
import { DAY, days, H, setting, WEEK } from './dose-calendar.v2.aides'
import { cpuMs } from './cpu-time'

const TWO_YEARS = days('2024-10-01', '2026-09-30')

function givenAt(day: string, dueTime: string | null, settingId = 's1'): Line {
  return {
    id: `${day}-${dueTime}`,
    settingId,
    dueOn: day,
    dueTime,
    status: 'given',
    givenOn: day,
    targetOn: null,
    updatedAt: `${day}T12:00:00.000Z`,
  }
}

const input: TreatmentViewInput = {
  settings: [setting('s1', '2024-10-01', DAY, H)],
  lines: TWO_YEARS.flatMap((day) => H.map((time) => givenAt(day, time))),
  today: '2026-09-30',
}

// Meilleur de trois essais : garde visible une régression, écarte le bruit.
function fastest<T>(run: () => T): { result: T; elapsed: number } {
  let best = { result: run(), elapsed: Infinity }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = cpuMs()
    const result = run()
    const elapsed = cpuMs() - start
    if (elapsed < best.elapsed) best = { result, elapsed }
  }
  return best
}

describe('performance', () => {
  it('un traitement quotidien à deux heures, sur deux ans, se calcule en moins de 100 ms', () => {
    const { result: view, elapsed } = fastest(() => {
      const computed = treatmentView(input)
      computed.upcoming({ limit: 400 })
      return computed
    })

    expect(input.lines).toHaveLength(1460)
    expect(view.unloggedDoses).toEqual([])
    expect(view.currentDoses).toEqual([{ settingId: 's1', dueOn: '2026-10-01', dueTime: '08:00' }])
    expect(elapsed).toBeLessThan(100)
  })

  it('le même traitement sans aucune prise notée aussi', () => {
    const { result: view, elapsed } = fastest(() => treatmentView({ ...input, lines: [] }))

    expect(view.unloggedDoses).toHaveLength(1458)
    expect(elapsed).toBeLessThan(100)
  })

  it('un report forgé vers 9999 se lit sans rien dérouler', () => {
    const forged: Line = {
      ...givenAt('2026-09-01', '08:00'),
      status: 'postponed',
      givenOn: null,
      targetOn: '9999-12-31',
    }

    const { elapsed } = fastest(() => treatmentView({ ...input, lines: [forged] }).currentDoses)

    expect(elapsed).toBeLessThan(50)
  })
})

const everyHour = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)

describe('date très lointaine (fichier forgé ou faute de frappe)', () => {
  it('un réglage à 24 heures par jour suivi d’un réglage en 2199 se lit en moins de 100 ms', () => {
    const forged: TreatmentViewInput = {
      settings: [setting('s1', '2026-09-01', DAY, everyHour), setting('s2', '2199-12-30', DAY)],
      lines: [],
      today: '2026-09-28',
    }

    const { result: view, elapsed } = fastest(() => {
      const computed = treatmentView(forged)
      computed.upcoming({ limit: 400 })
      return computed
    })

    expect(view.unloggedDoses).toHaveLength(27 * 24)
    expect(view.currentDoses).toEqual(
      everyHour.map((dueTime) => ({ settingId: 's1', dueOn: '2026-09-28', dueTime })),
    )
    expect(view.nextDue).toEqual({ settingId: 's1', dueOn: '2026-09-29', dueTime: '00:00' })
    expect(elapsed).toBeLessThan(100)
  }, 20000)

  it('les rappels du même traitement se calculent en moins de 100 ms', () => {
    const forged: TreatmentViewInput = {
      settings: [setting('s1', '2026-09-01', DAY, everyHour), setting('s2', '2199-12-30', DAY)],
      lines: [],
      today: '2026-09-28',
    }

    const { result: reminders, elapsed } = fastest(
      () => treatmentView(forged).reminders({ count: 64, daysBefore: 0, daysAfter: 0 }).reminders,
    )

    expect(reminders.filter(({ moment }) => moment === 'due')).toHaveLength(5 * 24)
    expect(elapsed).toBeLessThan(100)
  }, 20000)

  it('un réglage à 24 heures par jour qui finit le 30/12/2199 se lit en moins de 100 ms', () => {
    const typo: TreatmentViewInput = {
      settings: [setting('s1', '2026-09-01', DAY, everyHour, { endsOn: '2199-12-30' })],
      lines: [],
      today: '2026-09-28',
    }

    const { result: view, elapsed } = fastest(() => {
      const computed = treatmentView(typo)
      computed.upcoming({ limit: 400 })
      return computed
    })

    expect(view.lastDueDay).toBe('2199-12-30')
    expect(view.nextDue).toEqual({ settingId: 's1', dueOn: '2026-09-29', dueTime: '00:00' })
    expect(elapsed).toBeLessThan(100)
  }, 20000)

  it.each([
    ['24 heures par jour', everyHour, 27 * 24],
    ['8 h et 20 h', H, 27 * 2],
  ])(
    '%s suivi d’un réglage hebdomadaire en 2199 se lit en moins de 100 ms',
    (_, times, late) => {
      const forged: TreatmentViewInput = {
        settings: [setting('s1', '2026-09-01', DAY, times), setting('s2', '2199-12-30', WEEK)],
        lines: [],
        today: '2026-09-28',
      }

      const { result, elapsed } = fastest(() => {
        const computed = treatmentView(forged)
        const upcoming = computed.upcoming({ limit: 400 })
        const reminders = computed.reminders({ count: 64, daysBefore: 0, daysAfter: 0 }).reminders
        return { view: computed, upcoming, reminders }
      })

      const far = { settingId: 's2', dueOn: '2199-12-30', dueTime: null }
      expect(result.view.unloggedDoses).toHaveLength(late)
      expect(result.view.currentDoses).toEqual([far])
      expect(result.view.nextDue).toEqual(far)
      expect(result.upcoming).toEqual([])
      expect(result.reminders.filter(({ moment }) => moment === 'due')).toHaveLength(67)
      expect(elapsed).toBeLessThan(100)
    },
    20000,
  )

  it('« Modifier » avec une date de fin au 30/12/2199 propose ses dates en moins de 100 ms', () => {
    const current: TreatmentViewInput = {
      settings: [setting('s1', '2026-09-01', DAY, everyHour)],
      lines: [givenAt('2026-09-27', '08:00')],
      today: '2026-09-28',
    }

    const { result, elapsed } = fastest(() =>
      newSettings(current, { frequency: DAY, times: everyHour, endsOn: '2199-12-30' }),
    )

    expect(result).toEqual({
      plan: {
        action: 'create',
        setting: {
          startsOn: '2026-09-28',
          firstDueOn: '2026-09-28',
          gridOriginOn: null,
          firstDueChosen: false,
          pastDosesStayUnlogged: false,
          endsOn: '2199-12-30',
          frequency: DAY,
          times: everyHour,
        },
      },
    })
    expect(elapsed).toBeLessThan(100)
  }, 20000)
})

// Un réglage par ajustement de posologie, toutes les prises données à leur jour.
function adjustedTreatment(start: string, months: number, count: number, times: string[]) {
  const starts = Array.from({ length: count + 1 }, (_, index) =>
    format(addMonths(parseISO(start), index * months), 'yyyy-MM-dd'),
  )
  const settings: Setting[] = starts
    .slice(0, count)
    .map((startsOn, index) =>
      setting(`s${index}`, startsOn, DAY, times, { createdAt: `${startsOn}T08:00:00.000Z` }),
    )
  const end = starts[count] ?? start
  const allDays = days(start, end).slice(0, -1)
  const lines = allDays.flatMap((day) => {
    const settingId = `s${starts.filter((startsOn) => startsOn <= day).length - 1}`
    return (times.length > 0 ? times : [null]).map((time) => givenAt(day, time, settingId))
  })
  return { settings, lines, today: allDays.at(-1) ?? start }
}

describe('traitements longs ordinaires, acceptés et calculés vite', () => {
  it.each([
    [
      'à 2 heures sur 8 ans, posologie ajustée tous les 4 mois (24 réglages)',
      4,
      24,
      ['08:00', '20:00'],
    ],
    ['sans heure sur 10 ans, posologie ajustée tous les 3 mois (40 réglages)', 3, 40, []],
  ])('%s', (_, months, count, times) => {
    const long = adjustedTreatment('2016-10-01', months, count, times)

    const { result: view, elapsed } = fastest(() => treatmentView(long))

    expect(view.unloggedDoses).toEqual([])
    expect(view.currentSetting?.id).toBe(`s${count - 1}`)
    expect(elapsed).toBeLessThan(500)
  })
})
