# Commandes utiles — MémoPatte

Aide-mémoire pour lancer le projet. Toujours avec `pnpm`.

## 0. Nouvelle machine Linux (CachyOS / Arch) — 2026-09-07

Ce que le projet attend et qui n'est pas là par défaut. Les outils agents (Claude Code, Orca, kit de skills)
sont gérés à part par le kit `agent-skills-kit` (`bash scripts/doctor.sh`).

```bash
# 1. Node : le projet demande 26 (.nvmrc, aligné sur @types/node 26 et la CI) ; minimum 24.12 (engines).
#    Optionnel, pour coller à la CI : fnm lit .nvmrc
sudo pacman -S --needed fnm && fnm install && fnm use

# 2. pnpm (déjà fait) puis dépendances
sudo pacman -S --needed pnpm
pnpm install --frozen-lockfile

# 3. JDK 21 et sélection comme java par défaut
sudo pacman -S --needed jdk21-openjdk
sudo archlinux-java set java-21-openjdk
java -version            # doit afficher 21

# 4. adb + règles udev pour voir le téléphone en USB (pas de usbipd : Linux natif)
sudo pacman -S --needed android-tools android-udev
sudo usermod -aG adbusers "$USER"   # puis se déconnecter / reconnecter
adb devices              # le téléphone doit apparaître "device" après acceptation sur l'écran

# 5. SDK Android (platform 36, build-tools, platform-tools). Le plus simple : Android Studio (AUR),
#    son assistant installe le SDK dans ~/Android/Sdk, chemin déjà attendu par ANDROID_HOME
paru -S android-studio   # ou yay
#    Sans Android Studio : cmdline-tools puis
#    sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

# 6. Vérification : premier build debug
pnpm build && pnpm cap:sync
cd android && ./gradlew assembleDebug && cd ..
```

Points propres à un changement de machine :

- **Nouveau keystore debug = nouveau SHA-1.** Il est créé au premier build. Le SHA-1 de cette machine doit
  être ajouté à l'identifiant Android dans Google Cloud Console (ticket #65), sinon « Continuer avec Google »
  échouera en silence :
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
  ```
- `ANDROID_HOME` / `ANDROID_SDK_ROOT` sont déjà exportés vers `~/Android/Sdk` ; `android/local.properties`
  n'est pas nécessaire tant que la variable pointe sur un SDK réel.
- `gh auth login -h github.com` (fait), et le fichier `.env` local à recréer depuis `.env.example`
  avec les clés Supabase (jamais versionné).
- Chrome DevTools : `chrome://inspect/#devices` fonctionne directement, la manipulation `adb tcpip` de la
  section 3 ne concernait que WSL.

## 1. Dev web

```bash
pnpm dev
```

### Statut MémoPatte Plus simulé

Tant que RevenueCat n'est pas branché, `pnpm dev:plus` lance le serveur de dev avec un statut « Plus à vie » :
pastille Plus absente, export PDF ouvert, écran Plus « déjà membre ». Le statut est écrit au lancement de l'app
par la persistance normale du statut Plus (`memopatte.plus.status`), en dev seulement, et l'app se comporte
comme avec un vrai droit.

`VITE_DEV_PLAN` choisit l'état simulé ; la variable seule suffit, avec `pnpm dev`, `pnpm dev:data` ou
`pnpm dev:plus` :

| `VITE_DEV_PLAN`                | Statut écrit                                                               |
| ------------------------------ | -------------------------------------------------------------------------- |
| `lifetime` (défaut `dev:plus`) | Plus à vie                                                                 |
| `annual`                       | abonnement annuel, échéance dans un an                                     |
| `monthly`                      | abonnement mensuel, échéance dans un mois                                  |
| `expired`                      | abonnement mensuel échu il y a trois jours : « expiré » dans Paramètres    |
| `none`                         | retour au gratuit, mémoire de l'abonnement effacée                         |

```bash
pnpm dev:plus                           # Plus à vie
VITE_DEV_PLAN=expired pnpm dev          # abonnement échu
VITE_DEV_PLAN=lifetime pnpm dev:data    # Plus à vie avec le carnet de démo (export PDF)
VITE_DEV_PLAN=none pnpm dev             # retour au gratuit
```

