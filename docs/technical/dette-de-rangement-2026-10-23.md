# Dette de rangement (audit du 2026-10-23)

Audit en lecture seule de `main` (commit `d7d0ef7c`), d'après `.claude/rules/clean-code.md` : taille comme signal, une responsabilité par fichier, une règle métier écrite à un seul endroit, pas de code mort. Aucun code n'a été modifié ; chaque ligne prioritaire a son ticket.

## Ce qui a été mesuré

| Mesure                                                              | Résultat                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `.vue` dont le `<script setup>` dépasse 300 lignes                  | **aucun** ; les plus longs : 237 (`TreatmentFormView`), 234 (`HomeView`)  |
| Modules `.ts` hors tests de plus de 500 lignes                      | **aucun** ; les plus longs : 473, 450, 441, 414, 414, 397, 368, 354       |
| Fichiers de production jamais importés dans `src/`                  | **aucun** (`knip --production`) ; voir les faux positifs plus bas         |
| Exports jamais importés ailleurs (tests compris), hors `scripts/`   | 25 valeurs et 59 types dans `src/`, tous encore utilisés dans leur fichier |
| Fonctions de production utilisées seulement par des tests           | aucune trouvée, sauf des outils de test assumés (`forgetPhotoUrls`, `forgetCurrentDeviceForTests`) |

Le dépôt est donc déjà sous les seuils : la dette est dans quatre modules de 400 à 470 lignes qui mêlent plusieurs sujets, dans une règle écrite plusieurs fois (le jour civil) et dans des `export` superflus.

## Tableau par priorité (gain / risque)

| #   | Sujet                                                                                      | Taille   | Gain  | Risque | Ticket |
| --- | ------------------------------------------------------------------------------------------ | -------- | ----- | ------ | ------ |
| 1   | Jour civil : un formateur et une validation (voir « Règles écrites deux fois »)            | ~20 sites | fort  | faible | #1144 |
| 2   | `vaccinations.repository.ts` : lectures, écritures, cascade et synchro dans une seule fabrique | 449 | fort  | moyen  | #1145 |
| 3   | `animals.repository.ts` : même structure, départ de l'animal en plus                       | 413      | moyen | moyen  | #1146 |
| 4   | `weight-chart.ts` : mesure du texte, axe du temps, placement des étiquettes, deux courbes  | 473      | moyen | faible | #1147 |
| 5   | `import-plan.ts` : types du carnet local, détection des refus, plan des appareils          | 414      | moyen | faible | #1148 |
| 6   | `export` superflus (25 valeurs, 59 types) dans `src/`                                       | 84 lignes | faible | très faible | #1149 |
| 7   | Scripts de préinscription Play (`scripts/*site-preregistration.mjs`) : aucun appel, à confirmer | 78 + 90 de test | faible | très faible | #1150 |

Laissés de côté après examen :

- `src/core/db/migrations.ts` (441) : historique figé, on ne le range pas, on l'allonge.
- `src/core/theme/icons.ts` (397) : une table d'icônes, un seul sujet.
- `auth.repository.ts` (354), `vaccination-injections.repository.ts` (368) : sous le signal, un seul sujet.
- `HomeView.vue` (688 lignes dont 234 de script), `TreatmentFormView.vue` (622 dont 237) : le script assemble déjà, le reste est gabarit et style.

## Détail des découpages proposés

1. **`vaccinations.repository.ts`** : sur le modèle de `treatments/repository/` (`*-reads`, `*-import`, `*-sync`, `*-row`) : `vaccination-reads.repository.ts` (liste, échéances remplacées), `vaccination-writes.repository.ts` (création, modification, suppression, restauration), `vaccination-cascade.repository.ts` (instructions par animal, effacement total), `vaccination-sync.repository.ts` (ligne à envoyer, ligne reçue), `vaccination-row.repository.ts` (ligne de table vers `Vaccination`). Le fichier `vaccinations.repository.ts` assemble.
2. **`animals.repository.ts`** : `animal-reads`, `animal-writes`, `animal-departure` (départ et détails), `animal-sync`, `animal-import`, même assemblage.
3. **`weight-chart.ts`** : `chart-text-measure.ts` (police, largeurs de glyphes, boîtes), `chart-time-axis.ts` (mois, repères, `timeChart`), `chart-labels.ts` (placement, pastille du dernier poids), `weight-chart.ts` garde `buildCarnetWeightChart`, `buildHistoryWeightChart`, `nearestPointIndex`. Les types exportés restent importables depuis `weight-chart.ts`.
4. **`import-plan.ts`** : `import-plan-types.ts` (types locaux, plan, refus), `import-plan-refusals.ts` (`findReattached`, `findMisplacedEvent`, `findMisplacedDose`), `import-plan.ts` garde `buildImportPlan` et `planDevices`.

## Règles écrites deux fois

