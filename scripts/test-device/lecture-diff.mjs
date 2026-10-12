// lecture-diff.mjs <dossier> : pour chaque carnet dont la lecture diffère entre avant/ et apres/, les parties qui changent.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const only = process.argv[3]
const read = (side, name) => JSON.parse(readFileSync(join(dir, side, name), 'utf8'))

function paths(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return []
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return [at]
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].flatMap((key) => paths(a[key], b[key], `${at}.${key}`))
}

const families = new Map()
for (const name of readdirSync(join(dir, 'avant'))) {
  if (only && !name.includes(only)) continue
  const [before, after] = [read('avant', name), read('apres', name)]
  const changed = paths(before, after).map((path) => path.replace(/\.\d+/g, '[]'))
  if (changed.length === 0) continue
  const key = [...new Set(changed.map((path) => path.split('.').slice(1, 3).join('.')))]
    .sort()
    .join(' + ')
  families.set(key, [...(families.get(key) ?? []), name.replace('.json', '')])
  const at = (side, path) =>
    JSON.stringify(
      path
        .split('.')
        .slice(1)
        .reduce((o, k) => o?.[k], side),
    )
  if (only) {
    for (const path of paths(before, after)) {
      process.stdout.write(`${path}\n  avant : ${at(before, path)}\n  après : ${at(after, path)}\n`)
    }
  }
}
for (const [key, names] of [...families].sort((a, b) => b[1].length - a[1].length)) {
  process.stdout.write(`${names.length}\t${key}\t${names.slice(0, 6).join(' ')}\n`)
}
