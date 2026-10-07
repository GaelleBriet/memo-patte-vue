// Régénère la liste des combinaisons de vaccins depuis l'export XML V2 de l'ANMV.
// Usage : pnpm vaccines:generate <dossier où amm-vet-fr-v2-v.7z a été décompressé>
// Téléchargement et licence : docs/technical/liste-vaccins.md.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { XMLParser } from 'fast-xml-parser'
import { format, resolveConfig } from 'prettier'

import { deriveVaccineList } from './vaccine-list.mjs'

const OUTPUT = 'src/features/vaccinations/logic/vaccine-combinations.json'
const SOURCE = {
  title: 'Base de données publique des médicaments vétérinaires autorisés en France',
  publisher: 'Anses – Agence nationale du médicament vétérinaire',
  url: 'https://www.data.gouv.fr/datasets/base-de-donnees-publique-des-medicaments-veterinaires-autorises-en-france-1',
  licence: 'CC BY',
}
const LISTS = ['medicinal-product', 'compo', 'sa', 'voie-admin', 'code-atcvet', 'entry']

const directory = process.argv[2]
if (!directory) {
  console.error('Usage : pnpm vaccines:generate <dossier de l’export XML V2 décompressé>')
  process.exit(1)
}

const parser = new XMLParser({ parseTagValue: false, isArray: (name) => LISTS.includes(name) })
const readXml = (file) =>
  parser.parse(readFileSync(join(directory, file), 'utf8').replace(/^\uFEFF/, ''))

const reference = readXml('amm-vet-fr-v2-d.xml')['donnees-reference-group']
const labels = (list) =>
  new Map(
    (reference[list]?.entry ?? []).map((entry) => [entry['source-code'], entry['source-desc']]),
  )
const substanceLabels = labels('term-sa')
const speciesLabels = labels('term-esp')
const statusLabels = labels('term-stat-auto')

const group = readXml('amm-vet-fr-v2-v.xml')['medicinal-product-group']
const products = group['medicinal-product'].map((product) => ({
  name: product.nom,
  status: statusLabels.get(product['term-stat-auto']),
  atc: product['atcvet-code']?.['code-atcvet'] ?? [],
  species: (product['voie-administration']?.['voie-admin'] ?? []).map((route) =>
    speciesLabels.get(route['term-esp']),
  ),
  substances: (product.composition?.compo ?? []).flatMap((compo) =>
    (compo.sa ?? []).map((substance) => substanceLabels.get(substance['term-sa'])),
  ),
}))

const { exportedOn, combinations } = deriveVaccineList(
  products,
  group.Informations['date-jeu-de-donnees'],
)
const json = JSON.stringify({ source: { ...SOURCE, exportedOn }, combinations })
writeFileSync(OUTPUT, await format(json, { ...(await resolveConfig(OUTPUT)), filepath: OUTPUT }))
process.stdout.write(
  `${combinations.length} combinaisons écrites dans ${OUTPUT} (export du ${exportedOn}).\n`,
)
