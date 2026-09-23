import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dismissToast, showToast, toastAnnouncement } from '../utils/toast'

const ANNONCE_MS = 100

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  dismissToast()
  vi.useRealTimers()
})

describe('annonce du toast', () => {
  it('n’annonce que le dernier message quand il en remplace un autre avant son annonce', () => {
    showToast('Rappels activés')
    vi.advanceTimersByTime(ANNONCE_MS / 2)
    showToast('Données exportées')

    vi.advanceTimersByTime(ANNONCE_MS / 2 + 10)
    expect(toastAnnouncement.value).toBe('')

    vi.advanceTimersByTime(ANNONCE_MS)
    expect(toastAnnouncement.value).toBe('Données exportées')
  })

  it('n’annonce rien et ne laisse aucun minuteur quand le toast est fermé avant son annonce', () => {
    showToast('Rappels activés')
    vi.advanceTimersByTime(ANNONCE_MS / 2)

    dismissToast()

    expect(toastAnnouncement.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('vide la région annoncée quand le toast se ferme', () => {
    showToast('Rappels activés')
    vi.advanceTimersByTime(ANNONCE_MS)
    expect(toastAnnouncement.value).toBe('Rappels activés')

    dismissToast()

    expect(toastAnnouncement.value).toBe('')
  })
})
