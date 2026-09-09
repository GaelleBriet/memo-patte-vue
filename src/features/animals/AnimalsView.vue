<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAnimalsStore } from './animals.store'
import AnimalChipSelector from '@/shared/AnimalChipSelector.vue'
import type { AnimalChipItem } from '@/shared/AnimalChipSelector.vue'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const chips = computed<AnimalChipItem[]>(() =>
  animals.animals.map((animal) => ({ id: animal.id, name: animal.name })),
)

onMounted(() => {
  void animals.load()
})

function createAnimal(): void {
  void router.push({ name: 'animal-new' })
}
</script>

<template>
  <v-container>
    <h1>{{ t('nav.animals') }}</h1>
    <AnimalChipSelector
      v-model:selected-id="animals.selectedAnimalId"
      :animals="chips"
      mode="switch"
      @add="createAnimal"
    />
  </v-container>
</template>
