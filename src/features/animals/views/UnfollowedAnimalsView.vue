<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { carnetSubtitle } from '../logic/carnet-animal'
import { useAnimalsStore } from '../store/animals.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import AnimalAvatar from '@/shared/components/AnimalAvatar.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const { today } = useToday()

const photoUrl = usePhotoUrls(() => animals.unfollowedAnimals.map((item) => item.photoPath))

const rows = computed(() =>
  animals.unfollowedAnimals.map((animal) => ({
    animal: { id: animal.id, name: animal.name, photoUrl: photoUrl(animal.photoPath) },
    subtitle: carnetSubtitle(t, animal, today.value),
  })),
)

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

function back(): void {
  returnTo(router, { name: 'animals' })
}

function open(id: string): void {
  animals.select(id)
  returnTo(router, { name: 'animals' })
}
</script>

<template>
  <PushedScreen
    class="unfollowed-animals"
    :title="t('animals.unfollowedList.title')"
    :back-label="t('animals.unfollowedList.back')"
    @back="back"
  >
    <div class="unfollowed-animals__list">
      <button
        v-for="row in rows"
        :key="row.animal.id"
        type="button"
        class="unfollowed-animal"
        :aria-label="t('animals.unfollowedList.open', { name: row.animal.name })"
        @click="open(row.animal.id)"
      >
        <AnimalAvatar class="unfollowed-animal__avatar" :animal="row.animal" />
        <span class="unfollowed-animal__text">
          <span class="unfollowed-animal__name">{{ row.animal.name }}</span>
          <span v-if="row.subtitle" class="unfollowed-animal__subtitle">{{ row.subtitle }}</span>
        </span>
        <v-icon class="unfollowed-animal__chevron" icon="ms:chevron_right" size="22" />
      </button>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.unfollowed-animals__list {
  overflow: hidden;
  margin: 8px tokens.$padding-section-inline 24px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.unfollowed-animal {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: tokens.$height-list-row;
  padding: 14px 12px 14px 16px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.unfollowed-animal + .unfollowed-animal {
  border-top: 1px solid tokens.$color-divider;
}

.unfollowed-animal__avatar {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
}

.unfollowed-animal__text {
  flex: 1 1 auto;
  min-width: 0;
}

.unfollowed-animal__name {
  display: block;
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.unfollowed-animal__subtitle {
  display: block;
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}

.unfollowed-animal__chevron {
  flex: 0 0 auto;
  color: tokens.$color-settings-chevron;
}
</style>
