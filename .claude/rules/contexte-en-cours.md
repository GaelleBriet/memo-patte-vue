# Contexte en cours (à mettre à jour à chaque lot)

- 2026-09-24 (après-midi) : **reprendre ici.** Mergés : #390 (#388, app de dev séparée « MémoPatte
  Dev », `com.gaellebriet.memopatte.dev`, installée par `pnpm dev:mobile` et `pnpm test:device:dev` ;
  la vraie app ne reçoit que `main` par `pnpm test:device`) et #389 (#351, Historique du poids par pages
  de 12 pesées, sous-titre des écrans poussés collé au titre). `main` à **2561 tests**.
  **En PR : #391 (#379, migration v6 de l'historique)**, revue propre (trois re-revues), intégrée avec
  le lot (2646 tests). **À merger seulement après le test sur le téléphone** : installer `main` (v5)
  dans MémoPatte Dev avec le carnet de démo, puis le build de #391, et vérifier la migration avec le
  vrai plugin (données, `user_version` 6, rappels). Pas d'émulateur possible : `/dev/kvm` absent.
  Décision de Gaelle du jour : l'import v1 rattache sa ligne à l'événement **de même date** (journal).
  **À faire une fois au prochain test sur le téléphone** : réinstaller la vraie app depuis `main`
  (`pnpm test:device`) ; elle vient d'un ancien `dev:mobile` et chargerait le code de dev.
  **Mis de côté par Gaelle** (« on voit ça après, quand le reste est ok ») : (1) l'audit de Fable,
  vérifié point par point, tickets rédigés dans `docs/product/audit-2026-09-24.md`, rien créé sur
  GitHub ; (2) les trois suites de #388 : installer sans que `cap run` puisse désinstaller la vraie
  app, garde « `test:device` depuis `main` seulement », phrase de `collaboration.md` sur la vraie app.
  Suite du lot historique : #380 (« Fait »), puis #381 à #384 ; #352, #385, #386 en attente.

- 2026-09-24 : **reprendre ici.** Maquette « rappel fait » reçue (`docs/design/rappels/`, écarts
  tranchés au journal du jour, points 1 à 5 ; planche F10 à faire corriger par Gaelle : l'app
  s'ouvre). **Modèle de l'historique tranché** (journal du jour ; spec
  `docs/technical/proposition-historique-rappels.md` §10). Prochaine étape : relecture de la spec
  (Gaelle, éventuellement Fable), puis tickets dans l'ordre du §10.9. **À ne pas oublier** : la
  réconciliation des prises à fréquence périmée est à faire avec l'activation de la synchro (#83,
  critère ajouté sur le ticket). #352 : unités kg / lb, défaut lb aux États-Unis, exports JSON / CSV
  en kg, PDF dans l'unité choisie (tranché le 2026-09-24, maquette attendue). #351 : nombre de pesées
  par page à juger sur la maquette (12 proposé).

- 2026-09-23 (soir) : **lot du soir.** Mergés dans la soirée : #367 (#344 « À faire » sur 30 jours,
  « Prochain rappel » à la place de « Aucun rappel à venir »), #369 (#354 toasts pétrole, au-dessus de
  toute barre fixe, tonalités réussite / information / échec), #370 (#350 courbe du PDF sur l'axe du
  temps ; aucune étiquette ne touche la ligne de base, Carnet compris). `main` à **2485 tests**, puis #373 (bande vide retirée sous la ligne de base de la courbe du Carnet, la place va au tracé) : voir la PR du même nom.
  Décisions au journal : « Cycle de vie d'un rappel » et « Finitions de #344, #350 et #354 ».
  **En attente de Gaelle** : (1) modèle de données de l'historique (#364) — document de comparaison
  sur la branche distante `docs/proposition-historique-rappels`, sans PR ; elle penche pour « une
  ligne de vaccin par injection » ; (2) maquette Claude Design de la feuille « Fait » (prompt donné,
  planches F1 à F11) ; (3) maquettes de #351 et #352 ; (4) #365 médicaments ; (5) ordre des tickets
  de synchro. Non vérifié sur appareil : l'annonce TalkBack des toasts (délai de 100 ms), la courbe
  avec police système agrandie, l'action de notification quand l'app est fermée.

