/**
 * Dégradé d'avatar affiché tant qu'un animal n'a pas de photo (maquettes v2,
 * `docs/design/accueil-v2/accueil.md` §2 et `docs/design/carnet-v2/carnet.md` §2).
 *
 * Ces couleurs sont purement décoratives : elles n'ont aucun rôle sémantique et
 * ne peuvent donc pas venir de la palette du thème (`src/core/theme/vuetify.ts`),
 * qui ne décrit que des rôles (fond, surface, urgences…). Elles vivent ici, à
 * l'unique endroit qui les utilise.
 */

export interface AnimalAvatarGradient {
  /** Couleur haute du dégradé. */
  from: string
  /** Couleur basse du dégradé. */
  to: string
}

/**
 * Palette des dégradés d'avatar.
 *
 * Les deux premiers sont relevés au pixel sur la maquette v2 de l'accueil
 * (Milo le golden retriever, Luna la chatte grise). Les quatre suivants
 * prolongent la même construction — deux tons voisins d'une teinte douce, du
 * plus clair au plus foncé — pour couvrir un foyer de plus de deux animaux.
 */
export const ANIMAL_AVATAR_GRADIENTS: readonly [AnimalAvatarGradient, ...AnimalAvatarGradient[]] = [
  { from: '#D1A378', to: '#C58D63' }, // fauve — Milo, maquette accueil v2
  { from: '#B8BEC6', to: '#A2A9B3' }, // gris ardoise — Luna, maquette accueil v2
  { from: '#C99CA7', to: '#B67C8B' }, // rosé
  { from: '#ABC99C', to: '#8FB67C' }, // olive
  { from: '#9CB6C9', to: '#7C9EB6' }, // bleu
  { from: '#B29CC9', to: '#997CB6' }, // mauve
]

/** Angle du dégradé, repris de la maquette (haut clair, bas plus soutenu). */
const GRADIENT_ANGLE = '160deg'

/**
 * Hachage djb2 : stable d'un rendu à l'autre et d'un appareil à l'autre, donc
 * un animal garde toujours le même dégradé.
 */
function hash(value: string): number {
  let result = 5381

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index)
  }

  return Math.abs(result)
}

/** Dégradé d'un animal, déterminé par son identifiant. */
export function animalAvatarGradient(animalId: string): AnimalAvatarGradient {
  const index = hash(animalId) % ANIMAL_AVATAR_GRADIENTS.length

  return ANIMAL_AVATAR_GRADIENTS[index] ?? ANIMAL_AVATAR_GRADIENTS[0]
}

/** Le même dégradé, prêt à être posé en `background-image`. */
export function animalAvatarGradientCss(animalId: string): string {
  const { from, to } = animalAvatarGradient(animalId)

  return `linear-gradient(${GRADIENT_ANGLE}, ${from}, ${to})`
}
