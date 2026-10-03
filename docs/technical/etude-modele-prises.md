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
- La prise en avance d'un intervalle ou plus demande **qu'une même date porte deux lignes** (la prise,
  et l'échéance qui revient). La clé actuelle (période, jour, heure) ne le permet pas.
- Recommandation : **option A + option C**. Une colonne `fixes_suite` sur la prise (« cette ligne
  refixe la suite » : prise de la dose du moment, report qui décale les suivantes), un état `extra`
  (« prise en plus », la prise en avance d'un intervalle ou plus), et un jour de référence sur la
  période (`reference_on`). Pas d'identifiant d'échéance (option B) : il coûte deux fois plus et
  ramène des orphelins dès qu'une ligne est supprimée ou redatée.
- Le choix entre A et B dépend d'une question produit (Q1 : comment l'historique montre une prise
  donnée un intervalle ou plus en avance). Six questions au §5 ; rien n'est à coder avant.

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
| 3c' | idem, dose **du moment** du 30 août donnée le 31 | 30 sept., puis **31 oct.**, 30 nov., 31 déc. | à trancher (Q3) |
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
| 3c', T2 en mois | Comportement voulu par T2 (« une prise donnée un autre jour devient la nouvelle référence »). | aucune : question produit (Q3) |
| 3d, date de fin | La prise du 10 refixe la suite au 7 nov., après la fin (TR-8) : plus d'échéance, terminé. | aucune : règle du moteur, avec un plancher à trancher (Q4) |
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
demandent une règle de produit (Q6), pas une donnée.

### 1.7 Ce qu'il faut retenir

Trois informations manquent : **ce que la ligne a fait à la suite** (sujets 2, 3a, 3b, 3c, une partie
de 4), **une identité qui ne se résume pas à la date** pour la prise en avance (sujet 1), et **le jour
de référence d'une période** en mois (3e). Le reste (3c', 3d, 3f, la seconde forme de 4) relève de
règles du moteur ou de questions produit.

## 2. Les options

Trois options, qui se combinent : A (donnée explicite sur la ligne), B (A plus un identifiant
d'échéance), C (jour de référence sur la période, à ajouter à A ou à B).

### 2.1 Option A — l'effet explicite sur la ligne, clé actuelle gardée

**Schéma** (`treatment_dose`) :

- `fixes_suite` (0 / 1, obligatoire). Prise donnée : 1 si, au moment de la noter, elle couvrait la
  dose du moment (à plusieurs heures : dernière heure du jour, les autres notées, G10) ; la suite repart
  alors de la date réelle **quand elle diffère de l'échéance**, sinon elle continue (le jour de
  référence d'un mensuel est gardé). 0 pour une dose non renseignée (Q8). Oubliée : toujours 0. Report :
  1 = « Décaler aussi les doses suivantes », 0 = seule cette dose bouge.
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

**Ce que ça règle** : 1 (sous la forme « prise en plus », voir Q1), 2, 3a, 3b (la prise en plus du
1ᵉʳ redatée au 10 redevient la prise de la dose du moment : prochaine le 17, attendu), 3c, et la forme
« échéances disparues » de 4, à condition que le moteur cesse de déclarer un report sans effet à la
lecture (§1.6). **Ne règle pas** : 3e (voir C), 3c', 3d, 3f et la seconde forme de 4 (règles, Q3, Q4,
Q6).

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
| 2, case | oui | oui | — |
| 3a, 3b, 3c | oui | oui | — |
| 3e, jour borné | non | non | oui |
| 3c', 3d, 3f | règles (Q3, Q4 ; 3f hors modèle) | idem | — |
| 4, « échéances disparues » | oui, sans péremption à la lecture | oui | — |
| 4, « l'échéance ne revient pas » | règle (Q6) | règle (Q6) | — |
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
activée). Animaux, vaccins, pesées et réglages restent. Après la publication, ce choix s'inverse : une
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
dans leur famille. Reste un vrai choix : une prise et un report de la même échéance, venus de deux
appareils (M4, Q5).

