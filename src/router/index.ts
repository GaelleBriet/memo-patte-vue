import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/features/home/HomeView.vue'),
    },
    {
      // Onglet « Carnet » de la bottom navigation.
      path: '/animals',
      name: 'animals',
      component: () => import('@/features/animals/AnimalsView.vue'),
    },
  ],
})

export default router
