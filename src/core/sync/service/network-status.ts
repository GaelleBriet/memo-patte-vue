import { Network } from '@capacitor/network'

type Listener = () => void

/**
 * `navigator.onLine` ment dans une WebView Android (portail captif, Doze) : seul le plugin natif
 * sait vraiment quand le réseau revient (§7-8 de la proposition).
 */
export function onNetworkOnline(listener: Listener): () => void {
  const handle = Network.addListener('networkStatusChange', (status) => {
    if (status.connected) listener()
  })

  return () => void handle.then((registered) => registered.remove())
}

export async function isNetworkConnected(): Promise<boolean> {
  return (await Network.getStatus()).connected
}
