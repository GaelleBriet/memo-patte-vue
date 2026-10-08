import combinationsFile from './vaccine-combinations.json'
import { comparableVaccineName, isSameVaccineName } from './vaccination-name'
import type { Animal, AnimalSpecies } from '@/features/animals/schema/animal.schema'
import { formatList } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export interface VaccineCombination {
  diseases: readonly string[]
  aliases: readonly string[]
}

export interface LabelledCombination {
  label: string
  aliases: readonly string[]
}

export interface CarnetVaccineName {
  name: string
  animalNames: string[]
}

export interface VaccineNameSuggestions {
  carnet: CarnetVaccineName[]
  combinations: LabelledCombination[]
  /** Le texte tapé, proposé tel quel en dernier, sauf s'il est déjà une proposition. */
  typed: string | null
}

/** Sigles de recherche, écrits à la main : ceux des produits, jamais un libellé. */
const ALIASES: Record<string, readonly string[]> = {
  'dog:distemper+hepatitis+parvovirus': ['CHP', 'DAP'],
  'dog:distemper+hepatitis+parvovirus+parainfluenza': ['CHPPi', 'DHPPi'],
  'dog:distemper+hepatitis+parvovirus+leptospirosis': ['CHPL', 'DAPL'],
  'dog:distemper+hepatitis+parvovirus+parainfluenza+leptospirosis': ['CHPPiL', 'DHPPiL'],
  'dog:distemper+hepatitis+parvovirus+parainfluenza+leptospirosis+rabies': ['CHPPiLR'],
  'dog:parainfluenza+leptospirosis': ['PiL'],
  'dog:parvovirus': [],
  'dog:leptospirosis': ['L4'],
  'dog:rabies': [],
  'dog:kennelCough': ['KC', 'BbPi'],
  'dog:leishmaniosis': [],
  'cat:panleukopenia+catFlu': ['RCP', 'CRP', 'CVR', 'HCP'],
  'cat:catFlu': ['RC', 'CR', 'HC'],
  'cat:panleukopenia+catFlu+felineLeukaemia': ['TCL', 'RCP FeLV', 'HCP FeLV'],
  'cat:panleukopenia+catFlu+chlamydiosis': ['RCPCh', 'HCPCh'],
  'cat:panleukopenia+catFlu+chlamydiosis+felineLeukaemia': ['RCPCh FeLV', 'HCPCh FeLV'],
  'cat:felineLeukaemia': ['FeLV'],
  'cat:rabies': [],
}

export function vaccineCombinationsFor(species: AnimalSpecies): VaccineCombination[] {
  return combinationsFile.combinations.flatMap((combination) => {
    if (combination.species !== species) return []
    const aliases = ALIASES[`${species}:${combination.diseases.join('+')}`]
    return aliases ? [{ diseases: combination.diseases, aliases }] : []
  })
}

function capitalized(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

export function labelledCombinations(t: Translate, species: AnimalSpecies): LabelledCombination[] {
  return vaccineCombinationsFor(species).map(({ diseases, aliases }) => ({
    label: capitalized(diseases.map((disease) => t(`vaccinations.diseases.${disease}`)).join(', ')),
    aliases,
  }))
}

/** Noms déjà donnés aux vaccins des animaux de l'espèce, un par nom, dans l'ordre des animaux. */
export function carnetVaccineNames(
  vaccinations: readonly { name: string; animalId: string }[],
  animals: readonly Pick<Animal, 'id' | 'name' | 'species'>[],
  species: AnimalSpecies,
): CarnetVaccineName[] {
  const names: CarnetVaccineName[] = []
  for (const animal of animals) {
    if (animal.species !== species) continue
    for (const { name, animalId } of vaccinations) {
      if (animalId !== animal.id) continue
      const entry = names.find((known) => isSameVaccineName(known.name, name))
      if (!entry) names.push({ name, animalNames: [animal.name] })
      else if (!entry.animalNames.includes(animal.name)) entry.animalNames.push(animal.name)
    }
  }
  return names
}

/** Nom lu par TalkBack : les sigles en phrase, sans le point médian de l'affichage. */
export function combinationSpokenName(t: Translate, combination: LabelledCombination): string {
  if (combination.aliases.length === 0) return combination.label
  return t('vaccinations.form.name.suggestions.spoken', {
    label: combination.label,
    aliases: combination.aliases.join(', '),
  })
}

export function usedForText(t: Translate, animalNames: readonly string[]): string {
  return t('vaccinations.form.name.usedFor', { names: formatList(animalNames) })
}

function byRelevance<T>(query: string, texts: (item: T) => readonly string[]) {
  const isExact = (item: T) => texts(item).some((text) => comparableVaccineName(text) === query)
  return (a: T, b: T) =>
    Number(isExact(b)) - Number(isExact(a)) || texts(a)[0]!.length - texts(b)[0]!.length
}

export function suggestVaccineNames(
  typed: string,
  carnet: readonly CarnetVaccineName[],
  combinations: readonly LabelledCombination[],
): VaccineNameSuggestions {
  const query = comparableVaccineName(typed)
  if (query === '') return { carnet: [], combinations: [], typed: null }

  const matches = (text: string) => comparableVaccineName(text).includes(query)
  const carnetMatches = carnet
    .filter(({ name }) => matches(name))
    .sort(byRelevance(query, ({ name }) => [name]))
  const combinationMatches = combinations
    .filter(({ label }) => !carnet.some(({ name }) => isSameVaccineName(name, label)))
    .filter(({ label, aliases }) => [label, ...aliases].some(matches))
    .sort(byRelevance(query, ({ label, aliases }) => [label, ...aliases]))
  const shown = [
    ...carnetMatches.map(({ name }) => name),
    ...combinationMatches.map(({ label }) => label),
  ]

  return {
    carnet: carnetMatches,
    combinations: combinationMatches,
    typed: shown.some((name) => isSameVaccineName(name, typed)) ? null : typed.trim(),
  }
}