- 2026-09-23 (fin) : **lot mergé.** Lot « retours de navigation » **mergé** : #346 (#339
  accueil à un animal), #355 (#342 + #341 écran Plus et pastille), #358 (#340 courbe de poids),
  #359 (#343 export enregistré dans Documents). `main` à **2403 tests**. Testé sur le téléphone de
  Gaelle (Android 16) avec le lot intégré : chip et feuille pesée à un animal, pastille, écran Plus
  depuis le PDF, courbe du Carnet, export JSON et CSV écrits dans Documents › MémoPatte sans
  permission, suffixe ` (1)` dans la même minute ; base sauvegardée puis restaurée à l'identique,
  fichiers de test et entrée MediaStore supprimés, build de `main` réinstallé. **Non testé sur
  appareil** : courbe avec la police système agrandie (réglage système interdit au test), export PDF
  (Plus requis), parcours Android 7 à 10 (émulateur API 29 nécessaire).
  **Suivis ouverts** : #344 (brainstorming de la liste « À faire », prochaine étape convenue), #349
  (« Ouvrir » du toast), #350 (courbe du PDF), #351 (Historique par pages, maquette Claude Design à
  recevoir), #352 (unité de poids, trois questions et maquette), #353 (relecture EN), #354 (style
  des toasts, plus le minuteur qui ne repart pas sur un message identique), #356 (PDF de tous les
  animaux). Synchro (#83, #40, #87…) à ordonner ensuite avec Gaelle.

- 2026-09-23 : **point de départ de la journée.** Gaelle a commencé à vérifier sur son téléphone le travail
  livré (`pnpm dev:mobile` depuis son dépôt principal). Deux questions lui ont été posées, la
  première est tranchée ; elle revient avec des retours de navigation dans l'app.

  **Premier retour, pas un bug de l'app** : sur l'écran « Avant de commencer », les boutons
  semblaient morts. Ils recevaient bien le tap (vérifié par `elementFromPoint`) et le choix était
  enregistré, mais le passage à l'accueil échouait. Le lien `adb reverse tcp:5173` avait sauté
  (reconnexion USB), donc chaque écran chargé à la demande échouait (console : « Failed to
  fetch dynamically imported module »). Rétabli par `adb reverse tcp:5173 tcp:5173`, l'app s'est
  rechargée seule. Symptôme à reconnaître : tout tap qui change d'écran « ne fait rien ».

  **Piège trouvé au passage** : dans le dépôt principal de Gaelle,
  `android/app/src/main/assets/capacitor.plugins.json` (ignoré par git) datait du 2026-09-07.
  `dev:mobile` tourne en `--no-sync` et ne le régénère jamais : seuls SQLite et les notifications
  y figuraient, donc App, Camera, Filesystem, Share et Network étaient « not implemented on
  android » en dev. Remède immédiat donné : `pnpm cap:sync` une fois, puis `pnpm dev:mobile`.

  **Question 1 tranchée par Gaelle** : `dev:mobile` lance désormais `cap update android` avant le
  `cap run` (liste des plugins régénérée sans build web, une seconde), et un `cap:sync` complet
  seulement si le dépôt n'a jamais été synchronisé. Plus de consigne à retenir.

  **Question 2 en attente** : quel lot lancer maintenant que #39 est mergé. Candidats : #83
  (amorçage de la synchro à la souscription), #40 (restauration), #87 (suppression de compte,
  débloqué par le bucket du Lot B), #82 (Auto Backup sur appareil), #51 (troisième critère, un
  second écran).

