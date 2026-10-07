import { afterEach, describe, expect, it } from 'vitest'

import {
  chosenReminder,
  injectionDatesExcept,
  injectionDatesOn,
  injectionGestureTexts,
  injectionRows,
  keptPlannedDueDate,
  needsNewReminder,
  pastInjectionDue,
  pastInjectionNeedsReminder,
  pastInjectionError,
  pastInjectionTexts,
  pastInjectionToast,
  vaccinationDeleteTexts,
  vaccinationDetailTexts,
} from '../logic/vaccination-history'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import i18n, { applyLocale } from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const t = i18n.global.t
const TODAY = '2026-09-23'

function injection(
  id: string,
  injectedOn: string,
  nextDueDate: string | null,
): VaccinationInjection {
  return {
    id,
    vaccinationId: 'carre',
    animalId: 'boree',
    injectedOn,
    nextDueDate,
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    deletedAt: null,
  }
}

afterEach(() => {
  applyLocale('fr')
})

describe('chosenReminder', () => {
  it('reconnaît un rappel à un mois pile (VA-13)', () => {
    expect(chosenReminder(injection('i', '2026-08-26', '2026-09-26'))).toEqual({ kind: 'oneMonth' })
    expect(chosenReminder(injection('i', '2026-01-31', '2026-02-28'))).toEqual({ kind: 'oneMonth' })
  })

  it('reconnaît un rappel à un an ou à trois ans pile', () => {
    expect(chosenReminder(injection('i', '2026-08-26', '2027-08-26'))).toEqual({ kind: 'oneYear' })
    expect(chosenReminder(injection('i', '2026-08-26', '2029-08-26'))).toEqual({
      kind: 'threeYears',
    })
  })

  it('garde la date d’un autre écart, et « pas de rappel » sans échéance', () => {
    expect(chosenReminder(injection('i', '2026-07-27', '2026-08-26'))).toEqual({
      kind: 'date',
      date: '2026-08-26',
    })
    expect(chosenReminder(injection('i', '2026-07-27', '2027-07-28'))).toEqual({
      kind: 'date',
      date: '2027-07-28',
    })
    expect(chosenReminder(injection('i', '2026-07-27', null))).toEqual({ kind: 'none' })
  })

  it('compte le 29 février comme un an pile vers le 28 février', () => {
    expect(chosenReminder(injection('i', '2028-02-29', '2029-02-28'))).toEqual({
      kind: 'oneYear',
    })
  })
})

describe('injectionDatesOn', () => {
  it('déplace un rappel à un an ou à trois ans avec l’injection', () => {
    expect(injectionDatesOn(injection('i', '2026-08-26', '2027-08-26'), '2026-08-20')).toEqual({
      injectedOn: '2026-08-20',
      nextDueDate: '2027-08-20',
    })
    expect(injectionDatesOn(injection('i', '2026-08-26', '2029-08-26'), '2026-08-20')).toEqual({
      injectedOn: '2026-08-20',
      nextDueDate: '2029-08-20',
    })
  })

  it('déplace un rappel à un mois avec l’injection (VA-13)', () => {
    expect(injectionDatesOn(injection('i', '2026-08-26', '2026-09-26'), '2026-08-20')).toEqual({
      injectedOn: '2026-08-20',
      nextDueDate: '2026-09-20',
    })
  })

  it('garde une autre date telle quelle, et l’absence de rappel', () => {
    expect(injectionDatesOn(injection('i', '2026-07-27', '2026-08-26'), '2026-07-25')).toEqual({
      injectedOn: '2026-07-25',
      nextDueDate: '2026-08-26',
    })
    expect(injectionDatesOn(injection('i', '2026-07-27', null), '2026-07-25')).toEqual({
      injectedOn: '2026-07-25',
      nextDueDate: null,
    })
  })
})

