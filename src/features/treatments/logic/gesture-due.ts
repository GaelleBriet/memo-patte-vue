import type { Due } from '@/shared/domain/dose-calendar'

/** Une échéance lue par le moteur v2, sous la forme que les gestes de l'ancien moteur reçoivent encore. */
export type GestureDue = { periodId: string; dueOn: string; dueTime: string | null }

export function gestureDue({ settingId, dueOn, dueTime }: Due): GestureDue {
  return { periodId: settingId, dueOn, dueTime }
}
