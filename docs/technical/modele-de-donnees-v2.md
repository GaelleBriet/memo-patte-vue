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
