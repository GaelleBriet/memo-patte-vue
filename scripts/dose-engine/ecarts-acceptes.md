# Écarts acceptés entre le moteur actuel et le moteur v2

> Archive depuis le pas 10 de l'épic #758 (2026-10-13) : l'ancien moteur (« moteur actuel » ci-dessous)
> et la reconnaissance des familles par l'oracle (`ecarts.ts`) sont supprimés. Ce fichier garde, pour
> chaque écart, la décision qui le justifie ; les graines citées ne se rejouent plus contre l'ancien
> moteur.

Un écart n'est accepté que rattaché à un ticket ou à une décision (spec `docs/product/specs/traitements.md`
§4.8 et §10, plan `docs/technical/moteur-doses-v2-plan.md` §6.1). Les familles sont celles que l'oracle
reconnaît (`ecarts.ts`) ; les scénarios sont ceux du jeu de recette (`src/shared/__tests__/dose-calendar.recette-*.spec.ts`,
marqués `it.fails` tant que le moteur en essai ne les tient pas). Dates de 2026.

## Familles de l'oracle (lecture d'un même carnet)

| Écart                            | Rattachement                                                                                                                                       | Exemple                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| famille `lignes-du-traitement`   | #719, #743, #745 ; décision Q-§11 ; plan §2 « les lignes appartiennent au traitement » (R1, R6, R7)                                                | Graine 530000146. Vermifuge hebdomadaire de Milo du 1er mars (fin le 20). Le 2 : dose du 1er reportée seule au 6, dose du 8 reportée au 12 avec décalage, posologie changée (nouveau réglage, première dose le 12). Le 3, la prise notée pour le 6 est supprimée : le moteur actuel ne redemande plus la dose du 6 (le report appartenait à l'ancien réglage), le moteur v2 la redemande.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| famille `lignes-sans-effet`      | décision Q-purge (R11) ; #719                                                                                                                      | Graine 530000006. Vermifuge hebdomadaire de Milo du 20 mars (fin le 3 avr.), dose du 27 reportée au 31 avec décalage ; le 20, fréquence passée à tous les 3 mois à 20 h. Le moteur actuel tient le report pour sans effet et le fait purger ; le moteur v2 le garde : dose du 31 mars à 20 h.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| famille `prises-du-traitement`   | #738, #741 ; graines 500000856, 510000010, 500001712 (R4)                                                                                          | Graine 530000397. Métacam de Luna toutes les 2 semaines à 8 h et 20 h du 9 avr. ; le 12, les deux doses du 23 sont données en avance, puis la fréquence passe à tous les 2 jours à 20 h. Le moteur actuel redemande le 23 à 20 h (la prise appartenait à l'ancien réglage) ; le moteur v2 la tient pour donnée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| famille `reglage-meme-frequence` | #734, #738 ; graine 520002718 ; R3 (le calendrier ne bouge pas quand la fréquence est gardée)                                                      | Graine 530000040. Vermifuge quotidien de Milo du 6 avr. Le 12 : dose du 14 reportée au 21 avec décalage, posologie changée (le moteur actuel fait commencer le nouveau réglage au 21), puis le décalage supprimé. Le moteur actuel ne demande plus rien du 15 au 20 ; le moteur v2 reprend tous les jours dès le 15. Le réglage hérite de la grille en vigueur dans son épisode (après un arrêt, celle de la reprise) et des seuls décalages de même fréquence : graine 560001008, vermifuge hebdomadaire arrêté le 3 avr., repris le 3 (première dose le 5), nouveau réglage le 8 : le moteur actuel suit la grille du 8 (8, 15 avr.), le moteur v2 celle du 5 (12, 19 avr.) ; graine 560003279, tous les 2 jours, décalage écrit le 22 mars, le 27 deux réglages mensuels le même jour (premières doses le 26 avr., puis le 4 avr.), décalage du 26 avr. supprimé : le moteur actuel suit le 4 (4 mai, 4 juin), le moteur v2 garde la grille du premier réglage mensuel (26 mai, 26 juin), le décalage du 22 mars étant dépassé par le changement de fréquence (R3, R6). |
| famille `mensuel-du-31`          | #736 (G26 n'en couvre qu'une partie) ; R3                                                                                                          | Graine 530000736. Antiparasitaire mensuel de Luna à 6 h, 12 h, 18 h et 23 h, première dose le 31 mars ; le 29 mars, nouveau réglage aux mêmes heures, première dose le 3 avr. (arrivée d'un report). Le moteur actuel fait repartir la grille du 30 avr. : 30 mai ; le moteur v2 garde le 31 : 31 mai.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| famille `reprise-meme-jour`      | décision Q-G3 (R8)                                                                                                                                 | Graine 530000789. Vermifuge quotidien de Milo : dose du 6 avr. donnée, « Arrêter » le 6, « Reprendre » le 6 à 20 h. Le moteur actuel redemande la dose du 6 à 20 h ; le moteur v2 la tient pour donnée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| famille `marqueur-reference`     | plan §2 et §3.1 (`grid_origin_on` remplace `reference_on`, un seul sens ; marqueurs G23, G24, Q8 abandonnés) ; cause racine B du rapport d'analyse | Graine 530014656. Antiparasitaire mensuel de Luna à 20 h du 25 mars ; le 27, posologie changée, le moteur actuel écrit la première dose au 27 et la grille au 8 mai (marqueur G23). Le moteur actuel ne connaît pas le 8 avr. ; le moteur v2, qui lit la grille du 8, demande le 8 avr.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| famille `reglage-remplace`       | #744, décision Q-#744 (R10)                                                                                                                        | Graine 530012060. Le 16 avr., fréquence passée à toutes les 6 semaines puis, le jour même et sans prise, à tous les 3 jours : le moteur actuel fait partir le dernier réglage du 27 mai, d'après le réglage remplacé ; le moteur v2 continue la grille de tous les 3 jours d'avant (18, 21, 24 avr.).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| famille `prise-orpheline`        | #762, décision du 2026-10-10 (R4 « une prise ne se perd jamais » ; R6, pas de case quand une ligne existe plus loin, au pas 3)                     | Graine 530000551 (réglages `sans`). Vermifuge hebdomadaire de Milo du 14 mars (fin le 28) : dose du 21 notée le 18 avec décalage (suite au 25), puis la prise du 14 corrigée au 12 avec décalage : la grille passe au 19, la prise du 21 ne vise plus aucune échéance. Le moteur actuel redemande le 25 ; le moteur v2 le tient pour couvert par la prise du 21, première échéance qui suit à moins d'une semaine. Le jour d'une telle prise peut aussi faire passer une dose en retard « à renseigner » pour le moteur actuel seul. La prise couvre la première échéance qui suit la sienne, jour et heure (graine 550248567, ci-dessous) ; une prise qui vise une journée de sa grille le jour où son réglage cède la place garde son échéance (R1) et n'est jamais orpheline ; hors de la grille (graine 570002709, première dose du 14 mars hors de la grille héritée du 12), elle reste orpheline.                                                                                                                                                                    |
| famille `reports-en-boucle`      | #763, décision du 2026-10-10 (R7 : la correction qui ferait se renvoyer une dose entre deux reports est refusée) ; refus des gestes au pas 3       | Graine 530001062. Toutes les 6 semaines à 8, 14 et 20 h du 15 mars : 14 h du 23 mai reportée seule au 5 juin, puis « Changer la date » de la prise de 20 h du 15 mars (au 25, avec décalage) réécrit l'autre report en « 5 juin avancée au 23 mai » : deux reports se renvoient la dose. Le moteur actuel ne demande plus rien le 23 mai ; le moteur v2 lit les reports dans l'ordre de leurs journées et la redemande. Même famille à trois reports ou plus (graine 550123096 : 20 h du 13 juin → 14 juin → 29 juin → 13 juin, après une correction de date). Après le pas 3, seule une ligne reçue par la synchro peut encore produire ce carnet.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| famille `dose-en-retard`         | décision Q-retard du 2026-10-10 (R9, TR-28)                                                                                                        | Graine 580011308. Antiparasitaire de Luna tous les 3 mois, sans heure, du 1er mars ; dose du 1er non donnée ; le 4, la dose du 1er juin avancée au 11 mars avec décalage, puis heures passées à 8, 14 et 20 h (fréquence gardée). Le moteur actuel range la dose du 1er mars à renseigner et montre le 11 ; le moteur v2 la garde en retard, dose du moment, comme avant la modification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| famille `decalage-hors-grille`   | décision de Gaelle du 2026-10-12, appliquée à la lettre (R6, R10)                                                                                  | Graine 550250118 (réglages `sans`, sans filtre). Toutes les 6 semaines à 8 h et 20 h du 25 mars, fin le 17 juin : la dose de 20 h du 25 donnée le 23 avec décalage (la grille passe au 23 : 4 mai, 15 juin), 20 h du 15 juin reportée au 17 avec décalage ; le 1er avr., la prise du 25 corrigée au 31, case décochée : le décalage du 25 tombe, la grille revient au 25 (6 mai, 17 juin). Le 15 juin n'est plus une échéance : son décalage est sans effet pour le moteur v2, que le moteur actuel applique encore. Un décalage ne vaut que si sa journée d'origine est une échéance de la grille telle qu'elle est avant lui, ou l'arrivée d'une dose reportée du rythme en vigueur ; l'oracle le rattache quand le moteur actuel, relu sans ces décalages, lit comme le moteur v2 (`ecarts-lignes.ts`). Même famille : graine 550048773 ; graine 520002718 (recette), 13 et 19 mars puis 2 avr. au lieu du 5.                                                                                                                                                           |

