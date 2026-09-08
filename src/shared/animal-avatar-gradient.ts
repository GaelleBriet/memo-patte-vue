export interface AnimalAvatarGradient {
  from: string
  to: string
}

export const ANIMAL_AVATAR_GRADIENTS: readonly [AnimalAvatarGradient, ...AnimalAvatarGradient[]] = [
  { from: '#D1A378', to: '#C58D63' }, // fauve
  { from: '#B8BEC6', to: '#A2A9B3' }, // gris ardoise
  { from: '#C99CA7', to: '#B67C8B' }, // rosé
  { from: '#ABC99C', to: '#8FB67C' }, // olive
  { from: '#9CB6C9', to: '#7C9EB6' }, // bleu
  { from: '#B29CC9', to: '#997CB6' }, // mauve
]

const GRADIENT_ANGLE = '160deg'

function hash(value: string): number {
  let result = 5381

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index)
  }

  return Math.abs(result)
}

export function animalAvatarGradient(animalId: string): AnimalAvatarGradient {
  const index = hash(animalId) % ANIMAL_AVATAR_GRADIENTS.length

  return ANIMAL_AVATAR_GRADIENTS[index] ?? ANIMAL_AVATAR_GRADIENTS[0]
}

export function animalAvatarGradientCss(animalId: string): string {
  const { from, to } = animalAvatarGradient(animalId)

  return `linear-gradient(${GRADIENT_ANGLE}, ${from}, ${to})`
}
