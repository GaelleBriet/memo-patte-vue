# Étude — le modèle des prises (#488)

Suivi : ticket #488 et ses commentaires (décisions de Gaelle du 2026-10-02). Sources : spec
[Traitements](../product/specs/traitements.md) (TR-7, TR-9, TR-13, TR-24 bis, gardes, §10, §11),
[modèle de données v2](modele-de-donnees-v2.md), [format d'export](export-format.md),
[proposition de synchro](proposition-sync.md), relecture d'ensemble du 2026-10-02 (coffre, M1 à M11).
Code lu : `main` au commit `e7e04f86` (schéma v10, moteur `src/shared/domain/treatment-schedule*.ts`).

Niveau de preuve : **sonde** = rejoué sur ce commit par une sonde jetable (sortie citée) ; **lu** =
vérifié dans le code, sans exécution ; **attendu** = conséquence d'un choix proposé, non vérifiée.

## 0. En bref

- Le moteur **devine** ce qu'une ligne a fait à la suite des échéances : il compare la date
  « prochaine dose » stockée avec ce qu'aurait donné un redémarrage. En mois, les deux coïncident
  par hasard ; après un redatage, le contexte de la devinette a changé. Il manque **une donnée
  explicite**.
- Décisions de Gaelle du 2026-10-03 (§5) : dès qu'une date de dose change, l'app propose « Décaler
  aussi les doses suivantes », cochée par défaut ; le décalage est **une ligne à part** de l'historique
  (état `shift`), visible, supprimable seule, et **rien ne se supprime en cascade**. La prise donnée un
  intervalle ou plus en avance est une **prise en plus** (`extra`).
- Recommandation finale : **option A + option C avec la ligne de décalage** (§2.6, §3). Identité par
  date gardée, ligne de décalage autonome (son échéance d'origine et sa date d'ancrage), jour de
  référence `reference_on` sur la période. Pas d'identifiant d'échéance, pas de période par décalage.
- Traçabilité (§6) : en v1, `created_by_device` et `updated_by_device` sur les tables synchronisées et
  une table `device` (modèle et date d'installation) ; rien à l'écran, l'information est dans l'export.
  L'historique complet viendra avec le partage (v2).
- Plus aucune question ouverte : N8, dernière réponse, retire la case de « Supprimer ce report » (§5.1).

## 1. Diagnostic

### 1.1 Ce que stocke une prise aujourd'hui

Une ligne de `treatment_dose` (v10) porte l'échéance couverte (`period_id`, `due_on`, `due_time`), la
date réelle (`given_on`), l'état (`given`, `missed`, `postponed`) et `next_due_date` (la prochaine
échéance fixée ; pour un report, la nouvelle date). L'identité d'une échéance est sa date :
`dueId` = période + jour + heure (`treatment-schedule-dues.ts:45`, lu). Deux lignes de même identité
sont fusionnées à l'affichage, la plus récemment modifiée gagne, **quel que soit leur état**
(`mergeDoses`, `treatment-schedule-plan.ts:34`, lu).

Pour savoir si une ligne a refixé la suite, le moteur teste « date réelle + fréquence = prochaine
échéance stockée » (`fixesSuiteFromItsDate`, `treatment-schedule-sequence.ts:17`, lu). Le même test
sert à `sequenceAfter` (l. 57), `isOvertaken` (`-plan.ts:89`), `followingMove` (`-doses.ts:99`),
`redate` (`-doses.ts:141`) et `lastReference` (`-new-period.ts:10`). C'est **la devinette**.

### 1.2 Les sujets, rejoués

| # | Exemple | Aujourd'hui (sonde) | Voulu |
| --- | --- | --- | --- |
| 1 | Hebdomadaire, première prise le ven. 16 oct., prise notée le 13 | prochaine le 20 | 20 |
| 1 | idem, notée le 9 | prochaine le **23** | 16 |
| 1 | idem, notée le 2 | prochaine le **23** | 9 |
| 1 | Tous les 3 jours, échéance le 8, notée le 5 | prochaine le **11** | 8 |
| 1 | Quotidien, deux « C'est fait » le 2 oct. | la 2ᵉ ligne couvre le 3 ; le 3, dose du moment le **4** | le 3 garde sa dose |
| 2 | Hebdo du vendredi, dose du 16 reportée au lun. 19 | 19, 26, 2 nov. (seul choix) | case décochée : 19, 23, 30 |
| 3a | Hebdo depuis le 1ᵉʳ sept., le 20 : dose non renseignée du 8 notée le 8, puis redatée au 9 | dose du moment le **16** | 15 |
| 3b | Hebdo, le 10 : dose du moment (8) notée par erreur le 1ᵉʳ, puis corrigée au 10 | prochaine le **15** | 17 (comme notée le 10 : 17, sonde) |
| 3c | Mensuel depuis le 30 juil., le 10 oct. : dose non renseignée du 30 août notée le 31 | à venir **31 oct.**, 30 nov., **31 déc.**, **31 janv.** | 30 oct., 30 nov., 30 déc. |
| 3c' | idem, dose **du moment** du 30 août donnée le 31 | 30 sept., puis **31 oct.**, 30 nov., 31 déc. | au choix de la personne (Q3, §2.6) |
| 3d | Toutes les 4 semaines, 5 oct. et 2 nov., fin le 2 nov. ; première dose donnée le 10 | `nextDueDate` 7 nov., **terminé** | la dose du 2 nov. reste |
| 3e | Mensuel depuis le 31 janv. 2027 ; le 20 févr., posologie changée | nouvelle période 28 févr., puis **28 mars, 28 avr., 28 mai** | 31 mars, 30 avr. |
| 3f | Tous les 2 jours à 8 h et 20 h ; 8 h du 3 donnée le 2 ; posologie changée le 2 | première dose de la nouvelle période le **5** | le 3 à 20 h |
| 4 | Six graines du test d'invariants (§1.6) | toutes en échec sur `main` | aucune échéance ne disparaît |

Sorties complètes de la sonde : §6.

### 1.3 Sujet 1 — la prise donnée un intervalle ou plus en avance

**Pourquoi** (lu). `givenNextDueDate` (`-doses.ts:53`) ne fait repartir la suite de la date réelle que
si `restarted > due.dueOn` (l. 69) : c'est la garde G11. Sans elle, la suite repartirait du 9 et
produirait une échéance le 16… sur la clé déjà occupée par la prise elle-même (`due_on` = 16). Le
moteur la jugerait couverte : `pendingDues` filtre par `noteKeys` (`-plan.ts:208`), et la suite ne
produit que des échéances après le plancher de la ligne (`keyOf(dose)`). Une prise notée ensuite pour
ce « nouveau 16 » aurait la même clé que la prise en avance : `mergeDoses` n'en garderait qu'une.

**Ce qui manque** : une ligne ne peut pas partager sa date avec une autre ligne du même genre. Écrire
la prise sous la clé de sa date réelle ne suffit pas (ticket) : la clé est déjà prise quand la dose
précédente a été donnée le même jour, cas du double « C'est fait » ci-dessus.

Constat utile (sonde) : le double « C'est fait » d'un quotidien consomme aujourd'hui la dose du
lendemain (M11-4 de la relecture). La règle 1 de Gaelle le corrige d'elle-même : la seconde prise fait
repartir la suite du jour même, le lendemain garde sa dose.

### 1.4 Sujet 2 — la case « Décaler aussi les doses suivantes »

**Pourquoi** (lu). Un report est une ligne `postponed` ; `sequenceAfter` en fait toujours l'origine
d'une nouvelle suite (`-sequence.ts:62` : `{ origin: dose.nextDueDate, firstStep: 0 }`). Rien dans la
ligne ne permet de dire « seule cette dose bouge ».

**Ce qui manque** : le choix de la personne, stocké sur la ligne. Le ticket l'exige aussi pour
« Changer la date d'un report garde le choix fait à la création ». La clé suffit ici : la dose
déplacée arrive entre deux échéances, et sa prise est rangée sous la date d'arrivée, comme aujourd'hui
(`movedDueOf`, `treatment-dose-writes.ts`).

### 1.5 Sujet 3 — les limites du §11

| Limite | Cause (lu) | Information qui manque |
| --- | --- | --- |
| 3a, redatée | `redate` recalcule avec `stateOn(…, givenOn)` (`-doses.ts:147`) : le carnet « tel qu'il était le 9 », où la dose du 8 était la dose du moment. La décision d'origine (Q8 : elle ne refixe rien) est perdue. | « cette prise ne refixe pas la suite » |
| 3b, date fausse corrigée | La prise du 1ᵉʳ n'a pas refixé (G11). Au redatage, `keepsSuite` (`-doses.ts:141`) voit « donnée un autre jour et n'a pas refixé » et garde la suite. Il ne sait pas si c'est une dose non renseignée (Q8) ou une dose du moment bloquée par G11. | « cette prise visait la dose du moment » |
| 3c, mois courts | 31 août + 1 mois = 30 sept. = la prochaine échéance stockée : `sequenceAfter` prend la prise pour un redémarrage (`-sequence.ts:66`), la référence devient le 31. Le correctif `clamps` (l. 67) ne couvre que la prise datée de son échéance. | même donnée que 3a |
| 3c', T2 en mois | Comportement voulu par T2 (« une prise donnée un autre jour devient la nouvelle référence »). | le choix de la personne : la case (Q3, §2.6) |
| 3d, date de fin | La prise du 10 refixe la suite au 7 nov., après la fin (TR-8) : plus d'échéance, terminé. | le choix de la personne (case) ; règle de la demi-fréquence pour « C'est fait » en un tap (Q4, §2.6) |
| 3e, jour borné | `newPeriod` reprend la dose prévue (28 févr.) comme `first_due_on` ; la grille d'une période part de `first_due_on` (`initialSequence`, `-sequence.ts:21`) : le 31 est perdu. | le jour de référence, porté par la période |
| 3f, plusieurs heures | `untouchedCurrentDay` (`-new-period.ts:29`) écarte la journée du 3 dès qu'une de ses heures est notée, et le reste du calcul saute au 5. | aucune : règle du moteur (couverture d'une journée à cheval sur deux périodes), hors modèle |

