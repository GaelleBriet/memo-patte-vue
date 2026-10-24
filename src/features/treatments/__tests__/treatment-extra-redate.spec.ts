import { describe, expect, it } from 'vitest'

import { dose, extra, period, plain, treatment } from './treatment-fixtures'
import { doseChange } from '../logic/treatment-dose-change'
import { extraRedateQuestion } from '../logic/treatment-extra-redate'
import { dateChangeOf } from '../logic/treatment-line-actions'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { dateChangeBox } from '../logic/treatment-shift-box'
import i18n from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-10-17'

// Milbemax chaque vendredi depuis le 2 oct. ; le 16, la dose donnée puis une prise « En plus ».
const weekly = period({
  startsOn: '2026-10-02',
  firstDueOn: '2026-10-02',
  frequency: { value: 1, unit: 'week' },
})
const enPlus = extra('2026-10-16', '')
const book = treatment(
  [weekly],
  [dose('2026-10-02', ''), dose('2026-10-09', ''), dose('2026-10-16', ''), enPlus],
)
const reading = treatmentReadingOf(book, TODAY)!

describe('« Changer la date » d’une prise en plus : « Cette prise » (Q37)', () => {
  const question = extraRedateQuestion(t, book, reading, enPlus)!

  it('le 17 couvrirait la dose du 23 : la question se pose, sans réponse choisie', () => {
    expect(plain(question('2026-10-17', null, false))).toEqual({
      title: 'Cette prise',
      options: [
        { value: 'extra', label: 'En plus' },
        { value: 'replaces', label: 'Remplace celle du 23 oct.' },
      ],
      help: null,
    })
  })

  it('le 15 et le 16 : pas de question', () => {
    expect(question('2026-10-15', null, false)).toBeNull()
    expect(question('2026-10-16', null, false)).toBeNull()
  })

  it('l’aide dit ce qu’écrit chaque réponse', () => {
    expect(plain(question('2026-10-17', 'extra', false))?.help).toBe(
      'Prise en plus le samedi 17 oct. · la prochaine dose reste le 23 oct.',
    )
    expect(plain(question('2026-10-17', 'replaces', false))?.help).toBe(
      'Donnée le 17 oct. pour la dose du 23 oct. · prochaine dose le 30 oct.',
    )
  })

  it('pas de question pour une prise donnée', () => {
    expect(extraRedateQuestion(t, book, reading, dose('2026-10-16', ''))).toBeNull()
  })

  it('le geste porte la réponse, et l’écrit', () => {
    const change = dateChangeOf(t, enPlus, null, {
      today: TODAY,
      earliest: null,
      view: reading.view,
    })!
    const action = change.action('2026-10-17', false, 'extra')

    expect(action).toEqual({
      kind: 'redate',
      lineId: enPlus.id,
      givenOn: '2026-10-17',
      shiftsFollowing: false,
      answer: 'extra',
    })
    const written = doseChange(book, reading, action, () => 'n').writes
    expect(
      written.map((write) =>
        write.action === 'rewrite' ? [write.dose.status, write.dose.dueOn] : [write.action],
      ),
    ).toEqual([['extra', '2026-10-17']])
  })

  it('la case « Décaler aussi » n’apparaît qu’avec « Remplace »', () => {
    const box = dateChangeBox(t, enPlus, { treatment: book, reading, today: TODAY })!

    expect(box.view('2026-10-17', true, 'replaces').shown).toBe(true)
    expect(box.view('2026-10-17', true, 'extra').shown).toBe(false)
    expect(box.view('2026-10-17', true, null).shown).toBe(false)
  })
})
