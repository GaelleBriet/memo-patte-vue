import type { HomeReminderSource } from '../service/home-reminders.service'
import {
  reminderIcon as sharedReminderIcon,
  type Reminder,
  type ReminderKind,
  type ReminderStatus,
} from '@/shared/domain/reminders'
import { formatFullDayMonth, formatLongDate } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type ScopeCounterInput = {
  total: number
  animalName: string | null
}

export function scopeCounter(
  t: Translate,
  { total, animalName }: ScopeCounterInput,
): string | null {
  if (animalName === null) {
    return total === 0 ? null : t('home.todo.count', { n: total }, total)
  }
  if (total === 0) return animalName
  return t('home.todo.scoped', {
    name: animalName,
    count: t('home.todo.count', { n: total }, total),
  })
}

export function overdueBanner(t: Translate, overdue: number): string | null {
  if (overdue === 0) return null
  return t('home.todo.overdueBanner', { n: overdue }, overdue)
}

export type DueBadge = {
  text: string
  icon: string | null
}

const DUE_ICONS: Record<ReminderStatus, string | null> = {
  overdue: null,
  today: 'ms:today',
  tomorrow: 'ms:schedule',
  later: 'ms:schedule',
}

export function dueBadge(t: Translate, reminder: Reminder): DueBadge {
  const days = Math.abs(reminder.daysUntil)
  return {
    text: t(`home.due.${reminder.status}`, { n: days }, days),
    icon: DUE_ICONS[reminder.status],
  }
}

type Typed = Pick<HomeReminderSource, 'kind' | 'treatmentType'>

type TypeKey = 'vaccination' | 'deworming' | 'antiparasitic'

function typeKey(source: Typed): TypeKey {
  return source.kind === 'vaccination' ? 'vaccination' : (source.treatmentType ?? 'deworming')
}

/** « Vaccin », « Vermifuge », « Antiparasitaire » : le titre d'une ligne est le nom du produit. */
export function reminderType(t: Translate, source: Typed): string {
  return t(`home.reminder.${typeKey(source)}`)
}

export function reminderIcon(source: Typed): string {
  return sharedReminderIcon(source.kind, source.treatmentType)
}

function spokenDue(t: Translate, reminder: Reminder): string {
  const days = Math.abs(reminder.daysUntil)
  if (reminder.status !== 'later') return t(`home.row.due.${reminder.status}`, { n: days }, days)
  return t('home.row.due.later', { n: days, date: formatFullDayMonth(reminder.dueDate) }, days)
}

export type UpToDateInput = {
  animalName: string | null
  allNames: string[]
}

export function upToDateText(t: Translate, { animalName, allNames }: UpToDateInput): string {
  if (animalName !== null) return t('home.upToDate.forAnimal', { name: animalName })
  const head = allNames.slice(0, -1).join(t('home.upToDate.namesSeparator'))
  const names = [head, allNames.at(-1)].join(t('home.upToDate.namesLast'))
  return t('home.upToDate.forMany', { names })
}

export type ReminderRow = {
  id: string
  kind: ReminderKind
  status: ReminderStatus
  icon: string
  title: string
  /** « Vermifuge · Boree », sans l'animal quand un seul est affiché. */
  subtitle: string
  badge: DueBadge
  /** Nom lu par le lecteur d'écran : produit, type, animal, échéance, puis ce que fait le tap. */
  ariaLabel: string
}

export type ReminderRowsOptions = {
  animalNames: ReadonlyMap<string, string>
  showAnimal: boolean
}

export function reminderRows(
  t: Translate,
  reminders: Reminder<HomeReminderSource>[],
  { animalNames, showAnimal }: ReminderRowsOptions,
): ReminderRow[] {
  return reminders.map((reminder) => {
    const type = reminderType(t, reminder)
    const animal = showAnimal ? animalNames.get(reminder.animalId) : undefined
    const spoken = {
      title: reminder.label,
      type: t(`home.row.spokenType.${typeKey(reminder)}`),
      animal,
      due: spokenDue(t, reminder),
    }
    return {
      id: reminder.id,
      kind: reminder.kind,
      status: reminder.status,
      icon: reminderIcon(reminder),
      title: reminder.label,
      subtitle: animal === undefined ? type : t('home.row.subtitle', { type, animal }),
      badge: dueBadge(t, reminder),
      ariaLabel:
        animal === undefined ? t('home.row.labelSingle', spoken) : t('home.row.label', spoken),
    }
  })
}

export function nextReminderText(
  t: Translate,
  reminder: Reminder<HomeReminderSource> | null,
  { animalNames, showAnimal }: ReminderRowsOptions,
): string | null {
  if (reminder === null) return null
  const params = {
    reminder: reminder.label,
    date: formatLongDate(reminder.dueDate).replaceAll(' ', '\u00a0'),
  }
  const name = showAnimal ? animalNames.get(reminder.animalId) : undefined
  if (name === undefined) return t('home.upToDate.nextForAnimal', params)
  return t('home.upToDate.nextForMany', { ...params, name })
}
