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
      path: '/animals',
      name: 'animals',
      component: () => import('@/features/animals/AnimalsView.vue'),
    },
    {
      path: '/animals/new',
      name: 'animal-new',
      component: () => import('@/features/animals/AnimalFormView.vue'),
    },
  ],
})

export default router