**Export.** Format **v4** : `fixesSuite` sur chaque prise, `extra` dans `status`, `referenceOn` sur
chaque période ; `prises.csv` gagne une colonne `fixesSuite`. Un champ obligatoire de plus et un état
de plus sont une rupture (`export-format.md` : « toute rupture l'incrémente »). Un v3 est refusé avec le
message existant ; sa relecture « au mieux » rejoint #469, seul endroit où la devinette survivrait
(calculer `fixesSuite` d'une ligne v3 avec l'ancienne règle).

## 3. Recommandation

**A + C**, avec la prise en avance d'un intervalle ou plus notée comme « prise en plus ».

1. A rend explicite la seule information que le moteur devine, et garde l'identité par date absolue.
   C'est ce qui rend le moteur actuel robuste : indépendant de l'ordre des lignes, une suppression ou
   un redatage ne touche que la ligne visée (relecture : aucune incohérence sur 340 000 gestes en
   dehors des constats M1 à M7).
2. C règle le seul cas qu'une donnée de ligne ne peut pas régler (la référence d'une période qui
   reprend un jour borné), pour une colonne.
3. La prise en plus suit la règle de Gaelle sans exception de date : les dates du ticket (16, 9, 8) en
   découlent, et aucune date n'apparaît deux fois dans l'historique.

**Écartée : B.** Elle n'apporte qu'une chose, la prise en avance affichée comme couvrant la dose
prévue, au prix d'une identité qui dépend d'autres lignes (cascades de réécriture, orphelins entre
appareils). Si Gaelle préfère cet affichage (Q1), B devient nécessaire : compter environ deux fois
l'effort de A.

**Choix techniques tranchés ici** (à consigner au journal des décisions autonomes) :

- v11 supprime et recrée les trois tables des traitements, sans `ALTER` ; données de test perdues.
- Le drapeau est décidé au moment de noter et gardé par « Changer la date » ; G10 n'est évaluée
  qu'une fois. Repasser une oubliée en donnée (TR-22) est une nouvelle prise : le drapeau est recalculé.
- `next_due_date` reste ; le moteur ne la lit plus que pour un report.
- Le moteur n'ignore plus une ligne écrite à la lecture, sauf deux reports du même jour (G17) et un
  report revenu à sa date. Un report dépassé (TR-24 bis) est supprimé par l'écriture de `redate`.
- Une prise en plus ne se note qu'à partir de la dernière ligne de la période (garde du type G8) : une
  prise en plus datée avant une prise existante réécrirait la grille sous elle. « Changer la date »
  d'une prise en plus lui fait viser l'échéance que viserait une prise notée à la nouvelle date (TR-13) :
  c'est ce qui règle 3b.
- Export v4, CSV complété, v3 refusé jusqu'à #469.
- Miroir Supabase par `alter`, après contrôle des miroirs vides.

## 4. Plan de livraison

Préalable : réponses de Gaelle aux questions du §5 ; maquette de la case (critère du ticket).

**1. `feat(treatments): une prise dit si elle refixe la suite (schéma v11, miroir, export v4)`**
Dépend des réponses à Q1 (la forme du sujet 1 fixe le schéma).

- [ ] v11 : `fixes_suite`, état `extra`, `reference_on` ; seulement `DROP`, `CREATE`, `INSERT`, `PRAGMA`
- [ ] Miroir Supabase : colonnes, CHECK, droit `update` ; migration appliquée avec Gaelle présente, job vert
- [ ] Repository, schémas Zod, carnet de démo, export et import v4 (v3 refusé, message existant), CSV
- [ ] Le moteur reçoit les champs ; ses résultats ne changent pas encore (tests existants verts)
- [ ] Rejoué sur le téléphone : v10 remplie, puis v11 par-dessus (voir plus bas)

**2. `fix(treatments): le moteur lit ce que la ligne a fait au lieu de le deviner`**

- [ ] 3a : dose du 8 notée le 8, redatée au 9 → dose du moment le 15
- [ ] 3b : dose du moment notée le 1ᵉʳ, corrigée au 10 → prochaine le 17
- [ ] 3c : départ le 30 juil., dose du 30 août notée le 31 → 30 oct., 30 nov., 30 déc.
- [ ] 3e : mensuel du 31 janv., posologie changée le 20 févr. → 28 févr., 31 mars, 30 avr.
- [ ] M6 : les graines 2010230, 3007564, 60011368, 85003771, 85006859, 85011306 passent ; 13503355 et
  20001783 selon Q6
