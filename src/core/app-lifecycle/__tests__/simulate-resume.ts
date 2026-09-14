import { vi } from 'vitest'

/** jsdom annonce `prerender` : sans forcer `visible`, le retour au premier plan est ignoré. */
export function simulateWebResume(): void {
  const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  spy.mockRestore()
}
