// @vitest-environment node
import { describe, expectTypeOf, it } from 'vitest'

import i18n from '../index'
import type { Translate } from '../translate'

describe('Translate', () => {
  it('accepte le t de vue-i18n', () => {
    expectTypeOf(i18n.global.t).toExtend<Translate>()
  })

  it('accepte une traduction de test qui ne lit que la clé', () => {
    expectTypeOf((key: string) => key).toExtend<Translate>()
  })
})