- [ ] TR-24 bis : un report dépassé est supprimé par l'écriture, le toast inchangé
- [ ] M4 selon Q5 ; campagne d'invariants élargie (plages du ticket)

**3. `feat(treatments): prise donnée un intervalle ou plus en avance`** (règle 1, forme selon Q1)

- [ ] Première prise le 16 : notée le 13 → 20 ; le 9 → 16 ; le 2 → 9 ; tous les 3 jours, le 8 noté le 5 → 8
- [ ] Second « C'est fait » du jour d'un quotidien : le lendemain garde sa dose
- [ ] La dose suivante se note, se redate, se supprime ; « Annuler » rend l'état d'avant ; historique
  et PDF selon Q1
- [ ] Q8 et G10 inchangés ; G11 et TR-13 réécrites dans la spec

**4. `feat(treatments): case « Décaler aussi les doses suivantes »`** (critères du ticket, plus Q2)

- [ ] Case sous « Prochaine dose », cochée par défaut, FR et EN, seulement quand le champ déplace une dose
- [ ] Décochée : dose du 16 au lundi 19 → 19, puis 23 et 30 ; ligne « Reportée au 19 oct. (prévue le 16 oct.) »
- [ ] « Changer la date » d'un report garde le choix ; à plusieurs heures, la journée part entière (Q21)
- [ ] Bornes et prise en retard de la dose déplacée seule selon Q2

**5. `fix(treatments): une date de fin ne fait pas sauter la dose prévue après un retard`** (selon Q4)

- [ ] 5 oct. et 2 nov., fin le 2 nov., première dose donnée le 10 → la dose du 2 nov. reste
- [ ] Le plancher décidé, avec son exemple

Hors modèle, à ouvrir à part : 3f (une journée à cheval sur deux périodes, Q37 à plusieurs heures).

**Rejeu sur le téléphone** (MémoPatte Dev, règles de `collaboration.md`) : base de MémoPatte Dev
sauvegardée ; build de `main` (v10) installé et rempli (carnet de démo, un traitement à plusieurs
heures, un report, une prise en retard) ; build de la branche installé **par-dessus**, sans
désinstaller. Vérifier : l'app s'ouvre (pas « Impossible d'ouvrir l'accueil »), `user_version` = 11,
animaux, vaccins et pesées intacts, traitements vides, création d'un traitement et une prise, export
v4 puis import. Ensuite base restaurée, build de `main` réinstallé. Pour les tickets 3 et 4 : les gestes
(prise en plus, report décoché) et la reprogrammation des rappels qui suit.

## 5. Questions pour Gaelle

**Q1 — Une prise donnée un intervalle ou plus en avance : comment l'historique la montre ?**
Pixel, Milbemax hebdomadaire, première prise prévue le ven. 16 oct. ; la prise est notée le 9. Les
dates sont celles que tu as décidées dans les deux cas (prochaine le 16). Seul l'historique change.

