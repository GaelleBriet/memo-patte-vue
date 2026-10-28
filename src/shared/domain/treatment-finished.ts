import type { TreatmentView } from '@/shared/domain/dose-calendar'

export function isTreatmentOpen(view: Pick<TreatmentView, 'phase'>): boolean {
  return view.phase !== 'ended' && view.phase !== 'stopped'
}

export function isTreatmentFinished(
  view: Pick<TreatmentView, 'phase' | 'finished'>,
  followed: boolean,
): boolean {
  return view.finished || (!followed && !isTreatmentOpen(view))
}
