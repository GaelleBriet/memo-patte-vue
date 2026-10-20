import type { Journey } from './journeys'

/** R4, R7 : faite des seules doses arrivées, la journée où un réglage cède la place garde aussi les siennes. */
export function withCededDoses(origin: Journey, ceded: Journey | undefined): Journey {
  if (ceded === undefined) return origin
  return { setting: origin.setting, hours: [...new Set([...origin.hours, ...ceded.hours])].sort() }
}
