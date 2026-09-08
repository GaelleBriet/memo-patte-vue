<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Le placeholder du ticket 0.3 laisse place à la coquille de navigation
// (ticket #33). Le contenu de l'accueil arrive avec les tickets #34 à #37.
</script>

<template>
  <v-container>
    <h1>{{ t('home.title') }}</h1>
  </v-container>
</template>
