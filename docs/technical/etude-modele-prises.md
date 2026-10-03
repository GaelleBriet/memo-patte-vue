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
  explicite sur la ligne**.
- Gaelle a tranché le 2026-10-03 (§5) : cette donnée devient **un choix de la personne**. Dès qu'une
  date de dose change, l'app propose « Décaler aussi les doses suivantes », cochée par défaut, dans
  cinq gestes ; seul « C'est fait » en un tap sur une dose en retard décale sans rien demander.
- La prise en avance d'un intervalle ou plus est une **prise en plus** (Q1) : rangée sous sa date
  réelle, elle ne couvre aucune échéance et la suite repart d'elle.
- Recommandation, confirmée par ces réponses : **option A + option C**. Sur la prise, le choix de la
  case et un état `extra` ; sur la période, un jour de référence `reference_on`. Pas d'identifiant
  d'échéance (option B). Le §2.6 vérifie la case dans chacun des gestes.
- Sur la proposition de Gaelle de séparer le report d'une dose du décalage du rythme (§2.7) :
  recommandé, **le décalage comme ligne à part dans les prises** (état `shift`), plutôt qu'une nouvelle
  période. Il remplace alors la colonne `fixes_suite`.
- Nouvelle demande (§6) : savoir quel appareil, et plus tard quelle personne, a écrit chaque donnée.
  Recommandé : deux colonnes d'appareil sur chaque table synchronisée dès la v1, la table d'historique
  avec le partage (v2).
- Questions encore ouvertes : trois sur le décalage (§5.2), trois sur la traçabilité (§6.8).

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
demandent une règle de produit, tranchée par la case de « Supprimer ce report » (Q6, §2.6).

### 1.7 Ce qu'il faut retenir

Trois informations manquent : **ce que la ligne a fait à la suite** (sujets 2, 3a, 3b, 3c, une partie
de 4), **une identité qui ne se résume pas à la date** pour la prise en avance (sujet 1), et **le jour
de référence d'une période** en mois (3e). Le reste (3c', 3d, la seconde forme de 4) relevait de questions produit, tranchées le 2026-10-03 par la
case (§5.1) ; 3f est une règle du moteur.

## 2. Les options

Trois options, qui se combinent : A (donnée explicite sur la ligne), B (A plus un identifiant
d'échéance), C (jour de référence sur la période, à ajouter à A ou à B).

### 2.1 Option A — l'effet explicite sur la ligne, clé actuelle gardée

**Schéma** (`treatment_dose`) :

- `fixes_suite` (0 / 1, obligatoire) : **l'état de la case « Décaler aussi les doses suivantes »**
  au moment du geste (décision du 2026-10-03). Prise donnée : 1 = la suite repart de la date réelle
  **quand elle diffère de l'échéance**, sinon elle continue (le jour de référence d'un mensuel est
  gardé) ; 0 = la suite garde ses jours. Sans case (dose non renseignée, N1 ; prise d'un traitement de tous les jours, N3) : 0.
  « C'est fait » en un tap : le moteur choisit et l'écrit (§2.6). Oubliée : toujours 0. Report :
  1 = la suite repart de la nouvelle date, 0 = seule cette dose bouge.
- `status` gagne `extra` : une **prise en plus**, notée un intervalle ou plus avant la prochaine dose.
  Elle est rangée sous sa date réelle (`due_on` = `given_on`), ne couvre aucune échéance, et la suite
  repart d'elle. Exemples : première prise le 16, notée le 9 → prise en plus le 9, prochaine le 16 ;
  notée le 2 → prochaine le 9 ; tous les 3 jours, notée le 5 pour le 8 → prochaine le 8 ; second
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
| 4, « l'échéance ne revient pas » | oui, par la case de « Supprimer ce report » (Q6) | idem, plus orphelins par identifiant | — |
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

### 2.6 La case dans chaque geste (décisions du 2026-10-03)

L'option A tient tous les gestes avec une seule colonne, parce que le choix est écrit sur la ligne au
moment du geste. Le moteur ne le recalcule jamais ensuite. Pour afficher la case et son message, il
calcule les deux issues avant l'écriture (un aperçu « cochée / décochée » : prochaine dose, et dose
perdue à cause de la date de fin).

