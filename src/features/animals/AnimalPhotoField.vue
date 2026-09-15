<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  photoUrl: string | null
  error?: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  pick: []
  remove: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="animal-photo">
    <button
      type="button"
      class="animal-photo__pick"
      :class="{ 'animal-photo__pick--filled': photoUrl }"
      :disabled="disabled"
      @click="emit('pick')"
    >
      <span class="animal-photo__circle">
        <img v-if="photoUrl" class="animal-photo__image" :src="photoUrl" alt="" />
        <v-icon v-else class="animal-photo__paw" icon="ms:pets" :size="40" />
        <span class="animal-photo__badge">
          <v-icon icon="ms:photo_camera" :size="16" />
        </span>
      </span>
      <span class="animal-photo__caption">
        {{ photoUrl ? t('animals.form.photo.change') : t('animals.form.photo.add') }}
      </span>
    </button>

    <v-btn
      v-if="photoUrl"
      class="animal-photo__remove"
      variant="text"
      size="small"
      color="primary"
      :disabled="disabled"
      @click="emit('remove')"
    >
      {{ t('animals.form.photo.remove') }}
    </v-btn>

    <p v-if="error" class="animal-photo__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

$size-photo: 88px;
$size-badge: 32px;
$color-photo-paw: #90abad;
$color-photo-dashed: #a2bdc0;

.animal-photo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.animal-photo__pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: none;
  }
}

.animal-photo__circle {
  display: grid;
  position: relative;
  place-items: center;
  width: $size-photo;
  height: $size-photo;
  border: 1.5px dashed $color-photo-dashed;
  border-radius: 50%;
  background: tokens.$color-field-surface;
}

.animal-photo__pick--filled .animal-photo__circle {
  border: 2px solid tokens.$color-on-primary;
  box-shadow: 0 2px 8px rgb(30 25 20 / 14%);
}

.animal-photo__image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.animal-photo__paw {
  color: $color-photo-paw;
}

.animal-photo__badge {
  display: grid;
  position: absolute;
  right: -6px;
  bottom: -2px;
  place-items: center;
  width: $size-badge;
  height: $size-badge;
  border: 2.5px solid rgb(var(--v-theme-background));
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;
}

.animal-photo__caption {
  font-family: tokens.$font-family-body;
  font-size: 12.5px;
  font-weight: 600;
  color: tokens.$color-hint;
}

.animal-photo__remove {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
}

.animal-photo__error {
  margin: 4px 0 0;
  font-size: 12.5px;
  font-weight: 500;
  color: rgb(var(--v-theme-error));
  text-align: center;
}
</style>
