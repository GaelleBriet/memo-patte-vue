// Temps de processeur du fichier de test (un processus par fichier) : une machine chargée ne le gonfle pas.
export function cpuMs(): number {
  const { user, system } = process.cpuUsage()
  return (user + system) / 1000
}
