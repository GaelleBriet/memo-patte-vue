import { z } from 'zod'

import { isCalendarDay, isNotFuture } from '@/shared/domain/calendar-day'
import { CLOCK_TIME_PATTERN } from '@/shared/domain/clock-time'
import { instantSchema } from '@/shared/domain/instant'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

export const day = z.string().refine(isCalendarDay)
let referenceDay = ''

export function withReferenceDay<T>(today: string, read: () => T): T {
  const previous = referenceDay
  referenceDay = today
  try {
    return read()
  } finally {
    referenceDay = previous
  }
}

export const pastDay = day.refine((value) => isNotFuture(value, referenceDay))
export const clockTime = z.string().regex(CLOCK_TIME_PATTERN)
export const timestamps = { createdAt: instantSchema, updatedAt: instantSchema }
export const stamps = { ...timestamps, createdByDevice: z.uuid(), updatedByDevice: z.uuid() }
export const optionalName = z
  .string()
  .trim()
  .max(MAX_NAME_LENGTH)
  .nullable()
  .transform((value) => value || null)

export const signed = <S extends z.ZodRawShape>(shape: S) => z.object({ ...shape, ...stamps })
export const dated = <S extends z.ZodRawShape>(shape: S) => z.object({ ...shape, ...timestamps })
