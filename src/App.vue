<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import AppToast from '@/shared/components/AppToast.vue'
import BottomNavigation from '@/shared/components/BottomNavigation.vue'

const route = useRoute()

const showsBottomNav = computed(() => route.meta.rootScreen === true)
</script>

<template>
  <v-app>
    <v-main>
      <router-view />
    </v-main>
    <BottomNavigation v-if="showsBottomNav" />
    <AppToast />
  </v-app>
</template>
