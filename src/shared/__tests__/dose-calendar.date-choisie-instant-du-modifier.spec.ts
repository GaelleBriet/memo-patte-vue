// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  judgedGrid,
  moveDose,
  newSettings,
  rewrittenSetting,
  treatmentView,
  withReportFacts,
  type LineChange,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { setting, WEEK } from './dose-calendar.v2.aides'

// Le téléphone, écrit comme par le repository : chaque écriture datée après la précédente, la date de
// grille d'un réglage ouvert ou réécrit jugée par le moteur (`judgedGrid`), donc souvent héritée.
function phone(start: TreatmentViewInput) {
  let input = start
  let tick = 0
  const stamp = () => new Date(Date.UTC(2026, 1, 1, 9, 0, ++tick)).toISOString()
  const write = (changes: readonly LineChange[], at?: string) => {
    for (const change of changes) {
      if (change.action === 'delete') {
        input = { ...input, lines: input.lines.filter(({ id }) => id !== change.id) }
        continue
      }
      const decidedAt = at ?? stamp()
      const { line } = withReportFacts(input.lines, input.settings, change)
      const lines =
        change.action === 'rewrite'
          ? input.lines.map((l) => (l.id === change.id ? { ...line, id: l.id, decidedAt } : l))
          : [...input.lines, { ...line, id: `l${input.lines.length + 1}`, decidedAt }]
      input = { ...input, lines }
    }
  }
  // Le réglage et les lignes de son plan, écrits dans la même transaction, au même instant.
  const settle = (plan: SettingsPlan) => {
    const lines = plan.lines ?? []
    const at = stamp()
    if (plan.action === 'rewrite') {
      const carnet = { input, lines }
      const settings = input.settings.map((s) =>
        s.id === plan.id ? rewrittenSetting(s, plan.setting, () => at, carnet) : s,
      )
      input = { ...input, settings }
    } else {
      const grid = judgedGrid(input, plan)
      const opened = {
        ...plan.setting,
        id: `s${input.settings.length + 1}`,
        stoppedOn: null,
        createdAt: at,
        updatedAt: at,
        gridWrittenAt: grid.writtenAt ?? at,
        gridBefore: grid.before,
      }
      input = { ...input, settings: [...input.settings, opened] }
    }
    write(lines, at)
  }
  const settingId = () => treatmentView(input).currentSetting!.id
  return {
    get input() {
      return input
    },
    on: (today: string) => {
      input = { ...input, today }
    },
    move: (dueOn: string, dueTime: string, to: string, shiftsFollowing: boolean) => {
      const result = moveDose(input, {
        due: { settingId: settingId(), dueOn, dueTime },
        to,
        shiftsFollowing,
      })
      if ('refusal' in result) throw new Error(JSON.stringify(result))
      write(result.changes)
    },
    modify: (request: SettingsRequest) => {
      const result = newSettings(input, request)
      if (!('plan' in result)) throw new Error(JSON.stringify(result))
      settle(result.plan)
    },
  }
}

const days = (input: TreatmentViewInput) => ({
  moteur: treatmentView(input)
    .upcoming({ limit: 4 })
    .map(({ dueOn }) => dueOn),
  reference: referenceReading({ ...input, until: '2026-06-30' })
    .upcoming.slice(0, 4)
    .map((key) => key.slice(0, 10)),
})

const both = (expected: string[]) => ({ moteur: expected, reference: expected })

const weekly = (times: string[], firstDueOn?: string): SettingsRequest => ({
  frequency: WEEK,
  times,
  endsOn: null,
  ...(firstDueOn === undefined ? {} : { firstDueOn }),
})

// Milo, chaque semaine à 20 h depuis le mercredi 4 mars ; le 9, la dose du 11 reportée au 18 avec la
// case ; le 10, redéplacée du 18 au 15 sans la case ; le même jour, « Modifier » : chaque semaine à 21 h,
// « Prochaine dose » le 18.
function milo() {
  const milo = phone({
    settings: [setting('s1', '2026-03-04', WEEK, ['20:00'])],
    lines: [],
    today: '2026-03-09',
  })
  milo.move('2026-03-11', '20:00', '2026-03-18', true)
  milo.on('2026-03-10')
  milo.move('2026-03-18', '20:00', '2026-03-15', false)
  milo.modify(weekly(['21:00'], '2026-03-18'))
  return milo
}

