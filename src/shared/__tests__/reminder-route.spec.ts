import { describe, expect, it } from 'vitest'
import { createRouter, createWebHistory } from 'vue-router'

import {
  originQuery,
  parseReminderQuery,
  parseReminderRequest,
  reminderQueryValue,
  reminderSheetQuery,
  todoReminderValue,
  withoutReminderRequest,
} from '../domain/reminder-route'
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

describe('échéance de la ligne de « À faire » gardée pour le retour de « Modifier »', () => {
  it('écrit l’échéance après le rappel, et la relit avec la demande de feuille', () => {
    const value = todoReminderValue({
      kind: 'treatment',
      id: 't1',
      due: { dueOn: '2026-10-06', dueTime: '08:00' },
    })

    expect(value).toBe('treatment:t1:2026-10-06T08:00')
    expect(parseReminderQuery(value)).toEqual({ kind: 'treatment', id: 't1' })
    expect(parseReminderRequest({ reminder: value })).toEqual({
      kind: 'treatment',
      id: 't1',
      step: 'actions',
      due: { dueOn: '2026-10-06', dueTime: '08:00' },
    })
  })

  it('écrit une échéance sans heure, les doses non renseignées, ou rien pour un vaccin', () => {
    const sans = todoReminderValue({
      kind: 'treatment',
      id: 't1',
      due: { dueOn: '2026-10-06', dueTime: null },
    })
    const nonRenseignees = todoReminderValue({ kind: 'treatment', id: 't1', due: 'unlogged' })

    expect(sans).toBe('treatment:t1:2026-10-06')
    expect(parseReminderRequest({ reminder: sans })?.due).toEqual({
      dueOn: '2026-10-06',
      dueTime: null,
    })
    expect(nonRenseignees).toBe('treatment:t1:unlogged')
    expect(parseReminderRequest({ reminder: nonRenseignees })?.due).toBe('unlogged')
    expect(todoReminderValue({ kind: 'vaccination', id: 'v1', due: null })).toBe('vaccination:v1')
    expect(parseReminderRequest({ reminder: 'vaccination:v1' })).not.toHaveProperty('due')
  })

  it('ignore une échéance mal formée', () => {
    expect(parseReminderQuery('treatment:t1:2026-10-06T25:00')).toBeNull()
    expect(parseReminderQuery('treatment:t1:06-10-2026')).toBeNull()
  })
})

describe('feuille d’un rappel demandée à l’accueil', () => {
  it('écrit puis relit le rappel et l’étape de sa feuille', () => {
    const query = reminderSheetQuery({ kind: 'vaccination', id: 'v1', step: 'done' })

    expect(query).toEqual({ reminder: 'vaccination:v1', step: 'done' })
    expect(parseReminderRequest(query)).toEqual({ kind: 'vaccination', id: 'v1', step: 'done' })
  })

  it('ouvre les actions quand l’étape est absente ou inconnue', () => {
    expect(parseReminderRequest({ reminder: 'treatment:t1' })).toEqual({
      kind: 'treatment',
      id: 't1',
      step: 'actions',
    })
    expect(parseReminderRequest({ reminder: 'treatment:t1', step: 'x' })?.step).toBe('actions')
  })

  it('ne demande rien sans rappel lisible', () => {
    expect(parseReminderRequest({ step: 'done' })).toBeNull()
    expect(parseReminderRequest({ reminder: 'weight:w1', step: 'done' })).toBeNull()
  })

  it('efface la demande de l’adresse sans toucher au reste', () => {
    expect(
      withoutReminderRequest({ reminder: 'treatment:t1', step: 'done', from: 'home' }),
    ).toEqual({
      from: 'home',
    })
    expect(
      withoutReminderRequest({
        reminder: 'treatment:t1',
        step: 'given-when',
        due: '2026-10-06',
        time: '20:00',
        from: 'home',
      }),
    ).toEqual({ from: 'home' })
  })

  it('« Donnée quand ? » porte l’échéance de la notification, avec ou sans heure', () => {
    const request = {
      kind: 'treatment',
      id: 't1',
      step: 'given-when',
      due: { dueOn: '2026-10-06', dueTime: '20:00' },
    } as const
    const query = reminderSheetQuery(request)

    expect(query).toEqual({
      reminder: 'treatment:t1',
      step: 'given-when',
      due: '2026-10-06',
      time: '20:00',
    })
    expect(parseReminderRequest(query)).toEqual(request)
    expect(
      parseReminderRequest({ reminder: 'treatment:t1', step: 'given-when', due: '2026-10-06' }),
    ).toEqual({ ...request, due: { dueOn: '2026-10-06', dueTime: null } })
  })

  it('« Donnée quand ? » sans échéance lisible ouvre les actions', () => {
    expect(parseReminderRequest({ reminder: 'treatment:t1', step: 'given-when' })?.step).toBe(
      'actions',
    )
    expect(
      parseReminderRequest({
        reminder: 'treatment:t1',
        step: 'given-when',
        due: '2026-10-06',
        time: '25:00',
      })?.step,
    ).toBe('actions')
  })
})

describe('originQuery', () => {
  it('nomme l’écran courant, et le rappel de son détail quand c’est un détail', () => {
    expect(originQuery({ name: 'home', params: {} })).toEqual({ from: 'home' })
    expect(originQuery({ name: 'vaccination-detail', params: { id: 'v1' } })).toEqual({
      from: 'vaccination-detail',
      reminder: 'vaccination:v1',
    })
    expect(originQuery({ name: 'treatment-detail', params: { id: 't1' } })).toEqual({
      from: 'treatment-detail',
      reminder: 'treatment:t1',
    })
  })
})

describe('returnTo', () => {
  const Vide = { render: () => null }

  async function routeur() {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: Vide },
        { path: '/animals', name: 'carnet', component: Vide },
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

    returnTo(router, { name: 'carnet' })
    await new Promise<void>((resolve) => router.afterEach(() => resolve()))

    expect(router.currentRoute.value.name).toBe('carnet')
    expect(router.options.history.state.back).toBe('/?reminder=treatment:t1')
  })
})