- 2026-09-22 : **#39 mergé (PR #334)** — cycle push/pull réel, Lot C de la synchro. Port par table
  (`core/sync/service/syncable-table.ts`) implémenté par les quatre repositories, `core/sync`
  n'écrit ni SQL ni appel Supabase direct. Pagination du pull avec curseur repositionné à
  `last_pulled_at` **pour chaque table** (pas chaîné d'une table à l'autre, sinon des modifications
  d'une table pas encore parcourue seraient sautées). Ping-pong (§3.4) vérifié avec les vrais
  triggers SQLite. `syncAllReminders()` rappelé après un pull touchant animal/vaccination/treatment
  (#41 avancé). `@capacitor/network` ajouté, `android/` resynchronisé, vrai `assembleDebug` relancé.

  **Point technique à retenir.** L'upsert atomique du doc, une seule requête avec condition sur
  `updated_at`, n'est pas exprimable via PostgREST (pas de condition possible sur un upsert).
  Remplacé par `guardedUpsert` (`core/supabase/guarded-upsert.ts`) : deux écritures indépendantes,
  chacune atomique (mise à jour conditionnée puis création si absente). Analysé : sûr pour deux
  appareils qui modifient la même ligne existante, le plus récent gagne quel que soit l'ordre.
  Fenêtre théorique résiduelle seulement sur la création simultanée de la même ligne pour la toute
  première fois par deux appareils à quelques ms d'intervalle — accepté comme compromis, une
  fonction RPC réglerait ça si besoin un jour.

  **Bug réel trouvé en testant contre une vraie instance Supabase locale** (jamais le vrai projet) :
  PostgREST rend un horodatage avec un décalage `+00:00`, jamais avec un `Z` final — la garde SQLite,
  une comparaison de chaînes, aurait pu juger une ligne distante plus ancienne à tort malgré un
  instant identique. Corrigé par `normalize-sync-timestamps.ts`.

  **Reste avant que ça serve à quelque chose en vrai** : #83 (amorçage à la souscription) est le seul
  endroit qui doit activer `sync_state.enabled` — sans lui, la file de Lot A reste vide pour tout le
  monde (sans effet pratique aujourd'hui, RevenueCat bloqué). #40 (restauration) reste aussi hors
  scope.

- 2026-09-22 : **Plugin Google tranché** — `@capawesome/capacitor-google-sign-in` (voir
  `docs/product/decisions-log.md` du jour). Le SIRET n'est toujours pas là (micro-entreprise pas
  créée) : Play Console/RevenueCat restent en pause côté Gaelle.
- 2026-09-21 : **#313 fermé — pas un bug, testé en vrai sur le téléphone (build de prod et
  `pnpm dev:mobile`).** En production, le sélecteur de photo s'ouvre du premier coup, à chaque
  fois. En dev, seule la **toute première** navigation vers un écran neuf dans une session fraîche
  peut couper un tap : Vite découvre à ce moment-là des composants Vuetify auto-importés
  (`VBottomSheet`, `VChip`, `VBtnToggle`…) pas encore dans son cache, s'optimise à chaud et
  recharge tout le live-reload (log Vite : « optimized dependencies changed. reloading »). Un
  correctif ciblé (`optimizeDeps.include` sur `@capacitor/camera`) a été essayé et écarté : ce
  n'était pas la bonne dépendance, donc aucun effet. **Piège général à retenir**, pas spécifique
  aux photos : le premier tour d'un écran jamais visité dans la session `pnpm dev`/`pnpm dev:mobile`
  en cours peut demander un deuxième essai — ça n'existe pas dans le vrai build (aucune
  optimisation à chaud dans un bundle de prod).
  **Incident de process signalé** : ce test a réinitialisé la base SQLite du téléphone plusieurs
  fois (jetons `VITE_FIXTURES` différents à chaque relance) sans sauvegarde préalable, contrairement
  à ce que dit `collaboration.md`. Aucune perte connue, mais la règle n'a pas été suivie — à corriger
  la prochaine fois : sauvegarder la base avant tout test qui touche aux fixtures.