| Geste | Ce qui s'écrit | Points précis |
| --- | --- | --- |
| « Prochaine dose » (formulaire, report) | ligne `postponed`, `fixes_suite` = case | décochée : au plus la veille de la dose suivante (Q2 a) ; dose suivante déjà notée : refus G7 (Q2 b) ; à plusieurs heures, la journée part entière (Q21) |
| « Fait à une autre date » | prise, `fixes_suite` = case | case seulement si la date diffère de l'échéance, jamais pour une dose non renseignée (N1, Q8) ni pour un traitement de tous les jours, avec ou sans heures (N3) ; plus espacé à plusieurs heures, seulement si la prise complète la journée (G10) ; Pixel le vendredi, dose du 16 donnée le lundi 19 : cochée, la suite passe au lundi ; décochée, elle reste le vendredi ; Luna depuis le 30 juil., dose du 30 août donnée le 31 : cochée 30 sept., 31 oct., 30 nov. ; décochée 30 sept., 30 oct., 30 nov. (Q3). La prise en plus n'a pas de case : la suite repart toujours d'elle. La prise d'une dose déplacée seule non plus : elle ne décale jamais les suivantes (Q2 c), `fixes_suite` = 0 |
| « Changer la date » d'une prise | prise réécrite : `given_on`, `fixes_suite` = case | mêmes conditions que « Fait à une autre date » ; décochée, un report qui suit ne bouge pas ; cochée, TR-24 bis comme aujourd'hui ; la case se rouvre comme elle avait été laissée (N2) |
| « Changer la date » d'un report | report réécrit : `next_due_date`, `fixes_suite` = case | mêmes bornes que « Prochaine dose » ; la case se rouvre comme laissée (N2) ; avec « Prochaine dose » et « Supprimer ce report », seul geste à case pour un traitement de tous les jours (N3) |
| « Supprimer ce report » | case « Remettre aussi les doses suivantes à l'ancien rythme » : cochée, la ligne est supprimée (comme aujourd'hui) ; décochée, voir plus bas | grisée et décochée, avec l'aide « Une dose plus lointaine est déjà notée. », dès qu'une dose plus loin dans la période est notée (Q6) ; un report qui ne décalait pas la suite n'a pas de case |
| « C'est fait » en un tap, dose en retard | prise, `fixes_suite` = 1, sans question | exception à la date de fin : voir plus bas (Q4) |

**Date de fin, avec la case** (Q4). Quand le décalage ferait passer la dose suivante après la date de
fin, un message sous la case le dit (« Avec le décalage, la dose du 2 nov. ne sera plus prévue (date
de fin). ») et la personne choisit. Rien à stocker de plus : le choix est `fixes_suite`.

**Date de fin, « C'est fait » en un tap** (Q4). Le moteur écrit `fixes_suite` = 0 (la dose prévue
reste) si elle tombe au moins une demi-fréquence après la prise ; sinon `fixes_suite` = 1 et le
traitement se termine (toast « Dernière dose … notée », « Annuler »). Exemple : 5 oct. et 2 nov., fin le
2 nov. ; donnée le 10 oct., le 2 nov. est 23 jours après (au moins 14) : il reste ; donnée le 1ᵉʳ nov.,
un jour après : terminé. Le choix étant écrit, changer la date de fin ensuite ne le rejoue pas.

**« Supprimer ce report », décochée** (Q6). La dose revient à son jour, les suivantes gardent le
rythme décalé. Il faut une ligne qui tienne ce rythme sans le report. **Choix technique** : le report
est réécrit en report de l'échéance suivante de l'ancien rythme vers la première date du rythme
décalé, cochée. Milo, dose du 16 reportée au 19, cochée (19, 26, 2 nov.) ; « Supprimer ce report »
décochée : 16, puis 26, 2 nov. ; l'historique montre « Reportée au 26 oct. (prévue le 23 oct.) », ce qui
est vrai par rapport à l'ancien rythme. Graine 13503355 (§1.6) : la case est grisée (l'oubli du 13 est
plus loin) ; la dose revient au 10 et la ligne devient « Reportée au 13 (prévue le 12) », dont l'oubli
du 13 est la dose d'arrivée : rien n'est orphelin (attendu, non prototypé). Écartée : une colonne
`suite_from` (« la suite repart de cette date ») à la place du drapeau ; plus générale, mais elle crée
une ligne sans dose et un libellé nouveau. Gaelle a accepté ce libellé (N4) et proposé de séparer le
report du décalage : comparaison et nouvelle recommandation au §2.7, qui remplace ce paragraphe si
elle est retenue.

