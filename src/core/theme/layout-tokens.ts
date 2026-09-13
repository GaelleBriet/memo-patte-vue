// Copies TS des tokens de `src/styles/_tokens.scss` dont un composant Vuetify a
// besoin en nombre (une prop `height`, par exemple). Le SCSS reste la référence :
// `shared/__tests__/BottomNavigation.styles.spec.ts` échoue si les deux divergent.

/** `$height-bottom-nav` : onglets de la bottom nav, hors zone de gestes (px). */
export const heightBottomNav = 56

/** `$padding-bottom-nav` : zone de gestes Android sous la bottom nav (px). */
export const paddingBottomNav = 22
