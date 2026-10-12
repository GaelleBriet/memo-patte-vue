// @vitest-environment node
// Lecture des écrans avant / après (#752) : LECTURE_OUT=<dossier> LECTURE_SEEDS=400 pnpm exec vitest run scripts/test-device/lecture-avant-apres.spec.ts
// Écrit les carnets (exports à importer sur l'émulateur) et, pour la version du code en place, ce que
// montrent l'accueil, le Carnet, la fiche, le PDF et le CSV ; lancé sur `main` puis sur la branche, `diff -r`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { Book } from '../dose-engine/carnet'
import { gapsBetween } from '../dose-engine/display'
import { verdictOf } from '../dose-engine/ecarts'
import { currentEngine, readWith, v2Engine } from '../dose-engine/engines'
import { step } from '../dose-engine/walk'
import { startWalk, WalkStopped } from '../dose-engine/walk-state'
import { buildDemoCarnet } from '@/core/dev/demo-carnet'
import i18n from '@/core/i18n'
import { todoItems } from '@/features/home/logic/todo-items'
import { carnetPdfText } from '@/features/settings/logic/carnet-pdf-text'
import { toCsvTables, toJsonExport } from '@/features/settings/logic/export-format'
import { buildCarnetPdfContent } from '@/features/settings/logic/pdf-content'
import { renderCarnetPdf } from '@/features/settings/logic/render-carnet-pdf'
import { animalOf, FIXTURE_DEVICE, periodOf } from '@/features/settings/__tests__/export-fixture'
import { readPdfPages } from '@/features/settings/__tests__/pdf-reader'
import { parseExportFile } from '@/features/settings/schema/export-file.schema'
import { doseCard } from '@/features/treatments/logic/treatment-card'
import { carnetTreatments } from '@/features/treatments/logic/treatment-carnet'
import { treatmentHistory } from '@/features/treatments/logic/treatment-history'
import { readableScheduleOf } from '@/features/treatments/logic/treatment-schedule-adapter'
import { unloggedBanner } from '@/features/treatments/logic/treatment-unlogged'
import type { ExportData } from '@/shared/domain/carnet-data'

/* eslint-disable @typescript-eslint/no-explicit-any */
const out = process.env.LECTURE_OUT
const SEEDS = Number(process.env.LECTURE_SEEDS ?? 400)
const FROM = Number(process.env.LECTURE_FROM ?? 530000000)
const STEPS = Number(process.env.LECTURE_STEPS ?? 24)
const DEMO_TODAY = '2026-10-12'
const reading = import.meta.glob('/src/shared/domain/treatment-reading.ts', {
  eager: true,
}) as Record<string, { treatmentReading: (treatment: unknown, today: string) => unknown }>
const treatmentReading = Object.values(reading)[0]?.treatmentReading
const VERSION = treatmentReading === undefined ? 'avant' : 'apres'
const t = i18n.global.t as any
const STAMP = '2026-01-01T00:00:00.000Z'
const ANIMAL = '11111111-1111-4111-8111-111111111111'
const TREATMENT = '22222222-2222-4222-8222-222222222222'

