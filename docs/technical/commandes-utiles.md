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
