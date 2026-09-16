// Compare les permissions et fonctionnalités du manifest Android *fusionné* à la liste
// blanche ci-dessous. Le manifest fusionné n'existe qu'après un build Gradle, donc pas en CI :
// `pnpm cap:sync && cd android && ./gradlew :app:processDebugManifest && cd .. && pnpm test:manifest`
// (cf. docs/technical/commandes-utiles.md).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const INTERMEDIATES = join('android', 'app', 'build', 'intermediates')
const variant = process.argv[2] ?? 'debug'

/** Chaque entrée dit d'où vient la permission et quelle fonction la justifie. */
const ALLOWED_PERMISSIONS = new Map([
  ['android.permission.INTERNET', 'notre manifest — Supabase, RevenueCat'],
  ['android.permission.POST_NOTIFICATIONS', 'notre manifest — rappels, demandée au premier rappel'],
  [
    'android.permission.RECEIVE_BOOT_COMPLETED',
    '@capacitor/local-notifications — reprogramme les rappels après redémarrage',
  ],
  ['android.permission.WAKE_LOCK', '@capacitor/local-notifications — affichage du rappel'],
  ['android.permission.ACCESS_NETWORK_STATE', 'RevenueCat — état du réseau avant un achat'],
  ['com.android.vending.BILLING', 'Play Billing via RevenueCat — achats MémoPatte Plus'],
  [
    'com.gaellebriet.memopatte.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    'androidx.core — permission de signature interne, jamais visible du Play Store',
  ],
])

/** Aucune fonctionnalité matérielle requise : la photo passe par le Photo Picker système. */
const ALLOWED_FEATURES = new Map()

function findMergedManifest() {
  const roots = readdirSync(INTERMEDIATES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('merged_manifest'))
    .map((entry) => join(INTERMEDIATES, entry.name))

  for (const root of roots) {
    const found = readdirSync(root, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name === 'AndroidManifest.xml')
      .map((entry) => join(entry.parentPath, entry.name))
      .find((path) => path.toLowerCase().includes(variant.toLowerCase()))
    if (found) return found
  }
  return null
}

function namesOf(manifest, tag) {
  const matches = manifest.matchAll(new RegExp(`<${tag}[^>]*android:name="([^"]+)"`, 'g'))
  return [...matches].map((match) => match[1])
}

let manifestPath
try {
  manifestPath = findMergedManifest()
} catch {
  manifestPath = null
}

if (!manifestPath) {
  console.error(
    `✗ Manifest fusionné (${variant}) introuvable sous ${INTERMEDIATES} : lancer` +
      ` \`pnpm cap:sync\` puis \`cd android && ./gradlew :app:process${variant[0].toUpperCase()}${variant.slice(1)}Manifest\`.`,
  )
  process.exit(1)
}

const manifest = readFileSync(manifestPath, 'utf8')
const permissions = namesOf(manifest, 'uses-permission')
const features = namesOf(manifest, 'uses-feature')

const failures = []
for (const permission of permissions) {
  if (!ALLOWED_PERMISSIONS.has(permission)) {
    failures.push(`permission inattendue : ${permission}`)
  }
}
for (const permission of ALLOWED_PERMISSIONS.keys()) {
  if (!permissions.includes(permission)) {
    failures.push(
      `permission attendue absente : ${permission} (${ALLOWED_PERMISSIONS.get(permission)})`,
    )
  }
}
for (const feature of features) {
  if (!ALLOWED_FEATURES.has(feature)) {
    failures.push(`fonctionnalité inattendue : uses-feature ${feature}`)
  }
}
if (permissions.length === 0) {
  failures.push(`${manifestPath} : aucune permission lue, le manifest n'a pas la forme attendue`)
}

if (failures.length > 0) {
  console.error(`✗ ${manifestPath} ne correspond pas à la liste blanche :`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error(
    '  Ajouter une entrée commentée dans scripts/check-android-manifest.mjs si la permission est justifiée,',
  )
  console.error(
    '  sinon la retirer avec tools:node="remove" dans android/app/src/main/AndroidManifest.xml.',
  )
  process.exit(1)
}

process.stdout.write(
  `✓ ${permissions.length} permissions, ${features.length} fonctionnalités, toutes attendues (${manifestPath})\n`,
)
