# Commandes utiles — MémoPatte

Aide-mémoire pour lancer le projet. Toujours avec `pnpm`.

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
- **JDK 21 installé** — le build Gradle Android en a besoin (`@capacitor/android` compile en ciblant Java 21) :
  ```bash
  sudo apt install openjdk-21-jdk
  ```
  Pas besoin d'en faire le JDK par défaut du système (`update-alternatives`) : `android/gradle.properties` pointe
  directement dessus via `org.gradle.java.home=/usr/lib/jvm/java-21-openjdk-amd64`.

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
