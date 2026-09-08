<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Coquille assumée : l'onglet Carnet doit mener quelque part dès la mise en
// place de la navigation (ticket #33). Le contenu réel arrive avec les tickets
// #16 (liste des animaux) et #17 (profil détaillé, maquette carnet-v2).
</script>

<template>
  <v-container>
    <h1>{{ t('nav.animals') }}</h1>
  </v-container>
</template>
