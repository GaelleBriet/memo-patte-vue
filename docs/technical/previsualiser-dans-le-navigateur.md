# Prévisualiser dans le navigateur

MémoPatte est une application **Android uniquement** (voir `CLAUDE.md`). Ce qui suit n'est pas un support
web de l'app : c'est un outil de développement pour voir les écrans avec de vraies données sans passer par
un appareil, ni Gaelle ni un agent n'ayant à lancer un émulateur pour vérifier une maquette.

## Lancer

```bash
pnpm dev            # http://127.0.0.1:5173, base vide
pnpm dev:data       # idem, avec le carnet de démo Milo + Luna
```

Rien d'autre à faire : `pnpm install` copie `sql-wasm.wasm` dans `public/assets/` (script `postinstall`),
et `src/core/db/web-sqlite.ts` charge le composant `jeep-sqlite` au premier accès à la base, seulement
quand `Capacitor.getPlatform()` vaut `web` **et** que l'app tourne sous le serveur de dev.

La prévisualisation n'existe que sous `pnpm dev` / `pnpm dev:data` : `pnpm preview` sert le build de
production, qui n'embarque pas la SQLite du navigateur (voir « Hors du build de production » plus bas). Il
affiche les écrans, mais tout accès à la base y rejette avec « SQLite web indisponible hors du serveur de
dev ».

## Les fixtures : un point de départ commun au navigateur et au téléphone

Le navigateur (IndexedDB) et le téléphone (SQLite natif) sont deux stockages séparés et le resteront. Ce qui
est commun, c'est le **jeu de données de départ**, choisi sur le serveur Vite :

| Commande          | Effet                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `pnpm dev`        | serveur **sans** fixtures : l'app démarre à vide                        |
| `pnpm dev:data`   | serveur **avec** fixtures : carnet de démo Milo + Luna                  |
| `pnpm dev:mobile` | inchangé : déploie l'app sur le téléphone, qui suit le serveur en cours |

- `pnpm dev:mobile` ne démarre pas le serveur (`cap run -l` pointe seulement la WebView vers lui) : c'est
  la commande `dev` ou `dev:data` lancée à côté qui décide du jeu de données, et **le téléphone suit**.
  Pour changer de jeu sur le téléphone, pas besoin de redéployer : arrêter le serveur, relancer avec
  l'autre commande, la WebView se reconnecte et recharge
- `pnpm dev:data` pose `VITE_FIXTURES=maquettes-<horodatage>` : un jeton **unique par démarrage**. À chaque
  chargement de page, `src/core/dev/fixtures.ts` le compare à celui mémorisé en `localStorage`
  (`memo-patte:fixtures-token`) : différent → base vidée (toutes les tables, lignes supprimées comprises),
  peuplée si le mode est `maquettes`, jeton mémorisé ; identique → rien
- Donc chaque `pnpm dev:data` repart d'un état de démo connu, et **un F5 ne détruit jamais rien** : ce
  qu'on saisit à la main pendant une session survit aux rechargements, y compris pour tester la persistance
- Sans variable (`pnpm dev`), le jeton mémorisé vaut `empty` : le premier chargement après un `dev:data`
  vide la base, les suivants ne touchent plus à rien
- **Attention au tout premier `pnpm dev`** sur un navigateur (ou un téléphone) qui n'a encore jamais vu les
  fixtures : aucun jeton n'est mémorisé, donc **la base est vidée une fois**, y compris ce qu'on y aurait
  saisi avant l'arrivée des fixtures. C'est voulu : chaque environnement part d'un état connu. Pour garder
  une base existante, poser à la main `memo-patte:fixtures-token` = `empty` dans le `localStorage`
  (DevTools → Application) avant de relancer
- Le navigateur et le téléphone ont chacun leur `localStorage` : chacun applique le mode de son côté, sur
  sa propre base
- Les dates du carnet de démo sont **relatives à aujourd'hui** (CHPPi en retard de 45 jours, Rage à jour…) :
  ce sont les statuts de la maquette qui sont reproduits, pas ses libellés au mot près
