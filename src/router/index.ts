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
    component: () => import('@/features/home/views/HomeView.vue'),
    meta: { rootScreen: true },
  },
  {
    path: '/animals',
    name: 'carnet',
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
    path: '/animals/unfollowed',
    name: 'unfollowed-animals',
    component: () => import('@/features/animals/views/UnfollowedAnimalsView.vue'),
  },
  {
    path: '/animals/:id/departure',
    name: 'animal-departure',
    component: () => import('@/features/animals/views/AnimalDepartureView.vue'),
    props: true,
  },
  {
    path: '/animals/:animalId/vaccinations/new',
    name: 'vaccination-new',
    component: () => import('@/features/vaccinations/views/VaccinationFormView.vue'),
    props: true,
  },
  {
    path: '/vaccinations/:id',
    name: 'vaccination-detail',
    component: () => import('@/features/vaccinations/views/VaccinationDetailView.vue'),
    props: true,
  },
  {
    path: '/vaccinations/:id/edit',
    name: 'vaccination-edit',
    component: () => import('@/features/vaccinations/views/VaccinationFormView.vue'),
    props: true,
  },
  {
    path: '/animals/:animalId/weight',
    name: 'weight-history',
    component: () => import('@/features/weight/views/WeightHistoryView.vue'),
    props: true,
  },
  {
    path: '/animals/:animalId/treatments/new',
    name: 'treatment-new',
    component: () => import('@/features/treatments/views/TreatmentFormView.vue'),
    props: true,
  },
  {
    path: '/treatments/:id',
    name: 'treatment-detail',
    component: () => import('@/features/treatments/views/TreatmentDetailView.vue'),
    props: true,
  },
  {
    path: '/treatments/:id/edit',
    name: 'treatment-edit',
    component: () => import('@/features/treatments/views/TreatmentFormView.vue'),
    props: true,
  },
  {
    path: '/treatments/:id/resume',
    name: 'treatment-resume',
    component: () => import('@/features/treatments/views/TreatmentFormView.vue'),
    props: (route) => ({ id: String(route.params.id), resume: true }),
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
    component: () => import('@/features/settings/views/SettingsView.vue'),
  },
  {
    path: '/settings/reminders',
    name: 'settings-reminders',
    component: () => import('@/features/settings/views/RemindersSettingsView.vue'),
  },
  {
    path: '/settings/backup',
    name: 'settings-backup',
    component: () => import('@/features/settings/views/BackupSettingsView.vue'),
  },
  {
    path: '/settings/data',
    name: 'settings-data',
    component: () => import('@/features/settings/views/MyDataSettingsView.vue'),
  },
  {
    path: '/settings/plus',
    name: 'settings-plus',
    component: () => import('@/features/purchase/views/PlusSettingsView.vue'),
  },
  {
    path: '/settings/account',
    name: 'settings-account',
    component: () => import('@/features/auth/views/AccountSettingsView.vue'),
  },
  {
    path: '/settings/privacy',
    name: 'settings-privacy',
    component: () => import('@/features/settings/views/PrivacySettingsView.vue'),
  },
  {
    path: '/settings/help',
    name: 'settings-help',
    component: () => import('@/features/settings/views/HelpContactSettingsView.vue'),
  },
  {
    path: '/settings/about',
    name: 'settings-about',
    component: () => import('@/features/settings/views/AboutSettingsView.vue'),
  },
  {
    path: '/settings/backup/erase',
    name: 'settings-erase',
    component: () => import('@/features/settings/views/EraseDataView.vue'),
  },
  {
    path: '/plus',
    name: 'plus',
    component: () => import('@/features/purchase/views/PlusView.vue'),
  },
  {
    path: '/sign-in',
    name: 'sign-in',
    component: () => import('@/features/auth/views/SignInView.vue'),
    beforeEnter: () => authAvailable() || { name: 'plus' },
  },
  {
    path: '/analytics/consent',
    name: 'analytics-consent',
    component: () => import('@/features/settings/views/AnalyticsConsentView.vue'),
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
