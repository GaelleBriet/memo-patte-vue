import type { HomeReminderSource } from './home-reminders.service'
import type { Reminder, ReminderStatus } from '@/shared/reminders'

/** La fonction `t` de vue-i18n, réduite à ce que ce module utilise : clé, paramètres nommés, pluriel. */
export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type ScopeCounterInput = {
  total: number
  /** Prénom de l'animal sélectionné, `null` en vue globale. */
  animalName: string | null
}

/** `3 rappels` en vue globale, `Milo · 2 rappels` ou `Milo` seul avec un animal ; rien si vue globale vide. */
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

type Typed = Pick<HomeReminderSource, 'kind' | 'label' | 'treatmentType'>

/** Un vaccin s'annonce par son nom, un traitement par son type : le produit reste au Carnet. */
export function reminderTitle(t: Translate, source: Typed): string {
  if (source.kind === 'vaccination') return t('home.reminder.vaccination', { name: source.label })
  return t(`home.reminder.${source.treatmentType ?? 'deworming'}`)
}

export function reminderIcon(source: Typed): string {
  if (source.kind === 'vaccination') return 'ms:vaccines'
  return source.treatmentType === 'antiparasitic' ? 'ms:pest_control' : 'ms:medication'
}

export type UpToDateInput = {
  animalName: string | null
  /** Prénoms de tous les animaux du foyer, dans l'ordre de la liste. */
  allNames: string[]
}

export function upToDateText(t: Translate, { animalName, allNames }: UpToDateInput): string {
  if (animalName !== null) return t('home.upToDate.forAnimal', { name: animalName })
  if (allNames.length === 1) return t('home.upToDate.forOne', { name: allNames[0] })
  const head = allNames.slice(0, -1).join(t('home.upToDate.namesSeparator'))
  const names = [head, allNames.at(-1)].join(t('home.upToDate.namesLast'))
  return t('home.upToDate.forMany', { names })
}
