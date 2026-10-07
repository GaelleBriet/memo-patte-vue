import { afterEach, describe, expect, it } from 'vitest'
import {
  formatWeight,
  formatWeightAxis,
  formatWeightDelta,
  formatWeightInput,
  formatClockTime,
  formatClockTimes,
  formatQuantity,
  formatFullDate,
  formatFullMonthYear,
  formatLongDate,
  formatMonthShort,
  formatMonthYear,
  formatNumericDate,
  formatDayMonth,
  formatDayMonthOrYear,
  formatFullDayMonth,
  formatWeekdayDate,
  formatWeekday,
  formatWeekdayDayMonth,
  formatDaySeries,
  formatDayList,
  weekdayInitials,
  weekStartsOn,
  withoutFinalDot,
  formatPeriodRange,
} from '../utils/format'
import { plain } from './plain'
import i18n, { applyLocale } from '@/core/i18n'

describe('formatWeight', () => {
  it('garde une décimale avec la virgule française', () => {
    expect(formatWeight(24.5)).toBe('24,5')
    expect(formatWeight(24)).toBe('24,0')
    expect(formatWeight(3.8)).toBe('3,8')
  })

  it('arrondit à la décimale, jamais deux', () => {
    expect(formatWeight(23.64)).toBe('23,6')
    expect(formatWeight(23.66)).toBe('23,7')
  })

  it('ne groupe pas les milliers', () => {
    expect(formatWeight(1234.5)).toBe('1234,5')
  })
})

describe('formatWeightAxis', () => {
  it('écrit une graduation ronde sans décimale inutile', () => {
    expect(formatWeightAxis(24)).toBe('24')
    expect(formatWeightAxis(24.5)).toBe('24,5')
    expect(formatWeightAxis(4.2)).toBe('4,2')
  })

  it('arrondit à la décimale et ne groupe pas les milliers', () => {
    expect(formatWeightAxis(23.500000001)).toBe('23,5')
    expect(formatWeightAxis(1200)).toBe('1200')
  })
})

describe('formatWeightDelta', () => {
  it('signe une hausse', () => {
    expect(formatWeightDelta(0.5)).toBe('+0,5')
  })

  it('signe une baisse avec le signe moins typographique', () => {
    expect(formatWeightDelta(-0.3)).toBe('−0,3')
  })

  it('marque ± quand la variation est nulle après arrondi', () => {
    expect(formatWeightDelta(0)).toBe('±0,0')
    expect(formatWeightDelta(0.04)).toBe('±0,0')
    expect(formatWeightDelta(-0.04)).toBe('±0,0')
  })
})

describe('formatWeightInput', () => {
  it('rend le poids tel qu’il est enregistré, virgule française, sans arrondi', () => {
    expect(formatWeightInput(24.5)).toBe('24,5')
    expect(formatWeightInput(24.55)).toBe('24,55')
    expect(formatWeightInput(24)).toBe('24')
  })

  it('ne groupe pas les milliers', () => {
    expect(formatWeightInput(1234.5)).toBe('1234,5')
  })
})

describe('mois et dates', () => {
  it('abrège le mois avec une majuscule pour les libellés de courbe', () => {
    expect(
      ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'].map(
        formatMonthShort,
      ),
    ).toEqual(['Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.'])
  })

  it('écrit un mois avec son année pour une validité', () => {
    expect(plain(formatMonthYear('2026-12-12'))).toBe('déc. 2026')
    expect(plain(formatMonthYear('2027-09-14'))).toBe('sept. 2027')
  })

  it('écrit une date complète courte', () => {
    expect(plain(formatLongDate('2026-11-08'))).toBe('8 nov. 2026')
  })

  it('écrit une date complète, mois en toutes lettres, pour le lecteur d’écran', () => {
    expect(plain(formatFullDate('2026-02-03'))).toBe('3 février 2026')
    expect(plain(formatFullDate('2026-09-01'))).toBe('1er septembre 2026')
  })

  it('écrit le jour et le mois abrégé, sans l’année', () => {
    expect(plain(formatDayMonth('2026-09-28'))).toBe('28 sept.')
    expect(plain(formatDayMonth('2026-05-03'))).toBe('3 mai')
  })

  it('n’ajoute l’année qu’en dehors de l’année en cours', () => {
    expect(plain(formatDayMonthOrYear('2026-09-28', '2026-09-23'))).toBe('28 sept.')
    expect(plain(formatDayMonthOrYear('2025-08-10', '2026-09-23'))).toBe('10 août 2025')
    expect(plain(formatDayMonthOrYear('2027-01-05', '2026-09-23'))).toBe('5 janv. 2027')
  })

  it('écrit le jour et le mois en toutes lettres pour le lecteur d’écran', () => {
    expect(plain(formatFullDayMonth('2026-09-28'))).toBe('28 septembre')
  })

  it('écrit une date précédée de son jour de la semaine abrégé', () => {
    expect(plain(formatWeekdayDate('2026-09-20'))).toBe('dim. 20 sept. 2026')
  })

  it('écrit une échéance en chiffres', () => {
    expect(formatNumericDate('2027-09-14T10:00:00Z')).toBe('14/09/2027')
    expect(formatNumericDate('2026-11-08')).toBe('08/11/2026')
  })
})

