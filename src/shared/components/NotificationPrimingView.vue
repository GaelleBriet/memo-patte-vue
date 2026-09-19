<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { onBackButton } from '@/core/app-lifecycle/back-button'
import { postponePriming, requestAfterPriming } from '@/core/notifications/permission'
import { primingReturnRoute } from '../domain/notification-priming'
import { showToast } from '../utils/toast'

const props = defineProps<{
  animalName: string
  kind: 'vaccination' | 'treatment'
}>()

const { t } = useI18n()
const router = useRouter()
const returnRoute = primingReturnRoute(useRoute().query.from)
const isRequesting = ref(false)

const personalBenefit = computed(() => {
  if (!props.animalName) return null
  return props.kind === 'treatment'
    ? t('notifications.priming.benefits.treatment', { name: props.animalName })
    : t('notifications.priming.benefits.vaccination', { name: props.animalName })
})

const benefits = computed(() => [
  ...(personalBenefit.value ? [personalBenefit.value] : []),
  t('notifications.priming.benefits.offline'),
  t('notifications.priming.benefits.onlyYours'),
])

function goBack(): void {
  void router.replace(returnRoute)
}

async function enable(): Promise<void> {
  if (isRequesting.value) return
  isRequesting.value = true
  const granted = await requestAfterPriming()
  if (granted) showToast(t('notifications.priming.enabled'))
  goBack()
}

function later(): void {
  if (isRequesting.value) return
  postponePriming()
  goBack()
}

onScopeDispose(onBackButton(later))
</script>

<template>
  <div class="notification-priming">
    <div class="notification-priming__body">
      <span class="notification-priming__icon">
        <v-icon icon="ms:notifications_active" size="44" />
      </span>
      <h1 class="notification-priming__title">{{ t('notifications.priming.title') }}</h1>
      <p class="notification-priming__subtitle">{{ t('notifications.priming.subtitle') }}</p>

      <ul class="notification-priming__benefits">
        <li v-for="benefit in benefits" :key="benefit" class="notification-priming__benefit">
          <v-icon icon="ms:check_circle" size="19" />
          <span>{{ benefit }}</span>
        </li>
      </ul>
    </div>

    <div class="notification-priming__actions">
      <v-btn
        class="notification-priming__enable"
        variant="flat"
        color="primary"
        :loading="isRequesting"
        @click="enable"
      >
        {{ t('notifications.priming.enable') }}
      </v-btn>
      <v-btn
        class="notification-priming__later"
        variant="text"
        color="primary"
        :disabled="isRequesting"
        @click="later"
      >
        {{ t('notifications.priming.later') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.notification-priming {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: calc(100vh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  min-height: calc(100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  padding: 32px 24px;
  background: rgb(var(--v-theme-background));
}

.notification-priming__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.notification-priming__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin-bottom: 28px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.notification-priming__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.notification-priming__subtitle {
  max-width: 300px;
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.notification-priming__benefits {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  margin: 30px 0 0;
  padding: 0;
  list-style: none;
  text-align: start;
}

.notification-priming__benefit {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.notification-priming__actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 34px;
}

.notification-priming__enable {
  width: 100%;
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.notification-priming__later {
  height: 44px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;

  @include tap.tap-target;
}
</style>
