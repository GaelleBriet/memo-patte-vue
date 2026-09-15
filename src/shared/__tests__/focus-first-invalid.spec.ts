import { afterEach, describe, expect, it } from 'vitest'

import { focusFirstInvalid } from '../form/focus-first-invalid'

function zone(html: string): HTMLElement {
  const element = document.createElement('div')
  element.innerHTML = html
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusFirstInvalid', () => {
  it('pose le focus sur le premier champ invalide, dans l’ordre du document', () => {
    const racine = zone(`
      <input id="nom" aria-invalid="false" />
      <input id="date" aria-invalid="true" />
      <input id="poids" aria-invalid="true" />
    `)

    focusFirstInvalid(racine)

    expect(document.activeElement?.id).toBe('date')
  })

  it('entre dans un groupe invalide et focalise sa première option', () => {
    const racine = zone(`
      <div role="radiogroup" aria-invalid="true">
        <button id="chien" role="radio">Chien</button>
        <button id="chat" role="radio">Chat</button>
      </div>
    `)

    focusFirstInvalid(racine)

    expect(document.activeElement?.id).toBe('chien')
  })

  it('ne déplace pas le focus quand tout est valide', () => {
    const racine = zone('<input id="nom" aria-invalid="false" />')
    const bouton = document.createElement('button')
    document.body.append(bouton)
    bouton.focus()

    focusFirstInvalid(racine)

    expect(document.activeElement).toBe(bouton)
  })
})