### 1.6 Sujet 4 — la famille M6

Rejoué sur `main` (sonde) : six des huit graines citées dans le ticket, toutes en échec. Deux formes.

- **« Échéances disparues »** (2010230, 3007564, 60011368, 85003771, et par la même forme 85006859,
  85011306 non rejouées) : à plusieurs heures, un report dont l'échéance d'origine a quitté la grille
  (un report antérieur supprimé, une prise antérieure supprimée ou redatée) n'est tenu que par le verrou Q25 (sa dose
  d'arrivée est notée, `isLoggedMove`, `-plan.ts:139`). Supprimer la prise d'arrivée lève le verrou ;
  le moteur juge alors le report « sans effet » à la lecture (`hasNoEffect`, `-plan.ts:99`) et
  l'ignore : les autres heures du jour d'arrivée disparaissent avec lui.
- **« L'échéance ne revient pas »** (13503355, 20001783) : un report est supprimé alors qu'une prise
  plus lointaine, notée sur la suite qu'il avait créée, existe déjà. Réduit à trois gestes (sonde) :
  tous les 2 jours depuis le 10 mars ; le 11, dose du 10 reportée au 11 ; le 14, dose du 13 notée
  oubliée ; report supprimé. La grille revient à 10, 12, 14, mais l'oubli du 13 reste. Comme son
  `next_due_date` (15) vaut 13 + 2, le moteur le prend pour un redémarrage : la dose du 14 n'existe pas,
  la dose du moment est le 15. Supprimer ensuite l'oubli ne rend pas le 13, qui n'est plus sur la
  grille.

**Expérience jetable** (sonde, fichier restauré ensuite) : en retirant la péremption à la lecture
(`hasNoEffect`, `isOvertaken`) pour ne garder que « report revenu à sa date », les quatre graines
« échéances disparues » passent. Quatre tests existants tombent, tous de TR-24 bis (« un report qui ne
tombe plus après la prise déplacée est dépassé ») : le cas qu'une écriture explicite de `redate` doit
porter à la place de la lecture. Les deux graines « l'échéance ne revient pas » restent en échec : elles
demandent une règle de produit, tranchée par la ligne de décalage autonome (Q6, N6, §2.6).

### 1.7 Ce qu'il faut retenir

Trois informations manquent : **ce que la ligne a fait à la suite** (sujets 2, 3a, 3b, 3c, une partie
de 4), **une identité qui ne se résume pas à la date** pour la prise en avance (sujet 1), et **le jour
de référence d'une période** en mois (3e). Le reste (3c', 3d, la seconde forme de 4) relevait de questions produit, tranchées le 2026-10-03 par la
case (§5.1) ; 3f est une règle du moteur.

## 2. Les options

