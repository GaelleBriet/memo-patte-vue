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
    {
      path: '/animals/:id/edit',
      name: 'animal-edit',
      component: () => import('@/features/animals/AnimalFormView.vue'),
      props: true,
    },
    {
      path: '/animals/:animalId/vaccinations/new',
      name: 'vaccination-new',
      component: () => import('@/features/vaccinations/VaccinationFormView.vue'),
      props: true,
    },
    {
      path: '/vaccinations/:id/edit',
      name: 'vaccination-edit',
      component: () => import('@/features/vaccinations/VaccinationFormView.vue'),
      props: true,
    },
  ],
})

export default router
