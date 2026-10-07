// Dérive les combinaisons de maladies courantes des vaccins du chien et du chat depuis la base
// publique des médicaments vétérinaires de l'ANMV. Source et méthode :
// docs/technical/liste-vaccins.md.

export const MIN_PRODUCTS = 2

const SPECIES = { Chien: 'dog', Chat: 'cat' }
const VACCINE_ATC = [/^QI07A/, /^QI06A/]
const AUTHORISED = new Set([
  'AMM',
  'AMM illimitée',
  'AMM renouvelée',
  'AMM sous circonstances exceptionnelles',
])

/** Ordre d'usage des maladies dans un libellé (« Carré, hépatite, parvovirose… »). */
export const DISEASE_ORDER = {
  dog: [
    'distemper',
    'hepatitis',
    'parvovirus',
    'parainfluenza',
    'leptospirosis',
    'rabies',
    'kennelCough',
    'leishmaniosis',
    'piroplasmosis',
    'lymeDisease',
    'canineHerpesvirus',
  ],
  cat: [
    'panleukopenia',
    'catFlu',
    'chlamydiosis',
    'felineLeukaemia',
    'rabies',
    'bordetella',
    'piroplasmosis',
  ],
}

const SUBSTANCE_DISEASES = [
  [/canine distemper virus/i, 'distemper'],
  [/canine adenovirus/i, 'hepatitis'],
  [/canine parvovirus/i, 'parvovirus'],
  [/canine parainfluenza virus/i, 'parainfluenza'],
  [/leptospira/i, 'leptospirosis'],
  [/rabies virus/i, 'rabies'],
  [/bordetella bronchiseptica/i, 'bordetella'],
  [/leishmania/i, 'leishmaniosis'],
  [/babesia/i, 'piroplasmosis'],
  [/borreliella|borrelia/i, 'lymeDisease'],
  [/feline panleucopenia virus/i, 'panleukopenia'],
  [/feline calicivirus|felid herpesvirus/i, 'catFlu'],
  [/feline leukemia virus/i, 'felineLeukaemia'],
  [/chlamydia felis/i, 'chlamydiosis'],
]
const SOLVENT = /^eau (pour préparation injectable|purifiée)$/i
const UNDEFINED_COMPOSITION = /A DEFINIR/i

/**
 * Produits dont l'export ne donne pas la composition, ou pas entière : maladies lues dans le RCP
 * ou dans `docs/product/etude-vaccination.md` §2.3. `[]` : ce n'est pas un vaccin (solvant).
 */
export const COMPOSITION_BY_NAME = {
  'PUREVAX RC': ['catFlu'],
  'PUREVAX RCP': ['catFlu', 'panleukopenia'],
  'PUREVAX RCPCh': ['catFlu', 'panleukopenia', 'chlamydiosis'],
  'PUREVAX RCP FeLV': ['catFlu', 'panleukopenia', 'felineLeukaemia'],
  'PUREVAX RCPCh FeLV': ['catFlu', 'panleukopenia', 'chlamydiosis', 'felineLeukaemia'],
  'PUREVAX RABIES': ['rabies'],
  'LEUCOFELIGEN FELV/RCP': ['catFlu', 'panleukopenia', 'felineLeukaemia'],
  LEUCOGEN: ['felineLeukaemia'],
  'NOBIVAC LEUFEL': ['felineLeukaemia'],
  'VERSICAN PLUS Pi': ['parainfluenza'],
  'VERSICAN PLUS DHPPI': ['distemper', 'hepatitis', 'parvovirus', 'parainfluenza'],
  'VERSICAN PLUS DHPPI/L4': [
    'distemper',
    'hepatitis',
    'parvovirus',
    'parainfluenza',
    'leptospirosis',
  ],
  'VERSICAN PLUS DHPPI/L4R': [
    'distemper',
    'hepatitis',
    'parvovirus',
    'parainfluenza',
    'leptospirosis',
    'rabies',
  ],
  'VERSICAN PLUS Pi/L4': ['parainfluenza', 'leptospirosis'],
  'VERSICAN PLUS Pi/L4R': ['parainfluenza', 'leptospirosis', 'rabies'],
  'VERSICAN PLUS L4': ['leptospirosis'],
  'CANIGEN L4': ['leptospirosis'],
  'NOBIVAC L4': ['leptospirosis'],
  'NOBIVAC DP PLUS': ['distemper', 'parvovirus'],
  LETIFEND: ['leishmaniosis'],
  'EURICAN HERPES 205': ['canineHerpesvirus'],
  UNISOLVE: [],
}

