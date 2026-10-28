import { rowToReopen, type ReminderRow } from './home-summary'
import type {
  NotifiedDue,
  ReminderRef,
  ReminderRequest,
  ReminderStep,
  TodoRequest,
} from '@/shared/domain/reminder-route'

export type ReopenTarget =
  | { to: 'given-when'; id: string; due: NotifiedDue }
  | { to: 'sheet'; request: TodoRequest; step: ReminderStep }
  | { to: 'detail'; reminder: ReminderRef }
  | { to: 'nothing' }

export function reopenTarget(
  rows: readonly ReminderRow[],
  request: ReminderRequest,
  fromNotification: boolean,
): ReopenTarget {
  const { kind, id, due } = request
  if (request.step === 'given-when') return { to: 'given-when', id, due: request.due }
  if (fromNotification && kind === 'treatment' && due !== undefined && due !== 'unlogged') {
    return { to: 'sheet', request: { kind, id, due }, step: request.step }
  }
  const row = rowToReopen(rows, request)
  if (row) return { to: 'sheet', request: row.request, step: request.step }
  return fromNotification ? { to: 'detail', reminder: { kind, id } } : { to: 'nothing' }
}
