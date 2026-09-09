# Prévisualiser dans le navigateur

MémoPatte est une application **Android uniquement** (voir `CLAUDE.md`). Ce qui suit n'est pas un support
web de l'app : c'est un outil de développement pour voir les écrans avec de vraies données sans passer par
un appareil, ni Gaelle ni un agent n'ayant à lancer un émulateur pour vérifier une maquette.

## Lancer

```bash
pnpm dev            # http://127.0.0.1:5173
pnpm build && pnpm preview
```

Rien d'autre à faire : `pnpm install` copie `sql-wasm.wasm` dans `public/assets/` (script `postinstall`),
et `src/core/db/web-sqlite.ts` charge le composant `jeep-sqlite` au premier accès à la base, seulement
quand `Capacitor.getPlatform()` vaut `web`.

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
- Pour repartir de zéro : DevTools → Application → IndexedDB → `jeepSqliteStore` → supprimer, puis recharger
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
