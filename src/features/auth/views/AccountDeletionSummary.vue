<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { MANAGE_SUBSCRIPTIONS_URL } from '@/shared/utils/google-play'

const { t } = useI18n()
</script>

<template>
  <div class="account-deletion-summary">
    <section class="account-deletion-summary__panel account-deletion-summary__panel--removed">
      <h2 class="account-deletion-summary__panel-title">
        {{ t('settings.account.delete.removed.title') }}
      </h2>
      <ul class="account-deletion-summary__list">
        <li class="account-deletion-summary__item">
          <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
          <span>{{ t('settings.account.delete.removed.account') }}</span>
        </li>
        <li class="account-deletion-summary__item">
          <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
          <span>{{ t('settings.account.delete.removed.backup') }}</span>
        </li>
        <li class="account-deletion-summary__item">
          <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
          <span>{{ t('settings.account.delete.removed.photos') }}</span>
        </li>
        <li class="account-deletion-summary__item">
          <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
          <span>{{ t('settings.account.delete.removed.usage') }}</span>
        </li>
      </ul>
    </section>

    <section class="account-deletion-summary__panel account-deletion-summary__panel--kept">
      <h2 class="account-deletion-summary__panel-title">
        {{ t('settings.account.delete.kept.title') }}
      </h2>
      <ul class="account-deletion-summary__list">
        <li class="account-deletion-summary__item">
          <v-icon icon="ms:check_circle" size="20" aria-hidden="true" />
          <span>{{ t('settings.account.delete.kept.carnet') }}</span>
        </li>
        <li class="account-deletion-summary__item">
          <v-icon icon="ms:check_circle" size="20" aria-hidden="true" />
          <span>{{ t('settings.account.delete.kept.purchases') }}</span>
        </li>
      </ul>
    </section>

    <div class="account-deletion-summary__subscription">
      <v-icon icon="ms:storefront" size="20" aria-hidden="true" />
      <div class="account-deletion-summary__subscription-text">
        <p>{{ t('settings.account.delete.subscription') }}</p>
        <a
          class="account-deletion-summary__manage"
          :href="MANAGE_SUBSCRIPTIONS_URL"
          target="_blank"
          rel="noopener"
        >
          <span>{{ t('plus.terms.manage') }}</span>
          <v-icon icon="ms:open_in_new" size="16" aria-hidden="true" />
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.account-deletion-summary {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-deletion-summary__panel {
  padding: 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-surface));
}

.account-deletion-summary__panel-title {
  margin: 0 0 10px;
  font-size: 13.5px;
  font-weight: 700;
}

.account-deletion-summary__panel--removed {
  .account-deletion-summary__panel-title,
  .v-icon {
    color: rgb(var(--v-theme-error));
  }
}

.account-deletion-summary__panel--kept {
  .account-deletion-summary__panel-title,
  .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.account-deletion-summary__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.account-deletion-summary__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.4;

  .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }
}

.account-deletion-summary__subscription {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-account-deletion-notice-surface;
  font-size: 13.5px;
  line-height: 1.45;

  > .v-icon {
    flex: 0 0 auto;
    color: tokens.$color-text-secondary;
  }

  p {
    margin: 0;
  }
}

.account-deletion-summary__manage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: tokens.$size-tap-target;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  text-decoration: none;
}
</style>
