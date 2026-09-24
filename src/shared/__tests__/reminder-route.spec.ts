import { describe, expect, it } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'

import { parseReminderQuery, reminderQueryValue } from '../domain/reminder-route'
import { returnTo } from '../utils/return-to'

describe('paramètre de retour vers la feuille d’un rappel', () => {
  it('écrit puis relit le rappel à rouvrir', () => {
    const value = reminderQueryValue({ kind: 'treatment', id: 't1' })

    expect(value).toBe('treatment:t1')
    expect(parseReminderQuery(value)).toEqual({ kind: 'treatment', id: 't1' })
    expect(parseReminderQuery('vaccination:v1')).toEqual({ kind: 'vaccination', id: 'v1' })
  })

  it('ignore une valeur absente ou mal formée', () => {
    expect(parseReminderQuery(undefined)).toBeNull()
    expect(parseReminderQuery(['treatment:t1'])).toBeNull()
    expect(parseReminderQuery('weight:w1')).toBeNull()
    expect(parseReminderQuery('treatment:')).toBeNull()
    expect(parseReminderQuery('treatment:t1:x')).toBeNull()
  })
})

describe('returnTo', () => {
  const Vide = { render: () => null }

  async function routeur() {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: Vide },
        { path: '/animals', name: 'animals', component: Vide },
        { path: '/edit', name: 'edit', component: Vide },
      ],
    })
    await router.push({ name: 'home', query: { reminder: 'treatment:t1' } })
    await router.push({ name: 'edit' })
    return router
  }

  it('revient par l’historique quand l’écran visé est l’entrée précédente, sans la doubler', async () => {
    const router = await routeur()
    const arrive = new Promise<void>((resolve) => router.afterEach(() => resolve()))

    returnTo(router, { name: 'home', query: { reminder: 'treatment:t1' } })
    await arrive

    expect(router.currentRoute.value.fullPath).toBe('/?reminder=treatment:t1')
    expect(router.options.history.state.forward).toBe('/edit')
  })

  it('remplace l’écran courant quand l’écran visé n’est pas l’entrée précédente', async () => {
    const router = await routeur()

    returnTo(router, { name: 'animals' })
    await new Promise<void>((resolve) => router.afterEach(() => resolve()))

    expect(router.currentRoute.value.name).toBe('animals')
    expect(router.options.history.state.back).toBe('/?reminder=treatment:t1')
  })
})