## Scénarios du jeu de recette que le moteur actuel ne tient pas

| Écart                               | Rattachement                                      | Exemple                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| scénario #719                       | #719, Q-§11                                       | Hebdo (1, 8, 15, 22), le 2 : dose du 15 reportée seule au 17 pendant que le 8 est à venir, posologie changée : 8, 17, 22 attendus, le moteur actuel montre 8, 15, 22.                                                                                                                                               |
| scénario #734                       | #734, décision Q-retard                           | Tous les 2 jours à 8 h et 20 h : 8 h du 3 donnée, 20 h reportée seule au 4, posologie changée le 4, « Supprimer ce report » : 20 h du 3 en retard (Q-retard), rien le 4, puis le 5 ; le moteur actuel redemande 8 h et 20 h le 4.                                                                                   |
| scénario voisin de #734             | #734, décision Q-purge (R11)                      | Tous les 2 jours à 8 h et 20 h, rien noté le 3, journée du 3 reportée seule au 4, posologie changée le 3, puis « Supprimer ce report » : 8 h et 20 h du 3 reviennent, puis le 5 ; le moteur actuel montre le 4.                                                                                                     |
| scénario #738                       | #738                                              | Tous les 2 jours à 8 h et 20 h : 20 h du 3 donnée, posologie changée le 3, prise supprimée : 20 h du 3 doit revenir ; le moteur actuel ne la redemande plus.                                                                                                                                                        |
| scénario #741                       | #741                                              | Tous les 3 mois à 6, 12, 18 et 23 h du 10 mars : 23 h reportée au 12 avec décalage, 23 h du 12 donnée le 5, le 12 passage à chaque semaine à 8 h et 20 h : rien le 12, puis le 19 ; le moteur actuel redemande le 12.                                                                                               |
| scénario #743                       | #743                                              | Tous les 3 mois à 8 h et 20 h du 29 mars, les deux doses du 29 données le 28 avec décalage, heures passées à 8, 14 et 20 h le 28 : 28 juin, 28 sept. ; le moteur actuel repart du 29 : 29 mars, 29 juin.                                                                                                            |
| scénario #744                       | #744, décision Q-#744 (R10)                       | Journée du 3 reportée seule au 4, le 3 fréquence passée à tous les 3 jours puis ramenée à tous les 2 jours : 4, 5, 7 ; le moteur actuel montre 3, 5, 7. Le réglage du 3 est remplacé (R10), pas empilé (gestes de réglage du pas 4).                                                                                |
| scénario #745                       | #745                                              | Tous les 6 jours à 8, 14 et 20 h : 14 h du 1er reportée seule au 3, posologie changée le 2, 20 h du 3 reportée seule au 5 et donnée, 9 h seule le 5 : 7, 13 ; le moteur actuel montre 9, 15.                                                                                                                        |
| scénario plusieurs changements le 4 | décision Q-#744 (R10)                             | Tous les 2 jours, 20 h du 3 reportée seule au 4, le 4 fréquence passée à tous les 3 jours puis ramenée à tous les 2 jours : 4 (20 h), 5, 7 ; le moteur actuel montre 4, 6, 8.                                                                                                                                       |
| scénario Q-C1                       | décision Q-C1 (R6)                                | Hebdo du vendredi, dose du 16 oct. notée le 16, corrigée le 25 « donnée le 24 » (case cochée) : la dose du 23 donnée le 24, celle du 16 à renseigner, puis 31 oct., 7 nov. (Q-C1 étendue, 2026-10-11 : une prise en retard ne couvre qu'une dose) ; le moteur actuel garde la dose du 23 en retard. Gestes : pas 3. |
| scénario Q-G3                       | décision Q-G3 (R8)                                | Dose du jour donnée, « Arrêter », « Reprendre » le soir même : rien à redonner ; le moteur actuel redemande la dose.                                                                                                                                                                                                |
| scénario deux appareils             | décision Q-purge (R11)                            | A note la dose du 16, B la reporte seule au 19 : la prise gagne, le report reste dans le carnet, sans effet ; le moteur actuel le purge à l'écriture suivante.                                                                                                                                                      |
| graine 500000856                    | #741 (famille) ; R4, R9                           | Tous les 2 jours à 8 h et 20 h du 15 mars, 20 h du 20 reportée seule au 24 ; le 24, toutes les 6 semaines à 20 h, 20 h du 24 notée oubliée, puis toutes les 2 semaines à 8 h et 20 h : rien le 24 ; le moteur actuel redemande 20 h.                                                                                |
| graine 510000010                    | #741 (famille) ; R4, R9                           | Tous les 2 jours à 8, 14, 20 h du 7 mars, 14 h du 7 reportée seule au 8 ; dose de 20 h du 8 donnée en avance ; le 8, heures passées à 8 h et 20 h (20 h du 8 donnée), puis tous les jours à 6, 12, 18, 23 h : rien le 8 ; le moteur actuel redemande 18 h et 23 h.                                                  |
| graine 500001712                    | #741 (famille) ; R4, R9                           | Tous les 2 jours à 6, 12, 18, 23 h du 5 mars, 6 h du 14 reportée seule au 15 ; le 15, chaque semaine sans heure (dose du 15 donnée), puis tous les jours à 8, 14, 20 h : rien le 15 ; le moteur actuel redemande 14 h et 20 h.                                                                                      |
| graine 520002718                    | R3 (posologie seule : le calendrier ne bouge pas) | Toutes les 2 semaines à 20 h du 9 mars : calendrier 13, 19 mars, 5 avr. ; posologie changée le 11 : le moteur actuel montre 13 mars, 5 avr., 19 avr.                                                                                                                                                                |
| graine 510001190                    | R12 (une seule lecture)                           | Mensuel à 8, 14, 20 h du 9 avr. ; le 19, passage à tous les jours à 8 h et 20 h : le moteur actuel propose le 19, le calendrier enregistré commence le 20 ; v2 propose le 20 (la proposition est le résultat, pas 4).                                                                                               |

## Carnets inatteignables dans l'app (filtrés depuis le pas 3)

Depuis le pas 3, l'oracle ne joue un geste du moteur actuel que si le moteur v2, pour le même geste
(case cochée ou non), écrit le même carnet (`walk-filter.ts`, `ORACLE_FILTER=v2` par défaut) ; les
gestes écartés sont comptés par raison dans la ligne « Oracle : … ». Les huit graines relevées au
pas 2 comme inatteignables (550248567, 550250118, 600018106, 600014163, 600014274, 580001079,
580011308, 580038853) ne laissent plus aucun écart non rattaché : test « carnet inatteignable… » de
`dose-calendar.oracle.spec.ts`. Rejouées sans filtre (`ORACLE_FILTER=aucun`), elles gardent leurs
écarts, que la lecture de secours de R4 (familles `prise-orpheline` et `reports-en-boucle`) explique
pour un carnet reçu par la synchro ou un import.

La graine 600014274 posait une question (« Supprimer ce décalage » quand un réglage ouvert après lui
hérite de l'origine) : R6 ne refuse ce geste que quand une prise existe plus loin, ce qui n'est pas
le cas ; v2 lit 25 mai puis 18 juil. (le report du 18 juin avancé seul au 25 mai, sans décalage,
R3, R7), le moteur actuel 25 mai, 25 juin, 25 juil. par son marqueur d'origine (famille
`marqueur-reference`). Avec le filtre, ce carnet n'est plus atteint : ses gestes antérieurs diffèrent
(prises en plus de R5).

## Questions de la campagne d'invariants v2, tranchées le 2026-10-11

- **Réglage écrit avant la première dose** (graines 640000526, 640001351) : à fréquence gardée, il
  remplace le réglage de création en gardant son rythme ; le calendrier ne bouge pas (R3), la
  nouvelle posologie vaut dès la première dose (R10, R9). Tous les 3 jours à 20 h, première dose le
  lundi 6 avr. ; le 4, la dose du 6 reportée au 8 ; le 5, posologie changée (première échéance
  proposée le 8) ; le 6, le report supprimé : 6, 9, 12, sous la nouvelle posologie. Écrit avant le
  premier jour d'un réglage déjà là, un réglage prend sa place ; héritée, sa première échéance ne fait
  pas repartir la grille plus tôt (la graine 570010320, rattachée jusque-là à `reglage-meme-frequence`,
  ne diverge plus du moteur actuel).
- **Journée d'arrivée devenue première échéance d'un réglage** (graine 620002762) : elle ne garde que
  l'heure reportée (R7), y compris quand le réglage est une posologie à fréquence gardée dont la
  première échéance est ce jour d'arrivée. Chaque semaine à 8, 14 et 20 h du 24 mars, 14 h reportée
  au 12 avr. avec décalage, posologies le 25 et le 28 : 12 avr. à 14 h seule, puis le 19.
- **Décalage ancré le jour même de la prise** (invariant de symétrie) : exemption unique gardée (à côté
  du refus G19, daté à part). Vermifuge hebdomadaire du vendredi de Milo : dose du 9 oct. donnée ; dose du
  16 notée le lundi 19 avec décalage, puis cette prise supprimée (le décalage du 16 au 19 reste, R6).
  Le 19, « Fait à une autre date » le 18, case décochée, garde le décalage : 26 oct., 2 et 9 nov. ;
  « C'est fait » puis « Changer la date » au 18, décochée, tient le décalage ancré au jour du tap pour
  celui de la prise et le supprime : 23 et 30 oct., 6 nov. Case cochée, les deux chemins donnent
  25 oct., 1er et 8 nov. L'invariant ne compare pas les deux chemins quand un décalage est déjà
  ancré au jour du tap sur la journée de la dose.

## Questions tranchées par Gaelle le 2026-10-12

Décisions écrites dans la spec (`traitements.md` §10, entrées du 2026-10-12) ; chaque graine se rejoue
seule (`INVARIANTS_FROM=<graine> INVARIANTS_SEEDS=1 INVARIANTS_STEPS=40`) et passe : 0 carnet en échec.

- **Prise d'avant l'arrêt notée le jour de la reprise** (#784, R8, Q-G3) : elle compte, avec ou sans
  posologie, même quand la première dose de la reprise est avancée à ce jour-là. Graines 690000127,
  690000782, 690001245, 700002909, 710000212, 730000200, 730000993, 750000185, 750000272, 750001179,
  780000409, 780000766 : vertes. Test daté : `dose-calendar.view.spec.ts` (#784).
- **Même geste, un seul résultat** (#786, G12, G19, TR-24 bis) : « Fait à une autre date » coché et
  « C'est fait » puis « Changer la date » passent par la même vérification (`withFollowed`) : le
  report seul qui suit est réécrit quand une date lui convient, refusé (`stuck-report`) sinon ; le
  refus `passes-report` n'existe plus. Toutes les 6 semaines à 20 h du 27 mars, dose du 8 mai avancée
  seule au 23 avr. ; le 10 avr., la dose du 27 mars donnée le 9, cochée : sans date de fin, accepté
  et le report suit, par les deux chemins ; fin le 10 mai, refusé par les deux. Graines 730001829 et
  780001784 vertes, sans exemption dans l'invariant de symétrie ; tests datés dans
  `dose-calendar.gestures-note.spec.ts`.
- **Première dose proposée après la date de fin** (#787) : un rythme qui repart de sa première
  échéance et ne laisse plus aucune dose encore à donner jusqu'à la date de fin est refusé
  (`no-dose-before-end`), une journée déjà toute donnée en avance comprise ; une date de fin égale à
  aujourd'hui n'a rien de spécial (dose due le 4, fin le 4 : accepté), une date de fin passée termine
  le traitement (TR-6). L'invariant n° 9 admet ce refus sans date et n'admet plus une lecture finie
  pour un rythme qui repart avant une date de fin à venir ; la campagne ne choisit plus de
  « Prochaine dose » après la date de fin (le formulaire la refuse, `nextDoseOnAfterEnd`, Q20).
- **Journée déjà toute donnée proposée par « Modifier »** : la date proposée et montrée est la
  première dose encore à donner (`shownOn`), la première échéance écrite reste la journée toute donnée
  (traduction des heures, R4 ; départ du rythme, R9.2). L'invariant n° 9 exige une dose encore à
  donner à la date montrée.
- **Décalage resté sous un réglage réécrit** (R6, R10) : un décalage ne vaut que si sa journée
  d'origine est encore une échéance, jugée sur la grille telle qu'elle est avant lui (héritée ou
  celle du réglage), ou l'arrivée d'une dose reportée du rythme en vigueur. Hebdo du lundi, tous les
  3 jours le 14 (première dose le 16), dose du 16 donnée le 14 avec décalage puis la prise
  supprimée ; retour à l'hebdo le 14 : le 16 n'est pas sur la grille 5, 12, 19, la fiche montre le 19.
  Une posologie seule garde le décalage (vendredi, le 16 est sur la grille 9, 16, 23 : 21, 28). Les
  écarts avec le moteur actuel vont dans la famille `decalage-hors-grille`. Graines 700001396,
  761000141 et 570010320 vertes ; exemption `staleShift` retirée de l'invariant n° 9.
- **Date choisie à fréquence gardée, le jour d'une échéance** (TR-9) : la date choisie remplace la
  dose du jour, les doses plus anciennes restent à renseigner. Métacam tous les 2 jours du 2 oct.,
  doses du 2 et du 4 données ; le 8, « Prochaine dose » le 9 : le 6 reste à renseigner ; tous les
  jours, 13 non noté, le 14 « Prochaine dose » le 16 : le 13 reste à renseigner.
- **Report d'une arrivée devenue première échéance d'un nouveau rythme** (#780) : verrouillé comme
  Q25 (ni « Changer la date » ni « Supprimer », `not-movable`).

## Date choisie plus tôt que celle d'un réglage jamais commencé (#794, tranché le 2026-10-12)

Une date choisie par la personne est toujours celle que la fiche montre (TR-9), même plus tôt que la
première échéance d'un réglage jamais commencé, et un décalage posé sur l'arrivée d'une dose d'un
rythme précédent ne la déplace pas. Tous les jours, première dose choisie le 16 mai par un réglage du
15 avr., dose du 16 reportée au 19 avec décalage ; le 20 avr., posologie, dose du 19 donnée ; le
24 avr., « Prochaine dose » le 24 : la fiche montre le 24 (le 20 mai avant). Mensuel du 29 mars, dose
du 29 reportée au 5 avr. ; réglage du 31, première dose choisie le 9 juin, décalage du 5 au 9 avr. :
5 avr., 9 juin, 9 juil. Avant la date choisie, seul le décalage sur lequel elle a été posée garde son
effet (R3) : hebdo du lundi 5 oct. ; le 7, tous les 3 jours, première dose choisie le 2 nov.,
décalage du lundi 12 au 14 écrit sous ce réglage ; le 7, retour à l'hebdo, « Prochaine dose » le
2 nov. : 2, 9 nov. (4, 11 nov. avant ; `main` lisait de même, l'invariant l'exemptait). Graines
810001161, 810002312, 780000156, 780001015 et 870000527 vertes ; tests datés dans
`dose-calendar.gestures-settings.spec.ts` et `dose-calendar.reference-model.spec.ts`.

**Revu le 2026-10-13 (Q26).** Le premier exemple devient un refus : la dose du 19 mai est donnée
d'avance, et une date choisie avant une dose déjà notée est refusée par le moteur, réglage changé
compris (`later-dose`, « Une dose plus lointaine est déjà notée. »). Le même carnet sans la prise du
19 mai montre toujours le 24 : #794 reste vrai quand rien n'est noté plus loin. La lecture d'un tel
réglage reçu d'un autre appareil ne change pas (test de `dose-calendar.reference-model.spec.ts`
gardé). Le champ est grisé dès qu'une dose est notée plus loin que le jour de la modification
(#811, décision du 2026-10-13 au soir) : tous les 2 jours, 12 donnée d'avance le 11, posologie le 11 :
grisé, 14 proposé ; la dose du lendemain à 8 h donnée d'avance, sur la date proposée elle-même
(prochaine dose), le laisse libre (G24, #711).

## Q38 sans dose avant la date de fin (#806, décision du 2026-10-13 au soir)

« Elles n'étaient pas à donner » qui ne laisse plus aucune dose avant la date de fin est refusée
(`no-dose-before-end`, texte de #787), « Elles restent à renseigner » reste possible ; la campagne
d'invariants ne joue plus cette réponse et ne vérifie plus sa date (graine 975000503 verte, tests
datés dans `dose-calendar.gestures-settings-end.spec.ts` et `dose-calendar.reference-model.spec.ts`).

## Date choisie et report plus loin (décision du 2026-10-13)

Une date choisie à fréquence gardée remplace la dose du moment ; la grille repart d'elle (TR-9). Un
report dont la journée d'origine tombe dans ce rythme repartant (le réglage de la date choisie et ses
suivants de même rythme) sans y être une échéance est sans effet (`nothing-to-move`), sauf celui qui
porte la date choisie ou ouvre le nouveau rythme (R9.2). La date choisie ne réécrit le report que si
la dose du moment est son arrivée (#796). Tous les 2 jours, doses des 2 et 4 données, 6 non donnée,
8 reportée au 10 : le 7, « Prochaine dose » le 9 : 9, 11, 13 (9, 11 avec le report réécrit et la dose
en retard fusionnée avant ; 9, 10, 11 sur l'ancien `main`) ; le 6, « Prochaine dose » le 7 : 7, 9, 11
(7, 9, 10, 11 avant). Un report écrit avant la date choisie et parti de cette date même est porté
par elle, sans effet : le 6 ou le 7, « Prochaine dose » le 8 : 8, 10, 12, comme sur `main` (confirmé
par Gaelle le 2026-10-13 au soir) ; un report écrit sous le réglage de la date choisie garde son effet. La règle
ne vaut pas hors d'une date choisie : un report parti d'une journée sortie du calendrier par un changement de fréquence reste lu (tests de
`dose-calendar.journees-sorties.spec.ts`). Le modèle naïf applique la même règle, report qui porte
la date choisie compris (graine 992000111 : à plusieurs heures, l'arrivée ne garde que l'heure
reportée ; test daté de `dose-calendar.reference-model.spec.ts`). Remplacé le jour même par un
réglage sans date choisie, un réglage lui transmet sa date choisie, dans les deux modèles (graine
998000832, tests datés « remplacé le jour même par un réglage sans date choisie » ; confirmé par
Gaelle le 2026-10-13 au soir).

## Garde d'écriture par réglage (#802, confirmé par Gaelle le 2026-10-14)

Écart au plan §3.2 et au ticket, qui demandaient une ligne par (`treatment_id`, `due_on`, `due_time`,
famille) : la garde du repository (`duplicateWhere`) refuse une deuxième ligne de la même échéance et
de la même famille sous le même réglage (`period_id`), pas sous tout le traitement. Tous les jours à
8 h et 20 h, la dose de 20 h du 10 donnée d'avance ; le 10, heures passées à 12 h et 20 h ; puis
« C'est fait » sur 20 h : une garde par traitement refuserait ce geste légitime, la prise de 20 h du
10 existant déjà sous l'ancien réglage (les deux comptent, R4, test « R4, le jour où les heures
changent » de `dose-calendar.deux-appareils.spec.ts`). Les doublons d'un autre réglage n'arrivent
que par la synchro, et la lecture les écarte : la plus récente est lue, l'autre est sans effet
(R11) ; sous un même réglage, deux appareils qui notent la même dose ne laissent qu'une ligne lue
(test « la même dose notée sous le même réglage par deux appareils »).

## Question encore ouverte du pas 4 (« Modifier »)

- **« Prochaine dose » choisie dans l'écart d'un décalage** (TR-9, G6, R6 ; question pour Gaelle) :
  chaque semaine à 20 h du 18 mars, dose du 18 donnée le 19 avec décalage (la suite repart du 19) ;
  le 19, heures passées à 6, 12, 18 et 23 h et « Prochaine dose » le 19 : le réglage est accepté,
  mais la fiche montre le 26, le décalage ayant déjà pris le 19 (graines 700000168, 700000329,
  700000374, 700000383 de la campagne depuis 700000000). TR-9 borne la date « du lendemain de
  l'échéance qui précède (en pratique, de la dernière prise notée) » : le 19 par l'échéance, le 20
  par la prise. Le moteur garde son comportement ; l'invariant n'exige pas qu'une date prise entre
  la journée d'origine d'un décalage et son ancrage soit lue.

## Refus à analyser de l'oracle (pas 3)

Oracle `actuel,v2`, 20 000 carnets à partir de 530000000. Corrigés au pas 3 (test daté pour chacun) :
« Prochaine dose » après un changement de posologie (R7), correction cochée qui fait suivre le report
(G12, G19), report ou prise d'une période arrêtée qui bloquait la reprise (`not-movable`,
`arrival-logged`, `report-loop`, R8, TR-32), prise en plus corrigée qui fait suivre le report (G19),
dose avancée jugée à son arrivée et bornes qui ne contredisent plus le geste (décision du
2026-10-11, R12 : graines 530000395, 530000118, 530000046, 530000019 dans
`dose-calendar.gestures-move.spec.ts`). Relecture du pas 3 : un report redéplacé garde son échéance
d'origine tant qu'il la déplace (graines 531000034 et 531000106, refusées jusque-là en
`out-of-bounds` faute de ce correctif), une dose avancée dont l'arrivée devient la première échéance
d'un nouveau rythme n'y garde que son heure, une date choisie avant la première dose est gardée, une
correction de date reste dans la période de sa prise (tests datés dans `dose-calendar.view.spec.ts`,
`dose-calendar.reference-model.spec.ts`, `dose-calendar.gestures-move.spec.ts`,
`dose-calendar.gestures-redate.spec.ts`). Sondage sur 400 carnets de l'oracle (trois jours par borne
et les voisins des jours exclus) : aucun jour proposé par les bornes de v2 n'est ensuite refusé par
le geste. Restent des refus où le moteur actuel choisit une
date que les bornes de v2 ne proposent pas, chacun justifié :

| Refus                                | Analyse                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| correction (`report-loop`)           | R7, #763 : la correction ferait se renvoyer une dose entre deux reports (graine 530004438, test daté de `dose-calendar.recette-refus.spec.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| échéance proposée (`arrival-logged`) | Q25, G17 : la journée d'arrivée du report a déjà une heure notée (graine 530002782 : 12 h du 3 avr. donnée, 18 h du 3 avr. refusée).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| correction (`stuck-report`)          | G19 : aucune date ne convient au report seul, la date de fin ayant fait sortir son échéance du nouveau rythme (graine 530002040 : mensuel du 27 mars, fin le 27 avr., dose du 27 avr. avancée au 10 avr. ; prise du 27 mars corrigée au 31, cochée). Permise décochée.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| échéance proposée (`no-date-alone`)  | Q2 a : seule, la dose ne passe pas la suivante (graine 530000063 : la dose reportée avec décalage, ramenée « seule » au même jour, ferait passer quatre doses).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| échéance proposée (`later-dose`)     | G7 : une prise existe plus loin dans la période (graine 530000318 : dose du 28 août donnée d'avance le 13 avr.). G13, R6 : la journée n'est plus dans la grille et sa prise ne tient que par le report qui en part ; réécrit vers l'échéance qu'il remplace, ce report la perdrait, donc les bornes refusent d'emblée (graine 530000359 : tous les 3 jours à 8, 14, 20 h, 8 h du 5 mars donnée, 14 h reportée au 7 avec décalage ; c'était le défaut de la graine 530000394).                                                                                                                                                                                                                                                                                                                                                                      |
| échéance proposée (`later-line`)     | R6 : avec la case, l'échéance d'origine d'une dose avancée plus loin reste un mur, le décalage déplacerait la grille sous elle ; seule, la dose se reporte (graine 530000297 : toutes les 6 semaines, doses du 19 et du 20 avr. avancées aux 9 et 14 mars ; 20 h du 14 mars, cochée). Le moteur actuel ne lit pas les lignes d'un réglage précédent (R7 : elles appartiennent au traitement).                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| échéance proposée (`report-loop`)    | R7, G9 : le jour choisi est le jour d'origine d'un autre report ; les bornes le donnent dans `excluded` (graine 530000900 : tous les 3 jours, dose du 9 avr. avancée au 8 ; 8 h du 15 avr. reportée au 9 refusée).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| échéance proposée (`not-movable`)    | R7, R9.2 : la dose est l'arrivée d'un report devenue la première échéance d'un nouveau rythme, journée qui ne garde que l'heure reportée ; partie, elle rendrait à ce jour les heures du nouveau réglage (graine 530000028 : toutes les 2 semaines à 20 h, dose du 28 mars avancée au 23 ; tous les 2 jours dès le 23 ; graines 531000257, 531000296, 530000019). Refusée dès les bornes : le report est verrouillé comme Q25, sans « Changer la date » ni « Supprimer » (#780, décision du 2026-10-12). Le moteur actuel déplace la dose du nouveau réglage, sans voir le report. Le refus ne vaut que tant que ce rythme est en vigueur : un réglage suivant qui ne le continue pas, commencé avant cette journée, le lève et rend au jour ses heures (relecture du pas 3, tests datés « un rythme qui ne part plus de l'arrivée d'un report »). |
| échéance proposée (`out-of-bounds`)  | Q2 a : seule, la dose ne passe pas la suivante (graine 530000198 : hebdomadaire, dose du 21 mars avancée au 16, ramenée seule au 1er avr.) ; G8 : pas avant le lendemain de la dernière prise notée (graine 530000210 : arrivée du 14 avr., prises du 9 notées le 10, déplacée au 10).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## Réglages proposés par « Modifier » (pas 4)

Depuis le pas 4, l'oracle ne joue « Modifier » du moteur actuel (`newPeriod`) que si le réglage que v2
écrirait (`newSettings`) se lit de la même façon ; sinon le geste est compté avec la branche de R9 en
cause (`walk-filter.ts`). Ces écarts de proposition viennent de R9 (décision du 2026-10-10, qui
remplace Q36, Q37, G15, G16, G23 et G24, et précise Q7) ; chaque branche a été relue sur des
carnets de l'oracle `actuel,v2` (20 000 carnets à partir de 530000000, réglages `avec`) :

| Branche de R9                    | Analyse                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R9.2, journée déjà toute donnée  | La prochaine journée a toutes ses heures données en avance : R9.2 la tient pour entamée (« une de ses heures donnée en avance ») et le nouveau rythme part d'elle ; le moteur actuel (G24, « une journée entièrement couverte n'ouvre pas la période ») part de la dose du moment suivante. Graine 530000019. Depuis le 2026-10-12, la date montrée est la dose suivante (`shownOn`), la journée toute donnée reste l'origine. |
| `no-dose-before-end`             | #787 (décision du 2026-10-12) : la nouvelle fréquence ne laisse aucune dose avant une date de fin encore à venir ; le moteur actuel acceptait et finissait le traitement.                                                                                                                                                                                                                                                      |
| R9.2, journée entamée ou arrivée | La prochaine journée entamée, ou l'arrivée d'un report, garde son jour et le rythme part d'elle ; le moteur actuel part d'aujourd'hui ou de sa dernière prise. Graines 530000067 (tous les jours dès le 19 avr., journée entamée, au lieu du 8), 530000352 (arrivée du 26 mars).                                                                                                                                               |
| R9.3                             | La dernière journée qui a une prise, par son échéance, plus la nouvelle fréquence (exemple de Q7 : « le calcul donne le 23 ») ; le moteur actuel part de la date réelle d'une prise qui a décalé la suite, d'un report ou d'aujourd'hui sur un traitement fini (Q8, G16). Graines 530000079, 530000385, 530000001.                                                                                                             |
| fréquence gardée (R3, Q-retard)  | Heures changées seules : la première échéance est la prochaine journée du calendrier en vigueur, ses prises la couvrent (R4) ; le moteur actuel redemande les heures d'une journée déjà donnée (famille `prises-du-traitement`, #741). Graines 530000066, 530000229.                                                                                                                                                           |
| R9 et un traitement fini         | Sur un traitement fini (date de fin passée), le moteur actuel propose aujourd'hui ; v2 suit R9.3. Graines 530000001, 530000148.                                                                                                                                                                                                                                                                                                |
| « même affichage »               | Les deux réglages montrent les mêmes doses ; seuls changent l'état d'une journée déjà donnée et l'effet des prises dans l'historique.                                                                                                                                                                                                                                                                                          |

## Réglage remplacé le jour même (#810, corrigé le 2026-10-14)

Écart ouvert le 2026-10-13 (graine 991003624, oracle `actuel,v2`), puis neuf graines de la passe de
300 000 du pas 10 (1500018007, 1500061791, 1500080102, 1500196692, 1500233661, 1500234082, 1500236809,
1500256618, 1500290961). Geste commun : supprimer la seule prise d'un réglage remplacé le jour même par
un autre. v2 et le modèle de référence montraient alors la dose en retard comme dose du moment ; l'ancien
moteur la gardait « à renseigner ». Décisions de Gaelle du 14 octobre 2026 : « à renseigner » dans les
deux cas ; un réglage remplacé le jour même sans prise ne compte pas, d'où qu'il vienne, et la fréquence
du réglage final se compare à celle d'avant ce jour (R10). Corrigé dans v2 et le modèle de référence
(tests de `dose-calendar.reglage-remplace.spec.ts`, carnets dans `fixtures/dose-calendar-graines.json`) :
neuf graines lisent comme l'ancien moteur. La graine 1500018007 s'en écarte : le réglage final garde
tous les 3 jours avec sa propre origine (première dose le 17 mai), la dose du moment du 5 avril est remplacée
(TR-9) au lieu de rester à renseigner (décision de Gaelle du 14 octobre 2026).

## Un oubli ne couvre que son échéance (2026-10-14)

Décision de Gaelle du 14 octobre 2026 : un oubli dont l'échéance a quitté le calendrier (ligne reçue
d'un autre appareil) est sans effet et ne couvre plus l'échéance suivante (R4) ; une reprise le même
jour aux mêmes heures retombe sur son échéance, qu'il garde (R8). Un écart de l'oracle `actuel,v2` sur
ce point est attendu quand l'ancien moteur faisait couvrir la dose suivante par l'oubli.