describe('needsNewReminder', () => {
  it('redemande le rappel d’une injection déplacée au jour de son « autre date » ou après', () => {
    const autreDate = injection('i', '2026-07-27', '2026-08-26')

    expect(needsNewReminder(autreDate, '2026-08-26')).toBe(true)
    expect(needsNewReminder(autreDate, '2026-09-01')).toBe(true)
    expect(needsNewReminder(autreDate, '2026-08-25')).toBe(false)
  })

  it('ne redemande rien pour un rappel à un mois, même déplacé au-delà de son ancienne date', () => {
    expect(needsNewReminder(injection('i', '2026-07-27', '2026-08-27'), '2026-09-01')).toBe(false)
  })

  it('ne redemande rien pour un rappel à un ou trois ans, ni sans rappel', () => {
    expect(needsNewReminder(injection('i', '2026-07-27', '2027-07-27'), '2026-09-01')).toBe(false)
    expect(needsNewReminder(injection('i', '2026-07-27', '2029-07-27'), '2026-09-01')).toBe(false)
    expect(needsNewReminder(injection('i', '2026-07-27', null), '2026-09-01')).toBe(false)
  })
})

describe('injectionRows', () => {
  it('décrit chaque injection par sa date et le rappel prévu ce jour-là, la dernière en tête (VA-9, V12)', () => {
    const rows = injectionRows(t, [
      injection('a', '2024-06-02', '2027-06-02'),
      injection('b', '2023-06-02', '2024-06-02'),
      injection('c', '2022-07-05', null),
    ])

    expect(plain(rows)).toEqual([
      {
        id: 'a',
        date: '2 juin 2024',
        badge: 'Dernière injection',
        regular: false,
        detail: 'Rappel prévu le 2 juin 2027',
        optionsLabel: 'Options pour l’injection du 2 juin 2024',
      },
      {
        id: 'b',
        date: '2 juin 2023',
        badge: null,
        regular: true,
        detail: 'Rappel prévu le 2 juin 2024',
        optionsLabel: 'Options pour l’injection du 2 juin 2023',
      },
      expect.objectContaining({ date: '5 juil. 2022', detail: 'Sans rappel prévu' }),
    ])
  })

  it('n’emploie jamais le verbe « fixer » (VA-9)', () => {
    const rows = injectionRows(t, [
      injection('a', '2024-06-02', '2027-06-02'),
      injection('b', '2023-06-02', null),
    ])

    expect(JSON.stringify(rows)).not.toMatch(/fix/i)
  })

  it('suit la langue courante', () => {
    applyLocale('en')

    expect(
      plain(
        injectionRows(t, [
          injection('a', '2024-06-02', '2027-06-02'),
          injection('b', '2022-07-05', null),
        ]),
      ),
    ).toEqual([
      {
        id: 'a',
        date: 'Jun 2, 2024',
        badge: 'Last injection',
        regular: false,
        detail: 'Reminder planned for Jun 2, 2027',
        optionsLabel: 'Options for the injection on June 2, 2024',
      },
      expect.objectContaining({ badge: null, detail: 'No reminder planned' }),
    ])
  })
})

