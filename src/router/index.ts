import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { authAvailable } from '@/shared/utils/auth-available'

declare module 'vue-router' {
  interface RouteMeta {
    /** Écran racine de la bottom navigation. Absent, l'écran est poussé et la barre disparaît. */
    rootScreen?: boolean
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/features/home/HomeView.vue'),
    meta: { rootScreen: true },
  },
  {
    path: '/animals',
    name: 'animals',
    component: () => import('@/features/animals/views/CarnetView.vue'),
    meta: { rootScreen: true },
  },
  {
    path: '/animals/new',
    name: 'animal-new',
    component: () => import('@/features/animals/views/AnimalFormView.vue'),
  },
  {
    path: '/animals/:id/edit',
    name: 'animal-edit',
    component: () => import('@/features/animals/views/AnimalFormView.vue'),
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
  {
    path: '/animals/:animalId/weight',
    name: 'weight-history',
    component: () => import('@/features/weight/WeightHistoryView.vue'),
    props: true,
  },
  {
    path: '/animals/:animalId/treatments/new',
    name: 'treatment-new',
    component: () => import('@/features/treatments/TreatmentFormView.vue'),
    props: true,
  },
  {
    path: '/treatments/:id/edit',
    name: 'treatment-edit',
    component: () => import('@/features/treatments/TreatmentFormView.vue'),
    props: true,
  },
  {
    path: '/notifications/priming',
    name: 'notifications-priming',
    component: () => import('@/shared/components/NotificationPrimingView.vue'),
    props: (route) => ({
      animalName: typeof route.query.animalName === 'string' ? route.query.animalName : '',
      kind: route.query.kind === 'treatment' ? 'treatment' : 'vaccination',
    }),
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/features/settings/SettingsView.vue'),
  },
  {
    path: '/plus',
    name: 'plus',
    component: () => import('@/features/purchase/PlusView.vue'),
  },
  {
    path: '/sign-in',
    name: 'sign-in',
    component: () => import('@/features/auth/SignInView.vue'),
    beforeEnter: () => authAvailable() || { name: 'plus' },
  },
  {
    path: '/analytics/consent',
    name: 'analytics-consent',
    component: () => import('@/features/settings/AnalyticsConsentView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'home' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
