// @vitest-environment node
import { RuleTester } from 'eslint'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'
import { describe, it } from 'vitest'
import rule from '../../tools/eslint/vue-script-order'

RuleTester.describe = describe
RuleTester.it = it
RuleTester.itOnly = it.only

const tester = new RuleTester({
  languageOptions: {
    parser: vueParser,
    parserOptions: { parser: tseslint.parser, sourceType: 'module', ecmaVersion: 'latest' },
  },
})

const vue = (...groups: string[]) =>
  `<script setup lang="ts">\n${groups.join('\n\n')}\n</script>\n<template><div /></template>\n`

const IMPORTS = "import { computed, onMounted, ref, watch } from 'vue'"
const TYPES = 'type Mode = "a" | "b"'
const CONSTANT = 'const MAX = 3'
const PROPS = 'const props = defineProps<{ id: string }>()'
const TOOLS = 'const { t } = useI18n()'
const STATE = 'const count = ref(0)'
const COMPUTED = 'const double = computed(() => count.value * 2)'
const WATCH = 'watch(count, () => reset())'
const FUNCTION = 'function reset() {\n  count.value = 0\n}'
const ARROW = 'const save = async () => {\n  await reset()\n}'
const LIFECYCLE = 'onMounted(reset)'
const EXPOSE = 'defineExpose({ reset })'

const order = (current: string, previous: string) => ({
  messageId: 'order',
  data: { current, previous },
})

