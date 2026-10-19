import type { OverflowMenuItems } from '@/shared/components/OverflowMenu.vue'

/** Les libellés d'un menu ⋮, lus comme à son ouverture. */
export function menuLabels(items: OverflowMenuItems): string[] {
  return (typeof items === 'function' ? items() : items).map(({ label }) => label)
}
