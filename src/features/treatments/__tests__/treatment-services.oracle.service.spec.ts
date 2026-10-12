// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'

import { startV2Walk, v2Step, type V2Step } from '../../../../scripts/dose-engine/v2-walk'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { newSettings, treatmentView, type Setting } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import {
  actionOf,
  createReplay,
  expectedSignature,
  readingAfter,
  storedHistory,
  type Replay,
} from './treatment-services-replay'

// Séries longues : TREATMENT_ORACLE_FROM, TREATMENT_ORACLE_SEEDS, TREATMENT_ORACLE_STEPS
// (scripts/dose-engine/README.md).
const FROM = Number(process.env.TREATMENT_ORACLE_FROM ?? 540_000_000)
const SEEDS = Number(process.env.TREATMENT_ORACLE_SEEDS ?? 20)
const STEPS = Number(process.env.TREATMENT_ORACLE_STEPS ?? 30)
const ASKED_SETTINGS = {
  name: 'Test',
  type: 'medication',
  doseQuantity: null,
  doseUnit: null,
} as const

type Periods = Map<string, string>

// Ce que l'écran empêche ou refuse avant tout service : la marche du moteur s'arrête là.
function refusedByScreen(step: V2Step): boolean {
  const view = treatmentView(step.before)
  const { gesture } = step
  if (gesture?.kind === 'note' && gesture.status === 'given') {
    return view.alreadyNotedOn(gesture.due, gesture.givenOn) !== null
  }
  if (step.plan !== null && view.phase === 'ended') return true
  if (step.request !== undefined) {
    const { firstDueOn, ...asked } = step.request
    const proposed = newSettings(step.before, asked)
    const proposedOn =
      'plan' in proposed ? (proposed.shownOn ?? proposed.plan.setting.firstDueOn) : undefined
    const { frequency, times, endsOn } = view.currentSetting!
    const same = JSON.stringify([frequency, [...times].sort(), endsOn])
    const keeps = same === JSON.stringify([asked.frequency, [...asked.times].sort(), asked.endsOn])
    return keeps && (firstDueOn === undefined || firstDueOn === proposedOn)
  }
  return step.label.endsWith(' arrêter') && view.phase === 'ended'
}

async function replayStep(replay: Replay, id: string, periods: Periods, step: V2Step) {
  const periodOf = (settingId: string) => periods.get(settingId) ?? settingId
  replay.clock.day = step.before.today
  replay.tick()
  if (step.gesture !== null) {
    const stored = await storedHistory(replay.treatments, id)
    await replay.doses.apply(id, actionOf(step.gesture, step.before, stored, periodOf))
  } else if (step.plan !== null && step.request !== undefined) {
    const { request } = step
    const result = newSettings(step.before, request)
    const pastDues =
      'question' in result
        ? JSON.stringify(step.plan) === JSON.stringify(result.question.keep)
          ? 'keep'
          : 'drop'
        : undefined
    await replay.plans.update(id, {
      ...ASKED_SETTINGS,
      frequency: request.frequency,
      times: [...request.times],
      endsOn: request.endsOn,
      nextDoseOn: request.firstDueOn ?? null,
      ...(pastDues === undefined ? {} : { pastDues }),
    })
  } else if (step.label.endsWith(' arrêter')) {
    await replay.stops.stop(id)
  } else if (step.label.includes(' reprendre ')) {
    const resumed = step.after.settings.at(-1)!
    await replay.plans.resume(id, {
      firstDoseOn: resumed.firstDueOn,
      frequency: resumed.frequency,
      times: [...resumed.times],
      doseQuantity: null,
      doseUnit: null,
      endsOn: resumed.endsOn,
    })
  }
  replay.clock.day = step.after.today
  const added = step.after.settings.filter(
    ({ id: settingId }) => !step.before.settings.some((setting) => setting.id === settingId),
  )
  const stored = await storedHistory(replay.treatments, id)
  const known = new Set(periods.values())
  const fresh = stored.periods.filter((period) => !known.has(period.id))
  added.forEach((setting, index) => periods.set(setting.id, fresh[index]?.id ?? setting.id))
}

describe('les services des traitements rejouent les gestes du moteur v2', () => {
  let db: InMemoryDb
  let replay: Replay

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2027, 0, 1) })
    db = await createInMemoryDb()
    replay = await createReplay(db)
  })

  afterEach(() => {
    db.close()
    vi.useRealTimers()
  })

  it(
    `${SEEDS} suites de ${STEPS} gestes : la lecture de la base est celle du moteur v2 seul`,
    async () => {
      const failures: string[] = []
      let played = 0
      for (let seed = FROM; seed < FROM + SEEDS; seed += 1) {
        const walk = startV2Walk(seed)
        const id = crypto.randomUUID()
        const periods: Periods = new Map([['s1', id]])
        await replay.start(walk, id)
        const steps: V2Step[] = []
        for (let count = 0; count < STEPS; count += 1) v2Step(walk, (step) => steps.push(step))
        for (const step of steps) {
          if (refusedByScreen(step)) break
          try {
            await replayStep(replay, id, periods, step)
          } catch (cause) {
            if (!(cause instanceof ZodError)) {
              failures.push(`graine ${seed}, ${step.label} : ${String(cause)}`)
            }
            break
          }
          played += 1
          const read = await readingAfter(replay, id)
          const expected = expectedSignature(step)
          if (JSON.stringify(read) !== JSON.stringify(expected)) {
            const stored = await storedHistory(replay.treatments, id)
            const shape = ({
              id: i,
              startsOn,
              firstDueOn,
              gridOriginOn,
              endsOn,
              stoppedOn,
              frequency,
              times,
            }: Setting) => ({
              i: i.slice(0, 4),
              startsOn,
              firstDueOn,
              gridOriginOn,
              endsOn,
              stoppedOn,
              f: frequency,
              times,
            })
            const raw = JSON.stringify(
              stored.periods.map(({ id: i, startsOn, firstDueOn, referenceOn, createdAt }) => ({
                i: i.slice(0, 4),
                startsOn,
                firstDueOn,
                referenceOn,
                createdAt,
              })),
            )
            const periodsText = `${raw}\n  ${JSON.stringify(readTreatment(stored, replay.clock.day)!.input.settings.map(shape))}\n  attendu  : ${JSON.stringify(step.after.settings.map(shape))}`
            failures.push(
              `graine ${seed}, ${step.label}\n  base : ${JSON.stringify(read)}\n  v2   : ${JSON.stringify(expected)}\n  réglages : ${periodsText}`,
            )
            break
          }
        }
      }
      console.warn(
        `Services : ${SEEDS} suites, ${played} gestes joués, graines ${FROM} à ${FROM + SEEDS - 1}`,
      )
      expect(failures).toEqual([])
    },
    600_000 + SEEDS * STEPS * 200,
  )
})
