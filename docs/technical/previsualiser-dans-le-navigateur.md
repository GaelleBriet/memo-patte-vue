# Prévisualiser dans le navigateur

MémoPatte est une application **Android uniquement** (voir `CLAUDE.md`). Ce qui suit n'est pas un support
web de l'app : c'est un outil de développement pour voir les écrans avec de vraies données sans passer par
un appareil, ni Gaelle ni un agent n'ayant à lancer un émulateur pour vérifier une maquette.

## Lancer

```bash
pnpm dev            # http://127.0.0.1:5173, base vide
pnpm dev:data       # idem, avec le carnet de démo Milo + Luna
pnpm build && pnpm preview
```

Rien d'autre à faire : `pnpm install` copie `sql-wasm.wasm` dans `public/assets/` (script `postinstall`),
et `src/core/db/web-sqlite.ts` charge le composant `jeep-sqlite` au premier accès à la base, seulement
quand `Capacitor.getPlatform()` vaut `web`.

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
- Le navigateur et le téléphone ont chacun leur `localStorage` : chacun applique le mode de son côté, sur
  sa propre base
- Les dates du carnet de démo sont **relatives à aujourd'hui** (CHPPi en retard de 45 jours, Rage à jour…) :
  ce sont les statuts de la maquette qui sont reproduits, pas ses libellés au mot près
- `pnpm preview` sert un build de production : `import.meta.env.DEV` y est faux, donc **pas de fixtures**.
  C'est voulu, et un test (`fixtures-absent-du-build.spec.ts`, lent : il lance un vrai build) vérifie
  qu'aucune trace du carnet de démo ne part en prod

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

- Elle est propre au navigateur et à l'origine (`127.0.0.1:5173`) : Chrome et Firefox n'ont pas la même,
  et `pnpm preview` (port 4173) a la sienne. Rien n'est partagé avec l'appareil Android
- Pour repartir de zéro : relancer `pnpm dev` ou `pnpm dev:data` (voir les fixtures ci-dessus) ; à la main,
  DevTools → Application → IndexedDB → `jeepSqliteStore` → supprimer, puis recharger
- Pour inspecter les tables : l'extension Chrome « Jeep SQLite Browser » (liée dans le README du plugin)

## Comment c'est branché

- `src/core/db/web-sqlite.ts` : sur `web`, import dynamique de `jeep-sqlite/loader`, `<jeep-sqlite autoSave>`
  ajouté au `body`, puis `CapacitorSQLite.initWebStore()`. Sur Android la fonction rend la main tout de suite
  et le chargeur n'est jamais importé
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