### 2.7 Report d'une dose et décalage du rythme : liés ou séparés ? (N4, 2026-10-03)

Gaelle propose de séparer le report d'une dose du décalage du rythme : « un report individuel ne
devrait peut-être pas être lié au report global, même si c'est le report individuel qui a permis de
créer le report global ». Trois représentations, comparées sur le même carnet : Pixel, vermifuge le
vendredi ; dose du 16 reportée au lundi 19, case cochée (19, 26, 2 nov.). Ensuite deux suites : (1)
report supprimé, case décochée (attendu : 16, puis 26, 2 nov.) ; (2) l'inverse, décalage annulé et
report gardé (attendu : 19, puis 23, 30).

- **(a) Lignes liées** (proposition du §2.6) : une ligne de report porte `fixes_suite`. Supprimer le
  report case décochée le réécrit en report de l'échéance suivante de l'ancien rythme.
- **(b) Le décalage comme nouvelle période** : le report reste une ligne simple ; le décalage ouvre
  une période aux mêmes réglages, qui commence le jour du geste (comme « Modifier », TR-28, Q24), avec
  le 19 pour première échéance.
- **(c) Le décalage comme ligne à part dans les prises** : le report reste une ligne simple
  (`postponed`, la dose seule) ; le décalage est une autre ligne de la même échéance, état `shift`
  (`due_on` = l'échéance d'origine, `next_due_date` = la date dont le rythme repart, sans dose). Les
  deux se suppriment séparément. La colonne `fixes_suite` disparaît : cocher la case, c'est écrire la
  ligne de décalage.