- **Jour civil `yyyy-MM-dd`, validation** : la même expression `/^\d{4}-\d{2}-\d{2}$/` à `src/shared/domain/calendar-day.ts:8`, `src/shared/domain/reminder-route.ts:26` (dans une expression plus longue) et `reminder-route.ts:56`. `isCalendarDay` existe déjà, et contrôle en plus l'existence de la date.
- **Jour civil, formatage** : `toDay(date)` existe (`calendar-day.ts:24`), et `format(x, 'yyyy-MM-dd')` est réécrit à la main à `core/app-lifecycle/today-iso-date.ts:5`, `core/dev/demo-carnet.ts:65`, `settings/logic/export-format.ts:48,67`, `settings/logic/backup-summary-text.ts:10,13`, `settings/logic/legacy-export.ts:61`, `settings/logic/parse-export-file.ts:54`, `settings/service/pdf-export.service.ts:48`, `treatments/logic/treatment-reminders.ts:19`, `treatments/service/reminders-priming.service.ts:55`, `treatments/logic/treatment-shift-box.ts:66`, `treatments/logic/treatment-resumption.ts:77` (`formatISO`), `vaccinations/logic/vaccination-sheet.ts:46`, `vaccinations/logic/vaccination-done.ts:24`, `shared/domain/reminder-plan.ts:69,180`, `shared/components/DateCalendar.vue:33,39`.
- **Durée d'un jour en millisecondes** : `shared/domain/weight-chart.ts:102` et `settings/logic/export-file-versions.ts:169`.
- **Pas touché volontairement** : la limite de 80 caractères des noms est écrite en dur dans `core/db/schema-statements.ts:94` alors que `MAX_NAME_LENGTH` existe ; les déclencheurs SQL sont rejoués par les migrations, une constante partagée changerait une ancienne migration le jour où la limite bouge. Le motif d'heure `HH:mm` est lui déjà unique (`CLOCK_TIME_PATTERN`), hors les `GLOB` figés des migrations.

## Code mort probable

Preuves (commandes lancées dans le worktree, `knip 6.42.1` via `pnpm dlx`) :

- `knip --include files,exports,types` : 5 fichiers, 43 exports, 63 types signalés.
- `knip --production --include files,exports` : 115 fichiers (tests, scripts, fichiers de référence du moteur), 164 exports (surtout des fabriques `createXxx` et des clés de stockage exportées pour les tests).
- Contrôle par `grep -w` sur chaque nom (comptage de lignes, pas relecture une à une) : pour les 33 fonctions signalées en mode production, aucune n'est sans appel dans son propre fichier, et aucune n'est appelée seulement par un test, sauf `forgetPhotoUrls` et `forgetCurrentDeviceForTests` (outils de test).

| Élément                                                                                  | Verdict                                                                                           |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/styles/settings.scss`                                                               | faux positif : chargé par `vite.config.ts:34` (`configFile` de Vuetify)                           |
| `site/vitrine.js`, `supabase/functions/revenuecat-webhook/index.ts`, `site/_worker.js`, `site/aide/*.js` | faux positifs : points d'entrée chargés par le navigateur, Cloudflare ou Supabase                 |
| `scripts/test-device/cdp.mjs`                                                            | à confirmer : documenté dans `.claude/rules/outils-de-test.md`, lancé à la main                   |
| `scripts/open-site-preregistration.mjs`, `scripts/site-preregistration.mjs`              | à confirmer : aucune référence hors de leur test, ni dans `package.json` ni dans la CI            |
| Types `Version4Period` à `Version9Period`, `Version8Dose`, `Version4Dose`                | exports superflus, pas du code mort : utilisés dans `export-file-versions.ts`                     |
| Clés i18n                                                                                | non auditées ici : la règle `@intlify/vue-i18n/no-unused-keys` les couvre déjà, sauf clés construites |

## Moteur des doses (règles gelées, aucun ticket)

`src/shared/domain/dose-calendar/` : 49 fichiers, 6 347 lignes hors tests, aucun au-dessus de 300 (`calendar-reports.ts` 300, `reference-calendar.ts` 297, `gestures/settings.ts` 291, `gestures/move.ts` 277, `journeys.ts` 268, `view.ts` 259). Les 11 fichiers `reference-*.ts` (1 549 lignes) ne sont importés que par l'oracle et les tests. Rien n'est proposé.

## Méthode de preuve (commune à tous les tickets)

1. Un commit par pas ; un refactor ne change pas le comportement.
2. Tests existants verts sans toucher à leurs attentes (`pnpm exec vitest run`), puis les quatre commandes (`pnpm lint && pnpm type-check && pnpm exec vitest run && pnpm build-only`).
3. Découpage de types ou de modules purs : build identique, `diff -r dist` entre `main` et la branche.
4. Découpage d'un repository : les specs existantes du repository et des services qui l'appellent passent telles quelles ; l'API publique (noms exportés de `xxx.repository.ts`) ne change pas.
5. Changement qui touche un écran (formatage de dates affichées) : captures avant / après sur l'émulateur avec le carnet de démo, comparées au pixel.
6. Aucun fichier du moteur des doses n'est modifié.