describe('en anglais', () => {
  afterEach(() => applyLocale('fr'))

  it('suit la langue courante pour les poids', () => {
    applyLocale('en')

    expect(formatWeight(24.5)).toBe('24.5')
    expect(formatWeight(24)).toBe('24.0')
    expect(formatWeight(1234.5)).toBe('1234.5')
    expect(formatWeightAxis(24.5)).toBe('24.5')
    expect(formatWeightInput(24.55)).toBe('24.55')
    expect(formatWeightDelta(-0.3)).toBe('−0.3')
    expect(formatWeightDelta(0)).toBe('±0.0')
  })

  it('suit la langue courante pour les mois et les dates', () => {
    applyLocale('en')

    expect(formatMonthShort('2026-09-05')).toBe('Sep')
    expect(plain(formatMonthYear('2026-12-12'))).toBe('Dec 2026')
    expect(plain(formatLongDate('2026-11-08'))).toBe('Nov 8, 2026')
    expect(plain(formatFullDate('2026-02-03'))).toBe('February 3, 2026')
    expect(formatNumericDate('2027-09-14T10:00:00Z')).toBe('09/14/2027')
    expect(plain(formatDayMonth('2026-09-28'))).toBe('Sep 28')
    expect(plain(formatFullDayMonth('2026-09-28'))).toBe('September 28')
    expect(plain(formatWeekdayDate('2026-09-20'))).toBe('Sun, Sep 20, 2026')
  })
})

describe('dates d’un seul tenant', () => {
  afterEach(() => applyLocale('fr'))

  it('relie jour, mois et année par des espaces insécables', () => {
    expect(formatLongDate('2027-08-06')).toBe('6\u00a0août\u00a02027')
    expect(formatDayMonth('2026-10-01')).toBe('1er\u00a0oct.')
    expect(formatFullDate('2026-02-03')).toBe('3\u00a0février\u00a02026')
    expect(formatFullDayMonth('2026-09-28')).toBe('28\u00a0septembre')
    expect(formatWeekdayDate('2026-09-20')).toBe('dim.\u00a020\u00a0sept.\u00a02026')
    expect(formatWeekdayDayMonth('2026-10-16')).toBe('vendredi\u00a016\u00a0oct.')
    expect(formatMonthYear('2026-12-12')).toBe('déc.\u00a02026')
    expect(formatFullMonthYear('2026-09-03')).toBe('septembre\u00a02026')
  })

  it('laisse une suite ou une liste de jours se couper entre ses dates', () => {
    expect(formatDaySeries(['2026-10-26', '2026-11-02'])).toBe('26\u00a0oct., 2\u00a0nov.')
    expect(formatDayList(['2026-10-03', '2026-10-05', '2026-10-07'])).toBe('3, 5 et 7\u00a0oct.')
  })

  it('tient une date et son heure d’un seul tenant, « à » compris', () => {
    const params = { date: formatDayMonth('2026-10-01'), time: formatClockTime('20:00') }

    expect(i18n.global.t('currentDose.at', params)).toBe('1er\u00a0oct.\u00a0à\u00a020\u00a0h')
    applyLocale('en')
    expect(
      i18n.global.t('currentDose.at', {
        date: formatDayMonth('2026-10-01'),
        time: formatClockTime('20:00'),
      }),
    ).toBe('Oct\u00a01\u00a0at\u00a08\u00a0pm')
  })

  it('donne les deux bouts d’une plage chacun d’un seul tenant', () => {
    expect(formatPeriodRange('2026-08-06', '2027-02-06')).toEqual({
      start: '6\u00a0ao\u00fbt',
      end: '6\u00a0f\u00e9vr.\u00a02027',
    })
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(formatLongDate('2026-10-01')).toBe('Oct\u00a01,\u00a02026')
    expect(formatDayMonth('2026-10-10')).toBe('Oct\u00a010')
    expect(formatWeekdayDate('2026-09-20')).toBe('Sun,\u00a0Sep\u00a020,\u00a02026')
    expect(formatMonthYear('2026-12-12')).toBe('Dec\u00a02026')
    expect(formatDaySeries(['2026-10-26', '2026-11-02'])).toBe('Oct\u00a026, Nov\u00a02')
  })
})

