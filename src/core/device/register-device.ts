import { Device } from '@capacitor/device'

import { currentDevice } from './device-identity'
import { getDeviceRepository, type DeviceRepository } from './device.repository'

function squeezed(text: string | undefined): string {
  return (text ?? '').trim().replace(/\s+/g, ' ')
}

// Sur Android, `model` n'est souvent qu'un code (« SM-X710 ») : le fabricant le rend reconnaissable.
function readableModel(info: { manufacturer?: string; model?: string }): string | null {
  const manufacturer = squeezed(info.manufacturer)
  const model = squeezed(info.model)
  const startsWithManufacturer =
    manufacturer !== '' && model.toLowerCase().startsWith(manufacturer.toLowerCase())
  const name = manufacturer === '' || startsWithManufacturer ? model : `${manufacturer} ${model}`
  return name.trim() || null
}

async function deviceModel(): Promise<string | null> {
  try {
    return readableModel(await Device.getInfo())
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
