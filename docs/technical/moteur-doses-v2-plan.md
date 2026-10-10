# Moteur des doses v2 — plan de mise en œuvre

Copie du dépôt ; la version de référence pour Gaelle vit dans son coffre (`technical/etudes/moteur-doses-v2-plan.md`), les règles font foi dans la spec `docs/product/specs/traitements.md` §4.8.


Document 2 sur 2 (les règles sont dans la spec `docs/product/specs/traitements.md` §4.8). Suite de l'analyse du 2026-10-10 (le rapport d'analyse du 2026-10-10 (coffre de Gaelle, `technical/relectures/architecture/`)) et des six décisions de Gaelle du même jour. Demande de Gaelle : « un moteur propre et fonctionnel, plus d'erreurs, plus de comportements différents d'un écran à l'autre, maintenable et évolutif, quitte à recommencer le moteur ; tables et colonnes libres, aucun utilisateur ».

## 1. En clair, pour Gaelle

**Ce qu'on fait.** On réécrit le cœur du moteur (la partie qui transforme réglages et lignes en calendrier, ~1 500 lignes aujourd'hui) sur un modèle plus simple : **un seul calendrier par traitement**, dont les réglages successifs ne font que changer la fréquence et les heures à partir d'un jour. On garde ce qui marche (la grille, les familles de lignes, la ligne de décalage, la prise en plus, la dose du moment). On supprime le mécanisme qui faisait tous les dégâts : la « frontière » entre deux réglages, où l'ancien était fermé et le nouveau devait tout deviner.