describe('vaccinationDetailTexts', () => {
  const carre: { name: string; dueDate: string | null; lastInjectionDate: string | null } = {
    name: 'Carré',
    dueDate: '2027-08-26',
    lastInjectionDate: '2026-08-26',
  }
  const textes = (vaccination: Partial<typeof carre> = {}, today = TODAY) =>
    plain(
      vaccinationDetailTexts(
        t,
        { ...carre, ...vaccination },
        { animal: 'Boree', today, injections: 3 },
      ),
    )

  it('annonce la dernière injection, le prochain rappel « À jour » et le nombre d’injections (V12)', () => {
    expect(textes()).toEqual({
      subtitle: 'Vaccin · Boree',
      top: 'Dernière injection · 26 août 2026',
      due: { value: '26 août 2027', delay: 'À jour', tone: null },
      note: null,
      editLabel: 'Modifier le vaccin Carré',
      otherDateLabel: 'Fait à une autre date : choisir la date de l’injection',
      doneLabel: 'C’est fait : noter l’injection de Carré pour Boree et choisir le prochain rappel',
      counter: '3',
      followed: true,
    })
  })

  describe('animal qu’on ne suit plus (Q6 de #579, VA-16)', () => {
    const nonSuivi = (vaccination: Partial<typeof carre> = {}) =>
      plain(
        vaccinationDetailTexts(
          t,
          { ...carre, ...vaccination },
          { animal: 'Boree', today: TODAY, injections: 3, followed: false },
        ),
      )

    it('ne dit plus rien du prochain rappel, ni retard ni teinte', () => {
      expect(nonSuivi({ dueDate: '2026-09-05' })).toMatchObject({
        top: 'Dernière injection · 26 août 2026',
        due: null,
        note: null,
        followed: false,
      })
    })

    it('garde « Premier vaccin · aucune injection notée » le jour du rendez-vous, sans note', () => {
      expect(nonSuivi({ dueDate: TODAY, lastInjectionDate: null })).toMatchObject({
        top: 'Premier vaccin · aucune injection notée',
        due: null,
        note: null,
      })
    })
  })

  it('n’annonce aucun rappel quand le dernier choix est « Pas de rappel »', () => {
    expect(textes({ dueDate: null }).due).toBeNull()
  })

  it('dit « Aujourd’hui » le jour même, en ambre (VA-17)', () => {
    expect(textes({ dueDate: TODAY }).due).toEqual({
      value: 'Aujourd’hui',
      delay: null,
      tone: 'today',
    })
  })

  it('dit depuis quand un rappel est en retard, jamais « en retard de N jours » (VA-17, Q4)', () => {
    expect(textes({ dueDate: '2026-09-05' }).due).toEqual({
      value: 'En retard depuis le 5 sept.',
      delay: null,
      tone: 'overdue',
    })
    expect(textes({ dueDate: '2025-12-05' }).due?.value).toBe('En retard depuis le 5 déc. 2025')
  })

  it('garde le délai d’un rendez-vous prévu à venir : « À jour » ne vaut qu’après une injection', () => {
    expect(textes({ lastInjectionDate: null, dueDate: '2026-10-05' }).due).toEqual({
      value: '5 oct. 2026',
      delay: 'dans 12 jours',
      tone: null,
    })
  })

  it('annonce un vaccin prévu sous le même libellé, avec « Premier vaccin » (V11 quinquies)', () => {
    const prevu = textes({ lastInjectionDate: null, dueDate: '2026-09-22' })
    expect(prevu.top).toBe('Premier vaccin · aucune injection notée')
    expect(prevu.due?.value).toBe('En retard depuis le 22 sept.')
    expect(prevu.note).toBeNull()
  })

  it('le jour du rendez-vous d’un vaccin prévu, dit « Aucune injection notée » sous la valeur (V11 ter)', () => {
    const jour = textes({ lastInjectionDate: null, dueDate: TODAY })
    expect(jour.top).toBe('Premier vaccin')
    expect(jour.due?.value).toBe('Aujourd’hui')
    expect(jour.note).toBe('Aucune injection notée')
    expect(textes({ dueDate: TODAY }).note).toBeNull()
  })

  it('parle anglais', () => {
    applyLocale('en')
    expect(textes({ dueDate: TODAY }).due?.value).toBe('Today')
    expect(textes({ dueDate: '2026-09-05' }).due?.value).toBe('Overdue since Sep 5')
    expect(textes({ lastInjectionDate: null }).top).toBe('First vaccine · no injection logged')
    expect(textes()).toMatchObject({
      top: 'Last injection · Aug 26, 2026',
      due: { value: 'Aug 26, 2027', delay: 'Up to date', tone: null },
    })
    expect(textes({ lastInjectionDate: null, dueDate: TODAY })).toMatchObject({
      top: 'First vaccine',
      note: 'No injection logged',
      editLabel: 'Edit the Carré vaccine',
      otherDateLabel: 'Done on another day: choose the injection date',
    })
  })
})

describe('injectionDatesExcept', () => {
  it('rend les jours des autres injections', () => {
    const injections = [injection('a', '2026-08-26', null), injection('b', '2026-07-27', null)]

    expect(injectionDatesExcept(injections, 'a')).toEqual(['2026-07-27'])
  })
})

