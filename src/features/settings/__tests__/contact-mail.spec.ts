// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { CONTACT_ADDRESS, contactMailBody, contactMailUrl } from '../logic/contact-mail'

describe('contactMailUrl', () => {
  it('écrit à l’adresse de contact de MémoPatte', () => {
    expect(CONTACT_ADDRESS).toBe('contact@memopatte.app')
    expect(contactMailUrl({ subject: 'x', body: 'y' })).toMatch(
      /^mailto:contact@memopatte\.app\?subject=x&body=y$/,
    )
  })

  it('encode l’objet français, accent et espace insécable compris', () => {
    const url = contactMailUrl({ subject: 'MémoPatte : question', body: '' })

    expect(url).toContain('?subject=M%C3%A9moPatte%C2%A0%3A%20question&')
  })

  it('encode l’objet anglais', () => {
    const url = contactMailUrl({ subject: 'MémoPatte: suggestion', body: '' })

    expect(url).toContain('?subject=M%C3%A9moPatte%3A%20suggestion&')
  })

  it('encode le corps sans laisser passer & ni ? ni =', () => {
    const url = contactMailUrl({ subject: 'a', body: 'Version : 1.0 & x=y ?' })

    expect(url.endsWith('&body=Version%20%3A%201.0%20%26%20x%3Dy%20%3F')).toBe(true)
    expect(new URL(url).searchParams.get('body')).toBe('Version : 1.0 & x=y ?')
  })
})

describe('contactMailBody', () => {
  it('laisse de la place pour écrire, puis donne les versions, en retours à la ligne CRLF', () => {
    expect(contactMailBody(['Version de l’app : 0.1.37', 'Version d’Android : 16'])).toBe(
      '\r\n\r\n\r\nVersion de l’app : 0.1.37\r\nVersion d’Android : 16',
    )
  })

  it('s’encode en %0D%0A dans le lien', () => {
    const url = contactMailUrl({ subject: 'a', body: contactMailBody(['App version: 0.1.37']) })

    expect(url).toContain('&body=%0D%0A%0D%0A%0D%0AApp%20version%3A%200.1.37')
  })
})
