// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  removalRefusal,
  removeLine,
  treatmentView,
  type Line,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { MONTH, setting, WEEK } from './dose-calendar.v2.aides'

const at = (second: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, second)).toISOString()

function line(
  id: string,
  settingId: string,
  status: Line['status'],
  [dueOn, dueTime]: [string, string | null],
  { givenOn = null, targetOn = null }: { givenOn?: string | null; targetOn?: string | null },
  second: number,
): Line {
  return { id, settingId, status, dueOn, dueTime, givenOn, targetOn, updatedAt: at(second) }
}

const played = (input: TreatmentViewInput, id: string) => {
  const result = removeLine(input, id)
  return 'refusal' in result ? result.refusal : null
}

// Graine 9600000163, réduite : le décalage du 16 rend au 25 son heure de 8 h.
const AVEC_DECALAGE: TreatmentViewInput = {
  settings: [
    setting('s1', '2026-03-16', WEEK, ['08:00', '14:00', '20:00'], {
      firstDueChosen: true,
      createdAt: at(0),
    }),
    setting('s3', '2026-03-25', WEEK, ['08:00', '20:00'], {
      startsOn: '2026-03-20',
      endsOn: '2026-04-13',
      firstDueChosen: false,
      createdAt: at(11),
    }),
  ],
  lines: [
    line('report', 's1', 'postponed', ['2026-03-16', '14:00'], { targetOn: '2026-03-25' }, 3),
    line('décalage', 's1', 'shift', ['2026-03-16', '14:00'], { targetOn: '2026-03-25' }, 4),
    line('prise', 's1', 'given', ['2026-03-25', '08:00'], { givenOn: '2026-03-20' }, 14),
  ],
  today: '2026-03-20',
}

// Graine 9600000951 : toutes les 2 semaines, passé le jour même à tous les jours.
const DEUX_PRISES: TreatmentViewInput = {
  settings: [
    setting('s1', '2026-03-12', { value: 2, unit: 'week' }, ['08:00', '20:00'], {
      firstDueChosen: true,
      stoppedOn: '2026-03-12',
      createdAt: at(0),
    }),
    setting('s2', '2026-03-12', { value: 1, unit: 'day' }, ['08:00', '20:00'], {
      firstDueChosen: true,
      createdAt: at(4),
    }),
  ],
  lines: [
    line('8 h', 's1', 'given', ['2026-03-12', '08:00'], { givenOn: '2026-03-12' }, 1),
    line('20 h', 's1', 'given', ['2026-03-12', '20:00'], { givenOn: '2026-03-11' }, 3),
  ],
  today: '2026-03-12',
}

// Graine 9600001479, réduite : deux reports à la suite, la dose d'arrivée du second donnée d'avance.
const DEUX_REPORTS: TreatmentViewInput = {
  settings: [
    setting('s1', '2026-04-18', MONTH, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-18',
      gridOriginOn: '2026-03-18',
      firstDueChosen: false,
      fallenDosesAnswer: 'not-due',
      createdAt: at(0),
      updatedAt: at(1),
    }),
    setting('s2', '2026-05-23', MONTH, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-25',
      firstDueChosen: true,
      createdAt: at(4),
    }),
    setting('s3', '2026-05-23', MONTH, ['08:00', '14:00', '20:00'], {
      startsOn: '2026-03-29',
      gridOriginOn: null,
      createdAt: at(9),
    }),
  ],
  lines: [
    line('report', 's3', 'postponed', ['2026-05-23', '14:00'], { targetOn: '2026-06-08' }, 13),
    line(
      'report suivant',
      's3',
      'postponed',
      ['2026-06-08', '20:00'],
      { targetOn: '2026-06-12' },
      17,
    ),
    line('prise', 's3', 'given', ['2026-06-12', '20:00'], { givenOn: '2026-04-09' }, 19),
  ],
  today: '2026-04-09',
}

describe('#961 : « Supprimer » lit le même refus que la suppression écrite (décision du 19 octobre 2026)', () => {
  it('Milo, chaque semaine à 8 h, 14 h et 20 h depuis le 16 mars, le 14 h du 16 reporté au 25 avec le décalage ; le 20, 8 h et 20 h à partir du 25 et le 25 à 8 h donné d’avance : supprimer le décalage ôterait au 25 son heure de 8 h, la prise resterait sans échéance', () => {
    expect(played(AVEC_DECALAGE, 'décalage')).toEqual({ reason: 'later-dose' })
    expect(removalRefusal(AVEC_DECALAGE, 'décalage')).toEqual({ reason: 'later-dose' })
  })

  it('Milo, le 12 mars à 8 h et 20 h, passé le jour même de toutes les 2 semaines à tous les jours ; 20 h donnée d’avance le 11 : supprimer la prise de 8 h laisserait celle de 20 h sans échéance', () => {
    expect(played(DEUX_PRISES, '8 h')).toEqual({ reason: 'later-dose' })
    expect(removalRefusal(DEUX_PRISES, '8 h')).toEqual({ reason: 'later-dose' })
  })

  it('Milo, chaque mois ; le 23 mai à 14 h reporté au 8 juin, le 8 juin à 20 h reporté au 12, le 12 à 20 h donné d’avance le 9 avril : supprimer le premier report est refusé', () => {
    expect(played(DEUX_REPORTS, 'report')).toEqual({ reason: 'later-dose' })
    expect(removalRefusal(DEUX_REPORTS, 'report')).toEqual({ reason: 'later-dose' })
  })

  it('R11 : Milo, chaque vendredi, la dose du 16 octobre notée sur chaque téléphone et celle du 23 donnée : la ligne sans effet du 16 se supprime toujours', () => {
    const input: TreatmentViewInput = {
      settings: [setting('s1', '2026-10-02', WEEK, [], { createdAt: at(0) })],
      lines: [
        line('ancienne', 's1', 'given', ['2026-10-16', null], { givenOn: '2026-10-16' }, 1),
        line('récente', 's1', 'given', ['2026-10-16', null], { givenOn: '2026-10-16' }, 2),
        line('le 23', 's1', 'given', ['2026-10-23', null], { givenOn: '2026-10-23' }, 3),
      ],
      today: '2026-10-24',
    }
    const effect = treatmentView(input).history.find(({ line }) => line.id === 'ancienne')!.effect
    expect(effect.kind).toBe('idle')
    expect(removalRefusal(input, 'ancienne')).toBeNull()
    expect(played(input, 'ancienne')).toBeNull()
  })

  it.each([
    ['AVEC_DECALAGE', AVEC_DECALAGE],
    ['DEUX_PRISES', DEUX_PRISES],
    ['DEUX_REPORTS', DEUX_REPORTS],
  ])('%s : chaque ligne, même refus avant et pendant la suppression', (_, input) => {
    for (const { id } of input.lines) expect(removalRefusal(input, id)).toEqual(played(input, id))
  })
})
