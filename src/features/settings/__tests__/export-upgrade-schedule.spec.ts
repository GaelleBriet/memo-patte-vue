import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { parseExportFile } from '../service/data-import.service'
import announcedV2 from './fixtures/announced-v2-0.1.48.json'
import announcedV3 from './fixtures/announced-v3-0.1.56.json'
import exportV1 from './fixtures/export-v1-0.1.37.json?raw'
import exportV2 from './fixtures/export-v2-0.1.48.json?raw'
import exportV3 from './fixtures/export-v3-0.1.56.json?raw'
import type { ExportData } from '@/shared/domain/carnet-data'
import { treatmentSchedule } from '@/shared/domain/treatment-schedule'

/**
 * Le format courant relu par le moteur d'échéances doit dire ce que l'app de l'époque annonçait :
 * `announced-*.json` a été écrit par le code de la 0.1.48 et de la 0.1.56, à côté de son export.
 */
const IMPORTEUR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TREATMENT = '0b6f7f2e-3a8d-4f0e-9a1c-5d2b7e8f9a01'
const PERIOD = '7c1e9a3b-2d4f-4b6a-8e0c-1f3a5b7d9e2c'

type Document = Record<string, unknown>
type Row = Record<string, unknown>

function converted(text: string): ExportData {
  const parsed = parseExportFile(text, () => IMPORTEUR)
  if (!parsed.ok) throw new Error(`export refusé : ${parsed.reason}`)
  return parsed.file.data
}

function scheduleOf(data: ExportData, treatmentId: string, today: string) {
  return treatmentSchedule({
    periods: data.treatmentPeriods.filter((period) => period.treatmentId === treatmentId),
    doses: data.treatmentDoses.filter((dose) => dose.treatmentId === treatmentId),
    today,
  })
}

function days(dues: { dueOn: string }[]): string[] {
  return dues.map(({ dueOn }) => dueOn)
}

