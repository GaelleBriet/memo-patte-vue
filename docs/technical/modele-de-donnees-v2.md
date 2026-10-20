---
tags:
  - perso
  - memo-patte
  - technical
---

# Modèle de données cible — revue globale (choix tranchés le 2026-09-29)

Suivi : cadrage produit. Revue demandée par Gaelle « une fois tous les parcours et toutes les specs
écrits, et non sujet par sujet » (2026-09-28). Sources : les 8 specs
([`docs/product/specs/`](../product/specs/README.md)), l'inventaire du code de `main` au 2026-09-29
(commit 2e71e08, migrations SQLite jusqu'à v8, miroir Supabase), et dans le dépôt
[`proposition-historique-rappels.md`](proposition-historique-rappels.md) §10,
[`proposition-sync.md`](proposition-sync.md), [`export-format.md`](export-format.md).
Les choix marqués **M…** sont à trancher avec Gaelle ; la recommandation est donnée avec sa raison.

## 1. État actuel (v8), en bref

| Table | Rôle | Points qui comptent pour la suite |
| --- | --- | --- |
| `animal` | racine du carnet | `initial_weight_kg` à part des pesées ; pas de suivi / non-suivi |
| `vaccination` | le vaccin (nom) | aucun résumé ; **visible seulement à travers sa dernière injection** (jointure interne) |
| `vaccination_injection` | une injection, avec le rappel choisi ce jour-là (`next_due_date`) | la plus récente est la « tête » ; « Modifier » réécrit la tête |
| `treatment` | le plan : nom, type (vermifuge, antiparasitaire), fréquence, `stopped_on` | **visible seulement à travers sa dernière prise** |
| `treatment_dose` | une prise donnée (`given_on`), la prochaine échéance (`next_due_date`), la fréquence recopiée | pas d'état « oubliée » ; ni échéance couverte ni heure |
| `weight_entry` | une pesée | aucun CHECK en base (plafond dans Zod) |
| `sync_outbox`, `sync_state`, `sync_pull_cursor` | synchro | jamais activée (#83) |

Autour : suppression logique partout (`deleted_at`), aucune contrainte d'unicité (une prise par jour
garantie par le repository seulement), miroir Supabase avec `user_id`, `server_updated_at` et RLS
(écriture si Plus actif, pas de policy de suppression), export JSON v2, réglages de l'appareil dans le
`localStorage` (`memopatte.*`).

## 2. Ce que les specs demandent

| Objet | Besoin | Spec |
| --- | --- | --- |
| Animal | date de naissance approximative ; ne plus suivre (date de retrait) ; départ facultatif (motif, date), sans note libre ; plus de poids initial (→ première pesée) | Animaux AN-1, AN-2, AN-9, AN-10, Q3, Q5 |
| Vaccin | un prochain rappel sans injection (« Prévu ») ; un vaccin visible sans injection | Vaccins VA-1, VA-3, VA-14 |
| Traitement | type « Médicament » ; visible sans prise | Traitements TR-1, TR-26 |
| Période | première prise, date de fin, fréquence, heures, posologie, moment du rappel, arrêt, lien à la précédente ; première échéance d'une période ouverte par « Modifier » jamais avant aujourd'hui | Traitements TR-1 à TR-7, TR-28 à TR-32, Q7 ; Rappels RA-7, RA-8 |
| Prise | échéance couverte (jour et heure), date réelle, donnée, oubliée ou reportée (nouvelle date) | Traitements TR-9, TR-13 à TR-26 |
| Réglages | du carnet : prévenance, heure des vaccins ; de l'appareil : rappels précis, messages fermés, dernier export partagé | Rappels, Accueil, Données, Paramètres PA-4 |
| Compte Plus | date de la dernière synchronisation réussie ; purge 12 mois après la fin de l'accès Plus | Plus et compte PL-17, PL-20 ; Données DO-12 |

## 3. Choix structurants

### M1 — Les périodes d'un traitement

- **Recommandé : une table `treatment_period`** (un traitement, une ou plusieurs périodes). Le traitement
  garde son identité (animal, nom, type) ; la période porte les réglages. Même patron que vaccin et
  injections ; la liste, les rappels, le PDF lisent « le traitement et sa période courante ».
- Écarté : une ligne de traitement par période, reliée à la précédente (`previous_id`) — tout lecteur
  doit remonter la chaîne, et le nom se répète sur chaque ligne.

### M2 — À quoi se rattache une prise

- **Recommandé : à sa période** (`period_id`), en gardant `treatment_id` et `animal_id` pour les requêtes
  et les clés du miroir Supabase (comme aujourd'hui). Les réglages de la prise sont ceux de sa période :
  plus besoin de recopier la fréquence sur chaque prise, ni de « réconciliation des prises à fréquence
  périmée » (un changement de fréquence après des prises ouvre une nouvelle période, TR-28).
- Écarté : rattacher au traitement seul (il faudrait retrouver la période par les dates).

### M3 — L'échéance couverte, la date réelle, l'état

- **Recommandé** : sur la prise, `due_on` (jour de l'échéance) et `due_time` (heure, vide sans heure),
  `given_on` (date réelle, vide pour une oubliée), `status` (`given` ou `missed` ; `postponed` ajouté
  par M4, corrigée le même jour). La clé logique d'une prise est (période, jour, heure) ; l'unicité
  reste garantie par le repository, et deux lignes de la même échéance (deux appareils) se fusionnent à
  l'affichage (TR-25). Pas de contrainte UNIQUE en base : une synchro qui la heurterait bloquerait la
  file.

### M4 — La prochaine échéance et le report

- **Recommandé** : garder `next_due_date` sur la prise (la tête l'emporte, comme aujourd'hui) pour le
  report (TR-9) ; sans prise, la première échéance est la première prise de la période. (Corrigé le
  même jour : pour un traitement, le report est une ligne `postponed`, voir M4 au §5 ; précisé le
  2026-10-01 : une ligne par déplacement, voir §5.)

### M5 — Heures, posologie, moment du rappel

- **Recommandé** : sur la période, `times` (texte, liste d'heures « 08:00,20:00 », vide = sans heure),
  `dose_quantity` (réel) et `dose_unit` (11 valeurs, CHECK), `reminder_offset_minutes` (0, 15, 30, 60 ;
  quand il y a des heures) et `reminder_time` (« 09:00 » ; quand il n'y en a pas). Une table d'heures à
  part est écartée : une liste courte, toujours lue en entier.

### M6 — Vaccin et traitement visibles sans événement

- **Recommandé** : `vaccination.planned_due_date` (prochain rappel tant qu'aucune injection n'existe) ;
  les requêtes passent de la jointure interne sur la tête à une jointure externe. La règle « un parent a
  toujours au moins un événement » disparaît (specs Traitements TR-26, Vaccins VA-14).

### M7 — Animal

- **Recommandé** : `birth_date_approximate` (0 / 1), `unfollowed_on` (vide = suivi), `departure_reason`
  (`death`, `rehomed`, `other`, vide), `departure_date` (vide) ; suppression de `initial_weight_kg`,
  transformé en pesée datée du jour de création. Pas de note libre (spec Animaux Q3) ; à l'écran,
  « Motif » (« Décès », « Chez quelqu'un d'autre », « Autre ») et « Date du départ » (Q5).

### M8 — Réglages

- **Réglages du carnet** (changent les rappels) : l'heure des rappels de vaccins et « Me prévenir avant
  l'échéance » vont dans la base (une table `carnet_settings`, une ligne), synchronisés avec Plus et
  présents dans l'export JSON, pour respecter CLAUDE.md (« les données qui permettent de reprogrammer
  les notifications sont persistées ») : après une restauration ou sur un autre appareil, les rappels se
  reconstruisent comme Sophie les avait réglés. (Décision du 2026-09-29, revue de schéma.)
- **Réglages de l'appareil**, dans le `localStorage`, non synchronisés, non restaurés par la sauvegarde
  d'Android : rappels précis (autorisation propre à l'appareil), accord aux statistiques (consentement
  donné sur l'appareil), unité de poids, messages fermés (bandeau des rappels, carte « protéger ton
  carnet », carte trimestrielle masquée ou « Ne plus me le proposer »), date du dernier export partagé,
  réponse à l'écran d'explication. Les réglages du carnet, eux, sont dans la base : la sauvegarde
  d'Android et l'import les ramènent avec le carnet.

## 4. Conséquences

Contexte (Gaelle, 2026-09-29) : l'app n'est pas publiée, les données des installations de
développement peuvent être effacées. Rien de l'existant n'est à récupérer.

- **Migration : un schéma neuf.** Recommandé : une seule migration (v9) qui supprime toutes les tables
  et crée directement le schéma cible, à la place de v1 à v8 (à vérifier : sur une installation neuve, le
  plugin n'applique qu'elle ; sur une installation v8, elle efface tout). **Pas de reconstruction de
  table par renommage** : la « séquence sûre » de v6 (renommer, recréer, copier, supprimer l'ancienne)
  casse le schéma dès qu'une autre table référence celle qu'on renomme — SQLite réécrit la référence
  vers l'ancien nom (rejoué le 2026-09-29 : « no such table: main.treatment_old » à la première prise).
  À consigner pour les migrations d'après la publication, et à corriger dans
  [`proposition-historique-rappels.md`](proposition-historique-rappels.md) §10.10, qui la présentait comme
  sûre (corrigé le 2026-09-30).
- **Listes appelées à grandir** (`treatment.type`, `dose_unit`) : contrôlées par un déclencheur plutôt
  que par un CHECK, pour qu'ajouter une valeur après la publication ne demande pas de reconstruire la
  table.
- **#447** (heures, moment du rappel) : dans le même schéma (colonnes de M5).
- **Supabase** : vérifier que les miroirs sont vides (la synchro n'a jamais été activée), puis une
  migration qui les supprime et les recrée, avec Gaelle présente ; `treatment_period` avec RLS.
- **Purge à 12 mois** (PL-20, #426) : côté serveur, elle part de la fin du dernier accès Plus
  (`plus_entitlements.expires_at`, qui existe) ; côté app, la date « Ta dernière sauvegarde est
  conservée jusqu'au … » (DO-12) se déduit de la fin d'accès que garde déjà le statut Plus
  (`expiresAt`), plus 12 mois. Comptes créés sans achat (aucune ligne de droit) : point ouvert au lot 9
  (plan de livraison, §4).
- **Synchro** : `treatment_period` dans l'ordre des entités (après `treatment`, avant les prises), dans
  `REMINDER_ENTITIES` (`sync-cycle.ts`), avec port et outbox ; la réconciliation « fréquence périmée »
  disparaît (M2) ; `sync_state` gagne la date de la dernière synchronisation réussie (PL-17).
  Cas simultanés acceptés : une période corrigée sur place pendant qu'un autre appareil y note une
  prise ; une prise notée sur l'ancienne période après le début de la nouvelle (la plus récente gagne,
  ligne par ligne).
- **Suppression d'un animal** : `treatment_period` rejoint la cascade logique
  (`animal-deletion.service.ts`).
- **Export JSON ; l'import n'accepte que le format courant (v3, puis v4 depuis #501)** : un fichier
  plus ancien est refusé avec un message clair. Toutes les données actuelles, installations de Gaelle
  comprises, sont des données de test : aucune conversion (Gaelle, 2026-09-29).
- **Écarts relevés au passage** : [`export-format.md`](export-format.md) parlait de 200 caractères (80
  depuis v8, corrigé le 2026-09-30) ; [`proposition-sync.md`](proposition-sync.md) annonce un bucket en JPEG seul (JPEG et WebP) et un compteur `attempts` jamais
  incrémenté ; Zod compte les emoji autrement que SQLite et Postgres (plus strict, sans risque d'erreur).

### 4.1 Schéma cible (colonnes)

- `animal` : `id`, `name`, `species`, `breed`?, `birth_date`?, `birth_date_approximate` (0 / 1),
  `photo_path`?, `unfollowed_on`?, `departure_reason`?, `departure_date`?, `created_at`, `updated_at`,
  `deleted_at`?.
- `weight_entry` : inchangée.
- `carnet_settings` : une ligne ; `vaccine_reminder_time` (« 09:00 »), `remind_before_due` (0 / 1),
  dates d'audit.
- `vaccination` : `id`, `animal_id`, `name`, `planned_due_date`?, dates d'audit.
- `vaccination_injection` : inchangée (`injected_on`, `next_due_date`?).
- `treatment` : `id`, `animal_id`, `name`, `type` (vermifuge, antiparasitaire, médicament), dates d'audit.
- `treatment_period` : `id`, `treatment_id`, `animal_id`, `starts_on` (date de début de la période :
  pour une période ouverte par « Modifier », le jour du changement, toujours ; les prises déjà notées
  ce jour-là comptent pour les premières heures du nouveau réglage, spec Traitements Q24),
  `first_due_on` (première échéance : la première prise pour une première période ou une reprise, la
  dernière prise plus la nouvelle fréquence pour une période ouverte par « Modifier », jamais avant
  aujourd'hui et modifiable, spec Traitements TR-7, Q7), `reference_on` (origine de la grille, par
  défaut la première échéance, v11 : étude #488 §2.3), `ends_on`? (date de fin),
  `stopped_on`?,
  `frequency_value`, `frequency_unit`, `times`?, `dose_quantity`?, `dose_unit`?,
  `reminder_offset_minutes`?, `reminder_time`?, dates d'audit. Ordre des périodes : `starts_on`, puis
  `created_at` (pas de lien explicite à la précédente).
- `treatment_dose` : `id`, `period_id`, `treatment_id`, `animal_id`, `due_on`, `due_time`?, `given_on`?
  (vide pour une oubliée ou reportée), `status` (`given`, `missed`, `postponed`, et depuis v11 `extra`
  pour une prise en plus, `shift` pour une ligne de décalage : étude #488 §2.6), `next_due_date`, dates
  d'audit. **Dernière prise** : tri par
  `due_on`, `due_time`, `created_at`, `id` (et non plus par `given_on`, vide pour une oubliée). Une
  ligne `postponed` par déplacement (voir §5, 2026-10-01).
- `sync_state` : gagne la date de la dernière synchronisation réussie (PL-17, alerte du nuage après
  7 jours).
- `device` (v11, étude #488 §6) : `id` (tiré au hasard au premier lancement), `model`? (fabricant puis modèle),
  `installed_at`, dates d'audit ; synchronisée avec Plus. Les huit tables synchronisées portent
  `created_by_device` et `updated_by_device` (l'appareil qui a créé la ligne, celui qui a écrit sa
  valeur actuelle).
- Index sur les clés étrangères ; suppression logique partout.


### 4.2 Évolution v12 (moteur des doses v2, décision du 2026-10-10)

Le calendrier devient celui du traitement, pas de la période : `treatment_dose.period_id` reste à
titre d'information (posologie appliquée), `treatment_period.reference_on` devient `grid_origin_on`
(origine de la grille, un seul sens), `treatment_dose.next_due_date` devient `target_on` (arrivée
d'un report, ancrage d'un décalage, vide pour une prise). Règles : spec `traitements.md` §4.8 ;
migration, export v5 et miroir Supabase : `moteur-doses-v2-plan.md` §3. Depuis le 2026-10-13 (pas 10),
seul le moteur v2 lit ces colonnes ; l'ancien moteur, qui relisait `reference_on` et `next_due_date`,
est supprimé.

### 4.3 Évolution v13 (deux faits sur le réglage, #825 et #836)

Décisions de Gaelle du 2026-10-13 (#817) et du 2026-10-14 (#836) : le réglage dit ce que la personne
a fait, le moteur ne le devine pas. `treatment_period` gagne deux colonnes `INTEGER NOT NULL DEFAULT 0`,
`0` ou `1` :

- `first_due_chosen` : la première dose a été **choisie** par la personne (« Prochaine dose » changée,
  création, reprise), pas proposée par l'app. Seule une date choisie, à fréquence gardée, remplace la
  dose du moment (R9) ;
- `past_doses_stay_unlogged` : « les doses passées du réglage précédent restent à renseigner »,
  écrit par la seule réponse « Elles restent à renseigner » à la question Q38 (R10) ; une date choisie
  ne remplace alors pas la dose en retard.

La migration (`src/core/db/migration-v13.ts`) recrée `treatment_period` et `treatment_dose` comme la
v12, sans `DELETE` ni `UPDATE` de premier niveau. Réglages existants : `first_due_chosen = 1` quand
`grid_origin_on` est posée, sinon `0`, ce qui garde la lecture d'avant (toute origine posée valait une
date choisie) ; `past_doses_stay_unlogged = 0`. Miroir Supabase :
`supabase/migrations/20261014090000_sync_mirror_tables_v13.sql`, mêmes colonnes et mêmes valeurs ;
export JSON v6 (`export-format.md`).

### 4.4 Évolution v14 (date d'écriture du réglage, #867)

Décision de Gaelle du 2026-10-16 (#867) : entre le report d'un téléphone et la réécriture du réglage
par l'autre, la plus récente des deux intentions l'emporte ; le report par sa date de modification,
la réécriture par la date d'écriture du réglage. `treatment_period` gagne `settings_written_at`
(`TEXT NOT NULL`, instant ISO 8601), qui avance seulement quand change ce qui fait le calendrier :
début, première échéance, fréquence, heures, origine de la grille et les deux faits de la v13 (depuis
la v15, la réponse à la question des doses tombées n'en fait plus partie, §4.5). L'arrêt,
son « Annuler », la suppression, la date de fin, la posologie et le rappel font bouger `updated_at`,
jamais `settings_written_at` (posologie exclue et valeur des données d'avant = date de création : lectures de l'implémenteur de la v14, à confirmer par Gaelle, spec R10) ; écartée : `updated_at`, qu'un arrêt annulé rendrait plus récent qu'un
report (Milo arrêté puis « Annuler » le 8 perdrait sa dose reportée au 10). Le moteur la lit comme
`Setting.updatedAt` (`viewInputOf`, `src/shared/domain/treatment-reading.ts`).

La migration (`src/core/db/migration-v14.ts`) recrée `treatment_period` et `treatment_dose` comme la
v13, sans `DELETE` ni `UPDATE` de premier niveau. Réglages existants : `settings_written_at` vaut
`created_at`, ce que le moteur lit comme « jamais réécrit » : la lecture d'avant reste. Miroir
Supabase : `supabase/migrations/20261017100000_sync_mirror_treatment_period_settings_written_at.sql`,
même colonne et même valeur ; export JSON v7 (`export-format.md`).

### 4.5 Évolution v15 (réponse à la question des doses tombées, #873)

Décisions de Gaelle du 2026-10-18 (#873, par la session d'analyse du moteur) : le réglage dit ce que
la personne a répondu à la question Q38, et chaque dose qu'elle a déclarée « pas à donner » est une
ligne. `past_doses_stay_unlogged` (booléen) est remplacée par `fallen_doses_answer`
(`TEXT NOT NULL DEFAULT 'unasked'`), à trois états : `unasked` (aucune question posée),
`stay-unlogged` (« Elles restent à renseigner »), `not-due` (« Elles n'étaient pas à donner ») ; la
réponse seule ne fait pas avancer `settings_written_at` (v14). `treatment_dose.status` accepte
`not-due` : « Elles n'étaient pas à donner » écrit une ligne `not-due` par dose que la question a
montrée (jour, heure, réglage, date de modification, appareil), par le même geste ; une réécriture
sans question n'en écrit ni n'en efface. Une ligne `not-due` compte comme une ligne (journée touchée
R4, suppression seule #822) et jamais comme une prise ; sa dose n'existe nulle part. Elle forme sa
propre famille : une prise et une ligne `not-due` de la même échéance coexistent en base, et la
prise l'emporte toujours, la ligne `not-due` étant alors sans effet (décision du 18 octobre 2026). Écartées : déduire la réponse d'un réglage réécrit (une simple « Prochaine dose »
retirait des doses, relecture de #914) ; une date ou une liste de doses sur le réglage (une dose dont
la prise était supprimée plus tard sortait sans avoir été listée, et une seconde réponse remplaçait
la première : relectures de la PR #948, fermée).

La migration (`src/core/db/migration-v15.ts`) recrée `treatment_period` et `treatment_dose` comme la
v14, sans `DELETE` ni `UPDATE` de premier niveau. Réglages existants : `stay-unlogged` quand
`past_doses_stay_unlogged = 1`, sinon `unasked`, jamais `not-due` (le booléen ne distinguait pas cette
réponse d'aucune question : rien n'est retiré après coup) ; aucune ligne `not-due` n'est créée.
Miroir Supabase :
`supabase/migrations/20261018090000_sync_mirror_treatment_period_fallen_doses_answer.sql`, même
colonne, mêmes valeurs, l'ancienne colonne retirée, contrainte d'état des prises élargie à `not-due` ;
export JSON v8 (`export-format.md`).

### 4.6 Évolution v16 (arrivée d'avant et rang d'un report, #939)

Décisions du 19 octobre 2026 de la session d'analyse du moteur (Q1 et Q4, valent comme celles de
Gaelle ; migrations accordées par Gaelle le 16 octobre) : une ligne de report garde ce que la
réécriture sur place (G13, G17) effaçait. `treatment_dose` reçoit `previous_target_on` (`TEXT`) et
`previous_target_time` (`TEXT`), le jour et l'heure de l'arrivée d'avant quand la dose est déplacée de
nouveau, et `due_rank` (`INTEGER`, au moins 1), le rang de son heure dans sa journée d'origine ; nuls
pour toute autre ligne. L'écriture d'un report les pose (`reportFactsOf`,
`src/shared/domain/dose-calendar/report-facts.ts`) : une réécriture vers une autre arrivée garde
l'arrivée qu'elle quitte, et l'heure de la dose ; à la même échéance, le rang est gardé, sinon il se
lit dans les heures du réglage de la ligne. Le moteur lit ces champs ; les règles qui s'en servent
viennent avec la PR #958.

La migration (`src/core/db/migration-v16.ts`) recrée `treatment_dose` comme la v15, sans `DELETE` ni
`UPDATE` de premier niveau. Lignes existantes : arrivée d'avant inconnue ; rang lu dans les heures du
réglage de la ligne au moment de la migration (1 pour un réglage sans heure), sinon vide. Miroir
Supabase : `supabase/migrations/20261019090000_sync_mirror_treatment_dose_report_facts.sql`, mêmes
colonnes, mêmes valeurs ; export JSON v9 (`export-format.md`).

### 4.7 Évolution v17 (date d'écriture de la grille d'un réglage)

Décision 1 du 19 octobre 2026 de la session d'analyse du moteur (vaut comme celle de Gaelle ;
migration accordée) : un report n'entre en conflit qu'avec ce qui fait les échéances, jamais avec les
heures. `treatment_period` reçoit `grid_written_at` (`TEXT`, obligatoire), la dernière écriture de la
première échéance, de la fréquence, de l'origine de la grille ou de la fin ; un changement des
heures, de la posologie, du rappel, du seul fait que la date soit choisie ou de la réponse à la
question des doses tombées ne la change pas, un arrêt ou une suppression non plus. `settings_written_at` garde sa règle (#867).
L'écriture d'une période la pose à sa création, ou reprend celle de la période qu'elle remplace quand
elle en garde la grille : une période hérite si sa grille est celle d'avant son ouverture
(`judgedGrid`, `src/shared/domain/dose-calendar/gestures/changes.ts`). `treatment_period` reçoit
aussi `grid_before` (`TEXT`, JSON, facultatif) : la grille que le moteur lisait juste avant
l'ouverture par « Modifier » (`src/shared/domain/dose-calendar/grid-before.ts`), en suites régulières
`[premier jour, dernier jour ou null]`, triées et disjointes, chacune sur la grille de son premier
jour, avec la fréquence, la fin et la date de grille de la période remplacée ; vide sans période d'avant,
après « Reprendre » ou pour une période écrite avant la colonne. Une correction sur place le jour de
l'ouverture hérite si les jours lus sont ceux de `grid_before`, et pose alors la date gardée dans
`grid_before`, jamais celle d'une période ouverte entre-temps par un autre téléphone, telle quelle
comme le plan la lui donne (`treatment-period-correction.repository.ts`) ; elle ne change pas
`grid_before`. Une valeur illisible ou trop longue (schéma `grid-before.schema.ts`) se lit vide, à
l'import comme à la synchro. Une autre correction sur place
(`treatment-period-correction.repository.ts`) ne la date que si l'une de ces colonnes change. Le moteur
la reçoit (`Setting.gridWrittenAt`) ; la règle qui la compare à la date d'un report vient avec la
PR #958.

La migration (`src/core/db/migration-v17.ts`) recrée `treatment_period` et `treatment_dose` comme la
v16, sans `DELETE` ni `UPDATE` de premier niveau. Réglages existants : `grid_written_at` vaut
`settings_written_at`, la date de la dernière écriture de la grille seule étant inconnue. Miroir
Supabase : `supabase/migrations/20261019100000_sync_mirror_treatment_period_grid_written_at.sql`, mêmes
colonnes, mêmes valeurs, `grid_written_at` écrêtée à 24 h dans le futur comme `settings_written_at`,
`grid_before` sans contrôle (une valeur que l'app lit vide ne doit jamais bloquer la file d'envoi) ; réglages
existants : `grid_before` vide ; export JSON v10 (`export-format.md`).

## 5. Décisions

- 2026-09-29 — **M1 : une table `treatment_period` sous le traitement.** Le traitement garde l'animal,
  le nom et le type ; chaque période porte ses réglages ; les prises se rattachent à leur période ; une
  reprise ou un changement ouvre une nouvelle période sans toucher la précédente. Raison : même patron
  que vaccin et injections ; lecture simple (le traitement et sa période en cours) ; le nom n'est écrit
  qu'une fois ; la recopie de la fréquence et la réconciliation disparaissent. Écartée : une ligne de
  traitement par période chaînée à la précédente (chaîne à remonter, données répétées qui peuvent
  diverger).
- 2026-09-29 — **M2 : une prise se rattache à sa période** (`period_id`), en gardant `treatment_id` et
  `animal_id` pour les recherches et les clés du miroir Supabase ; ses réglages sont ceux de sa période,
  plus de fréquence recopiée ni de réconciliation. Raison : chaque prise sait sous quels réglages elle a
  été donnée. Écartée : au traitement seul, période retrouvée par les dates (fragile aux frontières).
- 2026-09-29 — **M3 : une prise enregistre `due_on` (jour de l'échéance couverte), `due_time` (heure,
  vide sans heure), `given_on` (date réelle, vide pour une oubliée), `status` (`given` / `missed`)** ;
  l'unicité par échéance est garantie par l'app, sans contrainte en base ; deux lignes d'une même
  échéance (deux appareils) se fusionnent à l'affichage, la plus récente l'emporte. Raison : une
  contrainte en base ferait échouer la synchro. Écartée : une contrainte d'unicité en base. (État
  `postponed` ajouté par M4, corrigée le même jour.)
- 2026-09-29 — **M4 : chaque prise garde la prochaine échéance qu'elle fixe** (`next_due_date`, la
  dernière fait foi), comme aujourd'hui ; un report modifie celle de la dernière prise ; sans prise, la
  première échéance est la « première prise le » de la période (la reporter = la corriger). Raison :
  fonctionnement existant et testé, trace de chaque report dans l'historique. Écartée : tout recalculer
  et ranger les reports sur la période.
  **Corrigée le même jour (revue de schéma d'un second agent)** : pour un traitement, un report
  réécrivant la dernière prise effaçait les doses non renseignées d'avant (toute la suite repartait de
  la nouvelle date). Le report devient une ligne de l'historique, état `postponed` (« Reportée au 30
  sept. »), qui couvre l'échéance reportée et fixe la suivante ; les doses d'avant restent non
  renseignées. Pour un vaccin (pas de suite d'échéances), le report modifie toujours le rappel de la
  dernière injection. Écarté : ranger le report sur la période (cas spécial dans chaque calcul, aucune
  trace dans l'historique).
- 2026-09-29 — **M8 : l'heure des rappels de vaccins et « Me prévenir avant l'échéance » sont des
  réglages du carnet**, en base, synchronisés et exportés ; les autres réglages restent sur l'appareil.
  Raison : règle de CLAUDE.md, rappels reconstruits à l'identique partout. Écarté : tout garder sur
  l'appareil (rappels revenus aux valeurs par défaut après une restauration).
- 2026-09-29 — **« Suivre de nouveau » efface `unfollowed_on`, `departure_reason` et `departure_date`.**
  Raison : un animal suivi n'a pas de départ ; les traitements gardent « Arrêté le … ». Écarté : un
  historique des départs (une table de plus pour un cas rare).
- 2026-09-29 — **Import : format v3 seulement** ; toutes les données actuelles sont des données de test
  (Gaelle). **Migration : un schéma neuf** (une v9 qui supprime tout et crée le schéma cible, à la place
  de v1 à v8) — recommandation de la revue, dans le cadre donné par Gaelle (données effaçables).
- 2026-09-29 — **M5 : sur la période, `times` (liste d'heures dans un champ, vide sans heure),
  `dose_quantity` et `dose_unit` (11 valeurs contrôlées par la base), `reminder_offset_minutes` (0, 15,
  30, 60, avec des heures) et `reminder_time` (heure fixe, sans heure).** Raison : simple à lire, à
  synchroniser et à exporter. Écartée : une table séparée pour les heures (une table de plus pour deux
  heures au plus).
- 2026-09-29 — **M6 : la règle « un parent a toujours au moins un événement » est levée.** Le vaccin
  porte `planned_due_date` (rappel prévu, utilisé tant qu'il n'a aucune injection) ; un traitement sans
  prise tire sa première échéance de sa période ; les requêtes passent de la jointure interne sur la tête
  à une jointure externe. Raison : chaque information là où elle a du sens ; « rien encore de fait » ne
  ressemble jamais à « quelque chose de fait ». Écartée : une fausse injection « prévue » (à filtrer
  partout ; un oubli de filtre ferait mentir le carnet, principe 1).
- 2026-09-29 — **M7 : l'animal gagne `birth_date_approximate`, `unfollowed_on` (date du geste « Ne plus
  suivre », vide = suivi), `departure_reason` (`death`, `rehomed`, `other`, facultatif) et
  `departure_date` (facultative, distincte du geste) ; `initial_weight_kg` disparaît**, converti en pesée
  datée du jour de création. Raison : la date du geste sert au fonctionnement, la date du départ est un
  souvenir facultatif. Écartée : une seule date (fausse dès que le geste n'a pas lieu le jour même).

- 2026-10-01 — **Ligne de déplacement d'une dose** (spec Traitements Q17, Q18, Q21). Une ligne
  `postponed` porte l'échéance d'origine (`due_on`, `due_time`) et la nouvelle date
  (`next_due_date`), plus tard ou plus tôt que l'échéance (« Reportée », « Avancée »). Déplacer de
  nouveau la même dose réécrit cette ligne (même échéance d'origine, nouvelle date) au lieu d'en
  ajouter une ; remise à sa date d'origine, la ligne est supprimée. À plusieurs heures, une seule
  ligne par journée déplacée : elle porte la première heure du jour encore sans prise. Raison et
  alternatives écartées : spec Traitements, Q18 et Q21.

## 6. Questions ouvertes

Aucune : M1 à M8 tranchés le 2026-09-29 (M8 : réglages du carnet en base, ceux de l'appareil sur
l'appareil). Comptes créés sans achat et purge : lot 9 du plan.