describe('formatQuantity', () => {
  afterEach(() => applyLocale('fr'))

  it('rend le nombre tel que saisi, au séparateur de la langue', () => {
    expect(formatQuantity(0.3)).toBe('0,3')
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(1234.125)).toBe('1234,125')

    applyLocale('en')
    expect(formatQuantity(0.3)).toBe('0.3')
  })
})

describe('formatClockTime', () => {
  afterEach(() => applyLocale('fr'))

  it('écrit l’heure à la française, minutes seulement quand il y en a', () => {
    expect(formatClockTime('08:00')).toBe('8\u00a0h')
    expect(formatClockTime('20:00')).toBe('20\u00a0h')
    expect(formatClockTime('08:30')).toBe('8\u00a0h\u00a030')
    expect(formatClockTime('20:05')).toBe('20\u00a0h\u00a005')
    expect(formatClockTime('00:00')).toBe('0\u00a0h')
  })

  it('écrit l’heure anglaise sur 12 h', () => {
    applyLocale('en')

    expect(formatClockTime('08:00')).toBe('8\u00a0am')
    expect(formatClockTime('20:00')).toBe('8\u00a0pm')
    expect(formatClockTime('08:30')).toBe('8:30\u00a0am')
    expect(formatClockTime('00:00')).toBe('12\u00a0am')
    expect(formatClockTime('12:00')).toBe('12\u00a0pm')
    expect(formatClockTime('12:05')).toBe('12:05\u00a0pm')
  })
})

describe('formatClockTimes', () => {
  afterEach(() => applyLocale('fr'))

  it('énumère les heures dans l’ordre de la journée', () => {
    expect(formatClockTimes(['20:00'])).toBe('20\u00a0h')
    expect(formatClockTimes(['20:00', '08:00'])).toBe('8\u00a0h et 20\u00a0h')
    expect(formatClockTimes(['08:00', '20:00', '14:00'])).toBe('8\u00a0h, 14\u00a0h et 20\u00a0h')
    expect(formatClockTimes([])).toBe('')
  })

  it('énumère en anglais', () => {
    applyLocale('en')

    expect(formatClockTimes(['08:00', '20:00'])).toBe('8\u00a0am and 8\u00a0pm')
    expect(formatClockTimes(['08:00', '14:00', '20:00'])).toBe(
      '8\u00a0am, 2\u00a0pm, and 8\u00a0pm',
    )
  })
})

describe('withoutFinalDot', () => {
  it('retire le point d’une abréviation qui précède le point final, et rien d’autre', () => {
    expect(withoutFinalDot('10 oct.')).toBe('10 oct')
    expect(withoutFinalDot('10 mai')).toBe('10 mai')
    expect(withoutFinalDot('Oct 10')).toBe('Oct 10')
  })
})

describe('mois d’un calendrier', () => {
  afterEach(() => applyLocale('fr'))

  it('écrit le mois en toutes lettres et commence la semaine le lundi', () => {
    expect(plain(formatFullMonthYear('2026-09-03'))).toBe('septembre 2026')
    expect(weekStartsOn()).toBe(1)
    expect(weekdayInitials()).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
  })

  it('en anglais, commence la semaine le dimanche', () => {
    applyLocale('en')

    expect(plain(formatFullMonthYear('2026-09-03'))).toBe('September 2026')
    expect(weekStartsOn()).toBe(0)
    expect(weekdayInitials()).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S'])
  })
})

describe('jours d’une suite de doses', () => {
  afterEach(() => applyLocale('fr'))

  it('écrit le jour de la semaine et la suite, le mois une fois dans un même mois', () => {
    expect(formatWeekday('2026-10-26')).toBe('lundi')
    expect(plain(formatWeekdayDayMonth('2026-10-16'))).toBe('vendredi 16 oct.')
    expect(plain(formatDaySeries(['2026-10-26', '2026-11-02']))).toBe('26 oct., 2 nov.')
    expect(plain(formatDaySeries(['2026-10-23', '2026-10-30']))).toBe('23, 30 oct.')
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(formatWeekday('2026-10-26')).toBe('Monday')
    expect(plain(formatWeekdayDayMonth('2026-10-16'))).toBe('Friday, Oct 16')
    expect(plain(formatDaySeries(['2026-10-26', '2026-11-02']))).toBe('Oct 26, Nov 2')
    expect(plain(formatDaySeries(['2026-10-23', '2026-10-30']))).toBe('Oct 23, 30')
  })
})

