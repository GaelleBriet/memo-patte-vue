<script setup lang="ts">
import BottomNavigation from '@/shared/BottomNavigation.vue'
</script>

<template>
  <v-app>
    <v-main>
      <router-view />
    </v-main>
    <BottomNavigation />
  </v-app>
</template>