let counter = 0
const ids = new Map<string, string>()
function uuid(key: string): string {
  if (!ids.has(key)) {
    counter += 1
    ids.set(
      key,
      `${String(counter).padStart(8, '0')}-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    )
  }
  return ids.get(key)!
}

const base = (): ExportData => ({
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
})
const by = { createdByDevice: FIXTURE_DEVICE, updatedByDevice: FIXTURE_DEVICE }

function walkData(seed: number, book: Book): ExportData {
  const data = base()
  data.animals.push(
    animalOf({
      id: ANIMAL,
      name: 'Milo',
      species: 'dog',
      breed: null,
      birthDate: '2022-01-01',
      photoFileName: null,
      createdAt: STAMP,
      updatedAt: STAMP,
    }),
  )
  data.treatments.push({
    id: TREATMENT,
    animalId: ANIMAL,
    name: `Graine ${seed}`,
    type: 'deworming',
    createdAt: STAMP,
    updatedAt: STAMP,
    ...by,
  })
  for (const period of book.periods) {
    data.treatmentPeriods.push(
      periodOf({
        ...period,
        id: uuid(`${seed}:${period.id}`),
        treatmentId: TREATMENT,
        animalId: ANIMAL,
        times: [...period.times],
        updatedAt: period.createdAt,
      }),
    )
  }
  for (const dose of book.doses) {
    data.treatmentDoses.push({
      ...dose,
      id: uuid(`${seed}:${dose.id}`),
      periodId: uuid(`${seed}:${dose.periodId}`),
      treatmentId: TREATMENT,
      animalId: ANIMAL,
      ...by,
    })
  }
  return data
}

function demoData(): ExportData {
  const data = base()
  const day = (iso: string) => iso
  buildDemoCarnet(new Date(`${DEMO_TODAY}T12:00:00`)).forEach(
    ({ animal, vaccinations, treatments, weights }, a) => {
      const animalId = uuid(`demo:animal:${a}`)
      data.animals.push(
        animalOf({
          ...(animal as any),
          id: animalId,
          breed: animal.breed ?? null,
          birthDate: animal.birthDate ?? null,
          photoFileName: null,
          createdAt: STAMP,
          updatedAt: STAMP,
        }),
      )
      vaccinations.forEach(({ history = [], ...vaccination }, v) => {
        const vaccinationId = uuid(`demo:vaccination:${a}:${v}`)
        const last = (vaccination as any).lastInjectionDate ?? null
        data.vaccinations.push({
          id: vaccinationId,
          animalId,
          name: vaccination.name,
          plannedDueDate: last === null ? ((vaccination as any).dueDate ?? null) : null,
          createdAt: STAMP,
          updatedAt: STAMP,
          ...by,
        })
        const injections = [
          ...(last === null
            ? []
            : [{ injectedOn: last, nextDueDate: (vaccination as any).dueDate ?? null }]),
          ...history,
        ]
        injections.forEach((injection, i) =>
          data.vaccinationInjections.push({
            id: uuid(`demo:injection:${a}:${v}:${i}`),
            vaccinationId,
            animalId,
            ...injection,
            createdAt: STAMP,
            updatedAt: STAMP,
            ...by,
          }),
        )
      })
      treatments.forEach(({ periods, ...treatment }, k) => {
        const treatmentId = uuid(`demo:treatment:${a}:${k}`)
        data.treatments.push({
          id: treatmentId,
          animalId,
          ...treatment,
          createdAt: STAMP,
          updatedAt: STAMP,
          ...by,
        })
        periods.forEach(({ doses, ...period }, p) => {
          const periodId = uuid(`demo:period:${a}:${k}:${p}`)
          const createdAt = `2026-01-01T00:00:0${p}.000Z`
          data.treatmentPeriods.push(
            periodOf({
              ...(period as any),
              id: periodId,
              treatmentId,
              animalId,
              createdAt,
              updatedAt: createdAt,
            }),
          )
          doses.forEach((dose, d) =>
            data.treatmentDoses.push({
              ...dose,
              id: uuid(`demo:dose:${a}:${k}:${p}:${d}`),
              periodId,
              treatmentId,
              animalId,
              createdAt: STAMP,
              updatedAt: STAMP,
              ...by,
            }),
          )
        })
      })
      weights.forEach((weight, w) =>
        data.weightEntries.push({
          id: uuid(`demo:weight:${a}:${w}`),
          animalId,
          weightKg: weight.weightKg,
          measuredOn: day(weight.measuredOn),
          createdAt: STAMP,
          updatedAt: STAMP,
          ...by,
        }),
      )
    },
  )
  return data
}

function walkBook(seed: number): Book | null {
  const walk = startWalk(seed, 'avec')
  try {
    for (let index = 0; index < STEPS; index += 1) step(walk, () => {})
  } catch (error) {
    if (!(error instanceof WalkStopped)) throw error
  }
  return walk.book.doses.length === 0 ? null : walk.book
}

/** Ce que le carnet montre, pour le classer : report, décalage, prise en plus, réglage changé, arrêt, fin, 31, heures. */
function traits({ periods, doses }: Book): string[] {
  const found = new Set<string>()
  if (doses.some(({ status }) => status === 'postponed')) found.add('report')
  if (doses.some(({ status }) => status === 'shift')) found.add('decalage')
  if (doses.some(({ status }) => status === 'extra')) found.add('en-plus')
  if (periods.some(({ stoppedOn }) => stoppedOn !== null) && periods.length > 1)
    found.add('arret-reprise')
  else if (periods.length > 1) found.add('reglage')
  if (periods.some(({ endsOn }) => endsOn !== null)) found.add('fin')
  if (
    periods.some(
      ({ frequency, firstDueOn }) =>
        frequency.unit === 'month' && Number(firstDueOn.slice(8)) >= 29,
    )
  )
    found.add('mensuel-31')
  if (periods.some(({ times }) => times.length > 1)) found.add('heures')
  return [...found]
}

function treatmentsOf(data: ExportData) {
  return data.treatments.map((treatment) => ({
    ...treatment,
    periods: data.treatmentPeriods
      .filter(({ treatmentId }) => treatmentId === treatment.id)
      .map((period) => ({ ...period, deletedAt: null })),
    doses: data.treatmentDoses.filter(({ treatmentId }) => treatmentId === treatment.id),
  })) as any[]
}

function screens(data: ExportData, today: string) {
  const treatments = treatmentsOf(data)
  const followed = new Set(data.animals.map(({ id }) => id))
  const sources = treatments.map((treatment) => ({
    kind: 'treatment',
    id: treatment.id,
    animalId: treatment.animalId,
    label: treatment.name,
    treatmentType: treatment.type,
    periods: treatment.periods,
    doses: treatment.doses,
  }))
  const fiche = treatments.map((treatment) => {
    const schedule = readableScheduleOf(treatment, today)
    const view = treatmentReading === undefined ? schedule : treatmentReading(treatment, today)
    if (schedule === null || view === null) return { name: treatment.name, illisible: true }
    const reads: any = treatmentReading === undefined ? schedule : { view, schedule }
    return {
      name: treatment.name,
      carte: doseCard(t, treatment, view as any, { animal: 'Milo', today }),
      aRenseigner: unloggedBanner(t, treatment, view as any, today),
      historique: treatmentHistory(t, treatment, reads, today),
    }
  })
  const pdf = data.animals.map(({ id }) => {
    const content = buildCarnetPdfContent(data, id, today)!
    const pages = readPdfPages(renderCarnetPdf([{ content, photoDataUrl: null }], '0.0.0', t))
    return {
      texte: carnetPdfText(content, t),
      pages: pages.map((page) => page.texts.map(({ text }) => text).join(' ')),
    }
  })
  return {
    today,
    accueil: todoItems(sources as any, today, followed),
    carnet: data.animals.map(({ id }) =>
      carnetTreatments(
        t,
        treatments.filter(({ animalId }) => animalId === id),
        today,
      ),
    ),
    fiche,
    pdf: JSON.parse(JSON.stringify(pdf).replace(/Généré le [^"]*/g, 'Généré le …')),
    csv: toCsvTables(data, 'kg', today),
  }
}

function write(name: string, data: ExportData, today: string) {
  const text = toJsonExport(data, {
    exportedAt: new Date(`${today}T12:00:00`),
    appVersion: '0.0.0',
  } as any)
  expect(parseExportFile(text)).toMatchObject({ ok: true })
  mkdirSync(join(out!, 'carnets'), { recursive: true })
  writeFileSync(join(out!, 'carnets', `${name}.json`), text)
  writeFileSync(join(out!, 'carnets', `${name}.today`), today)
  mkdirSync(join(out!, VERSION), { recursive: true })
  const shown = JSON.stringify(screens(data, today), null, 1).replaceAll(' ', ' ')
  writeFileSync(join(out!, VERSION, `${name}.json`), shown)
}

describe.skipIf(out === undefined)('lecture des écrans, avant / après (#752)', () => {
  it(`écrit les carnets et ce que montre la version « ${VERSION} »`, () => {
    write('demo', demoData(), DEMO_TODAY)
    const chosen: Record<string, number> = {}
    const families: Record<string, unknown> = {}
    let written = 1
    for (let seed = FROM; seed < FROM + SEEDS; seed += 1) {
      const book = walkBook(seed)
      if (book === null) continue
      write(`graine-${seed}`, walkData(seed, book), book.today)
      written += 1
      for (const trait of traits(book)) chosen[trait] ??= seed
      const [a, b] = [readWith(currentEngine, book), readWith(v2Engine, book)]
      if (gapsBetween(a, b).length > 0) {
        const { families: found, unexplained } = verdictOf(book, a, b, (each, until) =>
          readWith(v2Engine, each, until),
        )
        families[`graine-${seed}`] = { familles: found, inexpliquees: unexplained }
      }
    }
    writeFileSync(join(out!, 'carnets-choisis.json'), JSON.stringify(chosen, null, 1))
    writeFileSync(join(out!, 'familles.json'), JSON.stringify(families, null, 1))
    expect(written).toBeGreaterThan(1)
    process.stdout.write(
      `Lecture « ${VERSION} » : ${written} carnets ; ${JSON.stringify(chosen)}\n`,
    )
  }, 900_000)
})