describe('#1232, Q40 : la date choisie se juge contre l’instant du « Modifier », pas contre une date de grille héritée', () => {
  it('Milo : le réglage du 10 mars hérite sa date de grille, plus ancienne que le report', () => {
    const chooser = milo().input.settings.at(-1)!
    const report = milo().input.lines.at(-1)!
    expect(chooser.gridWrittenAt! < report.decidedAt).toBe(true)
    expect(report.decidedAt < chooser.createdAt).toBe(true)
  })

  it('Milo : « Prochaine dose » le 18 dite après le déplacement au 15 : 18, 25 mars, 1er et 8 avril', () => {
    expect(days(milo().input)).toEqual(
      both(['2026-03-18', '2026-03-25', '2026-04-01', '2026-04-08']),
    )
  })

  // Le même jour, la dose du 18 reportée au 16 sans la case, après le « Modifier » : le report l'emporte.
  function reportAfterChoice() {
    const after = milo()
    after.move('2026-03-18', '21:00', '2026-03-16', false)
    return after
  }

  it('un report écrit après le « Modifier » l’emporte sur la date choisie : 16, 25 mars, 1er et 8 avril', () => {
    expect(days(reportAfterChoice().input)).toEqual(
      both(['2026-03-16', '2026-03-25', '2026-04-01', '2026-04-08']),
    )
  })

  // Le formulaire montre le 16, l'arrivée du report, et l'envoie tel quel si la personne n'y touche pas.
  it.each([
    ['la « Prochaine dose » montrée gardée', '2026-03-16'],
    ['sans « Prochaine dose »', undefined],
  ])(
    'un second « Modifier » le même jour qui ne change que les heures, %s, ne re-choisit pas la date : le report garde son effet',
    (_, firstDueOn) => {
      const after = reportAfterChoice()
      after.modify(weekly(['22:00'], firstDueOn))
      expect(days(after.input)).toEqual(
        both(['2026-03-16', '2026-03-25', '2026-04-01', '2026-04-08']),
      )
    },
  )

  it('un second « Modifier » le même jour qui change la date choisie la re-choisit : le 19 porte sa dose', () => {
    const after = reportAfterChoice()
    after.modify(weekly(['21:00'], '2026-03-19'))
    expect(days(after.input).moteur).toContain('2026-03-19')
    expect(days(after.input).reference).toEqual(days(after.input).moteur)
  })

  // Graine 290000921, réduite : tous les 2 jours, réglage du 11 avril (date de grille héritée) qui choisit
  // le 17 ; le report de la dose du 7, reparti du 17 vers le 8, a été écrit avant ce « Modifier ».
  it('graine 290000921 : la date choisie du 17 avril porte une dose', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-04-03', { value: 2, unit: 'day' }, ['08:00', '14:00', '20:00'], {
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        {
          ...setting('s2', '2026-04-08', { value: 2, unit: 'day' }, [], { gridOriginOn: null }),
          startsOn: '2026-04-07',
          firstDueChosen: false,
          createdAt: '2026-01-01T00:00:09.000Z',
          updatedAt: '2026-01-01T00:00:10.000Z',
          gridWrittenAt: '2026-01-01T00:00:00.000Z',
          gridBefore: {
            frequency: { value: 2, unit: 'day' },
            endsOn: null,
            writtenAt: '2026-01-01T00:00:00.000Z',
            runs: [['2026-04-07', null]],
          },
        },
        {
          ...setting('s3', '2026-04-17', { value: 2, unit: 'day' }, []),
          startsOn: '2026-04-11',
          firstDueChosen: true,
          createdAt: '2026-01-01T00:00:18.000Z',
          gridWrittenAt: '2026-01-01T00:00:00.000Z',
          gridBefore: {
            frequency: { value: 2, unit: 'day' },
            endsOn: null,
            writtenAt: '2026-01-01T00:00:00.000Z',
            runs: [['2026-04-11', null]],
          },
        },
      ],
      lines: [
        {
          id: 'l3',
          settingId: 's1',
          dueOn: '2026-04-07',
          dueTime: '08:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-08',
          previousTargetOn: '2026-04-17',
          previousTargetTime: '08:00',
          dueRank: 1,
          decidedAt: '2026-01-01T00:00:05.000Z',
        },
      ],
      today: '2026-04-11',
    }

    const slots = treatmentView(input).slots('2026-04-17', '2026-04-17')
    const reference = referenceReading({ ...input, until: '2026-06-30' })

    expect(slots.map(({ state }) => state)).toContain('pending')
    expect(reference.upcoming.some((key) => key.startsWith('2026-04-17'))).toBe(true)
  })
})
