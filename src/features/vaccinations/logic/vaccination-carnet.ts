import { vaccinationStatus } from './vaccination-status'
import type { Vaccination } from '../schema/vaccination.schema'
import { overdueDays } from '@/shared/domain/due-delay'
import { reminderIcon } from '@/shared/domain/reminders'
import { formatDayMonthOrYear } from '@/shared/utils/format'

type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type CarnetVaccinationBadgeStatus = 'overdue' | 'today' | 'up-to-date' | 'none' | 'planned'

export type CarnetVaccinationRow = {
  icon: string
  badge: { status: CarnetVaccinationBadgeStatus; label: string }
  detail: string
}

/** La ligne d'un vaccin dans le Carnet : icône, badge d'état et sous-titre. */
export function carnetVaccinationRow(
  t: Translate,
  vaccination: Pick<Vaccination, 'lastInjectionDate' | 'dueDate'>,
  today: string,
): CarnetVaccinationRow {
  return { icon: reminderIcon('vaccination', null), ...statusOf(t, vaccination, today) }
}

function statusOf(
  t: Translate,
  { lastInjectionDate, dueDate }: Pick<Vaccination, 'lastInjectionDate' | 'dueDate'>,
  today: string,
): Omit<CarnetVaccinationRow, 'icon'> {
  const status = vaccinationStatus(dueDate, today)
  if (dueDate === null || status === 'none') {
    return {
      badge: { status: 'none', label: t('vaccinations.section.status.none') },
      detail: t('vaccinations.section.detail.none'),
    }
  }
  if (status === 'overdue') {
    const days = overdueDays(dueDate, today)
    return {
      badge: {
        status: 'overdue',
        label: t('vaccinations.section.status.overdue', { n: days }, days),
      },
      detail: t('vaccinations.section.detail.overdue'),
    }
  }
  const date = formatDayMonthOrYear(dueDate, today)
  if (lastInjectionDate === null) {
    return {
      badge: { status: 'planned', label: t('vaccinations.section.status.planned', { date }) },
      detail: t('vaccinations.section.detail.firstVaccine'),
    }
  }
  if (dueDate === today) {
    return {
      badge: { status: 'today', label: t('vaccinations.section.status.today') },
      detail: t('vaccinations.section.detail.nextOn', { date }),
    }
  }
  return {
    badge: { status: 'up-to-date', label: t('vaccinations.section.status.upToDate') },
    detail: t('vaccinations.section.detail.nextOn', { date }),
  }
}