describe('formatPeriodRange', () => {
  afterEach(() => applyLocale('fr'))

  it('reprend formatDayRange dans une même année', () => {
    expect(plain(formatPeriodRange('2026-10-06', '2026-10-10'))).toEqual({
      start: '6',
      end: '10 oct.',
    })
    expect(plain(formatPeriodRange('2026-09-01', '2026-10-10'))).toEqual({
      start: '1er sept.',
      end: '10 oct.',
    })
  })

  it('date la fin de son année quand elle diffère de celle du début', () => {
    expect(plain(formatPeriodRange('2026-08-06', '2027-02-06'))).toEqual({
      start: '6 août',
      end: '6 févr. 2027',
    })
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(plain(formatPeriodRange('2026-08-06', '2027-02-06'))).toEqual({
      start: 'Aug 6',
      end: 'Feb 6, 2027',
    })
  })
})

describe('premier jour du mois', () => {
  afterEach(() => applyLocale('fr'))

  it('écrit « 1er » dans tous les formats français', () => {
    expect(plain(formatDayMonth('2026-10-01'))).toBe('1er oct.')
    expect(plain(formatLongDate('2026-10-01'))).toBe('1er oct. 2026')
    expect(plain(formatDayMonthOrYear('2025-10-01', '2026-10-06'))).toBe('1er oct. 2025')
    expect(plain(formatFullDayMonth('2026-10-01'))).toBe('1er octobre')
    expect(plain(formatFullDate('2026-10-01'))).toBe('1er octobre 2026')
    expect(plain(formatWeekdayDate('2026-10-01'))).toBe('jeu. 1er oct. 2026')
    expect(plain(formatWeekdayDayMonth('2026-10-01'))).toBe('jeudi 1er oct.')
    expect(plain(formatDaySeries(['2026-10-01', '2026-10-08']))).toBe('1er, 8 oct.')
    expect(plain(formatDayList(['2026-10-01', '2026-10-03']))).toBe('1er et 3 oct.')
    expect(plain(formatPeriodRange('2026-09-01', '2026-09-20'))).toEqual({
      start: '1er',
      end: '20 sept.',
    })
    expect(plain(formatPeriodRange('2026-10-01', '2027-02-01'))).toEqual({
      start: '1er oct.',
      end: '1er févr. 2027',
    })
  })

  it('n’écrit « 1er » que pour le premier jour, ni « 11 » ni « 21 »', () => {
    expect(plain(formatDayMonth('2026-10-11'))).toBe('11 oct.')
    expect(plain(formatLongDate('2026-10-21'))).toBe('21 oct. 2026')
    expect(formatNumericDate('2026-10-01')).toBe('01/10/2026')
  })

  it('ne change rien en anglais', () => {
    applyLocale('en')

    expect(plain(formatDayMonth('2026-10-01'))).toBe('Oct 1')
    expect(plain(formatLongDate('2026-10-01'))).toBe('Oct 1, 2026')
    expect(plain(formatFullDate('2026-10-01'))).toBe('October 1, 2026')
    expect(plain(formatWeekdayDate('2026-10-01'))).toBe('Thu, Oct 1, 2026')
    expect(plain(formatDaySeries(['2026-10-01', '2026-10-08']))).toBe('Oct 1, 8')
    expect(plain(formatPeriodRange('2026-09-01', '2026-09-20'))).toEqual({
      start: 'Sep 1',
      end: 'Sep 20',
    })
  })
})

describe('formateurs de nombres, d’une langue à l’autre', () => {
  afterEach(() => applyLocale('fr'))

  const VALEURS = [0, 0.04, 0.05, 0.3, 1, 4.25, 24.55, 54, 99.95, 1234.5, 12345.678]

  function attendu(langue: 'fr' | 'en', options: Intl.NumberFormatOptions, value: number) {
    return new Intl.NumberFormat(langue, { useGrouping: false, ...options }).format(value)
  }

  it.each(['fr', 'en', 'fr'] as const)(
    'écrit les mêmes textes qu’un formateur neuf (%s)',
    (langue) => {
      applyLocale(langue)

      for (const value of VALEURS) {
        const arrondi = Math.round(value * 10) / 10
        expect(formatWeight(value)).toBe(
          attendu(langue, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, arrondi),
        )
        expect(formatWeightAxis(value)).toBe(attendu(langue, { maximumFractionDigits: 1 }, arrondi))
        expect(formatQuantity(value)).toBe(attendu(langue, { maximumFractionDigits: 20 }, value))
      }
    },
  )

  it('suit la langue choisie entre deux appels', () => {
    expect([formatWeight(1234.5), formatWeightAxis(24.5), formatQuantity(0.3)]).toEqual([
      '1234,5',
      '24,5',
      '0,3',
    ])
    applyLocale('en')
    expect([formatWeight(1234.5), formatWeightAxis(24.5), formatQuantity(0.3)]).toEqual([
      '1234.5',
      '24.5',
      '0.3',
    ])
    applyLocale('fr')
    expect(formatWeightDelta(-0.3)).toBe('−0,3')
  })
})