describe('app/vue-script-order', () => {
  tester.run('app/vue-script-order', rule, {
    valid: [
      {
        name: 'les neuf groupes dans l’ordre',
        filename: 'Ordre.vue',
        code: vue(
          IMPORTS,
          `${TYPES}\n${CONSTANT}`,
          PROPS,
          `${TOOLS}\nconst store = useAnimalsStore()`,
          `${STATE}\nconst figure = useTemplateRef('figure')\nlet opener: HTMLElement | null = null`,
          COMPUTED,
          `${WATCH}\nwatchEffect(() => count.value)`,
          `${FUNCTION}\n${ARROW}`,
          `${LIFECYCLE}\nonScopeDispose(reset)`,
          EXPOSE,
        ),
      },
      {
        name: 'un composable qui reçoit un état reste après lui',
        filename: 'Dependance.vue',
        code: vue(IMPORTS, STATE, 'const { errors } = useFormValidation(count)', COMPUTED),
      },
      {
        name: 'un objet dont les fonctions lisent un outil va avec l’état',
        filename: 'Actions.vue',
        code: vue(IMPORTS, TOOLS, STATE, "const ACTIONS = { home: () => t('home') }"),
      },
      {
        name: 'un composable dont la fonction lit un état reste après lui',
        filename: 'Getter.vue',
        code: vue(IMPORTS, STATE, 'const photoUrl = usePhotoUrls(() => [count.value])'),
      },
      {
        name: 'un ref initialisé depuis un computed reste après lui',
        filename: 'Computed.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const copy = ref(double.value)'),
      },
      {
        name: 'une valeur tirée des props va avec l’état',
        filename: 'Derivee.vue',
        code: vue(IMPORTS, PROPS, "const mode = props.id === '' ? 'create' : 'edit'", COMPUTED),
      },
      {
        name: 'un watch immédiat qui appelle une fonction fléchée reste après elle',
        filename: 'Immediat.vue',
        code: vue(IMPORTS, STATE, ARROW, 'watch(count, save, { immediate: true })'),
      },
      {
        name: 'un appel qui ne lit que des imports va avec les constantes',
        filename: 'Inconnu.vue',
        code: vue(
          IMPORTS,
          'const cache = buildCache()\nconst max = Math.max(1, MAX)',
          PROPS,
          STATE,
        ),
      },
      {
        name: 'une fonction passée à .map lit un computed : elle reste après lui',
        filename: 'Map.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const list = [1, 2].map((x) => x + double.value)'),
      },
      {
        name: 'une fonction passée à un appel inconnu lit un computed',
        filename: 'Build.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const cache = build(() => double.value)'),
      },
      {
        name: 'une fonction passée à .map appelle une fonction locale',
        filename: 'Map-fonction.vue',
        code: vue(
          IMPORTS,
          STATE,
          'const load = () => count.value',
          'const items = [1].map(() => load())',
        ),
      },
      {
        name: 'un ref initialisé par .map sur un computed',
        filename: 'Ref-map.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const copy = ref([1].map(() => double.value))'),
      },
      {
        name: 'un new dont la fonction lit un computed',
        filename: 'New-fonction.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const observer = new Observer(() => double.value)'),
      },
      {
        name: 'un watch dont les options immédiates sont dans une constante',
        filename: 'Options.vue',
        code: vue(
          IMPORTS,
          'const OPTIONS = { immediate: true }',
          STATE,
          ARROW,
          'watch(count, () => save(), OPTIONS)',
        ),
      },
      {
        name: 'un watch dont les options viennent d’ailleurs est jugé immédiat',
        filename: 'Options-import.vue',
        code: vue(IMPORTS, STATE, ARROW, 'watch(count, () => save(), SHARED_OPTIONS)'),
      },
      {
        name: 'provide va avec l’état, nextTick avec le cycle de vie',
        filename: 'Vue-api.vue',
        code: vue(IMPORTS, PROPS, `${STATE}\nprovide('count', count)`, FUNCTION, 'nextTick(reset)'),
      },
      {
        name: 'la source d’un watch lit une fonction déjà déclarée',
        filename: 'Source.vue',
        code: vue(IMPORTS, STATE, 'const f = () => count.value', 'watch(() => f(), () => {})'),
      },
      {
        name: 'un appel qui lit les outils va avec l’état',
        filename: 'Appel-etat.vue',
        code: vue(
          IMPORTS,
          'const { query } = useRoute()\nconst store = useAnimalsStore()',
          'const returnRoute = primingReturnRoute(query.from)\nstore.load()',
          COMPUTED,
        ),
      },
      {
        name: 'le <script> à côté du <script setup> est ignoré',
        filename: 'Deux.vue',
        code: `<script lang="ts">\nexport const A = 1\n</script>\n${vue(IMPORTS, STATE)}`,
      },
    ],
    invalid: [
      {
        name: 'defineEmits avant defineProps',
        filename: 'Macros.vue',
        code: vue(
          IMPORTS,
          'const emit = defineEmits<{ close: [] }>()\nconst model = defineModel()\n' + PROPS,
        ),
        errors: [order('defineProps', 'defineModel')],
      },
      {
        name: 'un objet dont les fonctions lisent un outil, avant cet outil',
        filename: 'Actions-tot.vue',
        code: vue(IMPORTS, "const ACTIONS = { home: () => t('home') }", TOOLS),
        errors: [order('outils (useI18n, stores, composables)', 'état (ref, reactive…)')],
      },
      {
        name: 'un appel inconnu qui lit une fonction, avant defineProps',
        filename: 'Avant-props.vue',
        code: vue(IMPORTS, 'const label = format(reset)', PROPS, FUNCTION),
        errors: [order('macros (defineProps, defineEmits…)', 'état (ref, reactive…)')],
      },
      {
        name: 'un appel qui lit l’état, après un computed',
        filename: 'Appel-tard.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const chart = draw(count)'),
        errors: [order('état (ref, reactive…)', 'computed')],
      },
      {
        name: 'un watch dont les options ne sont pas immédiates, après les fonctions',
        filename: 'Options-non.vue',
        code: vue(
          IMPORTS,
          'const OPTIONS = { deep: true }',
          STATE,
          ARROW,
          'watch(count, () => save(), OPTIONS)',
        ),
        errors: [order('watch', 'fonctions')],
      },
      {
        name: 'useRoute().query est un outil',
        filename: 'Chaine.vue',
        code: vue(IMPORTS, STATE, 'const query = useRoute().query'),
        errors: [order('outils (useI18n, stores, composables)', 'état (ref, reactive…)')],
      },
      {
        name: 'un getter de computed reste paresseux',
        filename: 'Getter-paresseux.vue',
        code: vue(IMPORTS, 'const load = () => 1', 'const value = computed(() => load())'),
        errors: [order('computed', 'fonctions')],
      },
      {
        name: 'new et inject vont avec l’état',
        filename: 'New.vue',
        code: vue(IMPORTS, COMPUTED, 'const chart = new Chart()', "const theme = inject('theme')"),
        errors: [
          order('état (ref, reactive…)', 'computed'),
          order('état (ref, reactive…)', 'computed'),
        ],
      },
      {
        name: 'les props après les outils',
        filename: 'Props.vue',
        code: vue(IMPORTS, TOOLS, PROPS),
        errors: [
          order('macros (defineProps, defineEmits…)', 'outils (useI18n, stores, composables)'),
        ],
      },
      {
        name: 'les outils après l’état',
        filename: 'Outils.vue',
        code: vue(IMPORTS, STATE, TOOLS),
        errors: [order('outils (useI18n, stores, composables)', 'état (ref, reactive…)')],
      },
      {
        name: 'l’état après un computed',
        filename: 'Etat.vue',
        code: vue(IMPORTS, 'const other = computed(() => 1)', STATE),
        errors: [order('état (ref, reactive…)', 'computed')],
      },
      {
        name: 'un computed après un watch',
        filename: 'Computed.vue',
        code: vue(IMPORTS, STATE, WATCH, COMPUTED, FUNCTION),
        errors: [order('computed', 'watch')],
      },
      {
        name: 'un watch après les fonctions',
        filename: 'Watch.vue',
        code: vue(IMPORTS, STATE, FUNCTION, WATCH),
        errors: [order('watch', 'fonctions')],
      },
      {
        name: 'le cycle de vie avant les fonctions',
        filename: 'Cycle.vue',
        code: vue(IMPORTS, STATE, LIFECYCLE, ARROW),
        errors: [order('fonctions', 'cycle de vie (onMounted…)')],
      },
      {
        name: 'defineExpose avant le cycle de vie',
        filename: 'Expose.vue',
        code: vue(IMPORTS, STATE, FUNCTION, EXPOSE, LIFECYCLE),
        errors: [order('cycle de vie (onMounted…)', 'defineExpose')],
      },
      {
        name: 'une constante de module après les props',
        filename: 'Constante.vue',
        code: vue(IMPORTS, PROPS, CONSTANT),
        errors: [order('types et constantes', 'macros (defineProps, defineEmits…)')],
      },
      {
        name: 'un composable qui reçoit un état, après un computed',
        filename: 'Trop-bas.vue',
        code: vue(IMPORTS, STATE, COMPUTED, 'const { errors } = useFormValidation(count)'),
        errors: [order('outils (useI18n, stores, composables)', 'computed')],
      },
      {
        name: 'deux groupes sans ligne vide',
        filename: 'Vide.vue',
        code: vue(IMPORTS, `${STATE}\n${COMPUTED}`),
        errors: [
          {
            messageId: 'blankLine',
            data: { previous: 'état (ref, reactive…)', current: 'computed' },
          },
        ],
      },
    ],
  })
})