| | (a) lignes liées | (b) nouvelle période | (c) ligne de décalage à part |
| --- | --- | --- | --- |
| Après le report cochée, historique | « Reportée au 19 oct. (prévue le 16 oct.) », puis 19, 26 | deux blocs de période : le premier finit avec la ligne de report, le second (« Toutes les semaines ») commence par le 19 | une ligne « Reportée au 19 oct. (prévue le 16 oct.) » ; le décalage, de même échéance, ne s'affiche pas en plus (comme Q13 pour une prise) |
| Suite (1) : report supprimé, décochée | 16 ; « Reportée au 26 oct. (prévue le 23 oct.) », une ligne que la personne n'a pas faite ; 26 | 16 ; la période suivante doit être réécrite pour commencer au 26 (sinon le 19 reste une dose en trop) | 16 ; la ligne de décalage reste seule : 26, 2 nov. ; son affichage seule est à décider (§5.2, N7) |
| Suite (2) : décalage annulé, report gardé | la ligne passe à `fixes_suite` = 0 : 19, 23, 30 | la période ouverte est supprimée : 19, 23, 30 | la ligne de décalage est supprimée : 19, 23, 30 |
| « Annuler » | lot inverse d'une table (`applyBatch`, existe) | lot sur deux tables avec son inverse : `applyPlan` écrit périodes et prises ensemble mais sans inverse (lu) ; à créer | lot inverse d'une table, deux lignes |
| Synchro | une ligne, toujours cohérente | deux lignes de deux tables ; arrivée de l'une sans l'autre : le 16 apparaît à renseigner, ou une dose en trop le 19 | deux lignes indépendantes ; chacune seule donne un état voulu (report seul : 19, 23 ; décalage seul : 16, 26) |
| Export | `fixesSuite` | rien de neuf, une période de plus | état `shift` de plus, pas de `fixesSuite` |
| Moteur | le drapeau lu par `sequenceAfter` | un report dont l'arrivée tombe dans la période suivante : aujourd'hui interdit (refus `previous-period`, échéances coupées à la fin de période, lu), à inventer ; G5 évité seulement si la période commence le jour du geste | la ligne de décalage est un point de redémarrage sans dose (`sequenceAfter`), placée après l'échéance d'origine ; le reste comme (a) |
| Lien report ↔ décalage (N2 : la case se rouvre comme laissée) | sur la même ligne | aucun : il faut une colonne de lien, ou deviner (période ouverte le jour du report, première échéance égale à l'arrivée) | la même échéance (période, jour, heure) : la présence de la ligne de décalage dit l'état de la case |
| Prises (« Fait à une autre date », « C'est fait » en un tap) | même drapeau | ne s'appliquerait pas : une période par prise en retard serait illisible ; il resterait `fixes_suite` pour les prises, deux mécanismes pour une même idée | même ligne de décalage : prise de la dose du 16 le 19, case cochée = prise + ligne de décalage |
| Formulaire | rien | une période sans nouveau réglage, à expliquer à l'écran et dans le PDF | rien |
| Q2, Q4, Q6, N2, N3 | tenus | Q6 et la suite (1) demandent de réécrire une période ; N2 demande un lien | tenus ; Q6 (case grisée) = supprimer le report seul ; graine 13503355 : la ligne de décalage garde l'oubli du 13 sur la grille |
| Effort | moyen (référence) | grand | moyen, un peu plus que (a) : une famille de lignes, deux lignes par geste coché |

**Recommandation : (c).** Elle fait ce que propose Gaelle (le report et le décalage vivent et se
suppriment séparément) sans les défauts de (b) : une seule table, un seul lot avec son inverse, aucun
report qui traverse deux périodes, et chaque ligne arrivée seule par la synchro donne un état voulu. Elle
supprime la ligne fabriquée de (a) (« Reportée au 26 oct. (prévue le 23 oct.) »), qui n'a plus lieu
d'être. La même ligne sert aux prises : un seul mécanisme pour « Décaler aussi les doses suivantes ».

**Écartée : (b).** Les périodes représentent un changement de réglages, voulu et rare ; en faire
l'outil d'un report multiplierait les blocs dans l'historique et le PDF. Elle demande un lien explicite
entre report et période (ou une devinette), une écriture sur deux tables pour un geste de la fiche
avec son « Annuler », et elle laisserait les prises sur un autre mécanisme.

**Écartée aussi : (a)**, qui reste valable si Gaelle préfère une seule ligne : elle coûte un peu moins,
mais lie les deux et fabrique une ligne à la suppression.

**Si (c) est retenue**, voici ce qui change ailleurs dans l'étude (attendu, non prototypé) :

- §2.1 et §2.5 : pas de colonne `fixes_suite` ; `status` gagne `shift` en plus d'`extra`. Une ligne de
  décalage d'une prise a pour `next_due_date` la date réelle de la prise ; celle d'un report, sa
  nouvelle date. Le rythme repart de cette date au pas suivant (16 donné le 19 : 26 ; Luna, 30 août
  donné le 31 : 30 sept., 31 oct.).
- §2.6 : chaque « case cochée » écrit ou garde la ligne de décalage, chaque « décochée » la supprime ou
  ne l'écrit pas ; « C'est fait » en un tap l'écrit, sauf la règle de la demi-fréquence.
- Supprimer une prise supprime sa ligne de décalage (§5.2, N6).
- Identité à l'affichage : une famille de plus (prise, prise en plus, report, décalage).

## 3. Recommandation

**A + C**, confirmée par les réponses du 2026-10-03 : la prise en avance d'un intervalle ou plus est
une « prise en plus » (Q1), et `fixes_suite` enregistre la case.

1. A rend explicite la seule information que le moteur devinait, et garde l'identité par date absolue.
   C'est ce qui rend le moteur actuel robuste : indépendant de l'ordre des lignes, une suppression ou
   un redatage ne touche que la ligne visée (relecture : aucune incohérence sur 340 000 gestes en
   dehors des constats M1 à M7). Le choix donné à la personne ne demande rien de plus : c'est la même
   colonne, remplie par la case au lieu d'une règle.
2. C règle le seul cas qu'une donnée de ligne ne peut pas régler (la référence d'une période qui
   reprend un jour borné), pour une colonne.
3. La prise en plus suit la règle de Gaelle sans exception de date : les dates du ticket (16, 9, 8) en
   découlent, et aucune date n'apparaît deux fois dans l'historique.

**Décalage du rythme** : recommandé comme ligne à part (§2.7, (c)), à valider par Gaelle (N5). Le
plan ci-dessous vaut pour les deux formes ; seule la colonne `fixes_suite` devient l'état `shift`.

**Écartée : B.** Elle ne servait qu'à afficher la prise en avance comme couvrant la dose prévue, que
Q1 n'a pas retenu. Son identité dépend d'autres lignes (cascades de réécriture, orphelins entre
appareils).

**Choix techniques tranchés ici** (à consigner au journal des décisions autonomes) :

- Une seule migration v11 pour les prises **et** les colonnes d'appareil du §6 ; elle recrée toutes les
  tables comme v9 (seulement `DROP`, `CREATE`, `INSERT`, `PRAGMA`). Tout le carnet des installations de
  développement est perdu (données de test). Avant la publication, un ticket à part vérifie
  `ALTER TABLE … ADD COLUMN` sur le téléphone : les migrations d'après en auront besoin.
- `fixes_suite` est le choix de la case, écrit au geste ; le moteur ne le recalcule pas. « C'est fait »
  en un tap : le moteur l'écrit (1, ou 0 par la règle de la demi-fréquence). Repasser une oubliée en
  donnée (TR-22) est une nouvelle prise.
- `next_due_date` reste ; le moteur ne la lit plus que pour un report.
- Le moteur n'ignore plus une ligne écrite à la lecture, sauf deux reports du même jour (G17) et un
  report revenu à sa date. Un report dépassé (TR-24 bis, case cochée) est supprimé par l'écriture.
- Une prise en plus ne se note qu'à partir de la dernière ligne de la période (garde du type G8).
  « Changer la date » d'une prise en plus lui fait viser l'échéance que viserait une prise notée à la
  nouvelle date (TR-13) : c'est ce qui règle 3b.
- « Supprimer ce report » décochée : réécriture en report de l'échéance suivante (§2.6) si (a) est
  gardée ; suppression du seul report si la ligne de décalage (c) est retenue (§2.7, recommandé).
- Fusion à l'affichage : la prise gagne sur un report de la même échéance (Q5) ; à `updated_at` égal,
  l'identifiant d'appareil départage (§6).
- Export v4, CSV complété, v3 refusé jusqu'à #469 ; miroir Supabase par `alter`, après contrôle des
  miroirs vides.

## 4. Plan de livraison

Préalable : réponses aux questions du §5.2 et du §6.8 ; maquette de la case dans les cinq gestes.

**1. `feat(db): schéma v11 — choix de décalage, prise en plus, jour de référence, appareil`**

- [ ] v11 : `fixes_suite` (ou l'état `shift`, selon N5), état `extra`, `reference_on`, `created_by_device` et `updated_by_device` sur
  les huit tables synchronisées ; seulement `DROP`, `CREATE`, `INSERT`, `PRAGMA`
- [ ] Identifiant d'appareil tiré au hasard au premier lancement, gardé hors de la sauvegarde d'Android
  (§6.6) ; chaque écriture des repositories le pose (test qui passe en revue toutes les écritures)
- [ ] Miroir Supabase : colonnes, CHECK, droit `update` ; migration appliquée avec Gaelle présente, job vert
- [ ] Repository, schémas Zod, carnet de démo, export et import v4 (v3 refusé, message existant), CSV
- [ ] Le moteur reçoit les champs ; ses résultats ne changent pas encore (tests existants verts)
- [ ] Rejoué sur le téléphone : v10 remplie, puis v11 par-dessus (voir plus bas)

**2. `fix(treatments): le moteur lit ce que la ligne a fait au lieu de le deviner`**

- [ ] 3a : dose du 8 notée le 8, redatée au 9 → dose du moment le 15
- [ ] 3b : dose du moment notée le 1ᵉʳ, corrigée au 10 → prochaine le 17
- [ ] 3c : départ le 30 juil., dose non renseignée du 30 août notée le 31 → 30 oct., 30 nov., 30 déc.
- [ ] 3e : mensuel du 31 janv., posologie changée le 20 févr. → 28 févr., 31 mars, 30 avr.
- [ ] M6 : les graines 2010230, 3007564, 60011368, 85003771, 85006859, 85011306 passent
- [ ] Q5 : une prise gagne sur un report de la même échéance ; à égalité, l'appareil départage
- [ ] TR-24 bis : un report dépassé est supprimé par l'écriture, le toast inchangé ; campagne
  d'invariants élargie (plages du ticket)

**3. `feat(treatments): prise en plus (prise donnée un intervalle ou plus en avance)`**

- [ ] Première prise le 16 : notée le 13 → 20 ; le 9 → 16 ; le 2 → 9 ; tous les 3 jours, le 8 noté le 5 → 8
- [ ] Second « C'est fait » du jour d'un quotidien : le lendemain garde sa dose
- [ ] Libellé de l'historique et du PDF selon la maquette ; « Annuler » rend l'état d'avant
- [ ] Q8 et G10 inchangés (à plusieurs heures, une heure donnée en avance couvre son échéance) ; G11 et
  TR-13 réécrites dans la spec

**4. `feat(treatments): « Décaler aussi les doses suivantes » dans les cinq gestes`** (maquette à
demander avant de coder)

- [ ] La case, cochée par défaut, FR et EN, dans « Prochaine dose », « Fait à une autre date »,
  « Changer la date » d'une prise et d'un report ; « Remettre aussi les doses suivantes à l'ancien
  rythme » dans « Supprimer ce report »
- [ ] Les exemples du §2.6 (Pixel du vendredi au lundi ; Luna du 30 au 31 ; Milo 16 → 19)
- [ ] Q2 : bornes de la dose déplacée seule, refus G7, prise de la dose déplacée seule sans décalage
- [ ] Q6 : case de « Supprimer ce report » grisée avec son aide ; décochée, la dose revient seule
  (graine 13503355 rejouée)
- [ ] Message sous la case quand le décalage fait perdre une dose à cause de la date de fin
- [ ] N1 à N3 : la case se rouvre comme laissée ; jamais de case pour une dose non renseignée ni sur
  une prise d'un traitement de tous les jours ; plus espacé à plusieurs heures, seulement quand la
  prise complète la journée
- [ ] Report et décalage supprimables séparément (§2.7, selon N5) ; rejoué sur le téléphone

**5. `fix(treatments): « C'est fait » en un tap après un retard et date de fin`**

- [ ] 5 oct. et 2 nov., fin le 2 nov. : donnée le 10 → le 2 nov. reste ; donnée le 1ᵉʳ nov. → terminé,
  toast « Dernière dose … notée » avec « Annuler »

**6. `feat(sync): départage par appareil et politique de confidentialité`**

- [ ] À `updated_at` égal, le plus grand identifiant d'appareil gagne, sur l'appareil et sur le serveur
- [ ] Page `site/confidentialite/` (FR, EN) : l'identifiant d'appareil, ce qu'il sert à savoir, sa durée
- [ ] Nom lisible de l'appareil selon §6.8

Hors modèle, à ouvrir à part : 3f (une journée à cheval sur deux périodes, Q37 à plusieurs heures).

**Rejeu sur le téléphone** (MémoPatte Dev, règles de `collaboration.md`) : base de MémoPatte Dev
sauvegardée ; build de `main` (v10) installé et rempli (carnet de démo, un traitement à plusieurs
heures, un report, une prise en retard) ; build de la branche installé **par-dessus**, sans
désinstaller. Vérifier : l'app s'ouvre (pas « Impossible d'ouvrir l'accueil »), `user_version` = 11,
base vide puis carnet de démo rechargé, colonnes d'appareil remplies, création d'un traitement et une
prise, export v4 puis import. Ensuite base restaurée, build de `main` réinstallé. Pour les tickets 3 à
5 : les gestes (prise en plus, case cochée et décochée dans chaque geste) et la reprogrammation des
rappels qui suit.

## 5. Décisions de Gaelle et questions restantes

### 5.1 Décisions du 2026-10-03

- **Q1** : option A, « Prise en plus » (libellé exact avec la maquette). À plusieurs heures par jour,
  une heure donnée en avance couvre son échéance comme aujourd'hui (G10 inchangée).
- **Q2** : une dose reportée seule va au plus jusqu'à la veille de la dose suivante ; si la dose
  suivante est déjà notée, refus G7 ; la dose déplacée seule puis donnée un autre jour ne décale pas
  les suivantes.
- **Q3**, élargie en principe général : dès qu'une date de dose change, l'app propose « Décaler aussi
  les doses suivantes », cochée par défaut (cochée = la suite repart de la date réelle), dans les cinq
  gestes du §2.6. Seule exception : « C'est fait » en un tap sur une dose en retard, qui décale sans
  rien demander (on corrige ensuite par « Changer la date »).
- **Q4**, remplacée par la case : un message sous la case dit la dose perdue à cause de la date de fin,
  la personne choisit, sans distance minimale. « C'est fait » en un tap : la dose prévue reste, sauf à
  moins d'une demi-fréquence après la prise ; le traitement se termine alors.
- **Q5** : une prise donnée l'emporte toujours sur un report de la même échéance entre deux appareils ;
  entre deux lignes de même nature, la plus récente (`updated_at`, heure de l'appareil, §2.5).
- **Q6** : « Supprimer ce report » toujours permis ; la case « Remettre aussi les doses suivantes à
  l'ancien rythme » est grisée, avec l'aide « Une dose plus lointaine est déjà notée. », dès qu'une dose
  plus loin dans la période est notée ; décochée, seule la dose revient à sa date.

Suite, réponses aux questions de la case (même jour) :

- **N1** : pas de case pour une dose non renseignée rattrapée (Q8 gardé). Remarque de Gaelle : pour un
  traitement quotidien, une dose n'est jamais « donnée le lendemain » (le lendemain, c'est la dose du
  lendemain, celle de la veille est oubliée) ; les exemples sont hebdomadaires ou mensuels.
- **N2** : « Changer la date » rouvre la case telle qu'elle avait été laissée.
- **N3** : traitement de tous les jours, avec ou sans heures, jamais de case sur une prise (une dose
  est donnée son jour ou elle est oubliée) ; la case n'apparaît que pour un report. Traitement plus
  espacé à plusieurs heures : case seulement quand la prise complète la journée (G10). Plus espacé
  sans heure : case comme décidé.
- **N4** : ligne « Reportée au 26 oct. (prévue le 23 oct.) » acceptée, avec la proposition de séparer
  le report d'une dose du décalage du rythme, étudiée au §2.7.

### 5.2 Questions restantes sur le décalage

**N5 — Le décalage du rythme, une ligne à part ?**
Pixel, vermifuge le vendredi. La dose du 16 est reportée au lundi 19, case cochée : 19, 26, 2 nov.
Plus tard, on supprime le report en gardant le nouveau rythme : 16, puis 26, 2 nov. Je recommande de
ranger le décalage dans **une ligne à part** de l'historique des prises, supprimable seule (§2.7, (c)).
Raison : le report et le décalage vivent séparément, comme tu le proposes, sans créer de période ni de
ligne fabriquée. Alternatives : une nouvelle période à chaque décalage (blocs de période multipliés,
écriture sur deux tables, un lien à stocker) ; une seule ligne qui porte les deux (§2.6, (a)).

**N6 — Supprimer une prise qui avait décalé la suite : le décalage part-il avec elle ?**
Luna, antiparasitaire mensuel depuis le 30 juil. ; la dose du 30 août est donnée le 31, case cochée
(30 sept., 31 oct., 30 nov.). Puis on supprime cette prise (TR-26). Je recommande que **le décalage
parte avec la prise** : la suite revient au 30 (30 oct.). Raison : c'est ce qui se passe aujourd'hui, et
la personne efface ce qu'elle avait noté, pas seulement la date. Alternative : garder le décalage seul
(la suite reste au 31 ; il faudrait une case de plus sur « Supprimer »).

**N7 — Un décalage resté seul : que montre l'historique ?**
Après N5 (report du 16 supprimé, rythme gardé), le carnet montre 16, puis 26 : dix jours d'écart sans
explication. Je recommande une ligne discrète « Doses suivantes décalées · prochaine le 26 oct. »,
seulement quand le décalage n'accompagne ni prise ni report de la même échéance. Raison : l'écart se
comprend, et la ligne n'apparaît que dans ce cas rare (Q13 interdit la ligne « A fixé la dose » pour
une prise). Alternative : rien (l'écart reste inexpliqué). Libellé à voir avec la maquette.

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

`created_by_device` et `updated_by_device` (identifiant d'appareil) sur les huit tables. Chaque écriture
d'un repository les pose : création, modification, suppression, « Annuler », import. Une ligne tirée de
la synchro garde les valeurs de l'appareil qui l'a écrite (elles voyagent avec la ligne).

- **SQLite** : deux colonnes par table, dans la v11 (§3). **Supabase** : deux colonnes `uuid not null`
  par miroir, ajoutées au `grant update (…)` (l'upsert gardé réécrit toutes les colonnes) ; RLS
  inchangée.
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
- **Nom lisible** (si retenu, §6.8) : le modèle de l'appareil (« Pixel 7 »), par `@capacitor/device`,
  une dépendance nouvelle.
- **Politique de confidentialité** (`site/confidentialite/`, FR et EN) : dans la ligne « Sauvegarde et
  synchronisation Plus », ajouter « un identifiant aléatoire de chaque appareil, créé à l'installation
  (et son modèle, si retenu), pour savoir depuis quel appareil une donnée a été écrite ». Base : exécution
  du contrat. Durée : celle du carnet (supprimé avec le compte, ou 12 mois après la fin de l'accès Plus,
  comme la sauvegarde). Sans compte, l'identifiant reste sur le téléphone et dans les exports.
- **En v2**, avec (b) : la table contient le contenu du carnet, y compris supprimé jusqu'à la purge ;
  sa durée de conservation est à ajouter à la politique.

### 6.7 Recommandation

**Intuition confirmée, avec deux précisions** : (a) en v1, (b) avec le partage en v2, donc (c) en v2.

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

### 6.8 Questions pour Gaelle

**T1 — L'historique complet attend-il bien le partage (v2) ?**
Sophie a un téléphone et une tablette sur son compte Plus. Une date de rappel de vaccin est fausse.
En v1, l'app sait que la tablette a écrit la valeur actuelle, et quand ; elle ne sait pas quelle était
la valeur d'avant. Je recommande de **s'en tenir là en v1** et de créer la table d'historique avec le
partage. Raison : à une seule personne, l'appareil suffit à comprendre l'erreur ; la table coûte une
purge, un export et une politique de conservation. Alternative : la table dès la v1 (environ 1 à 2 Mo
par an et par foyer, estimé).

**T2 — Faut-il un nom lisible pour chaque appareil ?**
Même situation : l'export dit « modifié par l'appareil 3f2a… ». Sans nom, personne ne sait lequel.
Je recommande d'enregistrer **le modèle de l'appareil** (« Pixel 7 »), automatiquement, dans une petite
table synchronisée avec Plus. Raison : lisible sans rien demander, et le modèle est déjà une
information technique que la politique cite pour RevenueCat. Alternatives : un nom tapé par la personne
(un écran de plus) ; l'identifiant seul (utile au support seulement).

**T3 — Montrer quelque chose à l'écran en v1 ?**
Sur la fiche d'un vaccin : « Modifié le 3 oct. sur Pixel 7 ». Je recommande **rien à l'écran en v1** :
l'information sert au diagnostic (export, support) ; l'écran « Historique de cette fiche » viendra avec
(b). Raison : pas de maquette, et peu d'intérêt avec une seule personne. Alternative : une ligne
discrète sur les fiches, à maquetter.

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
migration ; la case dans les gestes, « Supprimer ce report » décochée (§2.6) et le départage par
appareil, non prototypés ; la taille de la table d'historique (§6.3), estimée, pas mesurée ; JSON1 dans
le SQLite du plugin Android.