function knownComposition(name) {
  const keys = Object.keys(COMPOSITION_BY_NAME)
    .filter((key) => name === key || name.startsWith(`${key} `))
    .sort((a, b) => b.length - a.length)
  return keys.length > 0 ? COMPOSITION_BY_NAME[keys[0]] : null
}

function diseaseOfSubstance(substance) {
  return SUBSTANCE_DISEASES.find(([pattern]) => pattern.test(substance))?.[1] ?? null
}

function compositionOf(product) {
  const known = knownComposition(product.name)
  if (known) return known

  const substances = product.substances.filter((substance) => !SOLVENT.test(substance.trim()))
  if (
    substances.length === 0 ||
    substances.some((substance) => UNDEFINED_COMPOSITION.test(substance))
  ) {
    throw new Error(
      `Composition inconnue pour « ${product.name} » : ajoute-la à COMPOSITION_BY_NAME.`,
    )
  }
  return substances.map((substance) => {
    const disease = diseaseOfSubstance(substance)
    if (disease === null) {
      throw new Error(`Substance sans maladie connue dans « ${product.name} » : ${substance}`)
    }
    return disease
  })
}

/** Les maladies couvertes par un produit pour une espèce, dans l'ordre d'usage. */
export function diseasesOf(product, species) {
  const diseases = new Set(compositionOf(product))
  if (species === 'dog' && diseases.delete('bordetella')) {
    diseases.delete('parainfluenza')
    diseases.add('kennelCough')
  }
  const order = DISEASE_ORDER[species]
  for (const disease of diseases) {
    if (!order.includes(disease)) {
      throw new Error(
        `Maladie « ${disease} » sans place dans DISEASE_ORDER.${species} (${product.name}).`,
      )
    }
  }
  return order.filter((disease) => diseases.has(disease))
}

/** Les vaccins rage multi-espèces ne portent que le code ATCvet du chien : l'espèce vient des voies. */
function speciesOf(product) {
  return Object.entries(SPECIES)
    .filter(([label]) => product.species.includes(label))
    .map(([, species]) => species)
}

function isVaccine(product) {
  return product.atc.some((code) => VACCINE_ATC.some((pattern) => pattern.test(code)))
}

function compareCombinations(a, b) {
  const species = Object.values(SPECIES)
  const order = DISEASE_ORDER[a.species]
  const byRank = (diseases) => diseases.map((disease) => order.indexOf(disease))
  const [rankA, rankB] = [byRank(a.diseases), byRank(b.diseases)]
  return (
    species.indexOf(a.species) - species.indexOf(b.species) ||
    a.diseases.length - b.diseases.length ||
    rankA.reduce((difference, rank, index) => difference || rank - rankB[index], 0)
  )
}

/**
 * `products` : vaccins lus dans l'export, avec `name`, `status`, `atc`, `species` (libellés de
 * l'export : « Chien », « Chat ») et `substances`. Ne garde que les combinaisons d'au moins
 * `MIN_PRODUCTS` produits autorisés.
 */
export function deriveVaccineList(products, exportedAt) {
  const counts = new Map()
  for (const product of products) {
    if (!AUTHORISED.has(product.status) || !isVaccine(product)) continue
    for (const species of speciesOf(product)) {
      const diseases = diseasesOf(product, species)
      if (diseases.length === 0) continue
      const key = `${species}:${diseases.join('+')}`
      const entry = counts.get(key) ?? { species, diseases, products: 0 }
      entry.products += 1
      counts.set(key, entry)
    }
  }
  const combinations = [...counts.values()]
    .filter((entry) => entry.products >= MIN_PRODUCTS)
    .sort(compareCombinations)
  return { exportedOn: exportedAt.slice(0, 10), combinations }
}
