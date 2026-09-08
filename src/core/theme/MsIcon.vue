<script setup lang="ts">
import { computed } from 'vue'
import { getMsIconPath } from './icons'

// Vuetify appelle ce composant avec la balise à produire et le nom résolu
// depuis `<v-icon icon="ms:pets" />` ou depuis un alias interne (`$close`…).
const props = withDefaults(defineProps<{ tag: string; icon?: string }>(), { icon: '' })

const glyph = computed(() => getMsIconPath(props.icon))
</script>

<template>
  <component :is="tag">
    <svg
      v-if="glyph"
      class="v-icon__svg"
      xmlns="http://www.w3.org/2000/svg"
      :viewBox="glyph.viewBox"
      role="img"
      aria-hidden="true"
    >
      <path :d="glyph.path" />
    </svg>
  </component>
</template>