- `pnpm preview` sert un build de production : `import.meta.env.DEV` y est faux, donc **pas de fixtures**
  (ni de base, voir plus haut). C'est voulu, et `pnpm test:build` (lancé par la CI après le build) lit le `dist/` produit et échoue si une
  trace des fixtures y est partie : `pnpm build-only && pnpm test:build`. Il cherche des marqueurs techniques
  (un chunk `fixtures`/`demo-carnet`, `memo-patte:fixtures-token`, et `DEMO_CARNET_MARKER` =
  `memo-patte:demo-carnet`, lu à l'exécution par les fixtures), jamais les noms de démo : un placeholder
  légitime comme « Ex. Milo » les reprend

## Ce qui marche

- Tous les écrans et toutes les données locales : animaux, vaccins, traitements, poids, Carnet, accueil
- La base est un vrai SQLite (`sql.js` en WebAssembly) qui joue les mêmes migrations que sur Android
- La base survit au rechargement de la page : `jeep-sqlite` la sauvegarde en IndexedDB après chaque
  écriture (`autoSave`)

## Ce qui ne marche pas

- **Rappels / notifications** : `@capacitor/local-notifications` n'a pas d'implémentation web
- **Photo Picker** et tout autre plugin natif (Filesystem, Auto Backup…)
- **Achat Plus** : pas de Play Billing dans un navigateur

Ces appels échouent avec « Not implemented on web » : c'est attendu, pas un bug à corriger.

## La base IndexedDB

- Elle est propre au navigateur et à l'origine (`127.0.0.1:5173`) : Chrome et Firefox n'ont pas la même.
  Rien n'est partagé avec l'appareil Android
- Pour repartir de zéro : relancer `pnpm dev` ou `pnpm dev:data` (voir les fixtures ci-dessus) ; à la main,
  DevTools → Application → IndexedDB → `jeepSqliteStore` → supprimer, puis recharger
- Pour inspecter les tables : l'extension Chrome « Jeep SQLite Browser » (liée dans le README du plugin)

## Comment c'est branché

- `src/core/db/web-sqlite.ts` : sur `web` et sous le serveur de dev, import dynamique de `jeep-sqlite/loader`,
  `<jeep-sqlite autoSave>` ajouté au `body`, puis `CapacitorSQLite.initWebStore()`. Sur Android la fonction
  rend la main tout de suite et le chargeur n'est jamais importé
- Garde-fou : si le composant n'est pas enregistré après le chargement, `getDb()` rejette avec
  « SQLite web indisponible : jeep-sqlite non chargé » au lieu d'attendre indéfiniment (le plugin, lui,
  fait `await customElements.whenDefined('jeep-sqlite')` sans délai)
- `jeep-sqlite` est une `dependency` (pas `devDependency`) parce que le code de l'app l'importe, même si
  l'import n'est jamais exécuté sur Android
- Le wasm doit venir de la **même version** de `sql.js` que le code JS figé dans le bundle de `jeep-sqlite`
  (2.8.0 embarque 1.11.0 ; un autre wasm donne un `LinkError` WebAssembly au chargement). D'où l'override
  pnpm `jeep-sqlite>sql.js` dans `package.json`, que le script `postinstall` résout depuis `jeep-sqlite`. La
  devDependency `sql.js` des tests, elle, reste libre de monter de version
- À la montée de version de `jeep-sqlite` : vérifier la version de `sql.js` qu'il embarque et ajuster
  l'override, puis relancer `pnpm install`

## Hors du build de production

`jeep-sqlite` (chunk de ~292 Ko, plus son chargeur de ~16 Ko) et `sql-wasm.wasm` (~652 Ko) ne servent qu'au
navigateur. Sans précaution, `vite build` les écrit dans `dist/` et `cap sync` les copie dans l'APK, où ils ne
sont jamais chargés (#156). Deux mécanismes les en sortent :

- **Le chunk** : l'import de `jeep-sqlite/loader` est gardé par `import.meta.env.DEV`. En production, Vite
  remplace la condition par `false` et l'import disparaît du bundle ; sur le web, `prepareWebSqlite()` rejette
  alors explicitement au lieu de laisser le plugin attendre `jeep-sqlite` indéfiniment
- **Le wasm** : Vite copie tout `public/` dans `dist/` sans exclusion possible. Le plugin
  `memo-patte:drop-web-sqlite-wasm` de `vite.config.ts`, actif au build seulement, supprime
  `dist/assets/sql-wasm.wasm` une fois le build écrit. Le serveur de dev, lui, le sert toujours depuis
  `public/assets/`

`pnpm test:build` (lancé par la CI après le build) échoue si l'un des deux revient : fichier `*.wasm` ou nom
contenant `jeep-sqlite` dans `dist/`, ou chaîne `sql-wasm.wasm` dans un fichier JS. Il ne cherche pas
`jeep-sqlite` dans le contenu : le plugin SQLite web, lui légitime dans le build, cite ce nom.

Mesure sur l'APK debug (build Gradle propre) : 17 239 965 → 16 787 136 octets, soit ~960 Ko de fichiers en
moins avant compression.
