import type { RouteLocationRaw } from 'vue-router'

export function plusScreenAccess(hasPlusAccount: boolean): true | RouteLocationRaw {
  return hasPlusAccount || { name: 'plus' }
}