function v2With(frequency: Row, doses: [string, string][]): string {
  const document = JSON.parse(exportV2) as Document
  const luna = (document.animals as Row[])[0]!.id
  const at = '2026-09-20T08:00:00.000Z'
  document.treatments = [
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
  document.treatmentDoses = doses.map(([givenOn, nextDueDate], index) => ({
    id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`,
    treatmentId: TREATMENT,
    animalId: luna,
    givenOn,
    nextDueDate,
    frequency,
    createdAt: `${givenOn}T08:00:00.000Z`,
    updatedAt: `${givenOn}T08:00:00.000Z`,
  }))
  return JSON.stringify(document)
}

function v3With(doses: Row[], period: Row = {}): string {
  const document = JSON.parse(exportV3) as Document
  const milo = (document.animals as Row[]).find((animal) => animal.name === 'Milo')!.id
  const at = '2026-10-01T08:00:00.000Z'
  document.treatments = [
    {
      id: TREATMENT,
      animalId: milo,
      name: 'Stronghold',
      type: 'antiparasitic',
      createdAt: at,
      updatedAt: at,
    },
  ]
  document.treatmentPeriods = [
    {
      id: PERIOD,
      treatmentId: TREATMENT,
      animalId: milo,
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-02',
      endsOn: null,
      stoppedOn: null,
      frequency: { value: 1, unit: 'week' },
      times: [],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
      createdAt: at,
      updatedAt: at,
      ...period,
    },
  ]
  document.treatmentDoses = doses.map((dose, index) => ({
    id: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}`,
    periodId: PERIOD,
    treatmentId: TREATMENT,
    animalId: milo,
    dueTime: null,
    givenOn: null,
    createdAt: at,
    updatedAt: at,
    ...dose,
  }))
  return JSON.stringify(document)
}

describe('anciens exports relus par le moteur d’échéances', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-31T12:00:00.000Z') })
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  describe('v1', () => {
    it.each(
      (JSON.parse(exportV1) as { treatments: { name: string; id: string; nextDueDate: string }[] })
        .treatments,
    )('$name : la prochaine dose est celle que l’app annonçait', ({ id, nextDueDate }) => {
      const schedule = scheduleOf(converted(exportV1), id, '2026-09-23')

      expect(days(schedule.currentDoses)).toEqual([nextDueDate])
      expect(schedule.unloggedDoses).toEqual([])
    })

    it('ancre la suite sur la prochaine échéance du fichier quand elle ne part pas de la prise', () => {
      const document = JSON.parse(exportV1) as Document
      const [stronghold] = document.treatments as Row[]
      Object.assign(stronghold!, { lastDoseDate: '2026-09-01', nextDueDate: '2026-10-02' })

      const schedule = scheduleOf(
        converted(JSON.stringify(document)),
        stronghold!.id as string,
        '2026-09-23',
      )

      expect(days(schedule.upcoming(2))).toEqual(['2026-10-02', '2026-10-30'])
      expect(schedule.unloggedDoses).toEqual([])
    })
  })

  describe('v2', () => {
    it.each(announcedV2.treatments.filter(({ stoppedOn }) => stoppedOn === null))(
      '$name : même prochaine dose qu’à l’époque, aucune dose à renseigner',
      ({ id, nextDueDate }) => {
        const schedule = scheduleOf(converted(exportV2), id, announcedV2.today)

        expect(schedule.unloggedDoses).toEqual([])
        expect(days(schedule.currentDoses)).toEqual([nextDueDate])
      },
    )

    it.each(announcedV2.treatments.filter(({ stoppedOn }) => stoppedOn !== null))(
      '$name : arrêté, comme à l’époque, sans dose à renseigner',
      ({ id }) => {
        const schedule = scheduleOf(converted(exportV2), id, announcedV2.today)

        expect(schedule.phase).toBe('stopped')
        expect(schedule.unloggedDoses).toEqual([])
      },
    )

    it('une prise donnée en retard : la suite part de sa date réelle, comme à l’époque', () => {
      const text = v2With({ value: 4, unit: 'week' }, [
        ['2026-08-04', '2026-09-01'],
        ['2026-09-03', '2026-10-01'],
      ])

      const schedule = scheduleOf(converted(text), TREATMENT, '2026-10-07')

      expect(schedule.unloggedDoses).toEqual([])
      expect(schedule.phase).toBe('overdue')
      expect(days(schedule.currentDoses)).toEqual(['2026-10-01'])
    })

    it('un hebdomadaire donné tous les 9 jours : aucune dose à renseigner, la suite part de la dernière', () => {
      const given = Array.from({ length: 20 }, (_, index) => {
        const day = new Date(Date.UTC(2026, 0, 1 + 9 * index))
        const next = new Date(day.getTime() + 7 * 86_400_000)
        return [day.toISOString().slice(0, 10), next.toISOString().slice(0, 10)] as [string, string]
      })

      const schedule = scheduleOf(
        converted(v2With({ value: 1, unit: 'week' }, given)),
        TREATMENT,
        given.at(-1)![0],
      )

      expect(schedule.unloggedDoses).toEqual([])
      expect(days(schedule.currentDoses)).toEqual([given.at(-1)![1]])
    })

    it('une prise donnée en avance, dont la prochaine échéance précède celle attendue : la date de l’époque', () => {
      const text = v2With({ value: 2, unit: 'day' }, [
        ['2025-02-24', '2025-02-26'],
        ['2025-02-26', '2025-03-02'],
        ['2025-02-27', '2025-03-01'],
      ])

      const schedule = scheduleOf(converted(text), TREATMENT, '2025-02-27')

      expect(schedule.unloggedDoses).toEqual([])
      expect(days(schedule.currentDoses)).toEqual(['2025-03-01'])
    })

    it('un mensuel du 31 donné le dernier jour des mois courts : la prochaine dose de l’époque', () => {
      const schedule = scheduleOf(
        converted(
          v2With({ value: 1, unit: 'month' }, [
            ['2026-01-31', '2026-02-28'],
            ['2026-02-28', '2026-03-28'],
            ['2026-03-28', '2026-04-28'],
          ]),
        ),
        TREATMENT,
        '2026-04-01',
      )

      expect(schedule.unloggedDoses).toEqual([])
      expect(days(schedule.currentDoses)).toEqual(['2026-04-28'])
    })
  })

  describe('v3', () => {
    it.each(announcedV3.treatments)(
      '$name : même phase, mêmes doses du moment, à renseigner et à venir qu’à l’époque',
      ({ id, phase, currentDoses, unloggedDoses, upcoming }) => {
        const schedule = scheduleOf(converted(exportV3), id, announcedV3.today)

        expect(schedule.phase).toBe(phase)
        expect(schedule.currentDoses).toEqual(currentDoses)
        expect(schedule.unloggedDoses).toEqual(unloggedDoses)
        const isOver = phase === 'stopped' || phase === 'ended'
        expect(isOver ? [] : days(schedule.upcoming(3))).toEqual(upcoming)
      },
    )

    it('un report du vendredi 16 au lundi 19 : la suite part du 19, comme à l’époque', () => {
      const { today, phase, upcoming } = announcedV3.scenarios.postponedWithSuite
      const text = v3With([
        { dueOn: '2026-10-02', givenOn: '2026-10-02', status: 'given', nextDueDate: '2026-10-09' },
        { dueOn: '2026-10-09', givenOn: '2026-10-09', status: 'given', nextDueDate: '2026-10-16' },
        { dueOn: '2026-10-16', status: 'postponed', nextDueDate: '2026-10-19' },
      ])

      const schedule = scheduleOf(converted(text), TREATMENT, today)

      expect(schedule.phase).toBe(phase)
      expect(days(schedule.upcoming(4))).toEqual(upcoming)
      expect(upcoming).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
    })

    it('la dose du 9 donnée le 11 : prochaines doses le 18 puis le 25, comme à l’époque', () => {
      const { today, phase, upcoming } = announcedV3.scenarios.givenLate
      const text = v3With([
        { dueOn: '2026-10-02', givenOn: '2026-10-02', status: 'given', nextDueDate: '2026-10-09' },
        { dueOn: '2026-10-09', givenOn: '2026-10-11', status: 'given', nextDueDate: '2026-10-18' },
      ])

      const schedule = scheduleOf(converted(text), TREATMENT, today)

      expect(schedule.phase).toBe(phase)
      expect(schedule.unloggedDoses).toEqual([])
      expect(days(schedule.upcoming(3))).toEqual(upcoming)
      expect(upcoming.slice(0, 2)).toEqual(['2026-10-18', '2026-10-25'])
    })

    function lines(
      rows: [string, string | null, string | null, string, string, number, number][],
    ): Row[] {
      const at = (second: number) =>
        `2026-03-01T00:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}.000Z`
      return rows.map(([dueOn, dueTime, givenOn, status, nextDueDate, created, updated]) => ({
        dueOn,
        dueTime,
        givenOn,
        status,
        nextDueDate,
        createdAt: at(created),
        updatedAt: at(updated),
      }))
    }

    function keys(dues: { dueOn: string; dueTime: string | null }[]): string[] {
      return dues.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`.trim())
    }

    it('une prise redatée du 9 au 10 mars alors que les 16, 23 et 30 étaient notés : rien à renseigner', () => {
      const text = v3With(
        lines([
          ['2026-03-02', null, '2026-03-02', 'given', '2026-03-09', 0, 0],
          ['2026-03-09', null, '2026-03-10', 'given', '2026-03-17', 1, 6],
          ['2026-03-16', null, '2026-03-16', 'given', '2026-03-23', 2, 2],
          ['2026-03-23', null, '2026-03-23', 'given', '2026-03-30', 3, 3],
          ['2026-03-30', null, '2026-03-30', 'given', '2026-04-06', 4, 4],
        ]),
        { startsOn: '2026-03-02', firstDueOn: '2026-03-02' },
      )

      const schedule = scheduleOf(converted(text), TREATMENT, '2026-04-07')

      expect(schedule.phase).toBe('overdue')
      expect(keys(schedule.currentDoses)).toEqual(['2026-04-06'])
      expect(schedule.unloggedDoses).toEqual([])
      expect(keys(schedule.upcoming(4))).toEqual([
        '2026-04-13',
        '2026-04-20',
        '2026-04-27',
        '2026-05-04',
      ])
    })

    it('un quotidien à 8 h et 20 h, des prises redatées à la veille et des reports : les doses à renseigner de l’époque', () => {
      const text = v3With(
        lines([
          ['2026-03-02', '08:00', null, 'postponed', '2026-03-04', 0, 0],
          ['2026-03-04', '08:00', null, 'missed', '2026-03-04', 1, 1],
          ['2026-03-04', '20:00', '2026-03-05', 'given', '2026-03-05', 2, 126],
          ['2026-03-05', '08:00', '2026-03-04', 'given', '2026-03-05', 3, 124],
          ['2026-03-05', '20:00', null, 'postponed', '2026-03-16', 5, 5],
          ['2026-03-16', '08:00', '2026-03-16', 'given', '2026-03-16', 7, 7],
          ['2026-03-16', '20:00', '2026-03-16', 'given', '2026-03-17', 8, 8],
          ['2026-03-17', '08:00', null, 'missed', '2026-03-17', 9, 9],
          ['2026-03-17', '20:00', null, 'postponed', '2026-03-22', 10, 10],
        ]),
        {
          startsOn: '2026-03-02',
          firstDueOn: '2026-03-02',
          frequency: { value: 1, unit: 'day' },
          times: ['08:00', '20:00'],
        },
      )

      const schedule = scheduleOf(converted(text), TREATMENT, '2026-03-24')

      expect(schedule.phase).toBe('today')
      expect(keys(schedule.currentDoses)).toEqual(['2026-03-24 08:00', '2026-03-24 20:00'])
      expect(keys(schedule.unloggedDoses)).toEqual([
        '2026-03-22 08:00',
        '2026-03-22 20:00',
        '2026-03-23 08:00',
        '2026-03-23 20:00',
      ])
      expect(keys(schedule.upcoming(4))).toEqual([
        '2026-03-24 08:00',
        '2026-03-24 20:00',
        '2026-03-25 08:00',
        '2026-03-25 20:00',
      ])
    })
  })
})
