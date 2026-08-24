<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <v-container>
    <h1>{{ t('home.title') }}</h1>
    <p>{{ t('home.placeholder') }}</p>
  </v-container>
</template>
