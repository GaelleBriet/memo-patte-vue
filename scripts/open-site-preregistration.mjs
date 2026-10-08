// Usage : node scripts/open-site-preregistration.mjs 'https://play.google.com/store/apps/details?id=…'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openPreregistration } from './site-preregistration.mjs'

const playUrl = process.argv[2]
const pages = readdirSync('site', { recursive: true })
  .filter((path) => path.endsWith('.html'))
  .map((path) => join('site', path))

for (const page of pages) {
  const lang = page.startsWith(join('site', 'en')) ? 'en' : 'fr'
  writeFileSync(page, openPreregistration(readFileSync(page, 'utf8'), lang, playUrl))
}
process.stdout.write(`${pages.length} pages mises à jour.\n`)
