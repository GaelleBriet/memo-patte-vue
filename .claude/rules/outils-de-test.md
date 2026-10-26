# Outils de test et de merge (2026-10-07)

Les scripts vivent dans `scripts/test-device/`, versionnés pour suivre d'un poste à l'autre. Ne jamais les recréer dans un dossier temporaire.

## Émulateur

- AVD `memopatte-test`, `ANDROID_SERIAL=emulator-5554`, app `com.gaellebriet.memopatte.dev`. Démarré juste avant un test, arrêté aussitôt après (`adb emu kill`), MémoPatte Dev désinstallée.
- Build d'une branche : `pnpm cap:sync`, puis `cd android && ORG_GRADLE_PROJECT_devApp=true ./gradlew --offline -q :app:assembleDebug`, puis `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- Données de test : `scripts/test-device/import.sh <export.json>`. Cette commande vide l'app, la relance et importe le fichier par le champ `input[type=file]`, sans ouvrir le sélecteur d'Android. Exemple d'export v4 (Luna, Milo, un vaccin en retard) : `src/features/settings/__tests__/fixtures/export-v4-0.1.60.json` de la branche `feat/anciens-exports` (#469).
- App en anglais : `adb shell cmd locale set-app-locales com.gaellebriet.memopatte.dev --locales en-US`, après le `pm clear`.

## Piloter l'app (émulateur comme téléphone)

- `scripts/test-device/emu.sh` : `click <texte ou nom accessible>`, `where` (écran et boutons), `text`, `rect <texte>` (boîte en px CSS), `date <sélecteur> <AAAA-MM-JJ>` (setter natif, puis `input` et `change`).
- `scripts/test-device/cdp.mjs` : `eval`, `tap`, `type`, par la WebView, sur le port `CDP_PORT` (9340 par défaut), après `adb forward tcp:9340 localabstract:webview_devtools_remote_<pid>`.
- Sur le téléphone de Gaelle, les règles de `collaboration.md` priment : jamais `adb shell input`.

## Captures annotées (FAQ du site)

- `scripts/test-device/annotate.py capture.png sortie.webp "x y w h" …` encadre en orange et numérote les zones données par `emu.sh rect`. Les constantes de l'écran (densité, haut de la WebView) valent pour l'AVD `memopatte-test`.

## Merge d'une PR

- `scripts/test-device/merge-pr.sh <numéro> <branche>` enchaîne les étapes :
  1. attend la CI ;
  2. refuse une branche en retard ou pas `CLEAN` ;
  3. merge ;
  4. supprime la branche distante ;
  5. vérifie `main` (quatre commandes) dans `.claude/worktrees/integ`, et affiche `MAIN OK` ou `MAIN KO`.
- Avant : `gh pr update-branch <numéro>`. Après : vérifier que le ticket est fermé.

## Campagnes d'invariants du moteur des doses

- Commande, variables posées **directement** devant elle : `INVARIANTS_FROM=120000000 INVARIANTS_SEEDS=3000 INVARIANTS_STEPS=40 pnpm exec vitest run src/shared/__tests__/dose-calendar.invariants.spec.ts --reporter=verbose` ; l'oracle (`ORACLE_*`) et la campagne des rappels (`RAPPELS_*`) se lancent de même, mode d'emploi dans `scripts/dose-engine/README.md`. Jamais par une variable shell intermédiaire (`env $E` sous zsh ne découpe pas la chaîne : le 2026-10-09, des campagnes ont ainsi joué zéro carnet en s'affichant vertes, et des défauts de #692 sont passés).
- Une campagne ne compte que si elle **prouve ce qu'elle a joué** : la spec échoue si ses réglages sont illisibles et annonce « Campagne : N carnets × M gestes, graines A à B », visible avec `--reporter=verbose`. Le rapport d'une campagne donne ce nombre.
- Une série longue se lance sous un verrou partagé avec les autres suites lourdes (`flock`), jamais en parallèle d'une autre suite complète.
- Avant de merger un changement du moteur : une série jamais jouée par l'implémenteur, lancée par le relecteur ; toute graine rouge est soit corrigée, soit reproduite à l'identique par le moteur de `main` et documentée avec un exemple concret (#721).
- **Volume fixé (Gaelle, 2026-10-20, « ce moteur v2 est vraiment trop long »)** : avant un merge, seules bloquent les campagnes **à un téléphone** (invariants, oracle, rappels), **une** série de 1 000 carnets × 30 gestes chacune sur des graines neuves, lancée par le relecteur. Les campagnes à deux téléphones, notes, doses listées et menu sont **informatives** : au plus une fois par PR, 500 carnets, jamais relancées « jusqu'à ce que ça passe » ; un rouge y fait un ticket, pas un blocage. Pas de propriété de dizaines de milliers de jugements à chaque passe de relecture.

## Pièges

- Attendre une tâche par son fichier de sortie ou par son PID. `while pgrep -f motif` ne s'arrête jamais : le motif figure dans la ligne de commande de la boucle elle-même.
- Vitest laisse dans `/tmp` un dossier d'environ 12 Mo par lancement (nom de 21 caractères, avec `client/` et `ssr/`). Quand `/tmp` est plein, les commandes échouent sans message clair : supprimer ceux de plus de 20 minutes.
- Après un merge de `main` dans une branche, relancer `pnpm install`, car `main` a pu ajouter une dépendance. Sinon le type-check du push échoue.
- Un composant de `shared/` que personne n'importe n'est compilé ni par `build-only` ni par Vitest (`css: false`) : le vert des commandes ne prouve rien sur son style, il faut un build jetable ou une mesure dans un navigateur.
- Une montée de Vuetify se vérifie aussi à l'œil (captures avant / après avec `pnpm dev:data` et Playwright) : les tests tournent avec `css: false`.
- Après avoir posé des secrets dans un dépôt, vérifier le projet visé avant de relancer un job qui écrit dans une vraie base.