- Le serveur Vite porte la variable : `pnpm dev:mobile` à côté donne le même statut au téléphone.
- Le statut est réécrit à chaque chargement de page tant que la variable est posée.
- Sans la variable, rien n'est écrit : le statut déjà gardé reste, y compris celui d'un `dev:plus` précédent.
  Pour revenir au gratuit, `VITE_DEV_PLAN=none`.
- Une valeur inconnue n'écrit rien et laisse un avertissement dans la console.
- **Limite** : avec une clé RevenueCat dans `.env` (`VITE_REVENUECAT_GOOGLE_KEY`), sur le téléphone, la
  revérification au lancement et la connexion à un compte remplacent le statut simulé. Sans achat de test,
  `lifetime` repasse au gratuit, `annual` et `monthly` s'affichent « expiré » (l'app garde le dernier abonnement
  connu) et `expired` reste expiré. Dans le navigateur, RevenueCat n'est jamais appelé : le statut simulé reste.
- Rien de ce code ne part en production : `pnpm build-only && pnpm test:build` le vérifie.

## 2. Dev sur Android, avec hot reload

Deux choses tournent en parallèle : le serveur Vite et l'app Android

**Prérequis** :

- Téléphone branché en USB, débogage USB activé
- Le device passé à WSL via `usbipd list` (`usbipd attach --wsl --busid <id> --auto-attach` côté Windows si pas déjà 
  fait)
