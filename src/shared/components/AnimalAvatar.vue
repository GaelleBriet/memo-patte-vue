<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { animalAvatarGradientCss } from '../domain/animal-avatar-gradient'

defineProps<{
  animal: { id: string; name: string; photoUrl?: string | null }
}>()

const { t } = useI18n()
</script>

<template>
  <span class="animal-avatar" :style="{ backgroundImage: animalAvatarGradientCss(animal.id) }">
    <img
      v-if="animal.photoUrl"
      :src="animal.photoUrl"
      :alt="t('animals.chipSelector.photoAlt', { name: animal.name })"
    />
  </span>
</template>

<style scoped lang="scss">
.animal-avatar {
  display: block;
  overflow: hidden;
  border-radius: 50%;
  background-size: cover;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}
</style>
