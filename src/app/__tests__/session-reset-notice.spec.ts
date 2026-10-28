import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { dismissToast, toastMessage, toastTone } from '@/shared/utils/toast'

import { installSessionResetNotice } from '../session-reset-notice'

afterEach(() => {
  dismissToast()
  i18n.global.locale.value = 'fr'
})

describe('avertissement de session illisible', () => {
  it('affiche le toast quand le signal est levé, pas avant', () => {
    let raise: () => void = () => {}
    installSessionResetNotice((listener) => (raise = listener))
    expect(toastMessage.value).toBeNull()

    raise()

    expect(toastMessage.value).toBe(
      'Connexion fermée\u00a0: la session n’a pas pu être lue. Ton carnet reste sur ce téléphone.',
    )
    expect(toastTone.value).toBe('info')
  })

  it('parle anglais quand l’app est en anglais', () => {
    i18n.global.locale.value = 'en'
    let raise: () => void = () => {}
    installSessionResetNotice((listener) => (raise = listener))

    raise()

    expect(toastMessage.value).toBe(
      'Signed out: the session could not be read. Your health record stays on this phone.',
    )
  })
})
