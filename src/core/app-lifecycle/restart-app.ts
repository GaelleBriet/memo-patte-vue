/** Recharge la WebView à la racine : stores, base et écrans repartent de zéro, comme au lancement. */
export function restartApp(): void {
  window.location.replace(import.meta.env.BASE_URL)
}
