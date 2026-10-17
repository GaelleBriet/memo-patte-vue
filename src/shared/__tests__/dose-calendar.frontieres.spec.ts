// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { plusDays } from '../domain/dose-calendar/grid'
import type { Line } from '../domain/dose-calendar/types'
import { DAY, line, setting, view } from './dose-calendar.v2.aides'

const folder = fileURLToPath(new URL('../domain/dose-calendar/', import.meta.url))
const modules = readdirSync(folder, { recursive: true, encoding: 'utf8' })
  .filter((name) => name.endsWith('.ts') && !name.split('/').at(-1)!.startsWith('reference-'))
  .map((name) => ({ name, text: readFileSync(join(folder, name), 'utf8') }))
const importsOf = (text: string) => [...text.matchAll(/from '([^']+)'/g)].map(([, path]) => path!)
const insideFolder = (name: string, path: string) =>
  path.startsWith('./') ||
  (name.includes('/') && path.startsWith('../') && !path.startsWith('../../'))

describe('moteur des doses v2 : frontières', () => {
  it('ne dépend que de lui-même : ni features, ni core, ni modèle de référence', () => {
    expect(modules.length).toBeGreaterThan(5)
    const foreign = modules.flatMap(({ name, text }) =>
      importsOf(text)
        .filter((path) => !insideFolder(name, path) || /\/reference-/.test(path))
        .map((path) => `${name} → ${path}`),
    )
    expect(foreign).toEqual([])
  })

  it('ne lit jamais l’horloge ; seuls la dose du moment, la vue et les gestes lisent aujourd’hui', () => {
    expect(modules.filter(({ text }) => /Date\.now\(|new Date\(\)/.test(text))).toEqual([])
    const knowsToday = modules
      .filter(({ text }) => /\btoday\b/.test(text))
      .map(({ name }) => name)
      .filter((name) => !name.startsWith('gestures/'))
    expect(knowsToday.sort()).toEqual(['moment.ts', 'types.ts', 'view.ts'])
  })

  it('chaque geste a son module dans gestures/, chacun avec son fichier de test', () => {
    const gestures = modules.filter(({ name }) => name.startsWith('gestures/'))
    const tested = readdirSync(fileURLToPath(new URL('.', import.meta.url)))
    const untested = gestures
      .map(({ name }) => name.slice('gestures/'.length, -'.ts'.length))
      .filter((name) => !tested.includes(`dose-calendar.gestures-${name}.spec.ts`))
    expect(gestures.length).toBeGreaterThanOrEqual(6)
    expect(untested).toEqual([])
  })

  it('seul le calendrier produit des échéances à partir de la grille', () => {
    const readers = modules.filter(({ text }) => /\bgridDays\(/.test(text)).map(({ name }) => name)
    expect(readers.sort()).toEqual(['grid-in-force.ts', 'grid.ts', 'journeys.ts'])
  })

  it('aucun module ne dépasse 300 lignes', () => {
    const long = modules.filter(({ text }) => text.split('\n').length > 300).map(({ name }) => name)
    expect(long).toEqual([])
  })
})

describe('moteur des doses v2 : une passe par étape', () => {
  it('lit un traitement de 400 échéances en moins de 20 ms (médiane)', () => {
    const p1 = setting('p1', '2026-01-01', DAY, ['06:00', '12:00', '18:00', '23:00'], {
      endsOn: '2026-04-10',
    })
    const lines: Line[] = []
    for (let index = 0; index < 90; index += 1) {
      const day = plusDays('2026-01-01', index)
      for (const hour of ['06:00', '12:00', '18:00']) lines.push(line('p1', 'given', day, hour))
      if (index % 7 === 0) lines.push(line('p1', 'postponed', day, '23:00', plusDays(day, 1)))
      else if (index % 11 === 0) lines.push(line('p1', 'missed', day, '23:00'))
    }
    const read = () => {
      const result = view([p1], lines, '2026-03-31')
      return [result.currentDoses, result.unloggedDoses, result.upcoming(), result.history]
    }
    for (let warm = 0; warm < 5; warm += 1) read()
    const times: number[] = []
    for (let run = 0; run < 21; run += 1) {
      const start = performance.now()
      read()
      times.push(performance.now() - start)
    }
    expect(read()[1]!.length).toBeGreaterThan(50)
    expect(times.sort((a, b) => a - b)[10]).toBeLessThan(20)
  })

  it('lit l’état de 400 échéances lointaines sans reconstruire le calendrier à chacune', () => {
    const read = view([setting('p1', '2026-01-01', DAY)], [], '2026-01-01')
    const times: number[] = []
    for (let run = 0; run < 5; run += 1) {
      const start = performance.now()
      for (let index = 0; index < 400; index += 1) {
        read.dueState({ dueOn: plusDays('2026-03-01', run * 400 + index), dueTime: null })
      }
      times.push(performance.now() - start)
    }
    expect(times.sort((a, b) => a - b)[2]).toBeLessThan(100)
  })
})