| | « Prise en plus » (recommandé) | « Couvre la dose prévue » |
| --- | --- | --- |
| Historique | « 9 oct. · Prise en plus », puis la dose du 16 à donner | « 16 oct. · Donnée le 9 oct. », puis une seconde ligne « 16 oct. » à donner |
| Quotidien, deux « C'est fait » le même jour | la seconde est une prise en plus | la seconde couvre demain, puis demain revient |
| Modèle | option A | option B (environ deux fois l'effort) |

Raison : une prise donnée un intervalle ou plus en avance arrive quand la dose précédente a déjà été
donnée dans l'intervalle ; c'est une dose de plus, pas la dose suivante, et la date du 16 n'apparaît
qu'une fois. Alternative : la prise couvre la dose prévue, comme TR-13 aujourd'hui, avec deux lignes
« 16 oct. ». Le libellé exact (« Prise en plus », « Dose supplémentaire ») est à voir avec la maquette.
Sous-question : à plusieurs heures par jour, je recommande qu'une heure donnée en avance couvre son
échéance comme aujourd'hui (G10 inchangée), sans prise en plus ; une journée entière donnée en avance
est assez rare pour ne pas avoir de règle à part.

**Q2 — La case décochée : jusqu'où, et ensuite ?**
Milo, vermifuge hebdomadaire du vendredi, dose du 16 reportée seule. (a) Jusqu'où : je recommande
jusqu'à la veille de la dose suivante (au plus le jeu. 22). Raison : au-delà, la dose déplacée viendrait
après la suivante. Alternative : jusqu'à la date de fin, en acceptant deux doses rapprochées.
(b) Si la dose suivante est déjà notée : je recommande le refus actuel (G7, « Une dose plus lointaine est
déjà notée. »). Alternative : décaler quand même et laisser la dose suivante notée. (c) La dose déplacée
au lundi 19, donnée le mardi 20 : je recommande que les suivantes gardent le vendredi (23, 30). Raison :
la personne a choisi de ne pas décaler. Alternative : T2 s'applique, la suite passe au mardi (27).

**Q3 — En mois, une dose du moment prévue le 30 et donnée le 31 : la suite passe-t-elle au 31 ?**
Luna, antiparasitaire mensuel commencé le 30 juil. ; la dose du 30 août est donnée le 31 août.
Aujourd'hui (T2, sonde) : 30 sept., puis 31 oct., 30 nov., 31 déc. Je recommande de **garder T2** : la
date réelle devient la référence, comme pour tout autre jour. Raison : une seule règle, et donner le 31
au lieu du 30 est un vrai décalage d'un jour. Alternative : garder le jour de référence de la période
quand le retard est d'un jour en fin de mois (une exception à expliquer).

**Q4 — Une date de fin après une prise en retard : quel plancher ?**
Pixel, deux doses à 4 semaines, 5 oct. et 2 nov., fin le 2 nov. Tu as décidé que la dose du 2 nov.
reste quand la première est donnée le 10. Si la première est donnée le 1ᵉʳ nov., la dose gardée
tomberait le lendemain. Je recommande : la dose prévue reste si elle tombe **au moins une
demi-fréquence** après la prise (ici 14 jours) ; sinon la prise en retard est la dernière, et le
traitement se termine avec le toast habituel. Raison : deux doses à un jour d'écart ressemblent à une
double dose, et l'app ne doit pas la proposer d'elle-même (principe 2). Alternatives : pas de plancher
(la dose du 2 nov. reste toujours) ; demander à la personne au moment de noter (un écran de plus).
À savoir : si la date de fin change ensuite, la règle se rejoue.

**Q5 — Deux appareils : une prise donnée et un report de la même dose, lequel gagne ?**
Un téléphone reporte la dose du 15 au 20 ; une tablette, hors ligne, note la dose du 15 donnée.
Aujourd'hui, la ligne la plus récente gagne : si c'est le report, la prise disparaît et l'app redemande
une dose déjà donnée (sonde : seule la ligne du report reste, dose du moment le 20). Je recommande que
**la prise gagne toujours**. Raison : un report ne s'écrit que sur une dose sans prise ; une prise est
un fait, un report un projet, et le risque est une double dose. Alternative : garder « la plus récente
gagne » (TR-25 à la lettre, critère 12 du §8).

**Q6 — Supprimer un report quand une dose plus lointaine est déjà notée ?**
Luna, tous les 2 jours depuis le 10 mars ; dose du 10 reportée au 11, puis dose du 13 notée oubliée.
Si le report est supprimé, la grille revient au 10, 12, 14, et l'oubli du 13 ne correspond plus à rien.
Je recommande d'étendre le verrou de Q25 : « Supprimer ce report » et « Changer la date » sont retirés
dès qu'une dose plus loin dans la période est notée, avec l'aide « Une dose plus lointaine est déjà
notée. » (le texte de G7). Raison : même règle que pour déplacer une dose (G7) ; rien ne reste
orphelin. Alternative : permettre la suppression et garder l'oubli du 13 dans l'historique, hors grille.

## 6. Vérifié, pas vérifié

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
FROM … WHERE` est réécrit pendant une mise à niveau) ; les droits colonne par colonne du miroir.

**Pas vérifié** : tout ce qui est marqué « attendu » (comportement des options, aucun prototype du
moteur) ; 85006859 et 85011306 (même forme annoncée, non rejouées) ; le passage d'un `ALTER TABLE`
sur le téléphone ; le nom par défaut de la contrainte `status` dans Postgres, à lire avant d'écrire la
migration.
