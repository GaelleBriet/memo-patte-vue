// @vitest-environment node
// Rappels programmés avant / après (#755) : RAPPELS_OUT=<dossier> RAPPELS_TODAY=<jour de l'émulateur>
// pnpm exec vitest run scripts/test-device/rappels-avant-apres.spec.ts
// Écrit dix carnets ramenés au jour de l'émulateur, un carnet qui les réunit, et les rappels attendus
// de chaque côté (`attendus.json`) ; `rappels-avant-apres.sh` les importe et relève les alarmes.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { daysBetween, plusDays, type Book } from '../dose-engine/carnet'
import { gapsBetween } from '../dose-engine/display'
import { currentEngine, readWith, v2Engine } from '../dose-engine/engines'
import { legacyReminders, viewReminders } from '../dose-engine/legacy-reminders'
import { step } from '../dose-engine/walk'
import { keptBook, startWalk, WalkStopped } from '../dose-engine/walk-state'
import { toJsonExport } from '@/features/settings/logic/export-format'
import { animalOf, FIXTURE_DEVICE, periodOf } from '@/features/settings/__tests__/export-fixture'
import { parseExportFile } from '@/features/settings/schema/export-file.schema'
import type { ExportData } from '@/shared/domain/carnet-data'
import { gridOriginsOf, targetOnOf, type DueReminder } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { REMINDER_WINDOW } from '../dose-engine/legacy-reminders'

const out = process.env.RAPPELS_OUT
const TODAY = process.env.RAPPELS_TODAY ?? '2026-10-13'
const FROM = Number(process.env.RAPPELS_FROM ?? 640000000)
const STAMP = '2026-01-01T00:00:00.000Z'
const by = { createdByDevice: FIXTURE_DEVICE, updatedByDevice: FIXTURE_DEVICE }

const uuid = (n: number, kind: number) =>
  `${String(n).padStart(8, '0')}-000${kind}-4000-8000-${String(n).padStart(12, '0')}`

function shifted(book: Book, today: string): Book {
  const delta = daysBetween(book.today, today)
  const day = <T extends string | null>(value: T): T =>
    (value === null ? null : plusDays(value, delta)) as T
  return {
    today,
    periods: book.periods.map((period) => ({
      ...period,
      startsOn: day(period.startsOn),
      firstDueOn: day(period.firstDueOn),
      referenceOn: day(period.referenceOn),
      endsOn: day(period.endsOn),
      stoppedOn: day(period.stoppedOn),
    })),
    doses: book.doses.map((dose) => ({
      ...dose,
      dueOn: day(dose.dueOn),
      givenOn: day(dose.givenOn),
      nextDueDate: day(dose.nextDueDate),
    })),
  }
}

function emptyData(): ExportData {
  return {
    carnetSettings: null,
    animals: [],
    vaccinations: [],
    vaccinationInjections: [],
    treatments: [],
    treatmentPeriods: [],
    treatmentDoses: [],
    weightEntries: [],
    devices: [
      { id: FIXTURE_DEVICE, model: null, installedAt: STAMP, createdAt: STAMP, updatedAt: STAMP },
    ],
  }
}

let counter = 0
function addCarnet(data: ExportData, seed: number, book: Book): string {
  const animalId = uuid(seed % 100_000, 1)
  const treatmentId = uuid(seed % 100_000, 2)
  data.animals.push(
    animalOf({
      id: animalId,
      name: `G${seed % 1000}`,
      species: 'dog',
      breed: null,
      birthDate: '2022-01-01',
      photoFileName: null,
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  )
  data.treatments.push({
    id: treatmentId,
    animalId,
    name: `Graine ${seed}`,
    type: 'deworming',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...by,
  })
  const ids = new Map<string, string>()
  const idOf = (local: string) => {
    if (!ids.has(local)) ids.set(local, uuid((counter += 1), 3))
    return ids.get(local)!
  }
  const origins = gridOriginsOf(book.periods)
  for (const { referenceOn: _, ...period } of book.periods) {
    data.treatmentPeriods.push(
      periodOf({
        ...period,
        gridOriginOn: origins.get(period.id) ?? null,
        id: idOf(period.id),
        treatmentId,
        animalId,
        times: [...period.times],
        updatedAt: period.createdAt,
      }),
    )
  }
  for (const { nextDueDate, ...dose } of book.doses) {
    data.treatmentDoses.push({
      ...dose,
      targetOn: targetOnOf({ status: dose.status, nextDueDate }),
      id: idOf(dose.id),
      periodId: idOf(dose.periodId),
      treatmentId,
      animalId,
      ...by,
    })
  }
  return treatmentId
}

function walkBook(seed: number): Book {
  const walk = startWalk(seed, 'avec')
  try {
    for (let index = 0; index < 24; index += 1) step(walk, () => {})
  } catch (error) {
    if (!(error instanceof WalkStopped)) throw error
  }
  return keptBook(walk)
}

type Chosen = { seed: number; book: Book; sameView: boolean; sameReminders: boolean }

function choose(): Chosen[] {
  const chosen: Chosen[] = []
  for (let seed = FROM; chosen.length < 10 && seed < FROM + 2000; seed += 1) {
    const book = shifted(walkBook(seed), TODAY)
    const [old, now] = [legacyReminders(book), viewReminders(book)]
    if ('error' in old || 'error' in now || now.reminders.length === 0) continue
    const sameView =
      gapsBetween(readWith(currentEngine, book), readWith(v2Engine, book)).length === 0
    const sameReminders = JSON.stringify(old.reminders) === JSON.stringify(now.reminders)
    const alike = chosen.filter((each) => each.sameReminders === sameReminders).length
    if (alike < (sameReminders ? 6 : 4)) chosen.push({ seed, book, sameView, sameReminders })
  }
  return chosen
}

function write(name: string, data: ExportData) {
  const text = toJsonExport(data, {
    exportedAt: new Date(`${TODAY}T12:00:00`),
    appVersion: '0.0.0',
  })
  expect(parseExportFile(text)).toMatchObject({ ok: true })
  writeFileSync(join(out!, `${name}.json`), text)
}

describe.skipIf(out === undefined)('rappels programmés avant / après (#755)', () => {
  it('écrit dix carnets au jour de l’émulateur et les rappels attendus', () => {
    mkdirSync(out!, { recursive: true })
    const all = emptyData()
    const expected: Record<string, unknown> = {}
    for (const { seed, book, sameView, sameReminders } of choose()) {
      const single = emptyData()
      const treatmentId = addCarnet(single, seed, book)
      addCarnet(all, seed, book)
      write(`graine-${seed}`, single)
      const read = readTreatment(
        { periods: single.treatmentPeriods, doses: single.treatmentDoses },
        TODAY,
      )
      const line = ({ moment, due, on }: DueReminder) =>
        `${moment} ${due.dueOn}${due.dueTime === null ? '' : ` ${due.dueTime}`} → ${on}`
      expected[`graine-${seed}`] = {
        treatmentId,
        lueParLApp: read?.view.reminders(REMINDER_WINDOW).map(line) ?? 'illisible',
        ficheIdentique: sameView,
        rappelsIdentiques: sameReminders,
        avant: legacyReminders(book),
        apres: viewReminders(book),
      }
    }
    write('dix-carnets', all)
    writeFileSync(join(out!, 'attendus.json'), JSON.stringify(expected, null, 1))
    expect(Object.keys(expected)).toHaveLength(10)
  }, 300_000)
})