- 2026-09-21 : **CI des migrations Supabase mise en place** (`.github/workflows/supabase-migrations.yml`,
  détail dans le coffre de notes de Gaelle, `docs/technical/supabase-migrations-ci.md`) — `supabase db
push --db-url` vers le Session Pooler, sans `supabase link` (cassé avec les tokens à permissions
  fines du Dashboard, [supabase/supabase#50244](https://github.com/supabase/supabase/issues/50244),
  encore ouvert) ni jeton de compte. Rattrape d'un coup les six migrations du Lot B jamais appliquées
  (miroir Postgres, droit Plus, RLS, bucket photos).
  **Incident signalé** : Gaelle a posé par erreur les secrets GitHub d'un tout autre projet
  (`symbaroum-bestiary`) sur le dépôt MémoPatte ; les six migrations sont donc parties sur la base
  Symbaroum au lieu de MémoPatte. **Contenu, sans perte** : les migrations n'ont fait qu'ajouter des
  objets nouveaux (4 tables, 2 fonctions, un bucket), jamais touché aux tables existantes de Symbaroum
  (`monsters` et son `grant` intacts) — tout supprimé proprement par `drop ... if exists` (le bucket via
  le Dashboard, la suppression directe des tables `storage.*` étant bloquée par
  `storage.protect_delete()`). Mot de passe de la base Symbaroum réinitialisé par précaution. Les bons
  secrets MémoPatte posés ensuite, migrations réellement appliquées sur le vrai projet, CI vérifiée
  verte. **Réflexe à en retenir** : après avoir posé des secrets dans un dépôt, vérifier une fois le nom
  du projet visé avant de relancer un job qui écrit dans une vraie base.
- 2026-09-19 : **pause demandée par Gaelle — reprendre exactement ici.**
  - **PostHog : fait et vérifié de bout en bout.** Clé posée dans `.env`, consentement testé sur le
    téléphone (`pnpm dev:mobile`, `VITE_ANALYTICS_CONSENT=ask` nécessaire pour voir l'écran en
    navigateur — sauté par défaut en dev hors natif), pageview reçu côté PostHog EU Cloud. Seul
    point laissé ouvert, pas bloquant : la rétention « 13 mois » de la doc n'est pas un réglage
    PostHog — la rétention des événements est fixée par palier d'abonnement (1 an gratuit, 7 ans
    payant), pas configurable à une valeur arbitraire. À trancher plus tard : ajuster ce que dit la
    politique de confidentialité sur la durée réelle, ou prévoir une purge programmée via l'API
    PostHog à 13 mois.
  - **Connexion Google (#65) : en cours, rien encore exécuté.** Projet Google Cloud « MémoPatte »
    créé par Gaelle. Guide donné pour la suite, vérifié dans la doc Supabase à jour (pas juste de
    mémoire) : le flux recommandé aujourd'hui est **Credential Manager + `signInWithIdToken`**,
    **sans** deep link — ça contredit ce que dit #65 (« schéma de redirection / deep link configuré
    côté Android et côté Supabase ») ; à corriger sur le ticket une fois qu'on y revient. Trois
    étapes détaillées, prêtes à exécuter dès que Gaelle veut s'y remettre : (1) écran de consentement
    OAuth sur le projet MémoPatte, (2) un client OAuth **Web** (« server client ID », donne un
    Client ID + Secret) et un client OAuth **Android** avec le SHA-1 **debug**
    (`cd android && ./gradlew signingReport`) — le SHA-1 de **release** attendra le premier upload
    Play Console, #53 n'étant pas fait (keystore pas créé) ; (3) déclarer dans Supabase → Auth →
    Providers → Google (client Web en principal, client Android en « Client ID supplémentaire
    autorisé »). ~~Reste à trancher avant du code : quel plugin Capacitor fait l'appel natif~~
    tranché le 2026-09-22 : `@capawesome/capacitor-google-sign-in` (voir decisions-log). Candidats
    comparés le 2026-09-19, à l'époque encore ouverts :
    `@capawesome/capacitor-google-sign-in`, `@capgo/capacitor-social-login`.
  - ~~#313 ouvert, pas encore investigué sur l'appareil~~ fermé depuis, pas un bug — voir l'entrée
    du 2026-09-21 ci-dessus.
  - **Play Console / RevenueCat en pause côté Gaelle**, en attente de la création de sa
    micro-entreprise — rien à faire de mon côté tant que ce n'est pas réglé.
