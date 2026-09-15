<script setup lang="ts">
import AppToast from '@/shared/AppToast.vue'
import BottomNavigation from '@/shared/BottomNavigation.vue'
</script>

<template>
  <v-app>
    <v-main>
      <router-view />
    </v-main>
    <BottomNavigation />
    <AppToast />
  </v-app>
</template>
