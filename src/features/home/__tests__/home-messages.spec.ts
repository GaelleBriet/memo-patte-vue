import { describe, expect, it } from 'vitest'

import { homeMessage, type HomeMessagesFacts } from '../logic/home-messages'
import { FRESH_HOME_MESSAGES } from '../logic/home-messages-memory'

const NOW = new Date('2026-10-06T10:00:00.000Z')
const FIRST_CARE = '2026-07-06T09:00:00.000Z'

function facts(overrides: Partial<HomeMessagesFacts> = {}): HomeMessagesFacts {
  return {
    notifications: 'granted',
    hasAndroidAsked: true,
    isPlus: false,
    care: { firstAt: null, lastAt: null },
    lastJsonShareAt: null,
    memory: FRESH_HOME_MESSAGES,
    now: NOW,
    ...overrides,
  }
}

const withCare = (firstAt = FIRST_CARE, lastAt = firstAt) => ({ care: { firstAt, lastAt } })

describe('homeMessage — bandeau « Les rappels sont désactivés »', () => {
  it('n’affiche rien sur un carnet sans soin, rappels autorisés', () => {
    expect(homeMessage(facts())).toBeNull()
  })

  it.each(['granted', 'unasked', 'unavailable', null] as const)(
    'ne s’affiche pas quand l’état est « %s »',
    (notifications) => {
      expect(homeMessage(facts({ notifications, ...withCare(), isPlus: true }))).toBeNull()
    },
  )

  it('après un refus, mène aux réglages d’Android', () => {
    expect(homeMessage(facts({ notifications: 'disabled' }))).toEqual({
      kind: 'remindersOff',
      enable: 'androidSettings',
    })
  })

  it('après « Plus tard », Android n’ayant jamais demandé, rouvre l’écran d’explication', () => {
    expect(homeMessage(facts({ notifications: 'disabled', hasAndroidAsked: false }))).toEqual({
      kind: 'remindersOff',
      enable: 'priming',
    })
  })

  it('reste fermé tant qu’aucun soin n’est enregistré après la croix', () => {
    const memory = { ...FRESH_HOME_MESSAGES, remindersClosedAt: '2026-10-01T08:00:00.000Z' }

    expect(
      homeMessage(
        facts({ notifications: 'disabled', memory, ...withCare(FIRST_CARE), isPlus: true }),
      ),
    ).toBeNull()
  })

  it('revient au prochain soin enregistré', () => {
    const memory = { ...FRESH_HOME_MESSAGES, remindersClosedAt: '2026-10-01T08:00:00.000Z' }

    expect(
      homeMessage(
        facts({
          notifications: 'disabled',
          memory,
          ...withCare(FIRST_CARE, '2026-10-02T08:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'remindersOff', enable: 'androidSettings' })
  })

  it('passe avant les deux cartes', () => {
    expect(homeMessage(facts({ notifications: 'disabled', ...withCare() }))?.kind).toBe(
      'remindersOff',
    )
  })
})

describe('homeMessage — carte « protéger »', () => {
  it('apparaît dès le premier soin enregistré', () => {
    expect(homeMessage(facts(withCare(NOW.toISOString())))).toEqual({ kind: 'protect' })
  })

  it('ne revient plus une fois fermée', () => {
    const memory = { ...FRESH_HOME_MESSAGES, protectClosed: true }

    expect(homeMessage(facts({ memory, ...withCare(NOW.toISOString()) }))).toBeNull()
  })

  it('ne s’affiche jamais pour un abonné Plus', () => {
    expect(homeMessage(facts({ isPlus: true, ...withCare() }))).toBeNull()
  })

  it('passe avant la carte trimestrielle', () => {
    expect(homeMessage(facts(withCare()))).toEqual({ kind: 'protect' })
  })
})

describe('homeMessage — carte trimestrielle', () => {
  const protectClosed = { ...FRESH_HOME_MESSAGES, protectClosed: true }

  it('apparaît 3 mois après le premier soin enregistré', () => {
    expect(
      homeMessage(facts({ memory: protectClosed, ...withCare('2026-07-06T10:00:00.000Z') })),
    ).toEqual({ kind: 'quarterly' })
  })

  it('attend encore la veille des 3 mois', () => {
    expect(
      homeMessage(facts({ memory: protectClosed, ...withCare('2026-07-07T10:00:00.000Z') })),
    ).toBeNull()
  })

  it('n’apparaît pas sans soin enregistré, même après un export', () => {
    expect(
      homeMessage(facts({ memory: protectClosed, lastJsonShareAt: '2026-01-01T10:00:00.000Z' })),
    ).toBeNull()
  })

  it('attend 3 mois après le dernier export JSON partagé', () => {
    const lastJsonShareAt = '2026-08-01T10:00:00.000Z'

    expect(homeMessage(facts({ memory: protectClosed, lastJsonShareAt, ...withCare() }))).toBeNull()
    expect(
      homeMessage(
        facts({
          memory: protectClosed,
          lastJsonShareAt,
          ...withCare(),
          now: new Date('2026-11-01T12:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'quarterly' })
  })

  it('attend 3 mois après la dernière croix', () => {
    const memory = { ...protectClosed, quarterlyClosedAt: '2026-09-10T10:00:00.000Z' }

    expect(homeMessage(facts({ memory, ...withCare('2026-01-01T10:00:00.000Z') }))).toBeNull()
    expect(
      homeMessage(
        facts({
          memory,
          ...withCare('2026-01-01T10:00:00.000Z'),
          now: new Date('2026-12-10T12:00:00.000Z'),
        }),
      ),
    ).toEqual({ kind: 'quarterly' })
  })

  it('ne revient jamais après « Ne plus me le proposer »', () => {
    const memory = { ...protectClosed, quarterlyStopped: true }

    expect(homeMessage(facts({ memory, ...withCare('2025-01-01T10:00:00.000Z') }))).toBeNull()
  })

  it('ne s’affiche jamais pour un abonné Plus', () => {
    expect(homeMessage(facts({ memory: protectClosed, isPlus: true, ...withCare() }))).toBeNull()
  })
})
