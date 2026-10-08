# Code propre (2026-10-08)

Règles générales de Gaelle appliquées à MémoPatte. La version générale, valable pour tous ses
projets, vit dans son coffre de notes (`claude/regles-generales.md`) ; `~/.claude/CLAUDE.md` est
un lien vers elle. Ce fichier prime sur elle pour ce dépôt.

## Le principe

- **Une responsabilité par fichier.** Un fichier qui sert plusieurs cas que la personne voit comme
  distincts (créer, modifier, reprendre…) range la logique de chaque cas dans son propre module ;
  le fichier partagé ne fait qu'assembler.
- **Un écran affiche et transmet, il ne décide pas.** Règles, validations, enchaînements, choix de
  navigation : dans `logic/` de la feature, `shared/domain/` ou un service de cas d'usage, testables
  sans monter de composant.
- **Une règle métier n'est écrite qu'à un endroit.** Jamais deux validations de la même chose ; une
  aide dupliquée remonte dans `shared/`.
- **Taille comme signal.** Au-delà d'environ 300 lignes de script dans un `.vue`, ou d'un module qui
  mélange plusieurs sujets, se demander s'il faut découper. Signal, pas seuil.

## Ranger

- **Un rangement n'est jamais abandonné** : ce qui ne se fait pas tout de suite part dans un ticket.
- **Un refactor ne change pas le comportement** : un commit par pas, tests existants verts sans
  toucher à leurs attentes, app comparée avant / après sur l'émulateur.

## Exemple

`TreatmentFormView.vue` (plus de 700 lignes) sert la création, la modification et la reprise d'un
traitement : les trois cas passent par un seul `write()` qui les distingue. Chaque cas doit vivre
dans son module, l'écran ne faisant qu'assembler : ticket #655.

## Ordre des `<script setup>`

Un groupe séparé du suivant par une ligne vide, vérifié par la règle ESLint `app/vue-script-order` :

1. imports, puis types locaux et constantes de module (`const MAX = 3`, `defineAsyncComponent`, un
   appel qui ne lit que des imports ou des constantes de module)
2. `defineProps` (ou `withDefaults`), `defineEmits`, `defineModel`, `defineSlots`, `defineOptions`
3. outils : `useI18n`, `useRouter`, `useRoute`, stores, composables `useXxx()`
4. état : `ref`, `reactive`, `shallowRef`, `useTemplateRef`, `useId`, `toRef`, `toRefs`, `inject`,
   `provide`, `readonly`, `shallowReadonly`, `customRef`, `markRaw`, `effectScope`,
   `getCurrentInstance`…, `new`, `let`, et toute valeur ou tout appel qui lit les props, les outils,
   l'état, un `computed` ou une fonction locale
5. `computed`
6. `watch`, `watchEffect`
7. fonctions
8. cycle de vie : `onMounted`, `onUnmounted`, `onScopeDispose`, `nextTick`…
9. `defineExpose`

Une instruction qui a besoin d'une valeur d'un groupe plus bas pour s'initialiser reste après elle :
un composable qui reçoit un état local (`useFormValidation(values)`) vient après cet état.

Limites connues de la règle : elle ne fait pas d'analyse de flux (fonction rangée dans un objet, un
tableau ou une `class` placés avant la valeur qu'elle lit, fabrique non `use*` qui lit un `computed`
à l'initialisation, `watch` en `flush: 'sync'`), et ne vérifie ni `class`, ni `if`, ni `for`, ni
déclaration multiple au premier niveau. En cas de doute, l'ordre qui fonctionne prime et se signale
en revue.