- 2026-09-19 : **nettoyage de ce fichier** — deux entrées du 2026-09-16 corrigées après vérification (issues et branches réellement encore ouvertes) : `fix/conformite-maquettes` a atterri dans `main` depuis (le test qui verrouille le correctif, `row-title-wrap.styles.spec.ts`, y est) — la branche n'existe plus, rien à reprendre ; #66 et #67 (consentement analytics) sont fermées, réglées par la PR #269 mergée, la question de poids des boutons ne reste pas ouverte. Le reste de l'entrée du 2026-09-16 sur les dépendances externes (#187, #65, #47, PostHog, #8) reste exact, vérifié à la même date
- 2026-09-16 : **audit visuel app ↔ maquettes, puis lot de conformité** — branche `fix/conformite-maquettes` (mergée depuis) : 15 écarts relevés à la lecture des planches et tous corrigés (icône Paramètres sur la ligne du titre, astérisque collée au libellé, tri des vaccins par échéance, barre du bas pleine largeur, suffixe « kg » et icône date visibles, flèche de retour sur la ligne du titre…), plus **#282** (le mot « vaccin » ne précède plus le nom saisi, FR et EN, accueil et notifications) et l'ordre de création des chips. **Piège de mise en page à retenir** : sur une ligne « titre + badge », c'est le `min-width: 0` de la colonne de titre — pas la valeur d'`overflow-wrap` — qui laisse le flex couper un mot en deux ; il faut `flex-wrap: wrap` sur la ligne et `margin-inline-start: auto` sur le badge, verrouillés pour les trois listes par `row-title-wrap.styles.spec.ts`. **Piège d'outillage** : `vite.config.ts` supprime `sql-wasm.wasm` de tout build et `web-sqlite.ts` lève hors de `import.meta.env.DEV` — pour servir un build avec données, `NODE_ENV=development vite build --mode development` **et** recopier `public/assets/sql-wasm.wasm` dans `dist/assets/`
- 2026-09-16 (nuit, autonomie complète) : **mergés** — #244 (#44 service billing RevenueCat : trois offres, statut Plus persisté, indisponible sans clé, aucun appel pour un gratuit), #246 (#7 + #9 session Supabase persistante, drapeau « compte Plus » local, client chargé seulement à la première opération de compte), #247 (#90 outillage : rien à monter, maintien en pnpm 10 consigné), #249 (avance #41 : test d'intégration de la reprogrammation des rappels sur appareil restauré). `main` à **1607 tests**
- 2026-09-16 : ~~en attente d'une réponse de Gaelle sur `feat/consentement-statistiques` (#66 + #67)~~ réglé depuis, voir l'entrée du 2026-09-19. **PR #248** (proposition d'architecture de l'épic sync) : dix décisions de modèle de données à trancher, à ne merger qu'après — en cours, réglées une par une à partir du 2026-09-19 (voir `docs/product/decisions-log.md`)
- 2026-09-16 : **dépendances de Gaelle** — clé publique RevenueCat `goog_…` + produits Play Console (#47) ; projet PostHog EU (clé, « Discard client IP », rétention, DPA) ; projet Supabase à peupler (#187) et région à fixer ; configuration Google OAuth native (#65) ; confirmation d'e-mail à l'inscription à trancher avant #6 ; #8 à réaligner sur #7 (le drapeau est effacé à la déconnexion)
- 2026-09-15 : **flux de travail** — chaque agent travaille dans son propre worktree sous `.claude/worktrees/`, **jamais** dans l'espace Orca `Dev` de Gaelle (un agent s'y est trompé le 2026-09-16, sans perte) ; machine à 15 Gio : un seul Vite/Chromium à la fois, émulateur démarré juste avant un test et arrêté aussitôt ; merge par script (attente de la CI, `update-branch`, merge, vérification de `main`), suppression de la branche distante par `gh api -X DELETE` seulement après « mergée, main vérifiée »
- 2026-09-13 : **lot 6 en PR, en autonomie**, ordre de merge conseillé **#173 → #158 → #164 → #166 → #165 → #171** — #173 (routeur mémoire dans le spec de la barre du bas : 2,5 s → 33 ms, il faisait expirer `vitest run` sous charge), #158 (#147 resync `android/` après Capacitor 8.5.1), #164 (#30 feuille pesée), #166 (#36 accueil v2, 5 états ; « Ton foyer » faute de prénom, pas d'icône Paramètres avant #48, Actions rapides à #37), #165 (#157 fixtures `pnpm dev` / `pnpm dev:data`, **test sur téléphone à faire par Gaelle avant merge**), #171 (#25 formulaire traitement + patron `shared/form/` repris par les trois formulaires ; conflit `fr.json` attendu après #166, deux blocs à garder). Toutes les branches fusionnées à l'essai : 725 tests verts
- 2026-09-13 : **tickets de suivi créés** — #167 badge d'échéance partagé (les teintes « En retard » divergent entre Carnet et Accueil), #168 rafraîchir les écrans au retour au premier plan (« Aujourd'hui » reste affiché le lendemain), #169 onglet actif de la barre du bas sans fond gris, #170 `AnimalChipSelector` sans « + » ni débord (la feuille pesée le surcharge en CSS), #172 texte clair sur l'option cochée du sélecteur à boutons. Suites naturelles : #37 Actions rapides (ses trois destinations existent), #31 suivi de poids
- 2026-09-13 : **dettes remboursées** — patron formulaire extrait (`FormScreen`, `FormField`, `FormSegmented`), `todayIsoDate` dédupliqué, contrôle « rien des fixtures en prod » sorti de `vitest run` (`pnpm test:build` en CI, marqueur dédié plutôt que noms de démo). **Nouvelle exception d'architecture** : `core/dev/` importe les repositories des features (decisions-log et règle ESLint dans #165)
- 2026-09-13 : **suppression des branches mergées bloquée** par le mode automatique (`git push origin --delete`) : 10 branches des lots 4 et 5 restent sur GitHub, à supprimer par Gaelle ou après autorisation de la commande
- 2026-09-09 (soir) : **lot 5 mergé** — #141 (#35 agrégation des échéances, module pur), #142 (#127 édition d'un animal), #143 (#139 + #140 stores weight et treatments), #138 (règle `Closes #N`), #144 (test vaccins sans dents). En PR : #146 (#50 icône, splash). **En cours : #17 le Carnet** (`CarnetView` remplace `AnimalsView`, sections par feature, `reminders.ts` déménage dans `shared/`, cascade traitements branchée). Tickets créés : #147 (resync `android/` après montée Capacitor)
- 2026-09-09 : **ménage** — 11 tickets fermés à la main (mes PR disaient « Ferme #N », GitHub ne lit que `Closes`), 30 branches distantes et 41 locales mergées supprimées. Restent ouverts volontairement : #90 (`pnpm check` sur la machine de Gaelle), #82 (test Auto Backup sur appareil, règles XML vérifiées), #23 (part « échéance » couverte par #35), #16 (requalifié)
- 2026-09-09 : **bloqués faute de maquette** — #11 (écran de priming) et #12 (permission refusée) ; #22 (notifications des vaccins) attend #11, sinon la popup système apparaîtrait sans explication. Un écran de contenu simple suffit
- 2026-09-09 : **à brancher après #17** — #25 formulaire traitement (et l'extraction du patron champ/label/erreur dans `shared/`, dupliqué entre les deux formulaires), #30 feuille pesée, #31 suivi de poids, #36 accueil (mapping vers `shared/reminders.ts`, icône de ligne selon le type de traitement). #101 doit préserver la photo en édition (note sur le ticket)
- 2026-09-09 : **lot 4 en PR, ordre de merge #132 → #134 → #133 → #136 → #135** — #132 règle « jamais de PR empilée », #134 (#102 cascade de suppression : vaccins + pesées branchés, traitements à brancher d'une ligne après #133), #133 (#24 table `treatment`, fréquence valeur + unité, `next_due_date` stockée), #136 (#20 formulaire vaccin + store `vaccinations` + tokens du patron formulaire dans `_tokens.scss`), #135 (journal des décisions du jour). Mergés plus tôt : #128 maquettes pesée/poids, #129 (#29 table `weight_entry`), #130 (#15 formulaire animal, **re-livré** après l'incident #126), #125 (#103 PRAGMA)
- 2026-09-09 : **incident #126** — PR empilée sur la branche de la maquette, mergée dedans et jamais dans `main` ; détecté par un compte de tests. Règle ajoutée dans `flux-tickets.md`. Réflexe : après chaque série de merges, vérifier `main` (fichier clé, nombre de tests)
- 2026-09-09 : décisions déléguées par Gaelle (« prends des décisions ») et consignées au journal : un store par domaine (question du lot 2 close), fréquence valeur + unité, échéance de vaccin saisie, rattachement à l'animal figé partout, cascade par constructeurs d'instruction, `*.service.spec.ts` exempté de la règle ESLint d'accès aux données
- 2026-09-09 : **dettes à reprendre au ticket #25 (troisième formulaire)** — extraire le patron champ/label/erreur dans `shared/` (dupliqué entre `AnimalFormView` et `VaccinationFormView`, ~150 lignes de SCSS), remonter `todayIsoDate` dans `shared/` (dupliqué faute d'import croisé). **À #33 ou ticket dédié** : masquer la bottom nav sur les écrans poussés (`App.vue`). **À #17** : point d'entrée des formulaires vaccin et #127 (édition animal), retour sur l'animal précis après enregistrement, brancher `getTreatmentsRepository` dans `animal-deletion.service.ts`
- 2026-09-09 : **rien n'a été vérifié visuellement** sur #15 et #20 (extension Chrome absente) : premier point à regarder sur appareil, en particulier `height: 100%` sous `v-main`
- 2026-09-09 : #16 requalifié (chips = liste ; reste le débordement après #36), #21 aligné sur `carnet.md` (deux badges + « Pas de rappel », pas d'« À venir »), #127 créé (édition animal), #90 réécrit (pnpm 11 écarté tant que Dependabot ne le supporte pas ; 10.34.5 ; groupe Capacitor)
- 2026-09-08 (soir) : **lot 3 mergé** — #112 (ticket #110, passe de sobriété des commentaires sur tout `src/` : 33 fichiers, +70/−443, aucune ligne de code touchée, 143 tests avant comme après), #113 (règle d'import croisé assouplie : un **service de cas d'usage** `xxx.service.ts` peut importer les repositories d'autres features pour les orchestrer ; un composant, un store ou un repository, jamais), #114 (`.claude/worktrees` exclu du scan de vitest, ESLint et Prettier)
- 2026-09-08 : **piège d'outillage à retenir** — les worktrees sont des copies du dépôt posées _dans_ le dépôt, donc toute commande lancée depuis la racine ramassait leurs `src/` : 423 tests au lieu de 143, dont 2 faux échecs (les specs d'une copie résolvent `@/` vers le `src/` de la racine). Corrigé par exclusion dans les trois configs ; **sortir les worktrees du dépôt reste l'option durable, non tranchée**, et l'exclusion sera à répéter dans tout outil ajouté plus tard
- 2026-09-08 : **#102 débloqué** — la cascade logique de suppression vivra dans `src/features/animals/animal-deletion.service.ts`, chaque repository enfant recevant un `markDeletedByAnimal()` pour rester le seul à écrire dans sa table. Elle dépend de **#111** (`runMany` dans `DbClient`, créé le même jour) : ordre de traitement **#111 → #102**. Les deux décisions sont au journal
- 2026-09-08 : **lot 2 livré, revu et proposé en PR** — #104 (#19 table `vaccination` + repository), #105 (#100 store Pinia animals), #106 (#33 coquille de navigation), #108 (#34 sélecteur d'animaux en chips), plus #107 pour la documentation des décisions. **L'ordre de numérotation des PR est un ordre de merge valide** : 104 → 105 → 106 → 107 → 108. Seule #108 accroche, sur `fr.json`, une fois #106 fusionnée : deux insertions en tête du même objet (`"nav"` + `"home"` d'un côté, `"animals"` de l'autre), trois lignes, les deux objets sont à garder. Les cinq autres fusions deux à deux passent seules
- 2026-09-08 : quatre décisions tranchées par Gaelle et consignées dans `docs/product/decisions-log.md` — palette de six dégradés d'avatar, cascade logique de la suppression d'un animal vers son carnet (à implémenter dans #16), contrat du store (`load()` ne lève pas, les écritures lèvent), fabrique paresseuse dans le repository appelée depuis `main.ts` comme point de composition
- 2026-09-08 : **questions encore ouvertes** — `update` d'un vaccin accepte `animalId` et déplace donc le vaccin d'un animal à l'autre (#19, à trancher avant la PR) ; le composant `AnimalChipSelector` porte lui-même son décalage à cheval, avec une marge négative qui fusionnerait s'il était le premier enfant de son conteneur (#34) ; `mandatory: true` n'assure pas « un animal toujours actif », seul `'force'` le ferait — le JSDoc du composant est donc faux (#34) ; duplication du 22 entre le TS de la bottom nav et `$padding-bottom-nav` (#33) ; `PRAGMA foreign_keys` activé par le plugin et non par notre code (`sqlite.ts`)
- 2026-09-08 : faiblesse héritée de #14, à corriger dans les deux repositories en même temps hors de ce lot — le test d'idempotence de `remove` ne pose pas de faux timers, les deux appels tombent dans la même milliseconde et retirer `AND deleted_at IS NULL` du `WHERE` ne fait tomber aucun test
- 2026-09-08 : piège de vérification à retenir — un composant de `shared/` que personne n'importe encore n'est compilé ni par `build-only` ni par Vitest (`css: false`) : le vert des commandes ne prouve rien sur son style, il faut un build jetable ou une mesure dans un navigateur
- 2026-09-08 : tickets fermés sans PR parce que déjà couverts — #18 (les 15 tests de `animals.repository.spec.ts` livrés avec #14 couvrent CRUD, suppression logique et contrainte chien/chat) et #13 (12 tests du service notifications livrés avec #10, mock Capacitor inclus ; la part « calcul des dates de rappel » est devenue un critère d'acceptation de #23 et #28, là où la logique vivra)
- 2026-09-08 : #15 allégé, la photo d'animal part dans #101 (3.7, Photo Picker + `files/photos/`). `animal.photo_path` et le champ Zod `photoPath` existent déjà depuis #14 : pas de migration à prévoir
- 2026-09-08 : **question ouverte** — les épics 4, 5 et 6 n'ont aucun ticket de store, contrairement à l'épic 3. À trancher au moment de #17 (le Carnet), premier écran qui affiche vaccins + traitements + poids ensemble : un store par domaine, ou un seul store « carnet de l'animal consulté » ? `auth.store.ts` (#7) et `purchase.store.ts` (#44) sont, eux, déjà couverts
- 2026-09-07 : outillage aligné sur Node 26 (`.nvmrc`, `engines`, CI via `setup-node` qui lit `.nvmrc`), pnpm épinglé par `packageManager`. Ticket #90 quasi clos (reste l'évaluation de pnpm 11) ; #82 Auto Backup quasi clos (reste le test sur appareil)
- Premier lot de tickets livré en PR : #10 service notifications (alarmes inexactes, `POST_NOTIFICATIONS` en contexte), #14 table `animal` + `core/db` (migrations versionnées, suppression logique via `deleted_at`), #70 design system v2 (palette, polices fontsource, icônes Material Symbols SVG, palette système `error` / `warning` / `success` distincte des urgences). Tickets suivants conseillés après le lot 2 : #15 / #16 / #17 écrans animaux, puis #20 à #23 vaccins
- Intégration à ne pas oublier : l'écran de priming (#11) doit appeler `requestPermission()` avant le premier `scheduleReminder()`, sinon le plugin demande la permission tout seul. Le plugin SQLite ajoute `USE_BIOMETRIC` / `USE_FINGERPRINT` au manifest : à retirer ou justifier avant le Play Store
- Points administratifs Play Store reportés par Gaelle (adresse publique, date de création du compte, durées de rétention) : consignés dans `docs/technical/conformite-play-store-rgpd.md` §4, à ressortir à l'épic 11 ou aux tickets #86 / #88, pas avant
