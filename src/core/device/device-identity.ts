import { z } from 'zod'

// Hors de la base : la sauvegarde d'Android copierait l'identifiant vers un autre téléphone.
export const DEVICE_STORAGE_KEY = 'memopatte.device'

const deviceIdentitySchema = z.object({ id: z.uuid(), installedAt: z.iso.datetime() })

export type DeviceIdentity = z.output<typeof deviceIdentitySchema>

let identity: DeviceIdentity | null = null

function savedIdentity(): DeviceIdentity | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? 'null')
    const parsed = deviceIdentitySchema.safeParse(saved)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function drawIdentity(): DeviceIdentity {
  const drawn = { id: crypto.randomUUID(), installedAt: new Date().toISOString() }
  try {
    globalThis.localStorage?.setItem(DEVICE_STORAGE_KEY, JSON.stringify(drawn))
  } catch (cause) {
    console.warn('Identifiant de l’appareil non retenu :', cause)
  }
  return drawn
}

/** Tiré au hasard au premier lancement, jamais un identifiant matériel ni publicitaire. */
export function currentDevice(): DeviceIdentity {
  identity ??= savedIdentity() ?? drawIdentity()
  return identity
}

export function currentDeviceId(): string {
  return currentDevice().id
}

export function forgetCurrentDeviceForTests(): void {
  identity = null
}
