# Proposition — historique des vaccins et des traitements (modèle de données)

Statut : **tranchée le 2026-09-24, voir §10.** Document de comparaison préparé le 2026-09-23 après
la séance sur le cycle de vie d'un rappel (#364, #344, #365). Les §3 et §4 comparent les deux
approches de départ. La décision retenue est une troisième voie, proposée par une relecture du
document (Fable) et validée par Gaelle : la structure de l'approche 1 sans son résumé stocké. Les
extraits SQL des §3.1, §3.3 et §4.2 ont été rejoués sur une base SQLite en mémoire.

Déjà décidé en séance, non rediscuté ici : historique complet sans limite de durée (vaccins,
vermifuges, antiparasitaires) ; le PDF regroupe les prises répétées d'un traitement, le JSON garde
chaque prise ; « fait » se marque depuis « À faire », le Carnet et la notification ; noter un
vaccin fait, c'est donner la date d'injection (aujourd'hui ou passée) puis le prochain rappel par
« Dans 1 an · Dans 3 ans · Autre date · Pas de rappel », rien de présélectionné ; noter un
traitement fait, c'est ajouter une prise, l'échéance suivante étant recalculée depuis la date
réelle ; feuille d'un rappel : « Fait aujourd'hui », « Fait à une autre date », « Modifier » (qui
sert aussi à reporter), « Arrêter ce traitement ».

Déjà acté avant, et que les deux approches doivent respecter : suppression logique par `deleted_at`,
cascade par constructeurs d'instruction joués dans un `runMany` (2026-09-09), rattachement à
l'animal figé (2026-09-09), `next_due_date` d'un traitement stockée (2026-09-09), échéance importée
jamais recalculée (2026-09-16), « la ligne entière la plus récente gagne » (2026-09-19), un
repository seul écrivain de sa table (CLAUDE.md).

Exemples suivis tout au long du document (identifiants abrégés) :

- **Boree**, vaccin **Carré** : aujourd'hui une ligne `vaccination`, dernière injection le
  2025-09-25, échéance le 2026-09-25. Le 2026-09-25, Gaelle note « Fait aujourd'hui · Dans 3 ans »
  (échéance 2029-09-25). Plus tard, elle recopie le carnet papier : une injection du 2024-09-20.
- **Milo**, **Bravecto** tous les 3 mois : dernière prise le 2026-07-08, prochaine le 2026-10-08.
  Prise notée le 2026-10-10 (prochaine le 2027-01-10), traitement arrêté le 2027-03-01.

## 0. L'essentiel

1. **Le choix ne porte que sur les vaccins.** Les traitements (table `treatment_dose`, colonne
   `stopped_on`), l'interface (feuille « Fait », historique, action de notification) et le passage
   de l'export en version 2 sont identiques dans les deux approches (§2). C'est une grosse part du
   travail, et elle ne dépend pas du choix.
2. **L'approche 1 ajoute, l'approche 2 change le sens d'une ligne.** Avec l'approche 1, une ligne
   `vaccination` reste « le vaccin suivi » : les lecteurs actuels de la table (§1.2) continuent de
   fonctionner tels quels, l'historique est du code neuf. Avec l'approche 2, une ligne devient
   « une injection » : chaque lecteur doit choisir entre « la dernière de chaque vaccin » et
   « toutes ». Se tromper remplit « À faire » de fausses injections en retard, ou fait perdre
   l'historique à l'export sans bruit.
3. **L'approche 2 vaut ce que vaut sa colonne de lien.** Avec `renewed_at` seul, rien ne relie une
   injection à la suivante : regroupement par le nom, vaccin en double après deux « fait »
   simultanés, notification périmée sans issue (§4.1). Avec un `series_id` et une tête calculée par
   date, ces défauts disparaissent, et l'approche 2 devient « l'approche 1 sans table parent ». La
   vraie question devient alors : **le nom (et demain le produit, #283) appartient-il au vaccin
   suivi ou à chaque injection ?**
4. **Les deux approches ont le même point faible en synchro** : un état résumé, stocké sur une autre
   ligne que le fait qui le justifie (le cache du vaccin dans l'approche 1, le drapeau `renewed_at`
   dans l'approche 2 variante a, le cache du traitement dans les deux), peut être écrasé par « la
   plus récente gagne » (§6).
5. **Le moment est le moins cher possible** : aucune version publiée sur le Play Store, tables
   Supabase vides en production (aucun appareil n'active la synchro avant #83). Chacune des deux
   approches peut ensuite être convertie en l'autre par une migration (§3.7, §4.8), sauf l'approche
   2 en variante `renewed_at` seul.

## 1. Point de départ

### 1.1 Le modèle actuel (migrations v2 et v4)

```sql
CREATE TABLE vaccination (
  id TEXT PRIMARY KEY NOT NULL,
  animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  last_injection_date TEXT NOT NULL,   -- yyyy-MM-dd
  due_date TEXT,                       -- NULL : « Pas de rappel »
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE treatment (
  id TEXT PRIMARY KEY NOT NULL,
  animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('deworming', 'antiparasitic')),
  frequency_value INTEGER NOT NULL, frequency_unit TEXT NOT NULL,
  last_dose_date TEXT NOT NULL,
  next_due_date TEXT NOT NULL,         -- calculée par le repository à chaque écriture
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
```

Une ligne `vaccination` porte **à la fois** le vaccin et sa dernière injection ; une ligne `treatment`
porte le plan (nom, type, fréquence) et sa dernière prise. Rien ne garde les injections ni les prises
précédentes, et rien ne permet de noter « fait » (#364) : refaire un vaccin crée une deuxième ligne,
l'ancienne reste « en retard » et continue de sonner.

### 1.2 Qui lit ces tables aujourd'hui

C'est la liste à reprendre pour mesurer l'impact de chaque approche.

| Lecteur                                  | Fichier                                                              | Lit                                                    |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ |
| Reconstruction des rappels               | `src/app/reminders-sync.ts`                                          | `listAll()` des deux tables                            |
| Rappels après une écriture               | `vaccination-reminders.service.ts`, `treatment-reminders.service.ts` | la ligne écrite                                        |
| Écran d'explication des rappels          | `src/app/reminders-priming.ts`                                       | `listAll()`, échéances à venir                         |
| « À faire » de l'accueil                 | `features/home/service/home-reminders.service.ts`                    | `listAll()`                                            |
| Carnet (sections, bandeau de stats)      | `VaccinationsSection.vue`, `TreatmentsSection.vue` via les stores    | `listByAnimal()`                                       |
| Suppression d'un animal                  | `features/animals/service/animal-deletion.service.ts`                | `listByAnimal()`, `markDeletedByAnimalStatement`       |
| Export JSON / CSV, tableau `reminders[]` | `data-export.service.ts`, `export-format.ts`                         | `listAll()`                                            |
| PDF                                      | `pdf-content.ts`, `render-carnet-pdf.ts`                             | données d'export                                       |
| Import                                   | `data-import.service.ts`, `shared/domain/import-plan.ts`             | `listVersions()`, `restoreStatement`                   |
| Synchro                                  | les repositories (port `SyncableTable`)                              | `getRowForPush`, `pullPage`, `applyRemoteRowStatement` |
| Fixtures de dev                          | `core/dev/demo-carnet.ts`, `core/dev/fixtures.ts`                    | `create()`                                             |

## 2. Ce qui est commun aux deux approches

### 2.1 Traitements : une table de prises et une date d'arrêt

Les deux approches traitent les traitements de la même façon : `treatment` devient « le plan », ses
colonnes `last_dose_date` et `next_due_date` restent, tenues à jour à chaque prise notée.

```sql
-- migration v6 (extrait traitements)
CREATE TABLE IF NOT EXISTS treatment_dose (
  id TEXT PRIMARY KEY NOT NULL,
  treatment_id TEXT NOT NULL REFERENCES treatment(id) ON DELETE CASCADE,
  animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
  given_on TEXT NOT NULL,              -- yyyy-MM-dd
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_treatment_dose_treatment ON treatment_dose (treatment_id, given_on);
CREATE INDEX IF NOT EXISTS idx_treatment_dose_animal_id ON treatment_dose (animal_id);
ALTER TABLE treatment ADD COLUMN stopped_on TEXT;   -- yyyy-MM-dd, NULL tant qu'il est en cours
-- triggers d'outbox de treatment_dose (outboxTriggerStatements), créés AVANT la copie
INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, created_at, updated_at, deleted_at)
SELECT id, id, animal_id, last_dose_date, created_at, updated_at, deleted_at FROM treatment;
```

- **`animal_id` redondant, volontairement** : la cascade d'un animal reste une instruction par table
  (`markDeletedByAnimalStatement`), et `import-plan.ts` a besoin de l'animal de chaque entrée pour
  ses deux règles (rattachement figé, retour avec l'animal). Invariant : même animal que le plan,
  garanti par le rattachement figé.
- **Migration sans perte** : chaque traitement existant donne exactement une prise, tombstones
  compris et avec leur `deleted_at`, pour que la règle « revient avec son animal » tienne. Rien n'est
  retiré de `treatment`. Les triggers d'outbox sont créés avant la copie, pour que les prises
  copiées partent à la synchro sur un appareil déjà abonné.
- **Identifiant de la prise migrée = identifiant du traitement.** Un UUID tiré au hasard ferait
  créer à deux appareils deux prises différentes pour la même prise ; après synchro, l'historique
  montrerait un doublon. Le même raisonnement vaut pour l'import d'un fichier v1 (§2.4). Un UUID v5
  dérivé de l'identifiant du parent est l'alternative, au prix d'une dépendance.

Écriture d'une prise (Milo, le 2026-10-10), une transaction :

```sql
INSERT INTO treatment_dose (id, treatment_id, animal_id, given_on, created_at, updated_at, deleted_at)
VALUES (:doseId, 'bravecto', 'milo', '2026-10-10', :now, :now, NULL);
UPDATE treatment
SET last_dose_date = '2026-10-10', next_due_date = '2027-01-10', updated_at = :now
WHERE id = 'bravecto' AND deleted_at IS NULL AND last_dose_date <= '2026-10-10';
```

La garde `last_dose_date <= :date` laisse le résumé intact quand on note une prise plus ancienne que
la dernière connue. `next_due_date` est calculée en JS par `addFrequency`, comme aujourd'hui. Deux
tables, donc deux repositories : `treatment-doses.repository.ts` fournit son instruction,
`treatments.repository.ts` joue le `runMany`, un `xxx.service.ts` de `features/treatments`
orchestre — le patron de la cascade (2026-09-09). **Ce mécanisme est à construire dans les deux
approches** : l'approche 2 l'économise pour les vaccins, pas pour les traitements.

### 2.2 Cycle de vie d'un traitement

| Action                              | Écritures                                                                                           | Rappels                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Fait aujourd'hui / à une autre date | prise + résumé du plan (ci-dessus)                                                                  | `reschedule(treatment)`, même clé             |
| Prise plus ancienne que la dernière | prise seule (la garde refuse la mise à jour)                                                        | inchangés                                     |
| Modifier (nom, type, fréquence)     | `UPDATE treatment`, `next_due_date` recalculée                                                      | `reschedule`                                  |
| Reporter                            | **à trancher** (§8.3) : l'échéance est calculée, jamais saisie (2026-09-09)                         | —                                             |
| Arrêter ce traitement               | `stopped_on = aujourd'hui` ; l'historique reste ; partie « Traitements terminés » du Carnet         | `cancel(id)` ; `treatmentReminders` rend `[]` |
| Reprendre un traitement arrêté      | `stopped_on = NULL` ; l'échéance stockée date de la dernière prise, donc probablement passée (§8.3) | `reschedule`                                  |
| Supprimer une prise                 | tombstone de la prise ; si c'était la dernière, résumé recalculé depuis la précédente               | `reschedule`                                  |
| Supprimer la seule prise            | **à trancher** : `last_dose_date` est `NOT NULL`                                                    | —                                             |
| Supprimer le traitement             | plan + prises, même `deleted_at`                                                                    | `cancel(id)`                                  |
| Supprimer l'animal                  | `getTreatmentDosesRepository` ajouté à la liste `records` d'`animal-deletion.service.ts`            | inchangés                                     |

« Arrêter » introduit un filtre « en cours » que plusieurs lecteurs actuels devront appliquer :
`home-reminders.service.ts` (« À faire »), `reminders-priming.ts` (`treatments.some(isActive)`), le
bandeau « Traitements en cours » du Carnet, le PDF. **La discipline « actif ou tout » arrive donc de
toute façon pour les traitements**, quelle que soit l'approche retenue pour les vaccins.

### 2.3 Rappels des traitements

Mécanisme inchangé : `treatmentReminders` programme les échéances depuis `nextDueDate` et la
fréquence, sous le plafond des 400 rappels ; une prise notée avance `nextDueDate`, ce qui relance le
cycle depuis la date réelle (décision 5 de la séance). Seul ajout : un traitement arrêté ne programme
rien. Après restauration, `syncAllReminders` lit `listAll()`, qui garde son sens. Clé de notification
inchangée (`treatment:<id>:<échéance>:<moment>`) : « C'est fait » sur une relance à J+3 d'une
échéance déjà notée se repère en comparant l'échéance de la clé à `nextDueDate` (comportement à
définir, §8.3).

### 2.4 Export, import, PDF, CSV

- **`schemaVersion` passe à 2 dans les deux approches.** `stoppedOn` change le sens d'un traitement :
  une version antérieure de l'app qui importerait le fichier ignorerait ce champ inconnu et ferait
  sonner à nouveau un traitement arrêté. Le refus « Cet export vient d'une version plus récente »
  existe déjà et la protège.
- **Import d'un fichier v1** : `parseExportFile` valide aujourd'hui `z.literal(EXPORT_SCHEMA_VERSION)`,
  donc un fichier v1 serait refusé comme « pas un export MémoPatte » dès le passage à 2. Il faut un
  adaptateur v1 → v2 : une prise par traitement (`id` = celui du traitement, `givenOn` =
  `lastDoseDate`, horodatages du traitement), `stoppedOn = null`. Même identifiant déterministe qu'à
  la migration : importer deux fois le même fichier en fusion ne duplique rien.
- **JSON** : `treatments[].stoppedOn` (`AAAA-MM-JJ` | `null`) et
  `treatmentDoses[] { id, treatmentId, animalId, givenOn, createdAt, updatedAt }`. `reminders[]`
  exclut les traitements arrêtés.
- **Import** : `treatmentDoses` rejoint `LocalCarnet`, `ENTRY_TABLES` (rattachement figé) et
  `planEntries` ; nouvelle règle de refus : une prise dont le `treatmentId` n'est pas dans le fichier,
  ou dont l'animal diffère de celui de son traitement. La règle « revient avec son animal » gagne un
  étage : les prises supprimées avec leur traitement (même `deletedAt`) reviennent avec lui.
- **PDF** : une ligne par traitement, prises regroupées (« Bravecto · antiparasitaire · tous les 3
  mois — 4 prises du 05/01/2026 au 10/10/2026 · prochaine le 10/01/2027 »), « Arrêté le … » pour les
  traitements terminés. La règle exacte de regroupement (dates listées sous un seuil ? prises
  irrégulières ?) reste à écrire, dans les deux cas.
- **CSV** : `traitements.csv` gagne `stoppedOn` ; nouveau `prises-traitements.csv`
  (`id;treatmentId;animalId;animalName;treatmentName;givenOn`).

### 2.5 Synchro des prises

Miroir Postgres `public.treatment_dose` (même forme qu'au §3.6), trigger `clamp_sync_timestamps`, RLS
(trois policies), index `(user_id, server_updated_at)`. Le nouveau repository implémente le port
`SyncableTable` (cinq membres, copie du patron existant). Ordre du push et du pull, imposé par les
clés étrangères : `ENTITY_ORDER` de `sync-outbox.repository.ts` et la liste `tables` de
`src/app/sync.ts` placent `treatment_dose` après `treatment`. L'amorçage #83 ajoute la table à son
`INSERT INTO sync_outbox SELECT …`. `REMINDER_ENTITIES` de `sync-cycle.ts` ne change pas : une prise
ne sonne pas, c'est le plan (résumé) qui porte l'échéance.

### 2.6 Interface

Identique dans les deux approches : lignes du Carnet et de « À faire » cliquables, feuille « Fait »
(date + raccourcis pour un vaccin, date pour un traitement), historique d'un vaccin et d'un
traitement, partie « Traitements terminés », action « C'est fait » dans la notification (types
d'action du plugin, écoute de l'action au démarrage de l'app, à vérifier sur appareil app fermée —
point 3 de la séance), textes FR/EN, maquette Claude Design (critère de #364). Seules les requêtes
qui alimentent ces écrans diffèrent.

## 3. Approche 1 — deux tables d'historique

`vaccination` devient « le vaccin suivi » : nom, animal, et un résumé (`last_injection_date`,
`due_date`) tenu à jour à chaque « fait ». Une nouvelle table garde une ligne par injection, avec le
rappel choisi ce jour-là.

### 3.1 Schéma SQLite et migration

```sql
-- migration v6 (extrait vaccins)
CREATE TABLE IF NOT EXISTS vaccination_injection (
  id TEXT PRIMARY KEY NOT NULL,
  vaccination_id TEXT NOT NULL REFERENCES vaccination(id) ON DELETE CASCADE,
  animal_id TEXT NOT NULL REFERENCES animal(id) ON DELETE CASCADE,
  injected_on TEXT NOT NULL,           -- yyyy-MM-dd
  next_due_date TEXT,                  -- rappel choisi ce jour-là ; NULL : « Pas de rappel »
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vaccination_injection_vaccination
  ON vaccination_injection (vaccination_id, injected_on);
CREATE INDEX IF NOT EXISTS idx_vaccination_injection_animal_id ON vaccination_injection (animal_id);
-- triggers d'outbox de vaccination_injection, créés AVANT la copie
INSERT INTO vaccination_injection
  (id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at)
SELECT id, id, animal_id, last_injection_date, due_date, created_at, updated_at, deleted_at
FROM vaccination;
```

`vaccination` ne change pas. Pour Boree, la ligne Carré reste telle quelle et gagne une injection de
même identifiant (2025-09-25, rappel 2026-09-25). Aucune injection antérieure n'est inventée : elles
n'ont jamais été saisies. Même justification que §2.1 pour `animal_id` et pour l'identifiant
déterministe.

Le sens des colonnes se précise : `vaccination.due_date` est **l'échéance qui sonne**, modifiable par
« Modifier » ; `vaccination_injection.next_due_date` est **ce qui avait été décidé ce jour-là**,
une donnée d'historique qui ne sonne jamais.

### 3.2 Identité du vaccin

- **Qui est « le Carré de Boree »** : une ligne `vaccination`, dont l'identifiant ne change jamais.
  Routes, clés de notification (`vaccination:<id>:…`) et PDF s'y réfèrent.
- **Renommer** : un `UPDATE` sur cette ligne ; tout l'historique affiche le nouveau nom, les
  injections n'en portent pas. Garder le nom écrit à l'époque demanderait une colonne `name` sur
  l'injection.
- **Supprimer le vaccin** : la ligne et ses injections, avec le même `deleted_at` (constructeurs
  d'instruction, un `runMany`).
- **Corriger une injection** (date, rappel choisi) : `UPDATE` de l'injection ; si c'est la plus
  récente, le résumé est recalculé dans la même transaction.
- **Injection saisie par erreur** : tombstone de l'injection, résumé recalculé depuis la précédente.
  Pour Boree, supprimer l'injection du 2026-09-25 ramène l'échéance au 2026-09-25, passée dès le
  lendemain — ce qui est vrai si l'injection n'a pas eu lieu. Supprimer la **seule** injection reste
  à trancher : `last_injection_date` est `NOT NULL`, donc supprimer aussi le vaccin, ou l'interdire
  (§8.3).
- **Carnet** : `listByAnimal()` inchangé, une ligne par vaccin ; l'historique se charge au tap
  (`listByVaccination(id)`, trié par `injected_on`).
- **#283 (liste de vaccins)** : `product_code` va sur `vaccination`, exactement comme l'étude
  (§9.1 de `etude-vaccination.md`) l'a écrit pour la table actuelle. Si le vétérinaire change de
  produit entre deux injections (l'étude §2.3 montre que la périodicité dépend du produit
  commercial), il faut soit un nouveau vaccin suivi, soit un `product_code` aussi sur l'injection.

### 3.3 Cycle de vie

| Action                                                 | Écritures (une transaction)                                            | Rappels                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------- |
| Ajouter un vaccin                                      | `vaccination` + première injection                                     | `reschedule(vaccination)` |
| Fait aujourd'hui / à une autre date                    | injection + résumé (garde sur la date, ci-dessous)                     | `reschedule`, même clé    |
| Fait à une date antérieure (carnet papier, 2024-09-20) | injection seule : la garde refuse la mise à jour du résumé             | inchangés                 |
| Modifier / reporter                                    | `vaccination.due_date` ; l'injection garde le rappel choisi ce jour-là | `reschedule`              |
| Renommer                                               | `vaccination.name`                                                     | `reschedule` (texte)      |
| Corriger une injection                                 | injection (+ résumé si c'est la dernière)                              | selon le résumé           |
| Supprimer une injection                                | tombstone + résumé recalculé                                           | `reschedule`              |
| Supprimer le vaccin                                    | vaccin + injections, même `deleted_at`                                 | `cancel(id)`              |
| Supprimer l'animal                                     | `getVaccinationInjectionsRepository` ajouté à `records`                | inchangés                 |

« Fait » pour Boree, le 2026-09-25, « Dans 3 ans » :

```sql
INSERT INTO vaccination_injection
  (id, vaccination_id, animal_id, injected_on, next_due_date, created_at, updated_at, deleted_at)
VALUES (:injectionId, 'carre', 'boree', '2026-09-25', '2029-09-25', :now, :now, NULL);
UPDATE vaccination
SET last_injection_date = '2026-09-25', due_date = '2029-09-25', updated_at = :now
WHERE id = 'carre' AND deleted_at IS NULL AND last_injection_date <= '2026-09-25';
```

La même paire, avec 2024-09-20, laisse le résumé intact (0 ligne modifiée, vérifié). Code :
`vaccination-injections.repository.ts` (nouveau, seul écrivain de sa table), un
`recordInjectionStatement` sur `vaccinations.repository.ts`, un service
`features/vaccinations/service/…service.ts` qui orchestre — le même patron qu'au §2.1, réutilisé.
Le formulaire actuel (`VaccinationFormView.vue`, nom + date + échéance) se scinde : création = vaccin
et première injection ; « Modifier » = nom et échéance ; la date d'injection passe par la feuille
« Fait » ou la correction d'une injection.

**Quatre chemins d'écriture tiennent le résumé à jour** (fait, fait antérieur, correction,
suppression). Chacun doit le faire dans la même transaction, et chacun mérite son test : un résumé
faux fait sonner le vaccin à la mauvaise date, sans aucun signal.

### 3.4 Rappels et notifications

- **Ce qui génère un rappel** : `vaccination.due_date` non nulle, vaccin et animal non supprimés —
  exactement la règle actuelle (`vaccinationReminders`). Une injection ne sonne jamais.
- **Ce qui l'arrête** : « Fait » avec « Pas de rappel » (`due_date = NULL`) ; « Fait » avec une
  nouvelle date, qui remplace les rappels de la même clé (`replaceDueReminders` annule le préfixe
  `vaccination:<id>:` et reprogramme) ; suppression du vaccin ou de l'animal.
- **Après restauration** : `syncAllReminders` lit `listAll()`, qui garde son sens. Rien à changer.
- **Notification « C'est fait »** : elle ouvre la feuille « Fait » d'un identifiant qui ne change
  jamais. Une notification périmée (le Carré déjà noté depuis l'autre téléphone) se reconnaît à
  l'échéance de sa clé, différente de `due_date`.

### 3.5 Export, import, PDF, CSV

- **JSON v2** : `vaccinations[]` inchangé (il dit l'état courant, lisible sans l'historique) ;
  nouveau `vaccinationInjections[]`, champs `id`, `vaccinationId`, `animalId`, `injectedOn`,
  `nextDueDate`, `createdAt`, `updatedAt`. `reminders[]` inchangé.
- **Fichier v1** : l'adaptateur crée une injection par vaccin (`id` = celui du vaccin).
- **Validation** : une injection dont le `vaccinationId` n'est pas dans le fichier, ou dont l'animal
  diffère de celui de son vaccin, fait refuser le fichier (comme un `animalId` orphelin aujourd'hui).
- **Fusion par `updatedAt`** : ligne par ligne. Deux exports de deux téléphones fusionnés
  additionnent leurs injections ; le résumé du vaccin, lui, suit la version la plus récente de la
  ligne `vaccination` (risque du §6). La règle « revient avec son parent » gagne un étage : injections
  supprimées avec leur vaccin.
- **PDF** : une ligne par vaccin (nom, échéance, état), puis ses dates d'injection. Regroupement par
  `vaccinationId`, sans ambiguïté.
- **CSV** : `vaccins.csv` inchangé ; nouveau `injections-vaccins.csv`
  (`id;vaccinationId;animalId;animalName;vaccinationName;injectedOn;nextDueDate`).

### 3.6 Synchro

```sql
create table public.vaccination_injection (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  vaccination_id uuid not null,
  animal_id uuid not null,
  injected_on date not null,
  next_due_date date,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, vaccination_id) references public.vaccination (user_id, id) on delete cascade,
  foreign key (user_id, animal_id) references public.animal (user_id, id) on delete cascade
);
create index on public.vaccination_injection (user_id, server_updated_at);
-- + trigger vaccination_injection_clamp_sync_timestamps, RLS : select / insert / update
```

Nouveau port `SyncableTable` sur le repository des injections ; ordre `animal`, `vaccination`,
`vaccination_injection`, `treatment`, `treatment_dose`, `weight_entry` (push et pull) ;
`REMINDER_ENTITIES` inchangé, puisque c'est la ligne `vaccination` qui porte l'échéance. Conflits
entre deux appareils : §6.

### 3.7 Coût et réversibilité

- **Couche données des vaccins**, ordre de grandeur : 4 fichiers nouveaux (schéma de l'injection,
  repository avec son port, service, migration Supabase) et une quinzaine modifiés
  (`migrations.ts`, `vaccinations.repository.ts`, store, formulaire et sa logique, section du
  Carnet, `animal-deletion.service.ts`, `carnet-data.ts`, `export-format.ts`, `data-export.service.ts`,
  `data-import.service.ts`, `import-plan.ts`, `pdf-content.ts`, `render-carnet-pdf.ts`,
  `sync-outbox.repository.ts`, `app/sync.ts`, fixtures, `export-format.md`), tests en plus.
- **Ticket propre à l'approche** : « table des injections, service d'injection, migration des
  vaccins existants », qui s'ajoute aux tickets communs (§7).
- **Risques** : cohérence du résumé sur quatre chemins d'écriture ; résumé écrasé en synchro (§6) ;
  une table, un port et trois policies de plus à maintenir.
- **Réversibilité vers l'approche 2** : chaque injection devient une ligne `vaccination` (nom du
  vaccin, `series_id` = identifiant du vaccin, tête = la plus récente). Mécanique, sans perte.

## 4. Approche 2 — une nouvelle ligne `vaccination` par injection

« Fait » crée une nouvelle ligne `vaccination` ; l'ancienne cesse de sonner. La table actuelle est
déjà, à un détail près, une table d'injections : une ligne a un nom, une date d'injection et le
rappel choisi ce jour-là. Il lui manque le lien entre deux injections successives du même vaccin.

### 4.1 La colonne de lien : trois variantes

| Variante                            | Qui sonne                                              | Carnet et PDF regroupent…            | Deux « fait » simultanés                                 | Notification périmée                 | Retour vers l'approche 1        |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------ | -------------------------------------------------------- | ------------------------------------ | ------------------------------- |
| **a.** `renewed_at` seul            | `renewed_at IS NULL`                                   | par le nom (casse, faute, renommage) | deux lignes actives : Carré deux fois, rappels en double | aucune trace de l'injection suivante | en devinant les groupes par nom |
| **b.** `superseded_by` (id suivant) | `superseded_by IS NULL`                                | en remontant la chaîne               | fourche : l'ancienne ne pointe que vers une des deux     | on suit la chaîne                    | mécanique                       |
| **c.** `series_id` + tête calculée  | la plus récente de la série (date, `created_at`, `id`) | `series_id`                          | une seule tête, un doublon dans l'historique             | `series_id` mène à la tête           | mécanique                       |

- **b, piège de synchro** : déclarée en clé étrangère, `superseded_by` bloque la synchro. Les
  `foreign_keys` sont actives (`sqlite.ts`) ; une page de pull qui applique l'ancienne ligne (qui
  pointe vers la nouvelle) avant la nouvelle échoue en entier (« FOREIGN KEY constraint failed »,
  vérifié). Au push, les deux lignes ont le même `queued_at` dans la file locale : leur ordre
  d'envoi n'est pas garanti, et Postgres refuserait l'ancienne si elle partait la première. Sans clé
  déclarée, rien ne protège d'une référence cassée.
- **c avec un drapeau explicite** (`series_id` + `renewed_at`) reprend le défaut de a en cas de
  conflit : le drapeau est un état stocké que « la plus récente gagne » peut effacer (§6).

Pour comparer au plus juste, la suite décrit **la variante c**, la plus solide, et signale où la
variante a change la réponse.

### 4.2 Schéma SQLite et migration

```sql
-- migration v6 (extrait vaccins)
ALTER TABLE vaccination ADD COLUMN series_id TEXT;
UPDATE vaccination SET series_id = id;
CREATE INDEX IF NOT EXISTS idx_vaccination_series ON vaccination (series_id, last_injection_date);
```

- **SQLite refuse `ADD COLUMN … NOT NULL` sans valeur par défaut** (« Cannot add a NOT NULL column
  with default value NULL », vérifié). Deux options : colonne nullable, que le repository, l'import
  et le pull remplissent toujours ; ou reconstruction de la table (création, copie, suppression,
  renommage, index et deux triggers d'outbox recréés).
- **Migration sans perte** : chaque ligne devient la tête de sa propre série. Rien d'autre ne bouge ;
  le Carré de Boree reste une ligne.
- **Nom de colonne trompeur** : `last_injection_date` devient « la date de cette injection ». Le
  renommer touche SQLite, Postgres, l'export (`lastInjectionDate`) et le CSV ; le garder oblige à
  le documenter.

La tête d'une série (vérifié : deux « fait » le même jour, la ligne créée en dernier est la tête ;
une injection antérieure ajoutée après coup ne l'est pas) :

```sql
SELECT v.* FROM vaccination v
WHERE v.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM vaccination n
    WHERE n.series_id = v.series_id AND n.deleted_at IS NULL
      AND (n.last_injection_date > v.last_injection_date
        OR (n.last_injection_date = v.last_injection_date AND n.created_at > v.created_at)
        OR (n.last_injection_date = v.last_injection_date AND n.created_at = v.created_at
            AND n.id > v.id)));
```

### 4.3 Identité du vaccin

- **Qui est « le Carré de Boree »** : une série (`series_id` = identifiant de la première injection),
  sans ligne propre. On la retrouve depuis n'importe laquelle de ses injections.
- **Renommer** : la tête seule (l'historique garde le nom écrit à l'époque) ou toute la série
  (`UPDATE … WHERE series_id = ?`, une ligne poussée par injection) — **choix produit**.
- **Supprimer le vaccin** :
  `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE series_id = ? AND deleted_at IS NULL`,
  une instruction, un seul repository.
- **Corriger une injection** : le formulaire actuel convient tel quel (nom, date, échéance d'une
  ligne). Si la date corrigée devient la plus récente, la ligne devient la tête d'elle-même.
- **Injection saisie par erreur** : tombstone ; la précédente redevient la tête toute seule. Variante
  a : il faut en plus remettre `renewed_at` à `NULL` sur la précédente (deuxième écriture). Supprimer
  la seule injection fait disparaître le vaccin, naturellement.
- **Carnet** : une ligne par série (sa tête) ; l'historique au tap = les lignes de la série.
- **#283** : `product_code` par ligne, donc par injection, tel que l'étude §9.1 l'a écrit (« table
  existante, à étendre ») ; un changement de produit entre deux injections n'est pas un cas
  particulier. C'est aussi la forme du logiciel de refuge étudié (§5.1 de l'étude : une ligne par
  injection), qui regroupe par l'identifiant de son catalogue ; MémoPatte n'a pas de catalogue avant
  #283, et les vaccins « Autre » n'en auront jamais — d'où `series_id`.
- **Partage de la valeur « série »** : un fichier exporté peut porter un `seriesId` qui ne correspond
  à aucune ligne (première injection supprimée, tombstones non exportés). C'est une clé, pas une
  référence : la validation ne doit pas l'exiger.

### 4.4 Cycle de vie

| Action                                     | Écritures                                                                                    | Rappels                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Ajouter un vaccin                          | une ligne, `series_id = id`                                                                  | `reschedule(ligne)`                              |
| Fait aujourd'hui / à une autre date        | une ligne (nom recopié de la tête, même `series_id`) ; variante a : + drapeau sur l'ancienne | `cancel(ancienne tête)` + `reschedule(nouvelle)` |
| Fait à une date antérieure (carnet papier) | une ligne, rien d'autre ; variante a : elle doit naître déjà « renouvelée »                  | inchangés                                        |
| Modifier / reporter                        | `due_date` de la tête (le rappel choisi ce jour-là est écrasé)                               | `reschedule`                                     |
| Renommer                                   | tête ou série (§4.3)                                                                         | `reschedule` (texte)                             |
| Corriger une injection                     | la ligne ; la tête peut changer                                                              | selon la tête                                    |
| Supprimer une injection                    | tombstone                                                                                    | `cancel` + `reschedule` de la nouvelle tête      |
| Supprimer le vaccin                        | toute la série                                                                               | `cancel` de chaque ligne                         |
| Supprimer l'animal                         | la cascade actuelle couvre déjà toutes les lignes (`WHERE animal_id = ?`)                    | inchangés                                        |

« Fait » pour Boree, en variante c, est une seule instruction :

```sql
INSERT INTO vaccination
  (id, animal_id, series_id, name, last_injection_date, due_date, created_at, updated_at, deleted_at)
VALUES (:id, 'boree', 'carre', 'Carré', '2026-09-25', '2029-09-25', :now, :now, NULL);
```

Tout vit dans `vaccinations.repository.ts` : pas de nouvelle table, pas de service pour les vaccins.

### 4.5 Rappels et notifications

- **Ce qui génère un rappel** : la tête de chaque série, si sa `due_date` est non nulle.
- **Ce qui l'arrête** : une nouvelle tête (« fait »), « Pas de rappel », la suppression.
- **La clé change à chaque injection** (`vaccination:<id de la ligne>:…`) : « fait » annule les
  rappels de l'ancienne tête et programme ceux de la nouvelle, deux appels au lieu d'un.
- **Tous les lecteurs de `listAll()` / `listByAnimal()` doivent ne voir que les têtes** :
  `reminders-sync.ts`, `reminders-priming.ts`, `home-reminders.service.ts`, la section Vaccins et le
  compteur « Rappels » du Carnet. Deux façons de l'organiser :
  - `listAll()` rend les têtes, et une nouvelle méthode rend toutes les lignes pour l'export, le PDF
    et l'historique. Les lecteurs actuels ne bougent pas ; le risque se déplace vers l'export, qui
    perdrait l'historique sans bruit s'il gardait `listAll()`.
  - `listAll()` rend tout et chaque lecteur filtre. Un filtre oublié se voit tout de suite :
    `buildReminders` garde tous les retards sans limite d'ancienneté, donc « À faire » afficherait
    chaque injection passée comme « en retard ». C'est le patron « chaque lecteur doit y penser »
    écarté le 2026-09-08 pour la suppression d'un animal (une jointure sur `deleted_at` que chaque
    futur écran aurait dû penser à écrire).
- **Après restauration** : `syncAllReminders` fonctionne si `listAll()` rend les têtes.
- **Notification « C'est fait »** : elle vise la ligne qui avait sonné. Si cette ligne n'est plus la
  tête (Carré déjà noté depuis l'autre téléphone), `series_id` mène à la tête. En variante a, rien ne
  mène à l'injection suivante.

### 4.6 Export, import, PDF, CSV

- **JSON v2** : `vaccinations[]` contient une entrée par injection, avec `seriesId`. Pour connaître
  l'état courant, le lecteur du fichier doit appliquer la règle « tête = la plus récente de la
  série » : le fichier s'explique moins seul, `export-format.md` doit la décrire. `reminders[]` ne
  prend que les têtes.
- **Fichier v1** : l'adaptateur pose `seriesId = id`, sans créer de ligne.
- **Validation** : toutes les lignes d'une même série doivent avoir le même animal, sinon refus (la
  règle du rattachement figé, étendue à la série).
- **Fusion par `updatedAt`** : les lignes s'additionnent ; la tête est recalculée, donc « qui sonne »
  ne dépend pas de l'ordre de la fusion. Un renommage de toute la série se fusionne ligne par ligne.
- **PDF** : regroupement par `seriesId` (variante a : par le nom).
- **CSV** : `vaccins.csv` devient une ligne par injection, plus une colonne `seriesId` (une colonne
  dérivée « en cours » aiderait la lecture dans un tableur). Il se lit comme un carnet papier.

### 4.7 Synchro

```sql
alter table public.vaccination add column series_id uuid;
update public.vaccination set series_id = id;
alter table public.vaccination alter column series_id set not null;
create index on public.vaccination (user_id, series_id);
```

Pas de table, de port, de policy ni d'ordre nouveaux : `series_id` rejoint `COLUMNS` et
`applyRemoteRowStatement` du repository existant. **Piège** : un remplissage qui n'avance pas
`updated_at` ne voyage pas par la synchro — `guardedUpsert` n'écrit côté serveur, et le pull
n'écrit en local, que si `updated_at` est strictement plus récent. La migration locale et la
migration Postgres font donc le même remplissage (`series_id = id`), pour qu'aucun appareil n'ait à
le recevoir. Conflits entre deux appareils : §6.

### 4.8 Coût et réversibilité

- **Couche données des vaccins**, ordre de grandeur : 1 fichier nouveau (migration Supabase) et une
  douzaine modifiés (`migrations.ts`, `vaccination.schema.ts`, `vaccinations.repository.ts` — requête
  des têtes, écritures de série, deux listes —, store, formulaire en mode « fait » prérempli, section
  du Carnet, `carnet-data.ts`, `export-format.ts`, `data-export.service.ts`, `data-import.service.ts`,
  `import-plan.ts`, `pdf-content.ts`, `render-carnet-pdf.ts`, fixtures, `export-format.md`), plus les
  lecteurs de `listAll()` dans la seconde organisation du §4.5. Tests en plus.
- **Ticket propre à l'approche** : « série des vaccins : colonne, requête des têtes, écritures de
  série », plus court que celui de l'approche 1 mais qui touche au sens de lectures existantes.
- **Risques** : changement de sens d'une table lue par tous les modules du §1.2 ; règle de la tête
  à définir une seule fois et à partager (SQL du repository, et JS si le PDF ou l'import la
  recalculent) ; choix de la variante ; colonne mal nommée.
- **Réversibilité vers l'approche 1** (variante c) : un vaccin suivi par série (identifiant =
  `series_id`, nom et résumé de la tête), une injection par ligne. Mécanique, sans perte. En variante
  a, les groupes sont à deviner par le nom.

## 5. Approche 3, écartée

Une table générique d'événements (`health_event` : type, sujet, date, charge JSON) : écartée, car
elle troque les contraintes de colonne (`CHECK`, `NOT NULL`) contre un JSON que SQLite ne valide
pas, et serait écrite par deux features, contre la règle « un repository seul écrivain de sa table ».

## 6. Conflits entre deux appareils, côte à côte

Cas : MémoPatte Plus, deux téléphones sur le même compte (Gaelle et une autre personne du foyer),
l'un hors ligne au moment de l'action.

| Scénario                                                     | Approche 1                                                                                                             | Approche 2, variante c                                                                       | Approche 2, variante a                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Les deux notent « fait » pour le Carré de Boree              | deux injections le même jour dans l'historique (doublon à supprimer) ; une seule échéance                              | deux lignes dans la série, une seule tête ; doublon dans l'historique                        | Carré affiché deux fois, rappels en double              |
| A note « fait », B (hors ligne) renomme le Carré             | la ligne de B gagne : nouveau nom, **ancien résumé** — « En retard » alors que l'historique montre l'injection         | B a renommé l'ancienne tête : la série porte deux noms ; les rappels sont justes             | la ligne de B efface `renewed_at` : deux vaccins actifs |
| A note « fait », B (hors ligne) reporte l'échéance           | la version la plus récente gagne : soit le report, soit le « fait » ; résumé possiblement incohérent avec l'historique | le report de B atterrit sur une ligne devenue historique : perdu sans bruit                  | deux vaccins actifs                                     |
| Deux renommages concurrents                                  | une ligne, le plus récent gagne                                                                                        | ligne par ligne ; noms mêlés si les deux appareils ne connaissaient pas les mêmes injections | idem c                                                  |
| A note une prise du Bravecto, B change la fréquence (commun) | le plan de B gagne : fréquence nouvelle, **ancienne dernière prise** — échéance calculée depuis la prise précédente    | identique                                                                                    | identique                                               |

Ce qui casse, c'est toujours **un état résumé stocké sur une autre ligne que le fait qui le
justifie** : le résumé du vaccin (approche 1), le drapeau `renewed_at` (variante a), le résumé du
traitement (les deux). « Ligne entière, la plus récente gagne » (2026-09-19) ne sait pas qu'une ligne
résume les autres. Trois remèdes, valables dans les deux approches :

1. **Accepter** : cas rare (Plus, deux appareils, modifications concurrentes hors ligne), symptôme
   visible (un badge « En retard », un doublon), réparé par un nouveau « Fait » ou une suppression.
2. **Recalculer le résumé depuis l'historique** après chaque pull et chaque import, en n'écrivant que
   si la valeur change. Revient sur « l'échéance importée fait foi, jamais recalculée » (2026-09-16).
3. **Dériver au lieu de stocker** : tête calculée (variante c) ; dernière injection ou prise lue par
   jointure (approche 1). Pour les traitements, revient sur « `next_due_date` stockée » (2026-09-09),
   et fait entrer une jointure dans toutes les lectures.

Le choix se pose pour les traitements quelle que soit l'approche des vaccins.

## 7. Tableau récapitulatif

| Critère                                    | Approche 1 — deux tables d'historique                               | Approche 2 — une ligne par injection (variante c)                           |
| ------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Traitements, interface, export v2          | identiques (§2)                                                     | identiques (§2)                                                             |
| Nouvelles tables pour les vaccins          | `vaccination_injection` (SQLite + Postgres)                         | aucune, une colonne `series_id`                                             |
| Sens d'une ligne `vaccination`             | inchangé : le vaccin suivi                                          | change : une injection                                                      |
| Lecteurs actuels de `vaccination`          | intacts                                                             | chacun choisit « têtes » ou « tout »                                        |
| Écriture « fait »                          | deux tables, une transaction, service + constructeurs d'instruction | un `INSERT`                                                                 |
| Où vit le nom (et le produit de #283)      | sur le vaccin suivi : renommer = un `UPDATE`, l'historique suit     | sur chaque injection : renommer la tête ou la série, au choix               |
| Saisie rétroactive (carnet papier)         | garde sur la date dans l'`UPDATE`                                   | rien de particulier                                                         |
| Résumé à tenir à jour (vaccins)            | sur quatre chemins d'écriture                                       | aucun (tête calculée)                                                       |
| Migration SQLite                           | `CREATE TABLE` + copie, identifiant repris                          | `ADD COLUMN` nullable + `UPDATE` (ou reconstruction de la table)            |
| JSON                                       | `vaccinations[]` = état courant, + `vaccinationInjections[]`        | `vaccinations[]` = injections, + `seriesId`                                 |
| Import d'un fichier v1                     | une injection créée par vaccin                                      | `seriesId = id`                                                             |
| Synchro                                    | + 1 table, 1 port, 3 policies, ordre revu                           | + 1 colonne, remplie aussi côté serveur                                     |
| Deux « fait » concurrents                  | doublon dans l'historique                                           | doublon dans l'historique                                                   |
| « Fait » + renommage concurrents           | échéance périmée affichée                                           | deux noms dans la série                                                     |
| Patron d'historique                        | le même pour vaccins et traitements                                 | deux patrons (série pour les vaccins, table de prises pour les traitements) |
| Couche données vaccins (ordre de grandeur) | ~4 fichiers nouveaux, ~15 modifiés                                  | ~1 nouveau, ~12 modifiés                                                    |
| Réversibilité                              | vers 2 : mécanique                                                  | vers 1 : mécanique (variante a : par devinette sur le nom)                  |

Tickets probables, dans les deux cas : migration v6 et prises des traitements (fait, arrêt,
reprise) ; feuille « Fait » et maquette ; historique dans le Carnet et « Traitements terminés » ;
action « C'est fait » de la notification ; export v2, import v1/v2 et PDF regroupé ; synchro des
nouvelles colonnes et tables ; plus **un ticket propre aux vaccins**, plus gros dans l'approche 1.

## 8. Questions à se poser pour choisir

### 8.1 Pour trancher entre les deux

1. **Que « suit » l'utilisateur quand il regarde le Carnet de Boree ?** Une chose nommée qui existe
   au-delà de ses injections (qu'on renomme, supprime, à laquelle on attache un produit) — c'est la
   forme de l'approche 1. Ou une suite de lignes de carnet, comme les vignettes collées par le
   vétérinaire — c'est la forme de l'approche 2.
2. **Renommer « Carré » en « CHPPiL » : l'historique doit-il suivre ?** Oui d'office dans l'approche
   1 (sauf à dupliquer le nom sur l'injection) ; au choix dans l'approche 2.
3. **Le produit change entre deux injections (#283)** : même vaccin suivi, ou nouveau ? L'approche 2
   l'absorbe sans cas particulier ; l'approche 1 demande un produit sur l'injection ou un nouveau
   vaccin suivi.
4. **Plutôt ajouter du code neuf en laissant intactes les lectures existantes (1), ou garder moins de
   tables en changeant le sens de l'une d'elles (2) ?**
5. **Un seul patron d'historique pour les vaccins et les traitements (1), ou deux patrons adaptés à
   deux objets différents (2) ?** Un vaccin n'a pas de plan (pas de fréquence, échéance saisie à
   chaque fois) ; un traitement en a un.
6. **Quel remède au conflit entre appareils (§6) ?** Commun aux deux approches pour les traitements,
   il oriente aussi la variante de l'approche 2.
7. **Si l'approche 2 : quelle colonne de lien ?** (§4.1)
8. **Quand ?** Avant la première publication, un changement d'avis coûte une migration. Après, il
   coûte aussi une version d'export, une migration Postgres avec reprise des lignes et des appareils
   qui n'ont pas tous la même version.

### 8.2 Risques signalés comme forts

- **Approche 2 en variante a (`renewed_at` seul).** Le regroupement du Carnet et du PDF repose sur le
  nom tapé au clavier ; deux « fait » simultanés donnent un vaccin en double qui sonne deux fois ;
  une notification périmée ne mène nulle part ; le retour vers l'approche 1 oblige à deviner les
  groupes. Chacun de ces points touche le différenciant n° 1 (rappels fiables) ou la promesse de
  données jamais otages.
- **Approche 2 en variante b avec clé étrangère déclarée** : une page de pull qui arrive dans le
  mauvais ordre échoue en entier (vérifié en SQLite), et la synchro de l'utilisateur reste bloquée.
- **Approche 1 : le résumé tenu à jour sur quatre chemins d'écriture.** Un chemin qui l'oublie fait
  sonner un vaccin à une mauvaise date sans aucun symptôme. Un test par chemin le rend sûr, mais
  c'est la contrepartie directe des lectures existantes laissées intactes.
- **Les deux : identifiants tirés au hasard à la migration ou à l'import d'un fichier v1** : doublons
  d'historique après synchro ou import répété. Identifiant repris du parent (§2.1).

### 8.3 À trancher de toute façon, quelle que soit l'approche

- **Reporter un traitement** : l'échéance est calculée (2026-09-09). Corriger la date de la dernière
  prise (modifie l'historique), ou rendre `next_due_date` saisissable (revient sur la décision) ?
- **Reprendre un traitement arrêté** : son échéance stockée est passée. Reprise = une prise notée
  aujourd'hui, ou saisie de la prochaine date ?
- **Supprimer la seule injection ou la seule prise** : supprimer aussi le vaccin ou le traitement, ou
  l'interdire ?
- **« C'est fait » sur une échéance déjà notée** (notification périmée) : message « Déjà noté le … »,
  ou ouverture de la feuille ?
- **Un repository par table, ou un repository propriétaire des deux tables d'une feature** (plan et
  prises) ? CLAUDE.md dit « chacun reste le seul à écrire dans sa table » : la lecture « un par table »
  est celle retenue ci-dessus.
- **« Ajouter un vaccin » alors qu'un vaccin du même nom existe** : l'app propose-t-elle « c'est un
  rappel ? » pour éviter de recréer le problème de #364 par l'autre porte ?

## 9. Ce que ce document n'a pas vérifié

- **Tables Supabase vides en production** : déduit du contexte du 2026-09-22 (aucun appareil
  n'active `sync_state.enabled` avant #83), pas vérifié par une requête sur le projet.
- **Contenu de la base du téléphone de Gaelle** : nombre de vaccins et de traitements à migrer
  inconnu ; la migration a été rejouée sur une base en mémoire (`sqlite3` 3.50), pas sur une copie
  de sa base ni avec le plugin Capacitor.
- **Action de notification app fermée** : non testée (point 3 de la séance, à vérifier sur appareil).
- **Nombres de fichiers** : estimés à la lecture du code, à ±30 % ; aucun prototype n'a été écrit.
- **Version de SQLite embarquée par `@capacitor-community/sqlite`** : non vérifiée ; la requête de
  tête du §4.2 n'utilise volontairement pas de fonction de fenêtrage, pour ne pas en dépendre.

## 10. Décision retenue (2026-09-24)

Validée par Gaelle le 2026-09-24. Elle fait foi sur les §3 et §4 et sert de spec aux tickets
d'implémentation de #364.

### 10.1 Principe

Un vaccin suivi, c'est un nom et la liste de ses injections ; un traitement, c'est un plan et la liste
de ses prises. **Chaque injection ou prise porte la prochaine échéance qu'elle a fixée, et la plus
récente fait foi** (la « tête »). Le parent ne stocke **aucun résumé** (dernière date, prochaine
échéance) : le repository le calcule par une jointure sur la tête, à un seul endroit. Les objets
`Vaccination` et `Treatment` gardent leurs champs actuels (`lastInjectionDate`, `dueDate`,
`lastDoseDate`, `nextDueDate`) : aucun lecteur hors des repositories ne change (vérifié : aucune
requête sur ces tables en dehors d'eux).

Raison : le défaut commun aux approches 1 et 2 était un état résumé stocké sur une autre ligne que le
fait qui le justifie, à tenir à jour sur plusieurs chemins d'écriture et que la synchro (« la plus
récente gagne ») peut écraser (§6). Le dériver supprime ce risque sans changer le sens d'une ligne
`vaccination`.

### 10.2 Schéma (migration v6)

- `vaccination` (reconstruite sans ses deux dates) : `id`, `animal_id`, `name` (et plus tard le
  produit de #283), `created_at`, `updated_at`, `deleted_at`.
- `vaccination_injection` : `id`, `vaccination_id` (clé étrangère), `animal_id`, `injected_on`
  (obligatoire), `next_due_date` (le rappel choisi ce jour-là ; `NULL` = « Pas de rappel »),
  `created_at`, `updated_at`, `deleted_at`.
- `treatment` (reconstruite sans `last_dose_date` ni `next_due_date`) : `id`, `animal_id`, `name`,
  `type`, `frequency_value`, `frequency_unit`, `stopped_on` (`NULL` tant que le traitement est en
  cours), `created_at`, `updated_at`, `deleted_at`.
- `treatment_dose` : `id`, `treatment_id` (clé étrangère), `animal_id`, `given_on` (obligatoire),
  `next_due_date` (obligatoire), `frequency_value` et `frequency_unit` (la fréquence avec laquelle
  cette prochaine dose a été calculée), `created_at`, `updated_at`, `deleted_at`.
- Index sur la clé du parent et sur `animal_id` pour les deux tables d'événements.
- Migration : **reconstruction** de `vaccination` et `treatment` (création, copie, suppression,
  renommage, index et déclencheurs d'outbox recréés), sans dépendre d'`ALTER TABLE … DROP COLUMN`
  dont la version de SQLite embarquée n'est pas vérifiée. Chaque ligne existante donne un premier
  événement, **de même identifiant que son parent**. Rien n'est perdu.
- Côté Supabase, les tables miroir suivent (encore vides : aucun appareil ne synchronise avant #83).

### 10.3 La tête

Événement non supprimé le plus récent, trié par date (`injected_on` ou `given_on`), puis
`created_at`, puis `id`. Une injection ancienne recopiée du carnet papier ne devient donc jamais tête.
Une requête par repository, testée.

### 10.4 Cycle de vie

- **Créer** un vaccin ou un traitement : le parent et son premier événement dans un seul `runMany`.
  **Un parent a toujours au moins un événement** ; la jointure interne rend de toute façon invisible
  un parent dont l'événement n'est pas encore arrivé par la synchro.
- **Fait aujourd'hui / à une autre date** : un seul `INSERT` d'événement. Vaccin : prochain rappel
  choisi par les raccourcis (F5). Traitement : `next_due_date` = `given_on` + fréquence du plan,
  fréquence recopiée sur la prise.
- **Annuler** (toast) et **supprimer une injection ou une prise** : pierre tombale sur l'événement ; la
  précédente redevient tête, et avec elle son échéance (F7). Supprimer la **seule** injection ou prise
  n'est pas proposé : l'interface propose de supprimer le vaccin ou le traitement.
- **Modifier / reporter** : on change la `next_due_date` de l'événement de tête (« Rappel choisi »
  de F7, « A fixé la dose du… » de F8).
- **Changer la fréquence** d'un traitement : un seul `runMany`, jamais l'un sans l'autre : mise à jour
  du plan **et** de la prise de tête (`next_due_date` et fréquence recopiée). Chaque repository fournit
  son instruction, le service de `features/treatments` les joue ensemble. La nouvelle prochaine dose
  vient du formulaire « Modifier », qui propose `given_on` de la dernière prise + la nouvelle
  fréquence ; l'utilisatrice la garde ou la change, un report manuel n'est jamais écrasé en silence.
- **Arrêter** : `stopped_on` sur le plan, plus aucun rappel. **Reprendre** : `stopped_on` remis à
  `NULL` et prochaine dose choisie, écrite sur la prise de tête (F9 ter).
- **Renommer** (et produit de #283, porté par le parent) : mise à jour du parent seul ; l'historique
  suit, les identifiants de route et de notification (ceux du parent) ne changent jamais.
- **Supprimer un vaccin ou un traitement** : la même `deleted_at` est posée sur le parent et sur tous
  ses événements, dans un seul `runMany` (le patron de la suppression d'un animal).
  **Supprimer un animal** : les repositories des deux tables d'événements rejoignent la liste
  `records` de `animal-deletion.service.ts`. À l'import, la règle « revient avec son animal » gagne un
  étage : un événement supprimé en même temps que son parent revient avec lui.
- Tests par geste, dont : changement de fréquence seul ; changement de fréquence avec report dans la
  même saisie ; reprise d'un traitement arrêté. Chacun vérifie que les deux lignes ont bougé.

### 10.5 Rappels

Calculés depuis la tête de chaque parent non supprimé et non arrêté. Notifications identifiées par le
parent, comme aujourd'hui ; `syncAllReminders` garde son sens. L'échéance arrivant désormais avec
l'événement, `REMINDER_ENTITIES` (`core/sync/service/sync-cycle.ts`) doit inclure
`vaccination_injection` et `treatment_dose` : sinon un « fait » reçu de l'autre téléphone ne
reprogramme rien.

### 10.6 Export et import

Format **v2** : parents et événements. L'import accepte v1 (un événement par ligne v1, par un
adaptateur) et v2. Dans l'adaptateur v1, **la ligne v1 se rattache à l'événement local de même date**
(supprimés compris : un non supprimé d'abord, puis un supprimé en même temps que son parent, puis le
plus récent), mis à jour seulement si le fichier est plus récent ou s'il avait été supprimé en même
temps que son parent ; à défaut, un événement est créé avec l'identifiant du parent s'il est libre,
sinon un nouvel identifiant. En fusion, tout autre événement supprimé en même temps que son parent
revient avec lui, à sa date (§10.4). Importer deux fois le même fichier ne duplique rien et aucune date déjà en base n'est réécrite ; une prise v1 recopie la
fréquence de son traitement. Deux refus nouveaux, fichier entier refusé comme les refus
existants : un événement dont le parent n'est pas dans le fichier ni sur l'appareil, et un événement
dont l'animal diffère de celui de son parent. Une échéance importée n'est jamais recalculée (décision du 2026-09-16, intacte).
PDF : prises répétées regroupées ; JSON : chaque événement ; CSV : une ligne par événement.

### 10.7 Synchro

Deux tables synchronisables de plus, tirées après leur parent (ordre des clés étrangères déjà
appliqué au pull) : à ajouter dans `ENTITY_ORDER` (`core/sync/repository/sync-outbox.repository.ts`),
dans la liste `tables` de `src/app/sync.ts` et dans l'amorçage de #83. Deux « fait » simultanés donnent deux événements, et la tête est déterminée
partout pareil ; un renommage et un « fait » simultanés se composent (le nom de l'un, l'échéance de
l'autre).

**Réconciliation des prises à fréquence périmée, à ne pas oublier.** Elle vaut dès aujourd'hui pour
l'**import** (fusionner les exports de deux téléphones produit le même cas) : cette part va dans le
ticket 4. La part **après un pull** attend l'activation de la synchro (#83, ticket 5). Même règle
dans les deux cas, au même endroit que `syncAllReminders` : pour chaque traitement en cours, si la
fréquence recopiée sur la prise de tête diffère de celle du plan (fréquence changée sur un appareil
pendant qu'un autre notait une prise), recalculer `next_due_date` depuis `given_on` avec la fréquence
du plan, recopier la fréquence et avancer `updated_at` ; les appareils font le même calcul et
convergent. Une prise de tête dont la fréquence recopiée est déjà celle du plan n'est **jamais**
touchée : c'est ce qui protège un report manuel. Les deux colonnes de fréquence de §10.2 existent dès
la migration v6 précisément pour rendre cette réconciliation possible.

**Accepté sans remède** : un report et un changement de fréquence concurrents sur la même prise de
tête — la plus récente gagne. Rare, visible, corrigé par la prise suivante.

### 10.8 Décisions antérieures touchées

- « `next_due_date` d'un traitement stockée » (2026-09-09) : toujours stockée, mais sur la prise.
- « Échéance d'un traitement calculée, jamais saisie » (2026-09-09) : déjà assouplie par « Modifier
  sert aussi à reporter » (2026-09-23, point 6) ; saisissable sur la prise de tête.
- « Échéance importée jamais recalculée » (2026-09-16) : intacte.

### 10.9 Ordre des tickets

1. Migration v6 et repositories (parents, événements, tête), sans changement visible.
2. Service « fait » et feuilles F2 à F6 (dont le bouton « Annuler » du toast), fenêtre J+29
   (**changement voulu** du J+30 inclus livré par #344, décision du 2026-09-24 : son test change),
   « Date ou fréquence », titre de ligne = nom du produit (F1).
3. Détail d'un vaccin et d'un traitement dans le Carnet, historique, traitements terminés (F7 à F9).
4. Export v2 et adaptateur v1, PDF regroupé, CSV, réconciliation après import.
5. Synchro des deux tables (miroirs Postgres, ports, listes de la synchro) ; réconciliation après un
   pull avec l'activation de la synchro (#83).
6. Bouton « C'est fait » des notifications (F10 corrigée : l'app s'ouvre).

### 10.10 Pièges pour le ticket 1 (migration v6)

- **Les clés étrangères sont actives pendant les migrations** : le plugin les active à l'ouverture,
  avant de jouer les migrations (`setForeignKeyConstraintsEnabled(true)`, vérifié dans
  `@capacitor-community/sqlite`). Un `DROP TABLE vaccination` alors qu'une table enfant la référence
  ferait un `DELETE` implicite et déclencherait `ON DELETE CASCADE` : les injections tout juste copiées
  disparaîtraient. Ordre sûr, sans toucher au `PRAGMA` :

  ```sql
  DROP TRIGGER vaccination_outbox_insert; DROP TRIGGER vaccination_outbox_update;
  DROP INDEX idx_vaccination_animal_id;
  ALTER TABLE vaccination RENAME TO vaccination_old;
  CREATE TABLE IF NOT EXISTS vaccination (...);            -- sous son nom définitif
  INSERT INTO vaccination SELECT ... FROM vaccination_old;
  CREATE TABLE IF NOT EXISTS vaccination_injection (... REFERENCES vaccination(id) ...);
  INSERT INTO vaccination_injection SELECT ... FROM vaccination_old;
  DROP TABLE vaccination_old;                              -- plus rien ne la référence
  -- puis index, et déclencheurs d'outbox des quatre tables (deux reconstruites, deux nouvelles)
  ```

  Même séquence pour `treatment`.

- **Créer les tables sous leur nom définitif** (`CREATE TABLE IF NOT EXISTS <nom>`) : `clear-all-tables.ts`
  retrouve les tables en lisant les `CREATE TABLE` des migrations ; une table créée sous un nom
  temporaire puis renommée y laisserait une table fantôme.
- Tester la migration sur une base v5 remplie (vaccins, traitements, pesées, file d'outbox), avec les
  clés étrangères actives : aucune ligne perdue, identifiants conservés, déclencheurs recréés.