- `adb devices` (dans WSL) doit lister ton téléphone
- **JDK 21 installé et sélectionné** — le build Gradle Android en a besoin (`@capacitor/android` compile en
  ciblant Java 21). Gradle lit `JAVA_HOME` ou le java par défaut du système ; `android/gradle.properties` ne
  fixe plus de chemin (il était propre à l'ancienne machine WSL). Voir §0 pour l'installation selon l'OS.

**Terminal 1** serveur Vite :

```bash
pnpm dev
```

**Terminal 2** — build + install sur le téléphone, connecte au serveur Vite du terminal 1 :

```bash
pnpm dev:mobile
```

Ça fait tourner `cap run android` avec live-reload pointé sur `localhost:5173`,
`--forwardPorts` lance automatiquement `adb reverse` pour que le téléphone puisse atteindre le `localhost` de la machine
— pas besoin de connaître l'IP de ta machine sur le réseau, ni de config manuelle dans `capacitor.config.ts`.

Avant, `cap update android` régénère la liste des plugins natifs (`capacitor.plugins.json`, ignoré par git) :
sans ça, un plugin ajouté depuis le dernier `cap:sync` reste « not implemented on android » en dev. Sur un
dépôt jamais synchronisé (clone neuf), la commande lance d'abord `pnpm cap:sync` complet.

**Pièges connus (2026-09-07)** :

- « Page web non disponible » sur le téléphone alors que le build passe : Vite n'écoute pas là où
  `adb reverse` se connecte. `vite.config.ts` épingle donc `host: 127.0.0.1`, `port: 5173`,
  `strictPort: true` : adb se connecte en IPv4, Node 26 fait résoudre `localhost` en IPv6 d'abord, et
  sans `strictPort` Vite glisse sur 5174 en silence si le port est pris. Vérifie que `pnpm dev` affiche bien
  `Local: http://127.0.0.1:5173/`.
- `No matching variant of project :capacitor-android … No variants exist` au build Gradle :
  `android/capacitor.settings.gradle` (généré, versionné) pointe vers les chemins du store **pnpm**
  (`node_modules/.pnpm/…`). Un `node_modules` installé par npm ne les a pas. `preinstall` refuse désormais
  `npm install` ; si ça arrive quand même : `rm -rf node_modules package-lock.json && pnpm install --frozen-lockfile`.
- Après un bump de `@capacitor/*` ou d'un plugin Capacitor (groupe Dependabot `capacitor`), ces chemins changent :
  le prochain `pnpm dev:mobile` (ou `pnpm cap:sync`) régénère `capacitor.settings.gradle`, qui apparaît alors
  modifié dans `git status` : **commite-le** (c'est un geste manuel après le merge, Dependabot ne peut pas le faire).
  Sinon la dérive revient à chaque bump (vu sur #147 : `main` pointait encore vers 8.5.0 après la montée 8.5.1).
  Le job `android` de la CI (§8) refait `pnpm cap:sync` et échoue si `android/` bouge : une PR qui laisse la
  dérive reste rouge jusqu'à ce que le fichier régénéré y soit commité.

**Tester un build de production sur le téléphone (sans live-reload)**

Utile pour vérifier un comportement observé en dev qui pourrait être un artefact du live-reload
(voir #313 : la toute première navigation vers un écran neuf peut recharger la page, Vite
découvrant à ce moment-là des composants Vuetify pas encore optimisés — ça n'existe pas dans un
vrai build).

```bash
pnpm test:device   # build de prod, synchronise Android, installe et lance sur le téléphone branché
```

Une seule commande, un seul terminal : contrairement à `pnpm dev:mobile`, pas de serveur Vite à
lancer en parallèle, et le comportement observé est celui qui part en production.

## 3. Inspecter l'app avec Chrome DevTools (optionnel)

Utile pour voir la console JS, le réseau, inspecter le DOM — pendant que l'app tourne sur le téléphone (avec ou sans live-reload, ça marche dans les deux cas). Ce n'est **pas** un troisième mode de lancement, juste un outil de debug branché sur ce qui tourne déjà.

1. Téléphone branché, app lancée dessus (via `pnpm dev:mobile` ou une install classique)
2. Sur Chrome (desktop) : `chrome://inspect/#devices`
3. Ton app doit apparaître dans la liste → **inspect**

⚠️ **Piège spécifique à ta config WSL** : comme le téléphone est attaché exclusivement à WSL via `usbipd`, le Chrome de Windows (qui utilise son propre `adb`) ne le verra pas directement. Si la liste reste vide :

```bash
# Dans WSL, une fois le téléphone détecté par adb :
adb tcpip 5555
adb shell ip addr show wlan0   # note l'IP Wi-Fi du téléphone
```

Puis côté Windows (le `adb` de `platform-tools` est déjà dans ton PATH) :

```
adb connect <ip-du-telephone>:5555
```

Le téléphone devient joignable en Wi-Fi indépendamment de WSL — il apparaîtra alors dans `chrome://inspect`. À refaire si le téléphone se déconnecte du Wi-Fi ADB.

Cette partie n'a pas pu être testée de bout en bout (pas de téléphone/émulateur branché ici) — à valider de ton côté, on ajustera si besoin.

## 4. Build / vérifs avant de committer

```bash
pnpm lint         # oxlint + eslint, avec --fix
pnpm type-check   # vue-tsc
pnpm test:unit    # vitest (mode watch)
pnpm build        # type-check + build de prod (dist/)

# ou 
pnpm check
```

Ces mêmes commandes tournent automatiquement dans les hooks Husky (`pre-commit`, `pre-push`) et dans la CI GitHub Actions sur chaque PR.

## 5. Synchroniser le code web vers le projet natif Android

Après un `pnpm build`, ou avant d'ouvrir Android Studio pour un build de prod / signé :

```bash
pnpm cap:sync           # build + copie le web build + synchronise les plugins natifs
pnpm cap:open:android   # ouvre le projet dans Android Studio
```

## 6. Contrôler le manifest fusionné avant un upload Play

Les plugins et leurs dépendances transitives ajoutent des permissions au manifest final : `androidx.biometric`
(tirée par `@capacitor-community/sqlite`) apportait `USE_BIOMETRIC` et `USE_FINGERPRINT`, retirées depuis avec
`tools:node="remove"`. `pnpm test:manifest` compare les permissions et les `uses-feature` du manifest **fusionné**
à la liste blanche commentée de `scripts/check-android-manifest.mjs`, et échoue dès qu'une permission apparaît,
disparaît ou n'est pas justifiée.

```bash
pnpm cap:sync
cd android && ./gradlew :app:processDebugManifest && cd ..
pnpm test:manifest              # variante debug par défaut
pnpm test:manifest release      # après ./gradlew :app:processReleaseManifest
```

Le job `android` de la CI (§8) fait tourner la variante `debug` sur chaque PR. La variante `release` reste un
contrôle local, à passer avant chaque upload sur la Play Console (check-list §3.4 point 11 de
`conformite-play-store-rgpd.md`).

Permissions attendues à ce jour : `INTERNET`, `POST_NOTIFICATIONS`, et `READ/WRITE_EXTERNAL_STORAGE` limitées
à Android 10 et moins par `maxSdkVersion="29"`, que le contrôle vérifie aussi (notre manifest),
`RECEIVE_BOOT_COMPLETED` et `WAKE_LOCK` (`@capacitor/local-notifications`, indispensables pour reprogrammer les
rappels après un redémarrage), `ACCESS_NETWORK_STATE` (RevenueCat), `com.android.vending.BILLING` (Play Billing)
et la permission de signature `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` d'`androidx.core`. Aucun `uses-feature` :
la photo passe par le Photo Picker système, jamais par la caméra déclarée comme fonctionnalité requise.

## 7. Version de l'app

`android/app/build.gradle` lit `package.json` (piloté par release-please) : `versionName` reprend la version telle
quelle et `versionCode` vaut `major × 1 000 000 + minor × 1 000 + patch` (0.1.26 → `1026`). Le build échoue si
`minor` ou `patch` atteint 1000, borne qui garantit que le code reste strictement croissant. Rien à mettre à jour
à la main avant un upload.

## 8. Ce que fait la CI

`.github/workflows/ci.yml` lance deux jobs en parallèle sur chaque PR vers `main` et sur chaque push sur `main`.

| Job       | Ce qu'il fait                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| `ci`      | `lint`, `type-check`, `vitest run`, `build`, `test:build`                                                           |
| `android` | `cap:sync`, contrôle que `android/` n'a pas bougé, `./gradlew :app:assembleDebug`, `test:manifest` (variante debug) |

Le job `android` tourne sur **toutes** les PR, sans filtre de chemins : il est parallèle au job `ci`, le dépôt est
public (minutes Actions gratuites), et un filtre à tenir à jour aurait le même mode de défaillance silencieux que
celui qui a motivé le ticket #260 — une CI verte qui ne construit rien.

`.github/workflows/supabase-migrations.yml` pousse les migrations de `supabase/migrations/` vers le vrai projet
Supabase (`supabase db push --db-url ...`) à chaque push sur `main`, sans filtre de chemins pour la même raison.
`db push` est idempotent : il ne rejoue que ce qui manque, donc ce workflow rattrape aussi tout ce qui a pu être
ajouté au dépôt avant sa mise en place. Passe par le **Session Pooler** (compatible IPv4, contrairement à la
connexion directe) plutôt que par `supabase link` (cassé avec les tokens à permissions fines du Dashboard,
[supabase/supabase#50244](https://github.com/supabase/supabase/issues/50244)) : aucun jeton de compte nécessaire.
Secrets nécessaires : `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_POOLER_HOST` (détail dans le
coffre de notes de Gaelle, jamais dans le dépôt).

Reproduire le job `android` en local :

```bash
pnpm install --frozen-lockfile
pnpm cap:sync
git diff --exit-code -- android    # doit être vide
cd android && ./gradlew :app:assembleDebug && cd ..
pnpm test:manifest
```

## 9. Régénérer les icônes et le splash

`@capacitor/assets` ne sert qu'à ça, une fois de temps en temps. Il n'est **pas** installé : il tirait `sharp` et
`tar`, soit 15 des 20 constats de `pnpm audit` (tous de développement). Il est appelé à la demande par `pnpm dlx`,
qui le télécharge dans le cache pnpm le temps de la commande :

```bash
python3 scripts/build-icon-resources.py   # sources -> resources/ (Python 3, Pillow, numpy)
pnpm assets:android                       # pnpm --allow-build=sharp dlx @capacitor/assets@3.0.5 generate --android
```

`--allow-build=sharp` n'est pas décoratif : `pnpm dlx` installe hors du projet et ne lit donc pas
`pnpm-workspace.yaml`. Sans ce drapeau, `sharp` ne compile pas son binaire et la génération échoue.

La suite du geste (restauration des fichiers réécrits sans raison, couche monochrome) est dans
`docs/design/logos/logos.md`, section « Régénérer ».
