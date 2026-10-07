/** Le même objet, espaces insécables remplacées : les attentes s'écrivent au clavier. */
export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replaceAll('\u00a0', ' ')) as T
}
