// Hors de la base : la sauvegarde d'Android copierait l'identifiant vers un autre téléphone.
export const DEVICE_STORAGE_KEY = 'memopatte.device'

export type DeviceIdentity = { id: string; installedAt: string }

let identity: DeviceIdentity | null = null

function isIdentity(value: unknown): value is DeviceIdentity {
  const candidate = value as Partial<DeviceIdentity> | null
  return typeof candidate?.id === 'string' && typeof candidate.installedAt === 'string'
}

function savedIdentity(): DeviceIdentity | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? 'null')
    return isIdentity(saved) ? { id: saved.id, installedAt: saved.installedAt } : null
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