**Ce que ça change pour toi.** Rien de visible dans les parcours courants. Les tickets ouverts du moteur ferment (#736 l'est déjà par #747, au prix d'une règle G26 de plus que R3 rend inutile), les nouveaux défauts trouvés aussi, et surtout : « changer la posologie ne change jamais le calendrier », « un mensuel du 31 reste au 31 », « une ligne ne disparaît jamais sans ton geste » deviennent vrais **par construction**, pas par une règle de plus. Tous les écrans liront la même chose, par un seul chemin.

**Combien.** Dix pas, chacun une PR vérifiable, dont quatre sur le moteur lui-même : **12 à 16 jours de travail d'agents**, en autonomie, avec trois moments où tu es nécessaire (la relecture des règles au pas 0, la migration Supabase au pas 7, le test sur ton téléphone au pas 9). Chaque pas se prouve avec l'ancien moteur comme témoin sur des centaines de milliers de carnets, comme pour #720 ; les seuls écarts acceptés sont ceux des tickets et de tes décisions, listés un par un.

**Pourquoi réécrire plutôt que corriger.** Corriger (le plan « consolider » du rapport) touchait déjà 60 % du moteur et laissait en place `newPeriod` et la couverture entre périodes, c'est-à-dire la zone des trente règles non écrites. Pour la maintenabilité que tu demandes, il faut que la spec et le code racontent la même histoire en douze règles : c'est une réécriture de cette zone, pas un correctif. Le reste (grille, lignes, gestes de report, dose du moment) est repris tel quel.

## 2. Décisions prises pour ce plan (en autonomie, consignées au journal)

| Décision | Raison | Alternative écartée |
| --- | --- | --- |
| **Réécrire le calcul du calendrier** (`build`, `newPeriod`, couverture entre périodes, purge) ; garder grille, familles, décalage, prise en plus, dose du moment, gestes de déplacement | C'est la zone des 29 règles non écrites et de tous les défauts | Consolider pas à pas (laisse les concepts fautifs) ; refonte totale avec échéances matérialisées en base (dérivées stockées = conflits de synchro, 3 à 4 fois le coût) |
| **Les lignes appartiennent au traitement** ; `period_id` reste informatif (posologie appliquée, affichage) mais ne borne plus le calendrier | Cause racine A du rapport | Rattacher les lignes à la période suivante à la lecture (rustine) |
| **Une colonne par sens** : `target_on` (arrivée d'un report, ancrage d'un décalage) remplace `next_due_date` ; `grid_origin_on` remplace `reference_on`, avec un seul sens | `reference_on` portait quatre sens relus par arithmétique ; `next_due_date` d'une prise n'était lu par personne mais rendait un traitement illisible | Garder les colonnes et documenter leurs sens |
| **Le moteur n'écrit ni n'efface jamais à la lecture** (`staleDoseIds` disparaît, R11) | Décision Q-purge | Garder la purge avec exceptions |
| **Un seul modèle de lecture `TreatmentView`** consommé par tous les écrans, rappels, PDF, export (R12) | Décision Q-double ; 17 doubles sources relevées | Corriger chaque double source séparément |
| **Les gestes de formulaire passent par le même chemin de simulation que les gestes de fiche** : « Modifier » = `preview(gesture)` du moteur sur le carnet simulé, le formulaire affiche ce que la lecture rendra | Graine 510001190 : proposition ≠ résultat | Garder `calculatedFirstDue` et trois simulateurs |
| **Schéma v12, export v5**, import des v3/v4 par conversion | Aucun utilisateur ; la clarté du modèle vaut une migration | Garder v11 et interpréter |
| **Ancien moteur gardé comme oracle** dans `src/shared/domain/__legacy__/` jusqu'au pas 10, puis supprimé | Preuve de non-régression sur les parcours justes | Comparer à la main |

## 3. Modèle de données cible (schéma v12)

### 3.1 `treatment_period` → réglage

| Colonne | Changement | Sens |
| --- | --- | --- |
| `starts_on` | gardée | Premier jour où le réglage vaut |
| `first_due_on` | gardée | Première échéance (R1) |
| `grid_origin_on` | **remplace** `reference_on` | Origine de la grille (R2) ; = `first_due_on` à la création et à la reprise ; héritée (R3) quand la fréquence ne change pas. **Un seul sens.** |
| `ends_on`, `stopped_on`, `frequency_*`, `times`, `dose_*`, `reminder_*` | gardées | |

Migration : `grid_origin_on` = `reference_on` si `reference_on` est bien sur la grille qui passe par `first_due_on` (cas mensuel du 31), sinon `first_due_on` (les marqueurs G23, G24, Q8 encodés dans `reference_on` sont abandonnés : le moteur v2 n'en a plus besoin). Les anciennes périodes « ouvertes aujourd'hui pour recopier » restent des réglages valides.

### 3.2 `treatment_dose` → ligne

| Colonne | Changement | Sens |
| --- | --- | --- |
| `treatment_id` | gardée, **c'est la clé du calendrier** | |
| `period_id` | gardée, **informative** (nullable à terme) | Réglage dont la posologie s'applique à la prise, pour l'historique et le PDF |
| `due_on`, `due_time` | gardées | Échéance visée (prise, report, décalage) ; pour une prise en plus, `due_on` = date réelle |
| `given_on` | gardée | Date réelle (prise, prise en plus) |
| `status` | gardée : `given`, `missed`, `extra`, `postponed`, `shift` | |
| `target_on` | **remplace** `next_due_date`, nullable | Report : jour d'arrivée ; décalage : jour d'ancrage ; prise : `NULL` |
| `with_shift` | **non** (le décalage reste une ligne à part, décision de Gaelle du 2026-10-03) | |

Contraintes : une ligne par (`treatment_id`, `due_on`, `due_time`, famille) côté local (garde d'unicité étendue aux lignes reçues par la synchro : la plus récente gagne, l'autre est **gardée mais sans effet**, R11). Index `(treatment_id, due_on, due_time)` gardé.

### 3.3 Export, import, Supabase

- **Export v5** : périodes avec `gridOriginOn`, lignes avec `targetOn` ; `nextDueDate` disparaît. Les CSV `prises.csv` et `traitements.csv` lisent la vue (R12).
- **Import** v3 et v4 : conversion à la lecture (`reference_on` → règle ci-dessus ; `next_due_date` → `target_on` pour `postponed` et `shift`, ignoré pour les prises). **L'import relit chaque traitement par le moteur** (Q40) et refuse le fichier, ou marque le traitement, avant d'écrire : aujourd'hui l'import n'appelle jamais le moteur.
- **Supabase** : migration miroir v12 (colonnes renommées, données converties par la même règle), appliquée par la CI avec Gaelle présente (règle du dépôt).
- **Synchro** : rien de nouveau dans le protocole ; la garde d'unicité s'applique aussi au `pull` (deux lignes de même échéance et famille : la plus récente reste lue, l'autre est marquée sans effet, visible dans l'historique, supprimable).

## 4. Architecture du code

### 4.1 Le moteur : `src/shared/domain/dose-calendar/`

Un dossier, des modules **par règle**, chacun pur (aucune horloge, aucun accès aux données), ~1 000 à 1 200 lignes au total (contre 2 660 aujourd'hui), ordre de dépendance strict :

| Module | Règles | Contenu |
| --- | --- | --- |
| `types.ts` | — | `Setting` (réglage), `Line` (prise, prise en plus, report, décalage), `Due`, `Calendar`, `Gesture`, `LineChange`, `Refusal` |
| `lines.ts` | TR-25, R11 | Familles, fusion « la plus récente gagne », lignes **sans effet** (marquées, jamais retirées) |
| `settings.ts` | R1, R3 | Suite des réglages valables par intervalle de jours ; origine héritée ; fermeture par arrêt |
| `grid.ts` | R2 | Journées d'une origine et d'une fréquence dans un intervalle, bornes de mois |
| `calendar.ts` | R4, R5, R6, R7 | **Le cœur** : à partir des réglages et des lignes, dans l'ordre chronologique des lignes, produit toutes les échéances du traitement avec leur état (à donner, couverte par telle prise, retirée par tel report, arrivée de tel report, décalée par tel décalage, sans effet). Une seule passe, un seul algorithme, écrit pour être lu comme la règle |
| `moment.ts` | TR-10, TR-11, TR-13, Q23 | Dose du moment par journée, en retard, à renseigner, à venir ; phases |
| `gestures/note.ts` | R5, R6, G19, Q4 | « C'est fait », « Fait à une autre date », renseigner : lignes à écrire, case proposée, refus, journées perdues |
| `gestures/move.ts` | R7, G6, G7, Q20, Q25, Q2 a | « Prochaine dose », report seul ou avec décalage, bornes, refus |
| `gestures/redate.ts` | R6 (Q-C1), G19, G21 | Correction de date = retrait + note au nouveau jour, **évaluée à ce jour** ; le report qui suit |
| `gestures/remove.ts` | R11, Q25, N8 | Supprimer une prise, un report, un décalage ; refus |
| `gestures/settings.ts` | R9, R10, Q38 | Nouveau réglage : première échéance proposée, origine, remplacement le jour même |
| `view.ts` | R12 | `TreatmentView` : la lecture unique (§4.2), construite depuis `calendar` + `moment` + les prédicats des gestes |
| `preview.ts` | R12 | `preview(view, gesture)` : la vue **après** le geste, sur le carnet simulé (remplace les trois simulateurs d'écritures et `calculatedFirstDue`) |
| `index.ts` | — | `treatmentView(input)` seule entrée publique |

Invariants du dossier, vérifiés par un test de garde statique : aucun import de `@/features`, de `@/core`, de l'horloge ; aucun module ne dépasse 300 lignes ; `calendar.ts` est le seul à produire des échéances ; aucun module ne connaît « aujourd'hui » sauf `moment.ts` et les gestes, qui le reçoivent en paramètre.

### 4.2 La lecture unique : `TreatmentView`

```
TreatmentView {
  phase, finished, stoppedBeforeFirstDose, endedOn
  currentDoses[], unloggedDoses[], upcoming(window), nextDue, lastDueDay
  history: HistoryLine[]           // une par ligne, avec effet / sans effet, textes à dériver (prévue le…, donnée le…, reportée au…, décalage → prochaine le…)
  dueState(due): 'pending' | 'given' | 'missed' | 'extra' | 'moved' | 'covered' | 'removed'
  alreadyNotedOn(due, today)       // TR-21, Q33 (une seule définition)
  extraBoundary(due)               // R5 : premier jour où une prise serait une prise en plus (plus de dichotomie)
  canNote(due, givenOn) → { allowed, offersShift, refusal, lostToEnd }
  canMove(due, alone) → bounds | refusal
  canRedate(lineId, givenOn, shift) → …
  canRemove(lineId) → refusal | null
  gestures: { note, move, redate, remove, newSettings }   // → LineChange[] | PlanChange
  reminders(window)                // échéances à programmer (du jour, prévenance, relance), lues ici et nulle part ailleurs
  currentSetting, settingAt(day)   // posologie et heures en vigueur un jour donné (PDF, historique)
}
```

Règle d'écriture : **toute règle produit sur les doses vit dans `dose-calendar/`**. `features/treatments/logic/` ne garde que : la traduction des `LineChange` en écritures repository (`treatment-dose-writes.ts`, réduit), les textes (i18n), la mise en forme pour chaque écran. Les fichiers qui recodaient des règles disparaissent ou fondent : `treatment-other-date.ts` (`dayDues`, `momentDue`), `treatment-notification.ts` (`isExtraOn`, `earliestGivenOn`), `treatment-shift-box.ts` (`lostDays`, `dosesAfter`, `refusedDays` sur 62 jours), `treatment-next-dose-move.ts` (`dosesWith`, `inBounds`), `treatment-edition-plan.ts` (`historyAfter`, `shiftDeletes`), `treatment-edition-change.ts` (`calculatedFirstDue`, `referenceOn` décidé à l'écran), `treatment-stop.ts` (`stopDues`), `treatment-carnet.ts` et `home/logic/todo-items.ts` (« en retard » recalculé), `treatment-reminders.ts` et `reminder-plan.ts` (lisent `view.reminders`).

### 4.3 Ce que les écrans deviennent

| Écran / service | Avant | Après |
| --- | --- | --- |
| Fiche, gestes | `doseFor`/`redate`/`move` + 6 modules de logique qui recalculent | `view.gestures.*` et `view.can*` ; textes seuls |
| Formulaire « Modifier » / « Reprendre » | `newPeriod` + plancher + `referenceOn` à l'écran + 3 simulateurs | `view.gestures.newSettings(...)` puis `preview(view, plan)` : le formulaire montre les dates **que la lecture rendra** |
| Accueil, « À faire » | `treatmentSchedule` direct, « en retard » par `differenceInCalendarDays`, Q33 recodée | `view.currentDoses`, `view.unloggedDoses`, `view.alreadyNotedOn` |
| Notifications | `notificationTarget` + dichotomie + ancienne clé | `view.alreadyNotedOn`, `view.extraBoundary`, `view.gestures.note` |
| Rappels | `reminder-plan.ts` lit 5 champs et recode RA-4/RA-5 | `view.reminders(window)` (RA-4, RA-5, relance « toutes les heures encore dues » dedans) |
| Carnet, PDF, CSV | `treatment-outlook`, `pdf-content` replie sur les lignes brutes | `view.history`, `view.phase`, `view.unloggedDoses` ; un traitement illisible est **affiché comme tel**, jamais replié sur le brut |
| Export / import | recopie brute ; import sans moteur | export v5 depuis les lignes ; import converti puis **relu par le moteur** avant écriture |
| « Ne plus suivre », arrêt | `periods.at(-1)` brut | `view.currentSetting` |

## 5. Les dix pas (une PR chacun, dans l'ordre)

Chaque pas liste **ce qu'il livre**, **comment il se prouve**, et **ce qu'il ferme**. Les quatre commandes du dépôt sont vertes à chaque PR ; les pas 2 à 6 ajoutent l'oracle (§6).

| # | Pas | Livre | Preuve | Ferme | Jours |
| --- | --- | --- | --- | --- | --- |
| 0 | **Spec et décisions** | `traitements.md` : §4 réécrit avec R1 à R12 à la place de G1 à G25 (TR-7, TR-9, TR-24, TR-24 bis, TR-28 alignées), §10 : décisions du 2026-10-10, §11 vidé ; `decisions-log.md` ; `modele-de-donnees-v2.md` §3.3 ; tickets du plan créés, tickets moteur ouverts rattachés | Relecture par Gaelle (le seul pas qui l'attend avant de coder) | — | 1 |
| 1 | **Témoins** | `scripts/dose-engine/oracle.ts` : rejoue deux moteurs sur N carnets aléatoires (générateur de la campagne, réglages changés compris) et liste les écarts par graine avec le carnet extrait ; le jeu de recette (§3 des règles, 64 scénarios) entre dans `src/shared/__tests__/dose-calendar.recette.spec.ts` avec les attentes v2 (rouges attendus listés) ; **modèle de référence naïf** (`reference-model.ts`, ~150 lignes : grille + lignes dans l'ordre, sans optimisation) | Oracle moteur actuel contre lui-même : zéro écart ; modèle naïf contre moteur actuel : écarts = la liste des défauts connus | — | 1,5 |
| 2 | **Moteur v2, lecture** | `dose-calendar/` : `types`, `lines`, `settings`, `grid`, `calendar`, `moment`, `view` (lecture seule, sans gestes), entrée `treatmentView` ; les anciens types d'entrée acceptés par un adaptateur (`reference_on`, `next_due_date` convertis en mémoire) | Oracle ancien/v2 sur 300 000 carnets **sans changement de réglage** : zéro écart hors prises en plus et lignes sans effet (listés) ; sur 300 000 **avec** réglages : chaque écart rattaché à un ticket ou une décision ; recette : tous verts sauf gestes ; tests unitaires par règle (un fichier par module) | #736, #738, #741, #743, #745, graines 5000008xx | 3 |
| 3 | **Moteur v2, gestes** | `gestures/note`, `move`, `redate`, `remove` ; `preview` ; refus et textes de confirmation | Oracle sur les gestes (même générateur, mêmes graines) : écarts = Q-C1, Q-purge, G19 incomplet ; recette verte ; campagne d'invariants **v2** (§6.3) 3 × 3 000 × 40 | #734, Q-C1, Q-purge | 2,5 |
| 4 | **Moteur v2, réglages** | `gestures/settings` (R9, R10, Q38) ; `preview` d'un plan | Oracle sur `newPeriod` : écarts = #719, #744, #736, 520002718, 510001190 ; recette verte | #719, #744, 520002718, 510001190 | 1,5 |
| 5 | **La vue dans les écrans, lecture** | Fiche, Carnet, accueil, « À faire », PDF, CSV, outlook lisent `TreatmentView` ; suppression des recalculs (§4.3) ; `home/logic/todo-items.ts` par l'adaptateur | Captures émulateur avant/après au pixel sur le carnet de démo et sur dix carnets extraits (scripts `scripts/test-device/`) ; tests des écrans existants verts avec attentes inchangées | 7 doubles sources | 2 |
| 6 | **La vue dans les gestes et formulaires** | « C'est fait », feuille, notification, « Donnée quand ? », « Modifier », « Reprendre », « Arrêter » passent par `view.gestures` et `preview` ; `treatment-dose-writes.ts` réduit à la traduction ; #654 par construction | Oracle bout en bout : un script rejoue 10 000 suites de gestes par les **services** (SQLite en mémoire) et compare les lignes écrites avec celles du moteur v2 seul ; captures émulateur | #654, 10 doubles sources | 2 |
| 7 | **Schéma v12, export v5, Supabase** | migration locale (rejouée sur l'émulateur v11 rempli → v12), miroir Supabase (CI, **Gaelle présente**), export v5, import v3/v4/v5 convertis et **relus par le moteur**, carnet de démo, fixtures | Test de migration sur un carnet v11 extrait de la campagne : vue identique avant/après ; import d'exports v3/v4 existants ; CI `fuseaux` | import sans moteur, `next_due_date` illisible | 1,5 |
| 8 | **Rappels** | `view.reminders` remplace `reminder-plan.ts` et `treatment-reminders.ts` ; relance et prévenance dans la vue ; action de notification par `view.gestures.note` | Tests de `core/notifications` inchangés ; comparaison des 400 rappels programmés avant/après sur dix carnets (émulateur, `dumpsys alarm`) | double lecture « journée notée » | 1 |
| 9 | **Test sur le téléphone de Gaelle** | MémoPatte Dev, carnet de démo + un carnet avec reports, décalages, changements de réglage ; parcours de la recette joués à la main | Gaelle | — | 0,5 |
| 10 | **Suppression de l'ancien moteur** | `__legacy__/` supprimé, oracle réduit à « v2 contre modèle naïf », campagne v2 seule, docs à jour | Quatre commandes, campagne 3 × 3 000 × 40 verte, `pnpm build-only` identique | — | 0,5 |

**Total : 17 jours** d'agents, sur deux à trois semaines calendaires avec les relectures ; les pas 2-3-4 sont séquentiels, 5 et 7 peuvent commencer dès 2, 8 dès 5.

## 6. Comment on prouve qu'on ne casse rien

### 6.1 L'oracle (pas 1)

`scripts/dose-engine/oracle.ts` prend un générateur de carnets (celui de la campagne, avec les gestes tirés au sort et, à chaque geste, **le carnet entier rejoué par les deux moteurs**), et sort par graine : affichage ancien, affichage v2, premier geste où ils divergent, carnet extrait avant ce geste. Un écart est **accepté** seulement s'il est rattaché à un ticket (#719, #734, #738, #741, #743, #744, #745 ; #736 et sa règle G26, fermés par #747) ou à une décision (Q-C1, Q-G3, Q-#744, Q-§11, Q-purge, G19 incomplet) ; la liste des écarts acceptés vit dans `scripts/dose-engine/ecarts-acceptes.md` et tout écart hors liste bloque la PR. Volume : 300 000 carnets sans changement de réglage (où l'ancien moteur est juste), 300 000 avec.

### 6.2 Le modèle de référence naïf (pas 1)

Un second calcul du calendrier, **indépendant du moteur**, écrit en ~150 lignes sans aucune optimisation : grille jour par jour depuis l'origine, puis les lignes appliquées dans l'ordre (prise → couverte ; report → retirée et ajoutée ; décalage → nouvelle origine), puis dose du moment. Il ne sert qu'aux tests : v2 doit lui être identique sur tous les carnets, sans exception. C'est lui qui garantit que le moteur **dit ce que les douze règles disent**, et pas « ce que l'affichage d'avant disait ».

### 6.3 La campagne d'invariants v2 (pas 3)

Réécrite pour ne vérifier **que des invariants indépendants de l'affichage d'avant** :

1. Conservation des faits : l'ensemble des lignes écrites par la personne ne change que par ses gestes (R11).
2. Pas de double : pour toute journée, prises notées ≤ heures du réglage en vigueur ce jour-là ; jamais deux échéances identiques à donner.
3. Posologie : `newSettings(même fréquence, mêmes heures)` donne un calendrier identique jusqu'à l'horizon de toutes les lignes, **sans exemption**.
4. Temps : l'union (à renseigner ∪ du moment ∪ à venir) jusqu'à un horizon fixe est la même à J et J+k.
5. Symétrie : « Fait à une autre date J » et « C'est fait puis Changer la date vers J » donnent le même calendrier (R6).
6. Annuler : les écritures inverses rendent la vue d'avant.
7. Préversion : `preview(view, geste)` = `treatmentView(carnet après écriture)` pour tout geste accepté (R12 ; ferme la famille 510001190).
8. Équivalence au modèle naïf à chaque pas.

Horizon en **jours** (pas en échéances), aucune exemption `isKnownLimit`, et la spec imprime le carnet avant le geste fautif. Mode d'emploi inchangé (`.claude/rules/outils-de-test.md`) ; séries à partir de 530 M.

### 6.4 L'application

Captures émulateur au pixel sur les parcours de la recette (pas 5, 6, 8), test sur le téléphone de Gaelle (pas 9), CI fuseaux (Kiritimati, Pago Pago, Santiago).

## 7. Impacts hors moteur, à ne pas oublier

- **Textes** : les aides de « Prochaine dose » (`calculated`, `scheduled`, `calculated-passed`, `today`) sont recalculées depuis `preview` ; les toasts de redatage (G19, G21) viennent de `view.gestures.redate` ; aucun nouveau texte produit sans maquette : les textes existants sont réutilisés, un texte qui change de sens est posé en question à Gaelle avant la PR.
- **Historique** : une ligne « sans effet » (R11) a un affichage : proposition « Reportée au 4 oct. · sans effet » en gris, menu « Supprimer » seul. **Question à Gaelle** au pas 0 (texte vu par l'utilisateur).
- **Carnet de démo** et fixtures de test : convertis au pas 7.
- **Site** (FAQ des rappels et des traitements) : relire les phrases qui décrivent les reports ; aucune ne devrait changer.
- **Performance** : une passe linéaire ; l'ancien `redate` reconstruisait l'état jusqu'à six fois ; viser < 5 ms par traitement sur 400 échéances (test de `treatment-schedule.perf.spec.ts` repris).
- **Fuseaux** : rien de nouveau ; `today` reste un paramètre, les jours des chaînes `yyyy-MM-dd`.

## 8. Tickets (créés le 2026-10-10 : épic #758, pas 1 à 10 = #748 à #757)

Un épic « Moteur des doses v2 » et un ticket par pas (1 à 10), chacun avec : les règles couvertes, la preuve attendue, les tickets qu'il ferme (`Closes`), les fichiers possédés. Les tickets ouverts #719, #734, #738, #741, #743, #744, #745 reçoivent un commentaire « fermé par le pas N de l'épic » et restent ouverts jusqu'à la PR qui les ferme ; #721 est fermé au pas 10 (ses graines rejouées par l'oracle) ; #654 au pas 6 ; #487 et #655 (rangement du code des traitements) sont absorbés par les pas 5 et 6.

## 9. Risques et parades

| Risque | Parade |
| --- | --- |
| Un écart de l'oracle qu'on ne sait pas rattacher à un ticket | Il bloque la PR ; soit c'est un défaut de v2 (corrigé), soit un défaut de l'ancien moteur non connu (ticket créé, écart accepté avec exemple) : jamais « accepté sans raison » |
| Les douze règles laissent un cas sans réponse | Le modèle naïf le révèle (il faut écrire la règle pour le coder) ; la question va à Gaelle avec exemple, recommandation, alternative, **avant** le code |
| Dérive du périmètre (tentation de toucher les écrans au pas 2) | Un pas = une PR = ses fichiers ; les pas 5 et 6 seuls touchent les écrans |
| Migration Supabase | Gaelle présente, CI, migration rejouée sur l'émulateur v11 rempli, règle du dépôt |
| Temps | Les pas 2-3-4 sont le cœur (7 jours) ; si le pas 2 révèle une règle fausse, on s'arrête et on corrige le document des règles, pas le code |

## 10. Ce qui est attendu de Gaelle

1. **Pas 0** : relire la spec `docs/product/specs/traitements.md` §4.8 (douze règles, un quart d'heure) et répondre à la question du texte « sans effet » (§7). Tout le reste se fait en autonomie, consigné au journal.
2. **Pas 7** : être présente pour la migration Supabase.
3. **Pas 9** : une heure sur son téléphone avec la recette.