describe('injectionGestureTexts', () => {
  it('annonce la suppression et le déplacement d’une injection (F7)', () => {
    const texts = injectionGestureTexts(t, '2026-07-27', TODAY)

    expect(plain(texts.changeDateSubtitle)).toBe('Injection du 27 juil. 2026')
    expect(plain(texts.removed)).toBe('Injection du 27 juil. supprimée')
    expect(plain(texts.undoRemove)).toBe('Annuler la suppression de l’injection du 27 juillet 2026')
    expect(plain(texts.moved('2026-07-25'))).toBe('Injection déplacée au 25 juil.')
    expect(texts.undoMove).toBe('Annuler le changement de date de l’injection')
  })

  it('écrit l’année d’une injection d’une autre année', () => {
    expect(plain(injectionGestureTexts(t, '2025-07-27', TODAY).removed)).toBe(
      'Injection du 27 juil. 2025 supprimée',
    )
  })
})

describe('vaccinationDeleteTexts', () => {
  it('confirme la suppression du vaccin sans la dire définitive : « Annuler » la défait (VA-15)', () => {
    expect(vaccinationDeleteTexts(t, 'Rage', { onlyInjection: false })).toEqual({
      title: 'Supprimer Rage\u00a0?',
      text: 'Ses injections et ses rappels seront supprimés du carnet.',
      cancel: 'Annuler',
      confirm: 'Supprimer',
      deleted: 'Vaccin Rage supprimé',
      undo: 'Annuler la suppression du vaccin Rage',
      failed: 'Rage n’a pas pu être supprimé. Réessaie.',
    })
  })

  it('explique que la seule injection, sans rappel prévu, emporte le vaccin (VA-14)', () => {
    expect(vaccinationDeleteTexts(t, 'Carré', { onlyInjection: true }).text).toBe(
      'C’est sa seule injection, sans rappel prévu\u00a0: le vaccin Carré sera supprimé du carnet.',
    )
  })

  it('parle anglais', () => {
    applyLocale('en')

    expect(vaccinationDeleteTexts(t, 'Rabies', { onlyInjection: false })).toMatchObject({
      text: 'Its injections and reminders will be deleted from the health record.',
      deleted: 'Rabies vaccine deleted',
      undo: 'Undo deleting the Rabies vaccine',
    })
    expect(vaccinationDeleteTexts(t, 'Carré', { onlyInjection: true }).text).toBe(
      'This is its only injection, with no reminder planned: the Carré vaccine will be deleted from the health record.',
    )
    expect(
      vaccinationDetailTexts(
        t,
        { name: 'Carré', dueDate: null, lastInjectionDate: '2026-08-26' },
        { animal: 'Boree', today: TODAY, injections: 1 },
      ).doneLabel,
    ).toBe('Done: log the Carré injection for Boree and choose the next reminder')
  })
})

describe('pastInjectionDue', () => {
  const rage = { lastInjectionDate: '2024-06-02', dueDate: '2027-06-02' }

  it('ne donne aucun rappel à une injection plus ancienne que la dernière (VA-10, VA-11)', () => {
    expect(pastInjectionDue(rage, '2022-06-20')).toBeNull()
  })

  it('recopie le prochain rappel en cours sur une injection qui devient la dernière (VA-10)', () => {
    expect(pastInjectionDue(rage, '2024-08-01')).toBe('2027-06-02')
    expect(
      pastInjectionDue({ lastInjectionDate: '2024-06-02', dueDate: null }, '2024-08-01'),
    ).toBeNull()
  })

  it('recopie le rendez-vous d’un vaccin prévu sur sa première injection (VA-10)', () => {
    expect(pastInjectionDue({ lastInjectionDate: null, dueDate: '2026-10-05' }, '2026-09-01')).toBe(
      '2026-10-05',
    )
  })
})