Trois options, qui se combinent : A (donnée explicite sur la ligne), B (A plus un identifiant
d'échéance), C (jour de référence sur la période, à ajouter à A ou à B).

Les §2.1 à §2.5 comparent les options telles qu'elles ont été proposées, avec une colonne
`fixes_suite`. Le modèle retenu le 2026-10-03 remplace cette colonne par une ligne de décalage
(§2.6) ; le reste vaut tel quel.

### 2.1 Option A — l'effet explicite sur la ligne, clé actuelle gardée

**Schéma** (`treatment_dose`) :

- `fixes_suite` (0 / 1, obligatoire) : **l'état de la case « Décaler aussi les doses suivantes »**
  au moment du geste (décision du 2026-10-03). Prise donnée : 1 = la suite repart de la date réelle
  **quand elle diffère de l'échéance**, sinon elle continue (le jour de référence d'un mensuel est
  gardé) ; 0 = la suite garde ses jours. Sans case (dose non renseignée, N1 ; prise d'un traitement de tous les jours, N3) : 0.
  « C'est fait » en un tap : le moteur choisit et l'écrit (§2.6). Oubliée : toujours 0. Report :
  1 = la suite repart de la nouvelle date, 0 = seule cette dose bouge.
- `status` gagne `extra` : une **prise en plus**, notée un intervalle ou plus avant la prochaine dose.
  Elle est rangée sous sa date réelle (`due_on` = `given_on`), ne couvre aucune échéance et ne change
  jamais le calendrier (décision de Gaelle du 2026-10-05, §5.1 ; la reprise de la suite depuis elle,
  proposée ici d'abord, est abandonnée). Exemples : première prise le 16, notée le 9, le 7 ou le 2 →
  prise en plus, prochaine le 16 ; tous les 3 jours, notée le 5 pour le 8 → prochaine le 8 ; second
  « C'est fait » du jour d'un quotidien → prise en plus, le lendemain garde sa dose.
- `next_due_date` reste : date d'arrivée d'un report (le moteur la lit) ; pour une prise, valeur
  calculée et écrite par le moteur, qu'il ne relit plus (le Carnet, l'accueil et les rappels la lisent
  encore jusqu'aux lots 4 et 7). La relecture M8 (« `nextDueDate` fait foi sans contrôle ») ne vaut
  plus que pour les reports.

**Identité d'une ligne** (fusion à l'affichage, TR-25) : période + jour + heure + **famille** (prise,
prise en plus, report). Une prise en plus et une prise du même jour ne se fusionnent plus ; deux prises
en plus du même jour, oui (un troisième « C'est fait » le même jour ne crée rien). Une prise et un
report de la même échéance non plus : il faut une règle pour les départager (Q5).

**Ce que ça règle** : 1 (« prise en plus », Q1), 2, 3a, 3b (la prise en plus du 1ᵉʳ redatée au 10
redevient la prise de la dose du moment : prochaine le 17, attendu), 3c et 3c' (la case donne les
deux suites, Q3), 3d (le choix est enregistré, Q4), la forme « échéances disparues » de 4 si le moteur
cesse de déclarer un report sans effet à la lecture (§1.6), et la seconde forme de 4 par la case de
« Supprimer ce report » (Q6, §2.6). **Ne règle pas** : 3e (voir C) et 3f (règle du moteur, hors
modèle).

**Moteur** (lu, pour l'ampleur) :

| Disparaît | Change |
| --- | --- |
| `fixesSuiteFromItsDate`, `referenceOf` comme devinette | `sequenceAfter` : lit `fixes_suite` (redémarre ou continue), sans branche des mois courts |
| la branche `clamps` / `continued` de `sequenceAfter` | `givenNextDueDate` → rend aussi `fixesSuite` ; G11 remplacée par la prise en plus |
| `isOvertaken`, `hasNoEffect` à la lecture (sauf G17 et report revenu à sa date) | `redate` : garde le drapeau de la ligne, plus de rejeu `stateOn` ; supprime explicitement un report dépassé (TR-24 bis) |
| le rejeu `stateOn` dans `redate` | `dueForDate`, `doseFor` : nouveau geste « prise en plus » |
| | `move(due, to, { shiftsSuite })` et ses bornes pour une dose déplacée seule |
| | `mergeDoses` : identité par famille, règle prise / report (Q5) |
| | `lastReference`, `followingMove` : lisent le drapeau |

**App** : le chemin unique `doseChange` → `applyBatch` écrit un champ de plus (`DoseFields`) ; une ligne
de report réécrite garde son drapeau ; le repository ajoute la colonne partout (`COLUMNS`,
`rewriteStatement`, `restoreStatement`, `applyRemoteRowStatement`, `pullPage`) et le doublon devient
« même échéance, même famille » (`duplicateWhere`, l. 208). Formulaire : la case sous « Prochaine dose »
(FR, EN, maquette à demander). Historique, PDF, CSV : le libellé d'une prise en plus. Carnet de démo et
fixtures de test : un champ de plus. Rappels : rien de direct.

### 2.2 Option B — A plus un identifiant d'échéance

La ligne vise une échéance identifiée indépendamment de sa date : `due_ref` = l'ancre de la suite (la
ligne qui l'a fait repartir, ou la période) et le rang dans cette suite, plus l'heure. La date
d'échéance, la date réelle et la date d'arrivée deviennent des attributs. Variante plus légère : jour +
heure + **occurrence** (0 d'habitude, 1 pour une date qui revient après une prise en avance), calculée
par le moteur.

**Ce que ça règle de plus que A** : la prise en avance peut **couvrir la dose prévue** (« 16 oct. ·
Donnée le 9 oct. »), puis une seconde ligne « 16 oct. » apparaît pour l'échéance qui revient. C'est
l'autre réponse à Q1.

**Ce que ça coûte** (attendu) :

- L'identité d'une échéance dépend d'une autre ligne. Redater, supprimer ou réécrire l'ancre change
  l'identité de toutes les échéances qui la suivent : `apply` doit réécrire leurs lignes dans le même
  lot (aujourd'hui une prise est rangée sous une date absolue et ne bouge pas quand une autre change).
- Entre deux appareils : une prise notée hors ligne sous une ancre supprimée ailleurs arrive orpheline.
  Il faut un repli par date… c'est-à-dire la devinette, et une nouvelle famille M6.
- La variante « occurrence » a le même défaut, plus petit : quand la prise en avance disparaît,
  l'occurrence 1 n'existe plus et doit retomber sur l'occurrence 0.

### 2.3 Option C — le jour de référence porté par la période

`treatment_period.reference_on` (date, obligatoire) : l'origine de la grille. Par défaut égale à
`first_due_on`. Quand « Modifier » ouvre une période sans changer la fréquence ni les heures (Q37), elle
reprend l'origine de la suite en cours : 3e donne 28 févr., 31 mars, 30 avr. (attendu ; `addMonths`
depuis le 31 janv. ne dérive pas). Une correction sans prise (TR-28) la remet à la nouvelle première
échéance. Seul `initialSequence` et `newPeriod` changent dans le moteur. Une prise qui refixe la suite
reste, elle, la nouvelle référence de la suite qui la suit (T2) : rien à stocker de plus.

Écartée pour 3e : calculer la référence depuis la période précédente (la grille d'une période
dépendrait des lignes d'une autre).

### 2.4 Grille de comparaison

| Critère | A | B (A + identifiant) | C (avec A ou B) |
| --- | --- | --- | --- |
| 1, prise en avance | oui, en « prise en plus » | oui, la prise couvre la dose prévue | — |
| 2, la case dans les cinq gestes | oui (§2.6) | oui | — |
| 3a, 3b, 3c | oui | oui | — |
| 3e, jour borné | non | non | oui |
| 3c', 3d | oui : le choix de la case est enregistré (Q3, Q4) | idem | — |
| 3f | non (hors modèle) | non | non |
| 4, « échéances disparues » | oui, sans péremption à la lecture | oui | — |
| 4, « l'échéance ne revient pas » | oui, par la ligne de décalage (Q6, N6, §2.6) | idem, plus orphelins par identifiant | — |
| SQLite (v11) | `fixes_suite`, valeur `extra` | + `due_ref` et son index | `reference_on` |
| Supabase | 1 colonne, CHECK, droit `update` | + 1 colonne | 1 colonne |
| Synchro | rien de neuf : les drapeaux voyagent avec la ligne | réécritures en cascade, orphelins | rien |
| Export | v4 | v4 | v4 (même montée) |
| Moteur | devinette et péremption retirées ; 3 fonctions étendues | + calcul et maintien des identifiants, repli par date | 2 fonctions |
| App | 1 champ, la case, 1 libellé | + réécritures en cascade dans `apply` | rien à l'écran |
| Risques | « prise en plus » à expliquer ; TR-13 et G11 réécrites | complexité, orphelins entre appareils | faible |
| Effort | moyen | grand (environ deux fois A) | petit |

Écartée aussi : une table des suites (`treatment_suite`, une ligne par redémarrage). C'est B avec une
table de plus à synchroniser avant les prises.

### 2.5 Migration, miroir, synchro, export (communs à A et C)

**SQLite, v11.** Le test de garde n'admet que `DROP`, `CREATE`, `INSERT`, `PRAGMA` au premier niveau
(`src/core/db/__tests__/migrations.spec.ts`). Le plugin Android 8.1.1 ne réécrit que `DELETE FROM …
WHERE` (`Database.execute`, lu) : un `ALTER TABLE … ADD COLUMN` passerait probablement, mais il sortirait
de la garde et devrait être rejoué sur le téléphone. **Choix technique** : comme v10, v11 supprime et
recrée `treatment_dose`, `treatment_period` et `treatment`, avec leurs index et déclencheurs (synchro,
longueur du nom, valeurs permises). **Perdu** : tous les traitements, périodes et prises des
installations de développement (données de test ; `sync_outbox` est vide, la synchro n'a jamais été
activée). Avec les colonnes d'appareil du §6 dans la même v11 (recommandé, §3), toutes les tables sont recréées et tout le carnet de test est perdu. Après la publication, ce choix s'inverse : une
recopie par table temporaire (`CREATE`, `INSERT … SELECT`, `DROP`, `CREATE`, `INSERT … SELECT`, `DROP`)
reste dans la garde, mais le drapeau ne se calcule pas en SQL (`date(…, '+1 month')` de SQLite ne borne
pas les fins de mois comme `date-fns`).

**Supabase.** Les miroirs sont vides (synchro jamais activée, #83). Migration : contrôle « miroir vide »
comme en v10, puis `add column fixes_suite smallint not null default 0 check (fixes_suite in (0, 1))`,
CHECK de `status` étendu à `extra`, `reference_on date not null` sur `treatment_period`, et les nouvelles
colonnes ajoutées au `grant update (…)` (les droits sont donnés colonne par colonne, lu). RLS inchangée
(politiques sur `user_id`). Elle s'applique au vrai projet par la CI : Gaelle présente.

**Synchro.** La règle reste « la plus récente gagne », ligne par ligne (`applyRemoteRowStatement`). Les
drapeaux voyagent avec la ligne entière : une ligne n'est jamais à moitié d'un appareil et à moitié de
l'autre. Deux appareils qui notent la même échéance produisent deux lignes, fusionnées à l'affichage
dans leur famille. Une prise et un report de la même échéance, venus de deux appareils : la prise
gagne toujours (Q5, M4) ; entre deux lignes de même famille, la plus récente.

« La plus récente » veut dire : la plus grande `updated_at`, **heure de l'horloge de l'appareil au
moment de la modification**, pas l'heure d'arrivée au serveur (`server_updated_at` ne sert que de
curseur au pull, `proposition-sync.md` §1). Risques, lus dans le code :

- un appareil en retard d'horloge perd ses modifications contre un appareil à l'heure, même faites
  après ; un appareil en avance gagne à tort ; le serveur ne ramène à son heure qu'une date à plus de
  24 h dans le futur (`clamp_sync_timestamps`) ;
- à `updated_at` exactement égal, les deux règles gardent chacune leur ligne : le serveur ne remplace
  que si la sienne est plus ancienne (`guardedUpsert`, `.lt('updated_at', …)`), l'appareil que si la
  distante est plus récente (`WHERE excluded.updated_at > …`). Deux appareils peuvent alors garder
  deux valeurs pour toujours. L'identifiant d'appareil du §6 donne un départage stable (à égalité, le
  plus grand identifiant d'appareil gagne, des deux côtés).

**Export.** Format **v4** : `fixesSuite` sur chaque prise, `extra` dans `status`, `referenceOn` sur
chaque période ; `prises.csv` gagne une colonne `fixesSuite`. Un champ obligatoire de plus et un état
de plus sont une rupture (`export-format.md` : « toute rupture l'incrémente »). Un v3 est refusé avec le
message existant ; sa relecture « au mieux » rejoint #469, seul endroit où la devinette survivrait
(calculer `fixesSuite` d'une ligne v3 avec l'ancienne règle).

### 2.6 Le modèle retenu : prise, report et ligne de décalage (décisions du 2026-10-03)

Gaelle a tranché (N5, N6, N7) : le décalage du rythme est **une ligne à part** dans l'historique des
prises, état `shift`, visible, supprimable seule ; **rien ne se supprime en cascade**. La colonne
`fixes_suite` des §2.1 et §2.5 disparaît : cocher la case, c'est écrire une ligne de décalage. Le reste
de l'option A (identité par date, prise en plus, péremption à la lecture retirée) et l'option C
(`reference_on`) sont gardés.

**Trois familles de lignes** sur la même échéance (période, jour, heure), fusionnées chacune à part à
l'affichage :

| Famille | État | Porte | Effet sur la suite |
| --- | --- | --- | --- |
| Prise | `given`, `missed` ; `extra` (prise en plus, rangée sous sa date réelle) | `given_on` | aucun ; la prise en plus ne change jamais le calendrier (2026-10-05) |
| Report | `postponed` | `next_due_date` = nouvelle date de la dose | la dose seule bouge ; les suivantes gardent leurs jours |
| Décalage | `shift` | `next_due_date` = **date d'ancrage** du nouveau rythme | les échéances **après** l'échéance d'origine suivent le rythme ancré : ancrage + 1 pas, + 2 pas… |

**La donnée qu'une ligne de décalage porte pour rester autonome** (N6) : son échéance d'origine
(`period_id`, `due_on`, `due_time`) et sa date d'ancrage (`next_due_date`), c'est tout. L'ancrage est
recopié au geste : la date réelle de la prise, ou la nouvelle date du report. Le moteur ne relit jamais
la prise ni le report pour s'ancrer ; la ligne garde sa date même quand ils ont disparu. Avec la
fréquence et le jour de référence de sa période, elle suffit à produire la suite (en mois, l'ancrage
devient la référence : ancré au 31 août, 30 sept., 31 oct.).

**Règles du moteur pour une ligne de décalage** (attendu, non prototypé) :

1. Elle agit après son échéance d'origine, au même rang qu'un report aujourd'hui (`stepOf`, après les
   prises du jour d'origine). Les échéances de l'ancien rythme qui suivent l'origine sont remplacées
   par celles du rythme ancré, à partir de la première **strictement après l'origine**.
2. Elle ne touche jamais l'échéance d'origine ni ce qui la précède : cette échéance reste à donner, à
   renseigner, ou notée. C'est la garde contre la famille M6 : une ligne `shift` seule ne fait
   disparaître aucune échéance d'avant elle, et une échéance notée après elle reste une ligne de
   l'historique (clé absolue), même hors du nouveau rythme.
3. Le moteur ne l'ignore jamais à la lecture, même quand son échéance d'origine a quitté la grille
   (une ligne d'avant supprimée) ; seules les écritures la retirent. Deux lignes de décalage de la même
   échéance (deux appareils) : la plus récente vaut (comme G17).
4. Un report sur une échéance qui a une ligne de décalage arrive à sa nouvelle date ; la suite reste
   celle du décalage. Report et décalage du même geste ont donc la même date (19) ; séparés ensuite,
   chacun garde la sienne.
5. Le décalage d'une dose avancée est rangé sous son échéance d'origine, celle de son report : une
   prise notée un autre jour réancre ce décalage à sa date réelle, et la corriger au jour d'arrivée le
   ramène à ce jour. Une ligne de décalage du jour d'arrivée est celle de cette échéance-là, jamais
   celle de la dose avancée. Le moteur ne devine donc rien par l'heure d'écriture des lignes, et
   « Annuler » rend le calendrier d'avant (#523). Vendredi, dose du 16 avancée au 13 avec décalage,
   puis donnée le 12 : décalage du 16 ancré au 12, prochaine dose le 19.

**N6, rejoué à la main sur les exemples** (attendu) :

- Pixel le vendredi, dose du 16 donnée le lundi 19, case cochée : prise (16, donnée le 19) + décalage
  (16, ancrage 19) → prochaine le 26. Prise supprimée : le décalage reste ; le 16 redevient la dose du
  moment ou une dose non renseignée (TR-26), puis 26, 2 nov. ; toast « Prise supprimée. Les doses
  suivantes restent décalées. » · Annuler.
- **TR-26, la seule prise** : la supprimer laisse aussi son décalage. Le traitement garde sa dose
  d'origine à donner, puis le rythme décalé. Rien ne disparaît.
- Report du 16 au 19 avec décalage, report supprimé : 16, puis 26, 2 nov., la ligne « Doses suivantes
  décalées · prochaine le 26 oct. » dans l'historique. Décalage supprimé, report gardé : 19, puis 23, 30.
- Graine 13503355 : report 10 → 11 avec décalage, oubli du 13 ; report supprimé : 10 revient, le
  décalage garde 13, 15 ; l'oubli du 13 reste sur la grille.

**La case dans chaque geste**

| Geste | Case cochée | Case décochée | Points précis |
| --- | --- | --- | --- |
| « Prochaine dose » (formulaire) | report + décalage, même date | report seul | décochée : au plus la veille de la dose suivante (Q2 a) ; dose suivante notée : refus G7 (Q2 b) ; à plusieurs heures, la journée part entière (Q21) |
| « Fait à une autre date » | prise + décalage ancré à la date réelle | prise seule | case seulement si la date diffère de l'échéance ; jamais pour une dose non renseignée (N1), ni pour une prise d'un traitement de tous les jours (N3) ; plus espacé à plusieurs heures, seulement si la prise complète la journée (G10). Pixel du vendredi au lundi 19 : cochée, la suite passe au lundi ; décochée, elle reste le vendredi. Luna, 30 août donnée le 31 : cochée 30 sept., 31 oct., 30 nov. ; décochée 30 sept., 30 oct., 30 nov. (Q3). Prise en plus et prise d'une dose déplacée seule (Q2 c) : pas de case |
| « Changer la date » d'une prise | prise réécrite ; décalage écrit, ou réancré à la nouvelle date | prise réécrite ; le décalage de cette échéance est supprimé | mêmes conditions que la ligne précédente ; la case se rouvre comme laissée (N2) : cochée s'il existe une ligne de décalage pour cette échéance |
| « Changer la date » d'un report | report réécrit ; décalage écrit ou réancré | report réécrit ; décalage supprimé | mêmes bornes que « Prochaine dose » ; rouverte comme laissée (N2) ; avec « Prochaine dose », seul geste à case pour un traitement de tous les jours (N3) |
| « Supprimer ce report » | pas de case (N8) | — | supprime le report seul, son décalage reste (N6) ; toast « Report supprimé. Les doses suivantes restent décalées. » · Annuler ; revenir à l'ancien rythme passe par « Supprimer ce décalage » |
| « C'est fait » en un tap, dose en retard | prise + décalage, sans question | — | date de fin : voir plus bas (Q4) |

Décocher la case dans « Changer la date » supprime la ligne de décalage : c'est un choix de la
personne, pas une cascade.

**Report seul et dose suivante** (Q2 a, décisions du 2026-10-05, #505) : aucun geste ne fait passer
un report seul (sans décalage sur sa journée) après la dose suivante, et aucun ne le fait disparaître
par ricochet. « Changer la date » d'une prise refusé dans un seul état de la case : le jour est grisé
dans cet état (« Ce jour ferait passer le report du 22 oct. après la dose suivante… »). Quand la
correction change le rythme, le report seul qui la suit vise l'échéance la plus proche de son
ancienne arrivée et garde cette date dans les bornes de Q2 a, sinon s'en approche sans passer avant
aujourd'hui ; sans date possible, la correction est refusée (« Avec ce jour, la dose que tu avais reportée au 30 oct. ne pourrait plus tomber au bon moment. Change d'abord la date de ce report. »). L'aide l'annonce (« La dose que tu avais reportée au 30 oct. reste prévue ce jour-là. »). Restent
refusés, faute de pouvoir faire suivre le report : « Fait à une autre date » coché (décocher suffit)
et « Supprimer ce décalage » (« Change d'abord la date du report »). « C'est fait » en un tap, la
notification et la feuille « À faire » notent la prise sans son décalage, et le toast le dit (« La
suite ne bouge pas : un report est prévu le 28 oct. »).

**La ligne de décalage dans l'historique** (N7) : toujours visible, discrète, au même endroit que les
reports : « Doses suivantes décalées · prochaine le 26 oct. » (libellé à fixer avec la maquette). Menu ⋮ :
« Supprimer ce décalage », toast et « Annuler ». Quand une dose plus loin dans la période est déjà
notée, supprimer le décalage est refusé, avec l'aide « Une dose plus lointaine est déjà notée. » (Q6
transposée, N8).

**Date de fin, avec la case** (Q4) : quand le décalage ferait passer la dose suivante après la date de
fin, un message sous la case le dit (« Avec le décalage, la dose du 2 nov. ne sera plus prévue (date de
fin). ») et la personne choisit. **« C'est fait » en un tap** : le décalage est écrit, sauf si la dose
prévue tombe au moins une demi-fréquence après la prise ; alors pas de décalage, la dose prévue reste.
À moins d'une demi-fréquence, le décalage est écrit et le traitement se termine (toast « Dernière dose
… notée », « Annuler »). Exemple : 5 oct. et 2 nov., fin le 2 nov. ; donnée le 10 oct. : le 2 nov. reste
(23 jours) ; donnée le 1ᵉʳ nov. : terminé. Le choix est écrit : changer la date de fin ensuite ne le
rejoue pas. Livré par #506 (G20 de la spec) : la demi-fréquence se compte en jours, de la prise à la
même date plus un intervalle (donnée le 19 oct., le 2 nov. reste ; le 20, terminé) ; la feuille
« À faire » et la notification passent par le même calcul que la fiche. Reste ouverte : plusieurs
doses avant la date de fin (spec, §11).

**Ce qui change par rapport au §2.1 et au §2.5** : `status` gagne `shift` (en plus d'`extra`), sans
colonne `fixes_suite` ; le moteur lit les lignes de décalage là où il aurait lu le drapeau
(`sequenceAfter`, `followingMove`, `lastReference`, `redate`) ; le miroir Supabase n'a que le CHECK de
`status` à étendre ; l'export v4 porte l'état `shift`, et `prises.csv` n'a pas de colonne de plus.

### 2.7 Comment on est arrivé à la ligne de décalage (N4, N5)

Gaelle a proposé de séparer le report d'une dose du décalage du rythme. Trois représentations ont été
comparées sur le même carnet : Pixel, vermifuge le vendredi ; dose du 16 reportée au lundi 19, case
cochée (19, 26, 2 nov.) ; puis (1) report supprimé, rythme gardé (16, 26, 2 nov.) et (2) l'inverse
(19, 23, 30).

| | (a) une ligne qui porte les deux | (b) une nouvelle période par décalage | (c) une ligne de décalage à part (retenue) |
| --- | --- | --- | --- |
| Suite (1) | réécriture en « Reportée au 26 oct. (prévue le 23 oct.) », une ligne que la personne n'a pas faite | la période suivante est réécrite pour commencer au 26 | supprimer le report ; le décalage reste |
| Suite (2) | la ligne perd son drapeau | la période est supprimée | supprimer le décalage |
| « Annuler » | lot d'une table (existe) | lot sur deux tables avec inverse, à créer (`applyPlan` n'en a pas, lu) | lot d'une table |
| Synchro | une ligne | deux tables ; l'une sans l'autre donne une dose en trop ou une dose à renseigner | deux lignes ; chacune seule donne un état voulu |
| Moteur | drapeau | report qui traverse deux périodes, interdit aujourd'hui (refus `previous-period`, lu) | point de redémarrage sans dose |
| Lien report ↔ décalage (N2) | même ligne | colonne de lien, ou devinette | même échéance |
| Prises | même drapeau | une période par prise en retard : illisible ; il resterait un drapeau pour les prises | même ligne |

(b) est écartée : les périodes représentent un changement de réglages, voulu et rare ; en faire l'outil
d'un report multiplierait les blocs dans l'historique et le PDF, demanderait un lien stocké et une
écriture sur deux tables, et laisserait les prises sur un autre mécanisme. (a) est écartée : elle lie ce
que Gaelle veut séparer et fabrique une ligne à la suppression.

## 3. Recommandation

**Option A + option C, avec la ligne de décalage** (décisions de Gaelle du 2026-10-03) :

1. **Identité par date absolue**, gardée : c'est ce qui rend le moteur robuste (indépendant de l'ordre
   des lignes ; une suppression ou un redatage ne touche que la ligne visée ; relecture : aucune
   incohérence sur 340 000 gestes en dehors des constats M1 à M7).
2. **Ce qu'une ligne fait à la suite est écrit, plus deviné** : par la ligne de décalage, choisie par
   la case, autonome (échéance d'origine et date d'ancrage), jamais supprimée en cascade.
3. **Prise en plus** (`extra`) pour une prise donnée un intervalle ou plus en avance.
4. **Jour de référence sur la période** (`reference_on`) pour un mensuel qui reprend un jour borné.

**Écartées** : l'identifiant d'échéance (option B : cascades de réécriture, orphelins entre appareils) ;
le décalage en nouvelle période ou porté par la ligne de report (§2.7).

**Choix techniques tranchés ici** (à consigner au journal des décisions autonomes) :

- Une seule migration v11 pour les prises, la table des appareils et les colonnes d'appareil (§6) ; elle
  recrée toutes les tables comme v9 (seulement `DROP`, `CREATE`, `INSERT`, `PRAGMA`). Tout le carnet des
  installations de développement est perdu (données de test). Avant la publication, un ticket à part
  vérifie `ALTER TABLE … ADD COLUMN` sur le téléphone.
- `next_due_date` reste : nouvelle date d'un report, date d'ancrage d'un décalage ; pour une prise,
  valeur calculée que le moteur ne relit plus (le Carnet, l'accueil et les rappels la lisent jusqu'aux
  lots 4 et 7).
- Le moteur n'ignore plus une ligne écrite à la lecture, sauf deux lignes de même famille sur la même
  échéance (la plus récente) et un report revenu à sa date. Un report dépassé (TR-24 bis) est supprimé
  par l'écriture.
- Une prise en plus ne change jamais le calendrier (2026-10-05) : la garde du type G8 proposée ici
  n'a plus d'objet. « Changer la date » d'une prise en plus lui fait viser l'échéance que viserait une
  prise notée à la nouvelle date (TR-13), ce qui règle 3b.
- Fusion à l'affichage : une prise gagne sur un report de la même échéance (Q5) ; entre deux lignes de
  même famille, `updated_at` puis, à égalité, l'identifiant d'appareil (§2.5, §6).
- Export v4 (états `extra`, `shift`, `referenceOn`, colonnes d'appareil, appareils), v3 refusé jusqu'à
  #469 ; miroir Supabase par `alter`, après contrôle des miroirs vides.

## 4. Plan de livraison

Dans l'ordre. Toutes les questions ont leur réponse (§5.1).

**1. `feat(db): schéma v11 — prise en plus, ligne de décalage, jour de référence, appareils`**

- [ ] v11 : états `extra` et `shift`, `reference_on`, table `device`, `created_by_device` et
  `updated_by_device` sur les huit tables synchronisées ; seulement `DROP`, `CREATE`, `INSERT`, `PRAGMA`
- [ ] Identifiant d'appareil tiré au hasard au premier lancement avec sa date, modèle par
  `@capacitor/device`, gardés hors de la sauvegarde d'Android (§6.6) ; chaque écriture des repositories
  pose l'appareil (test qui passe en revue toutes les écritures)
- [ ] Miroir Supabase : colonnes, CHECK, table `device` (RLS, `auth.users(id)` `on delete cascade`),
  droit `update` ; migration appliquée avec Gaelle présente, job vert
- [ ] Repository, schémas Zod, carnet de démo, export et import v4 (v3 refusé, message existant), CSV
- [ ] Le moteur reçoit les champs ; ses résultats ne changent pas encore (tests existants verts)
- [ ] Rejoué sur le téléphone : v10 remplie, puis v11 par-dessus (voir plus bas)

**2. `fix(treatments): le moteur lit les lignes de décalage au lieu de deviner`**

- [ ] 3a : dose du 8 notée le 8, redatée au 9 → dose du moment le 15
- [ ] 3b : dose du moment notée le 1ᵉʳ, corrigée au 10 → prochaine le 17
- [ ] 3c : départ le 30 juil., dose non renseignée du 30 août notée le 31 → 30 oct., 30 nov., 30 déc.
- [ ] 3e : mensuel du 31 janv., posologie changée le 20 févr. → 28 févr., 31 mars, 30 avr.
- [ ] Ligne de décalage autonome : prise ou report supprimé, la suite reste décalée ; l'échéance d'origine
  revient (TR-26) ; aucune échéance ne disparaît (graines 2010230, 3007564, 60011368, 85003771,
  85006859, 85011306, 13503355, 20001783)
- [ ] Q5 : une prise gagne sur un report de la même échéance ; à égalité, l'appareil départage
- [ ] TR-24 bis : un report dépassé est supprimé par l'écriture ; campagne d'invariants élargie

**3. `feat(treatments): prise en plus (prise donnée un intervalle ou plus en avance)`**

- [ ] Première prise le 16 : notée le 13 → 20 ; le 9, le 7 ou le 2 → 16 (2026-10-05) ; tous les 3 jours, le 8 noté le 5 → 8
- [ ] Second « C'est fait » du jour d'un quotidien : le lendemain garde sa dose
- [ ] Libellé de l'historique et du PDF selon la maquette ; « Annuler » rend l'état d'avant
- [ ] Q8 et G10 inchangés ; G11 et TR-13 réécrites dans la spec

**4. `design(treatments): maquette de la case et de la ligne de décalage`** (prompt Claude Design,
copie dans le coffre)

- [ ] La case « Décaler aussi les doses suivantes » dans les gestes du §2.6, cochée, décochée, avec le
  message de date de fin
- [ ] La ligne « Doses suivantes décalées · prochaine le 26 oct. », son menu ⋮, le refus quand une dose
  plus lointaine est notée, les toasts (« Prise supprimée. Les doses suivantes restent décalées. »)
- [ ] La prise en plus dans l'historique

**5. `feat(treatments): « Décaler aussi les doses suivantes » et la ligne de décalage`** (après 4)

- [ ] La case, cochée par défaut, FR et EN, dans les gestes du §2.6, avec ses conditions (N1, N3, G10)
- [ ] Les exemples du §2.6 (Pixel du vendredi au lundi ; Luna du 30 au 31 ; report du 16 au 19)
- [ ] Q2 : bornes du report seul, refus G7, prise d'une dose déplacée seule sans décalage
- [ ] N2 : la case se rouvre comme laissée ; décocher supprime le décalage de cette échéance
- [ ] N6 : supprimer une prise ou un report laisse son décalage, toast et « Annuler » ; « Supprimer ce
  report » sans case (N8)
- [ ] N7 : ligne de décalage visible, « Supprimer ce décalage », toast, « Annuler », refus quand une
  dose plus lointaine est notée
- [ ] Message sous la case quand le décalage fait perdre une dose à cause de la date de fin
- [ ] Rejoué sur le téléphone

**6. `fix(treatments): « C'est fait » en un tap après un retard et date de fin`**

- [x] 5 oct. et 2 nov., fin le 2 nov. : donnée le 10 → le 2 nov. reste ; donnée le 1ᵉʳ nov. → terminé,
  toast « Dernière dose … notée » avec « Annuler »

**7. `feat(sync): départage par appareil et politique de confidentialité`**

- [ ] À `updated_at` égal, le plus grand identifiant d'appareil gagne, sur l'appareil et sur le serveur
- [ ] Page `site/confidentialite/` (FR, EN) : identifiant aléatoire, modèle et date d'installation de
  chaque appareil, ce qu'ils servent à savoir, leur durée
- [ ] L'export JSON v4 porte les appareils (T3) ; rien à l'écran

Hors modèle, à ouvrir à part : 3f (une journée à cheval sur deux périodes, Q37 à plusieurs heures) ;
avant la publication, vérifier `ALTER TABLE … ADD COLUMN` sur le téléphone.

**Rejeu sur le téléphone** (MémoPatte Dev, règles de `collaboration.md`) : base de MémoPatte Dev
sauvegardée ; build de `main` (v10) installé et rempli (carnet de démo, un traitement à plusieurs
heures, un report, une prise en retard) ; build de la branche installé **par-dessus**, sans
désinstaller. Vérifier : l'app s'ouvre (pas « Impossible d'ouvrir l'accueil »), `user_version` = 11,
base vide puis carnet de démo rechargé, appareil enregistré, colonnes d'appareil remplies, création d'un
traitement et une prise, export v4 puis import. Ensuite base restaurée, build de `main` réinstallé.
Pour les tickets 3, 5 et 6 : les gestes (prise en plus, case cochée et décochée dans chaque geste,
suppression d'une prise et d'un décalage) et la reprogrammation des rappels qui suit.

## 5. Décisions de Gaelle

### 5.1 Décisions du 2026-10-03

- **Q1** : option A, « Prise en plus » (libellé avec la maquette). À plusieurs heures par jour, une
  heure donnée en avance couvre son échéance comme aujourd'hui (G10 inchangée).
- **Q1, précisée le 2026-10-05** : une prise en plus ne change jamais le calendrier. Les doses
  prévues restent toutes à leur date, la prise en plus s'ajoute seulement à l'historique.
  Hebdomadaire du vendredi, dose du 16 prévue : donnée le mercredi 7, le 9 ou le 2, la prochaine
  reste le 16, puis 23, 30 ; notée avant le début de la période, idem. La reprise de la suite depuis
  la prise en plus (§2.1) et l'exemple « donnée le 2 → prochaine le 9 » sont abandonnés.
- **Q2** : un report seul va au plus jusqu'à la veille de la dose suivante ; si la dose suivante est
  notée, refus G7 ; la dose déplacée seule puis donnée un autre jour ne décale pas les suivantes.
- **Q3**, principe général : dès qu'une date de dose change, l'app propose « Décaler aussi les doses
  suivantes », cochée par défaut (cochée = la suite repart de la date réelle). Seule exception :
  « C'est fait » en un tap sur une dose en retard décale sans rien demander.
- **Q4** : avec la case, un message dit la dose perdue à cause de la date de fin, la personne choisit,
  sans distance minimale ; « C'est fait » en un tap : la dose prévue reste, sauf à moins d'une
  demi-fréquence après la prise, où le traitement se termine.
- **Q5** : une prise l'emporte toujours sur un report de la même échéance entre deux appareils ; entre
  deux lignes de même nature, la plus récente (`updated_at`, heure de l'appareil, §2.5).
- **Q6** : « Supprimer ce report » toujours permis ; quand une dose plus loin est notée, le rythme ne
  revient pas en arrière (transposé à la ligne de décalage par N6 et N7, §2.6).
- **N1** : pas de case pour une dose non renseignée rattrapée (Q8 gardé). Pour un traitement quotidien,
  une dose n'est jamais « donnée le lendemain » : les exemples sont hebdomadaires ou mensuels.
- **N2** : « Changer la date » rouvre la case telle qu'elle avait été laissée.
- **N3** : traitement de tous les jours, avec ou sans heures, jamais de case sur une prise ; la case
  n'apparaît que pour un report. Plus espacé à plusieurs heures : seulement quand la prise complète la
  journée (G10). Plus espacé sans heure : case comme décidé.
  Précisé le 2026-10-05 (#505) : pour un traitement de tous les jours, le report non plus n'a pas de
  case, car décochée elle ne laisserait aucune date (la veille de la dose suivante est le jour même) ;
  son report décale toujours la suite.
- **N4** : séparer le report d'une dose du décalage du rythme (comparaison au §2.7).
- **N5** : le décalage est une ligne à part dans les prises (état `shift`), supprimable seule.
- **N6** : chaque ligne se supprime seule, rien en cascade. Supprimer une prise qui avait décalé la
  suite laisse la ligne de décalage ; toast « Prise supprimée. Les doses suivantes restent décalées. »
  avec « Annuler ». Même chose pour un report.
- **N7** : la ligne de décalage est toujours visible, discrète, au même endroit que les reports :
  « Doses suivantes décalées · prochaine le 26 oct. », menu ⋮ « Supprimer ce décalage », toast et
  « Annuler » ; libellé avec la maquette.
- **N8** : « Supprimer ce report » n'a plus de case ; il ne supprime que le report (toast « Report
  supprimé. Les doses suivantes restent décalées. » · Annuler). Revenir à l'ancien rythme passe par
  « Supprimer ce décalage », refusé quand une dose plus loin dans la période est notée (garde de Q6,
  transposée). Raison : une ligne, un geste, comme N6 pour une prise ; aucune cascade dans l'app.
- **T1, T2, T3** : voir §6.8.

## 6. Traçabilité : qui a écrit quoi, depuis quel appareil

Demande de Gaelle (2026-10-03) : pouvoir remonter l'origine d'une donnée fausse quand plusieurs
appareils, et plus tard plusieurs personnes (partage, v2, hors périmètre v1), écrivent dans le même
carnet.

### 6.1 Ce qui existe

- Huit tables synchronisées portent `created_at`, `updated_at`, `deleted_at` : `animal`,
  `weight_entry`, `carnet_settings`, `vaccination`, `vaccination_injection`, `treatment`,
  `treatment_period`, `treatment_dose` (`SYNCED_TABLES`, `migrations.ts`, lu). Le miroir ajoute
  `user_id` (le propriétaire du carnet) et `server_updated_at`.
- Aucun auteur ni appareil. Mais la suppression est logique partout : supprimer est une modification,
  et une colonne « dernier appareil » dirait aussi qui a supprimé.
- En v1, l'auteur d'une ligne du miroir est toujours son propriétaire : les politiques `insert` et
  `update` exigent `user_id = auth.uid()` (lu). Une colonne « compte » répéterait `user_id`.
- Le seul identifiant d'appareil existant est celui de PostHog, lié au consentement aux statistiques :
  il ne doit pas servir ici.

### 6.2 Option (a) — des colonnes sur chaque ligne

`created_by_device` et `updated_by_device` (identifiant d'appareil) sur les huit tables, et une table
`device` (identifiant, modèle, date d'installation de l'app, dates d'audit), synchronisée avec Plus, qui
donne le nom lisible (T2). Chaque écriture
d'un repository les pose : création, modification, suppression, « Annuler », import. Une ligne tirée de
la synchro garde les valeurs de l'appareil qui l'a écrite (elles voyagent avec la ligne).

- **SQLite** : deux colonnes par table, dans la v11 (§3). **Supabase** : deux colonnes `uuid not null`
  par miroir, ajoutées au `grant update (…)` (l'upsert gardé réécrit toutes les colonnes) ; RLS
  inchangée. Table `device` en miroir comme les autres : `user_id references auth.users(id) on delete
  cascade`, `select`, `insert` et `update` sur `user_id = auth.uid()`.
- **Synchro** : « la plus récente gagne » ne compare pas l'appareil, sauf pour départager une égalité
  exacte d'`updated_at`, aujourd'hui sans issue (§2.5).
- **Export v4** : `createdByDevice`, `updatedByDevice` sur chaque ligne ; à l'import, une ligne écrite
  prend l'appareil qui importe en `updatedByDevice` (comme `updatedAt` prend l'heure de l'import,
  `export-format.md`). Le CSV ne les reprend pas (identifiants illisibles).
- **Ce que ça dit** : qui a créé la ligne, et qui a écrit sa valeur actuelle (y compris une
  suppression). **Ce que ça ne dit pas** : les valeurs d'avant, ni qui les avait écrites.
- **Coût** : environ 70 octets par ligne, une ligne de plus par écriture dans chaque repository.

### 6.3 Option (b) — une table d'historique en ajout seul

`change_log` : identifiant, compte, appareil, heure, table, ligne, opération, valeurs avant et après
(JSON). Une entrée par écriture, jamais modifiée.

- **Écriture** : par les repositories, dans la même transaction que la ligne (`runMany`). Un
  déclencheur SQLite ne connaît pas l'identifiant d'appareil, qui vit hors de la base (§6.6) ; JSON1
  dans le SQLite du plugin Android n'est pas vérifié.
- **Taille** (estimée) : environ 700 octets par entrée. Un traitement à deux prises par jour fait
  730 entrées par an ; « Toutes données » sur un an, 730 d'un coup. Un foyer de deux ou trois animaux :
  de l'ordre de 1 000 à 2 000 entrées et 1 à 2 Mo par an, sur le téléphone et dans Supabase.
- **Synchro** : simple (rien à départager), mais une table qui ne fait que grandir, à pousser et à
  tirer. **RLS** : `select` et `insert` sur `user_id = auth.uid()`, ni `update` ni `delete` ;
  `user_id references auth.users(id) on delete cascade`.
- **Purge** : obligatoire, par exemple 12 mois glissants, sur l'appareil et côté serveur (tâche
  programmée).
- **Export** : à décider (le contenu du carnet, en double) ; « Effacer les données » doit la vider ; un
  import ne la rejoue pas.
- **Vie privée** : elle garde les valeurs d'une donnée supprimée jusqu'à la purge ; la politique doit le
  dire.
- **Ce que ça dit** : tout, y compris les valeurs d'avant. C'est ce qu'il faut pour un écran
  « Historique de cette fiche ».

### 6.4 Option (c) — les deux

(a) pour l'état courant et le départage, (b) pour l'histoire. C'est la cible du partage ; (a) reste utile
à ce moment-là (lire l'auteur d'une ligne sans parcourir l'historique).

### 6.5 Comparaison

| Critère | (a) colonnes | (b) historique | (c) les deux |
| --- | --- | --- | --- |
| Dernier appareil, créateur | oui | oui | oui |
| Valeurs d'avant, auteurs successifs | non | oui | oui |
| Tables touchées | 8, deux colonnes | 1 nouvelle table (+ miroir) | 9 |
| Taille | négligeable | 1 à 2 Mo par an et par foyer (estimé) | idem (b) |
| Purge, export, effacement | rien de neuf | à concevoir | à concevoir |
| Départage à égalité | oui | non | oui |
| Effort | petit | moyen à grand | grand |

### 6.6 Vie privée

- **Identifiant d'appareil** : un UUID tiré au hasard au premier lancement (`crypto.randomUUID()`),
  rangé dans le stockage du WebView. Jamais `ANDROID_ID`, ni l'identifiant publicitaire, ni celui de
  PostHog. Le stockage du WebView est exclu de la sauvegarde d'Android (`data_extraction_rules.xml`,
  `app_webview/`, lu) : un téléphone restauré par Android reçoit un nouvel identifiant, et deux
  téléphones ne partagent jamais le même. L'identifiant dans la base, lui, serait copié par la
  sauvegarde : c'est pourquoi il n'y est pas rangé.
- **Nom lisible** (T2) : le modèle de l'appareil, lu par `@capacitor/device` (dépendance nouvelle), et
  la date du premier lancement, celle où l'identifiant est tiré : « Samsung Galaxy Tab S9 · depuis le
  3 oct. 2026 ». Ils vivent dans la table `device` du carnet ; une réinstallation ou un téléphone
  restauré par Android donnent un nouvel appareil, avec sa nouvelle date.
- **Politique de confidentialité** (`site/confidentialite/`, FR et EN) : dans la ligne « Sauvegarde et
  synchronisation Plus », ajouter « un identifiant aléatoire de chaque appareil, créé à l'installation
  avec son modèle et la date d'installation de l'app, pour savoir depuis quel appareil une donnée a été
écrite ». Base : exécution
  du contrat. Durée : celle du carnet (supprimé avec le compte, ou 12 mois après la fin de l'accès Plus,
  comme la sauvegarde). Sans compte, l'identifiant reste sur le téléphone et dans les exports.
- **En v2**, avec (b) : la table contient le contenu du carnet, y compris supprimé jusqu'à la purge ;
  sa durée de conservation est à ajouter à la politique.

### 6.7 Recommandation

**Intuition confirmée, avec deux précisions** (retenue par Gaelle, T1) : (a) en v1, (b) avec le partage en v2, donc (c) en v2.

1. En v1, un seul compte écrit dans un carnet (RLS) : la seule question utile est « quel appareil ? ».
   (a) y répond pour un coût négligeable, et apporte un gain immédiat : le départage à égalité, qui
   manque aujourd'hui (§2.5).
2. Précision 1 : garder aussi **le créateur** (`created_by_device`), pas seulement le dernier
   modificateur ; c'est lui qui répond à « qui a ajouté ce vaccin ? », pour le même coût.
3. Précision 2 : **pas de colonne « compte » en v1** (elle répéterait `user_id`). Avec le partage, elle
   arrive avec (b), et elle référence `auth.users(id)` avec `on delete set null`, pas `cascade` : la
   règle de CLAUDE.md vise la colonne du propriétaire ; en cascade, la suppression du compte d'une
   personne invitée effacerait les lignes du carnet partagé qu'elle a modifiées. À consigner au journal
   des décisions le moment venu.
4. (b) attend la v2 : à un seul utilisateur, connaître les valeurs d'avant ne justifie pas une table qui
   grandit, une purge, un export et une politique à écrire. Ce qu'elle ne saura pas reconstituer avant
   sa création est accepté.

**Écartées** : (b) ou (c) dès la v1 (coût et vie privée sans besoin à un seul utilisateur) ; rien en v1
(la v11 est la dernière migration qui peut repartir d'une base vide : ajouter ces colonnes après la
publication demandera une migration qui garde les données).

### 6.8 Décisions de Gaelle (2026-10-03)

- **T1** : l'historique complet (table en ajout seul) attend le partage (v2). En v1, les colonnes
  `created_by_device` et `updated_by_device` sur les tables synchronisées.
- **T2** : le nom lisible d'un appareil est son **modèle, enregistré automatiquement**
  (`@capacitor/device`), **plus la date d'installation de l'app sur cet appareil**, pour distinguer deux
  appareils du même modèle : « Samsung Galaxy Tab S9 · depuis le 3 oct. 2026 ». Un nom personnalisé
  viendra avec le partage.
- **T3** : rien à l'écran en v1 ; l'information est dans l'export JSON.

Limite connue : deux appareils du même modèle installés le même jour restent impossibles à distinguer
par leur nom (leurs identifiants diffèrent) ; le nom personnalisé de la v2 la lève.
## 7. Vérifié, pas vérifié

**Vérifié par sonde** (sonde jetable sur `e7e04f86`, supprimée ensuite) : tous les exemples du §1.2.
Extraits abrégés :

```text
S1bis première prise le 16, donnée le 2026-10-09 : vise 2026-10-16, nextDueDate=2026-10-23
S1bis première prise le 16, donnée le 2026-10-02 : vise 2026-10-16, nextDueDate=2026-10-23
S1bis tous les 3 jours, première prise le 8, donnée le 5 : vise 2026-10-08, nextDueDate=2026-10-11
S1 quotidien, second « C'est fait » le 2 : ligne dueOn 2026-10-03, givenOn 2026-10-02 ; le 3 : moment=["2026-10-04"]
S3a redatée au 9 : nextDueDate=2026-09-16 ; moment=["2026-09-16"]
S3b corrigée au 10 : nextDueDate=2026-09-15 ; témoin notée directement le 10 : 2026-09-17
S3c dose non renseignée du 30 août notée le 31 : à venir 2026-10-31, 2026-11-30, 2026-12-31, 2027-01-31
S3d première dose donnée le 10 : nextDueDate=2026-11-07 ; phase=ended finished=true
S3e le 20 févr. : firstDueOn=2027-02-28 ; à venir 2027-02-28, 2027-03-28, 2027-04-28, 2027-05-28
S3f 8 h du 3 donnée le 2, posologie changée le 2 : firstDueOn=2026-10-05
M4 lignes gardées pour le 15 : ["postponed"] ; moment=["2026-09-20"]
```

Test d'invariants rejoué sur `main` (`INVARIANTS_SEEDS=1`, `INVARIANTS_FROM=<graine>`, 30 ou 40 pas) :
2010230, 3007564, 13503355, 20001783, 60011368, 85003771 en échec ; puis l'expérience du §1.6.

**Lu dans le code, non exécuté** : les causes citées ; le plugin SQLite Android 8.1.1 (seul `DELETE
FROM … WHERE` est réécrit pendant une mise à niveau) ; les droits colonne par colonne du miroir ; le
départage à égalité d'`updated_at` (`guardedUpsert`, `applyRemoteRowStatement`) ; l'écrêtage à 24 h
(`clamp_sync_timestamps`) ; les règles d'Auto Backup (`data_extraction_rules.xml`, `app_webview/`
exclu) ; les politiques RLS du miroir ; la politique de confidentialité (`site/confidentialite/`).

**Pas vérifié** : tout ce qui est marqué « attendu » (comportement des options, aucun prototype du
moteur) ; 85006859 et 85011306 (même forme annoncée, non rejouées) ; le passage d'un `ALTER TABLE`
sur le téléphone ; le nom par défaut de la contrainte `status` dans Postgres, à lire avant d'écrire la
migration ; la ligne de décalage et ses règles (§2.6), la case dans les gestes et le départage par
appareil, non prototypés ; la taille de la table d'historique (§6.3), estimée, pas mesurée ; JSON1 dans
le SQLite du plugin Android.
