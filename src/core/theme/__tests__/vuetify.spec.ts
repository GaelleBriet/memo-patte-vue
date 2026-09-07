import { describe, it, expect } from 'vitest'

import vuetify from '../vuetify'

describe('thème Vuetify', () => {
  it('expose la palette des maquettes v2', () => {
    const couleurs = vuetify.theme.themes.value.light?.colors

    expect(couleurs?.primary).toBe('#01383E')
    expect(couleurs?.background).toBe('#F9F3E9')
    expect(couleurs?.surface).toBe('#FEFCF9')
    expect(couleurs?.overdue).toBe('#C0453D')
    expect(couleurs?.today).toBe('#D38D38')
    expect(couleurs?.soon).toBe('#5C8664')
  })
})