describe('pastInjectionNeedsReminder', () => {
  const carre = { lastInjectionDate: '2025-03-10', dueDate: '2026-03-10' }

  it('demande le rappel suivant quand la nouvelle dernière injection dépasse le rappel en cours', () => {
    expect(pastInjectionNeedsReminder(carre, '2026-05-20')).toBe(true)
  })

  it('le demande aussi pour une injection le jour même du rappel en cours : elle fait ce rappel', () => {
    expect(pastInjectionNeedsReminder(carre, '2026-03-10')).toBe(true)
  })

  it('le demande pour la première injection d’un vaccin prévu avant elle', () => {
    expect(
      pastInjectionNeedsReminder({ lastInjectionDate: null, dueDate: '2026-08-01' }, '2026-09-01'),
    ).toBe(true)
  })

  it('ne le demande pas quand le rappel en cours vient après la nouvelle injection', () => {
    expect(pastInjectionNeedsReminder(carre, '2026-01-10')).toBe(false)
  })

  it('ne le demande pas pour une injection plus ancienne que la dernière (VA-11)', () => {
    expect(pastInjectionNeedsReminder(carre, '2024-06-20')).toBe(false)
  })

  it('ne le demande pas pour un vaccin sans rappel', () => {
    expect(
      pastInjectionNeedsReminder({ lastInjectionDate: '2025-03-10', dueDate: null }, '2026-05-20'),
    ).toBe(false)
  })
})

describe('keptPlannedDueDate', () => {
  it('garde le rendez-vous prévu s’il y en avait un (VA-14)', () => {
    expect(keptPlannedDueDate('2026-10-05', injection('i', '2026-09-01', '2027-03-14'))).toBe(
      '2026-10-05',
    )
  })

  it('reprend sinon le rappel de l’injection supprimée (VA-14, Q5)', () => {
    expect(keptPlannedDueDate(null, injection('i', '2026-03-14', '2027-03-14'))).toBe('2027-03-14')
  })

  it('ne garde rien sans l’un ni l’autre : c’est le vaccin qu’on supprime', () => {
    expect(keptPlannedDueDate(null, injection('i', '2026-03-14', null))).toBeNull()
  })
})

describe('pastInjectionTexts', () => {
  it('nomme la feuille, et annonce l’injection ajoutée et son annulation (V12 bis)', () => {
    expect(pastInjectionTexts(t, { name: 'Rage', animal: 'Milo' })).toEqual({
      header: 'Rage · Milo',
      eyebrow: 'Injection passée',
      title: 'Ajouter une injection passée',
      dateLabel: 'Date de l’injection',
      submit: 'Ajouter',
      future: 'La date de l’injection ne peut pas être dans le futur.',
      taken: 'Une injection est déjà notée ce jour-là.',
    })
    expect(plain(pastInjectionToast(t, '2022-06-20', TODAY))).toEqual({
      added: 'Injection du 20 juin 2022 ajoutée',
      undoAdd: 'Annuler l’ajout de l’injection du 20 juin 2022',
    })
    expect(plain(pastInjectionToast(t, '2026-06-20', TODAY).added)).toBe(
      'Injection du 20 juin ajoutée',
    )
  })

  it('parle anglais', () => {
    applyLocale('en')

    expect(pastInjectionTexts(t, { name: 'Rage', animal: 'Milo' })).toMatchObject({
      eyebrow: 'Past injection',
      title: 'Add a past injection',
      dateLabel: 'Injection date',
      submit: 'Add',
      taken: 'An injection is already logged on that day.',
    })
    expect(plain(pastInjectionToast(t, '2022-06-20', TODAY))).toEqual({
      added: 'Injection of Jun 20, 2022 added',
      undoAdd: 'Undo adding the injection of June 20, 2022',
    })
  })
})

describe('pastInjectionError', () => {
  const taken = ['2024-06-02', '2023-06-02']

  it('accepte toute date passée libre, même très ancienne (VA-10)', () => {
    expect(pastInjectionError('2022-06-20', { today: TODAY, taken })).toBeNull()
    expect(pastInjectionError('2001-01-01', { today: TODAY, taken })).toBeNull()
    expect(pastInjectionError(TODAY, { today: TODAY, taken })).toBeNull()
  })

  it('refuse une date future, ou un jour qui a déjà son injection', () => {
    expect(pastInjectionError('2026-09-24', { today: TODAY, taken })).toBe('future')
    expect(pastInjectionError('2024-06-02', { today: TODAY, taken })).toBe('taken')
  })
})
