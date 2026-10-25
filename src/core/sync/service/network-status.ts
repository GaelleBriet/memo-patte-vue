import { Network } from '@capacitor/network'

type Listener = () => void

/**
 * `navigator.onLine` ment dans une WebView Android (portail captif, Doze) : seul le plugin natif
 * sait vraiment quand le réseau revient (§7-8 de la proposition).
 */
export function onNetworkOnline(listener: Listener): () => void {
  let connected: boolean | null = null
  // Sur Android, le plugin émet à chaque changement de capacités du réseau, plusieurs fois par seconde.
  const handle = Network.addListener('networkStatusChange', (status) => {
    if (status.connected && connected !== true) listener()
    connected = status.connected
  })
  Network.getStatus().then(
    (status) => {
      if (connected === null) connected = status.connected
    },
    () => {},
  )

  return () => void handle.then((registered) => registered.remove())
}

export async function isNetworkConnected(): Promise<boolean> {
  return (await Network.getStatus()).connected
}
