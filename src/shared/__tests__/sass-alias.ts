import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DOSSIER_SRC = resolve(process.cwd(), 'src')

/** Importer sass qui résout l'alias `@/`, que seul Vite connaît. */
export const aliasSrc = {
  findFileUrl: (url: string) =>
    url.startsWith('@/') ? pathToFileURL(resolve(DOSSIER_SRC, url.slice(2))) : null,
}
