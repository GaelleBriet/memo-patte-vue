import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MAX_TEXT_LENGTH } from '@/features/settings/schema/export-file-rows.schema'
import { timesColumn } from '@/features/treatments/repository/treatment-period-row.repository'
import {
  gridBeforeColumn,
  MAX_GRID_BEFORE_LENGTH,
} from '@/features/treatments/schema/grid-before.schema'
import { treatmentTimesSchema } from '@/features/treatments/schema/treatment-period.schema'
import { CLOCK_TIME_PATTERN, MAX_TIMES_PER_DAY } from '@/shared/domain/clock-time'
import type { GridBefore } from '@/shared/domain/dose-calendar'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const MIGRATIONS = resolve(__dirname, '../../supabase/migrations')

const migrations = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(resolve(MIGRATIONS, name), 'utf8'))
  .join('\n')

function lastCheck(constraint: string): string {
  const checks = [
    ...migrations.matchAll(new RegExp(`${constraint}\\s+check \\((.+)\\)[,;]?$`, 'gm')),
  ]
  const check = checks.at(-1)?.[1]
  if (check === undefined) throw new Error(`Contrainte introuvable : ${constraint}`)
  return check
}

function serverPattern(constraint: string, column: string): RegExp {
  const pattern = new RegExp(`^${column} ~ '([^']+)'$`).exec(lastCheck(constraint))?.[1]
  if (pattern === undefined) throw new Error(`Motif illisible : ${constraint}`)
  return new RegExp(pattern)
}

function serverMaxLength(constraint: string, column: string): number {
  const max = new RegExp(`^char_length\\(${column}\\) <= (\\d+)$`).exec(lastCheck(constraint))?.[1]
  if (max === undefined) throw new Error(`Longueur illisible : ${constraint}`)
  return Number(max)
}

const everyMinute = Array.from({ length: 24 * 60 }, (_, minute) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
})
const invalidTimes = ['', '8:00', '08:00:00', '24:00', '08:60', '08h00', '08:00,20:00', ' 08:00']

describe('limites des colonnes texte des miroirs, face à ce que l’app écrit', () => {
  it.each([
    ['treatment_period_reminder_time_format', 'reminder_time'],
    ['treatment_dose_due_time_format', 'due_time'],
    ['treatment_dose_previous_target_time_format', 'previous_target_time'],
  ])('%s : le serveur accepte exactement les heures de l’app', (constraint, column) => {
    const server = serverPattern(constraint, column)

    const disagreements = [...everyMinute, ...invalidTimes].filter(
      (time) => server.test(time) !== CLOCK_TIME_PATTERN.test(time),
    )

    expect(disagreements).toEqual([])
  })

  it('heures d’une période : toute liste que l’app garde est acceptée, une heure de plus refusée', () => {
    const server = serverPattern('treatment_period_times_format', 'times')
    const allDay = everyMinute.filter((_, minute) => minute % 60 === 59)
    const lists = [...everyMinute.map((time) => [time]), allDay, ['20:00', '08:00']]

    expect(lists.every((times) => treatmentTimesSchema.safeParse(times).success)).toBe(true)
    expect(lists.filter((times) => !server.test(timesColumn(times)!))).toEqual([])
    expect(allDay).toHaveLength(MAX_TIMES_PER_DAY)
    expect(server.test(timesColumn([...allDay, '12:30'])!)).toBe(false)
    expect(timesColumn([])).toBeNull()
  })

  it.each([
    ['animal_name_length', 'name'],
    ['animal_breed_length', 'breed'],
    ['vaccination_name_length', 'name'],
    ['treatment_name_length', 'name'],
  ])('%s : le serveur pose la même longueur que l’app', (constraint, column) => {
    expect(serverMaxLength(constraint, column)).toBe(MAX_NAME_LENGTH)
  })

  it('nom de photo : un nom de l’app ou d’un import tient dans la colonne', () => {
    const max = serverMaxLength('animal_photo_path_length', 'photo_path')

    expect(`${crypto.randomUUID()}.jpg`.length).toBeLessThanOrEqual(max)
    expect(MAX_TEXT_LENGTH).toBeLessThanOrEqual(max)
  })

  it('grille d’avant : la plus longue que l’app range tient, même réécrite en jsonb par le serveur', () => {
    const max = serverMaxLength('treatment_period_grid_before_length', 'grid_before')
    const run = ['2026-03-26', '2026-03-29'] as const
    const grid = (count: number): GridBefore => ({
      frequency: { value: 1, unit: 'month' },
      endsOn: '2026-12-31',
      writtenAt: '2026-03-26T07:00:00.000Z',
      runs: Array.from({ length: count }, () => run),
    })
    let count = 1
    while ((gridBeforeColumn(grid(count + 1))?.length ?? Infinity) <= MAX_GRID_BEFORE_LENGTH) {
      count += 1
    }
    const longest = gridBeforeColumn(grid(count))!
    const asJsonbText = longest.replace(/,/g, ', ').replace(/:/g, ': ')

    expect(longest.length).toBeLessThanOrEqual(MAX_GRID_BEFORE_LENGTH)
    expect(asJsonbText.length).toBeLessThanOrEqual(max)
  })
})
