import { Device } from '@capacitor/device'

import { currentDevice } from './device-identity'
import { getDeviceRepository, type DeviceRepository } from './device.repository'

async function deviceModel(): Promise<string | null> {
  try {
    return (await Device.getInfo()).model || null
  } catch {
    return null
  }
}

/** Ne lève jamais : un appareil non enregistré n'empêche pas d'utiliser le carnet. */
export async function registerCurrentDevice(
  repository: () => Promise<Pick<DeviceRepository, 'register'>> = getDeviceRepository,
): Promise<void> {
  try {
    await (await repository()).register(currentDevice(), await deviceModel())
  } catch (cause) {
    console.warn('Appareil non enregistré :', cause)
  }
}
