---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Traitements (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md), parcours 2, 3, 4, 5, 7, 9, matrice
des fonctionnalités. Chaque règle cite sa source ; une règle marquée **(à valider)** est une déduction
nécessaire à la cohérence, pas encore décidée : elle renvoie à une question ouverte.
« Spec » suivi d'une date, d'un § ou d'un numéro de décision renvoie à `technical/traitements-quotidiens.md` ;
« spec Qn », aux décisions de cette spec (§10).

Le modèle de données n'est pas figé ici : la section « Données » dit ce qu'il faut retenir, la forme
sera tranchée à la revue globale du modèle (décision du 2026-09-28).

## 1. Problème

Un traitement donné à la maison (vermifuge, antiparasitaire, médicament) revient à un rythme que
Sophie (P1) doit retenir pour chacun de ses animaux. Aujourd'hui, l'app affiche une prochaine dose
passée comme si elle était à venir, ne sait pas qu'un traitement a une fin, ni qu'une dose a été
oubliée, ni qu'un traitement commence demain, ni qu'il se prend matin et soir. Le carnet ment alors,
et Sophie ne peut pas le remettre d'aplomb (constat du 2026-09-28, test d'un vermifuge quotidien).

## 2. Objectifs

1. Sophie sait à tout moment ce qu'elle doit donner **maintenant**, pour chaque animal, sans calcul.
2. Le carnet dit la vérité : ce qui a été donné, oublié, ou n'a pas été renseigné (principe 1).
3. Rattraper un oubli prend quelques gestes, jamais un blocage (principe 5).
4. Un changement de rythme, de produit, un arrêt ou une reprise ne réécrivent jamais le passé.

**Hors objectifs** : conseiller une dose ou un produit (principe 2) ; gérer un stock de produits ;
suivre une ordonnance comme document (v2, P2) ; partager un traitement entre personnes (v2, Plus).

## 3. Vocabulaire

| Terme | Sens |
| --- | --- |
| **Traitement** | Un produit donné à un animal (« Panacur de Pixel »). Identifié par son nom ; un autre produit est un autre traitement. Type : vermifuge, antiparasitaire ou médicament. |
| **Réglage** (ou période) | Fréquence, heures, posologie, date de fin, moment du rappel, valables **à partir d'un jour** jusqu'au réglage suivant ; une première échéance et une origine de grille (R1). Un traitement a un ou plusieurs réglages successifs ; **le calendrier, lui, est celui du traitement** (R1). |
| **Ligne** | Ce que la personne a écrit dans l'historique : une prise (donnée ou oubliée), une prise en plus, un report, un décalage. Une ligne appartient au traitement ; le moteur n'en supprime jamais (R11). |
| **Décalage** | Ligne « Doses suivantes décalées » : à partir d'une journée d'origine, la grille a une nouvelle origine (R6). Écrite par la case « Décaler aussi les doses suivantes ». |
| **Prise en plus** | Prise notée un intervalle ou plus avant la dose qu'elle viserait : rangée sous sa date réelle, elle ne couvre rien et ne change pas le calendrier (R5). |
| **Sans effet** | Ligne que le moteur ne lit plus (report revenu à sa date, ligne plus ancienne de la même journée entre deux appareils, report battu par une prise) : elle reste visible, grisée, et seule la personne la supprime (R11). |
| **Échéance** | Moment où une prise est prévue par la période : un jour, et une heure si le traitement en a plusieurs par jour. |
| **Prise** | Ce qui s'est passé pour une échéance : **donnée** ou **oubliée** à une date, ou **reportée** à une autre date, plus tard ou plus tôt (ligne « Reportée au … » ou « Avancée au … », TR-9). |
| **Dose du moment** | La dernière échéance jusqu'à aujourd'hui inclus, si elle est encore sans prise ; à défaut, la prochaine. |
| **Dose non renseignée** | Une échéance passée qu'aucune prise ne couvre et qui n'est plus la dose du moment (TR-13). |
| **Posologie** | Une quantité et une unité (« ½ comprimé »), recopiée du vétérinaire ; jamais calculée. |
| **En cours / terminé / arrêté** | En cours : la période courante n'est ni finie ni arrêtée. Terminé : sa dernière échéance a un état et il ne reste rien à renseigner. Arrêté : Sophie a touché « Arrêter ». Fini ou arrêté, il reste dans « Traitements en cours » tant qu'il a des doses à renseigner (TR-31). |
| **À renseigner** | Traitement qui a des doses non renseignées, en cours, fini ou arrêté : il apparaît dans « À faire », groupe « À renseigner », badge neutre (spec Accueil, AC-5, AC-8). |

Mots bannis de l'app : « cure » (décision du 2026-09-28).

## 4. Règles

### 4.1 Créer un traitement

- **TR-1** Champs : nom (1 à 80 caractères), type (vermifuge, antiparasitaire, médicament),
  fréquence (1 à 365, en jours, semaines ou mois), **« Première prise le »** (passée, aujourd'hui ou
  future), date de fin facultative, heure(s) facultative(s), posologie facultative. (Formulaire actuel ;
  P7 Q2 ; décisions de la relecture ; limites des noms #409.)
- **TR-2** Texte d'aide sous « Première prise le » : « Déjà en cours ? Indique la dernière prise
  certaine : l'historique commencera là. » (P2 Q1 ; tournure neutre, spec Q12)
- **TR-3** Rien n'est noté comme donné à la création. Si la première prise est passée, un encart
  facultatif, en fin de formulaire (juste avant le bouton « Créer », spec Q10), annonce les échéances passées (« 25 doses prévues depuis le 3 sept. »)
  et propose « Toutes données », « Choisir les jours » (ou « Donnée » / « Oubliée » pour une seule) ;
  non rempli, il devient le bandeau de la fiche. Rempli, il résume la réponse (« 25 données · Modifier »,
  « 20 données, 5 oubliées · Modifier ») ; rien n'est écrit avant « Créer », et il revient à son état de
  départ si la première prise, la fréquence, les heures ou la date de fin changent. L'encart compte
  aussi la dose du moment quand elle est déjà passée, jamais celle du jour ; non renseignée, elle reste
  en retard sur la fiche (spec Q42). (Relecture, point 7 ; décisions du 2026-09-28 ; lot A révisé, N1.)
- **TR-4** Posologie : une quantité (décimales permises) et une unité parmi 11 : comprimé, gélule,
  pipette, collier, ml, goutte, g, sachet, pulvérisation, application, dose. Comprimés affichés en
  fractions (¼, ½, ¾, 1 ½), avec des raccourcis « ¼ ½ ¾ 1 1 ½ » ; décimales pour les autres. Pluriel
  et anglais gérés. (P7 Q1, Q1 bis ; P2 Q3 ; relecture du lot A, QA-17)
- **TR-5** Un traitement peut avoir **plusieurs heures par jour d'échéance** (matin et soir), sur une
  même fiche, **quelle que soit sa fréquence** (« tous les 2 jours, à 8 h et 20 h ») : les heures
  s'appliquent à chaque jour d'échéance. (P7 Q2 ; spec Q1, 2026-09-29)
- **TR-6** Date de fin : pas avant la première prise ; lors d'une modification, pas avant la dernière
  prise notée (égale acceptée). (Planche Q1 ; relecture 4d)

### 4.2 Échéances et dose du moment

- **TR-7** La première échéance d'un réglage est sa première prise (création, reprise) ou la date
  proposée puis confirmée dans « Prochaine dose » quand « Modifier » ouvre un réglage (R9 ; aide
  « Calculée d'après la dernière prise : … Modifiable. », lot A révisé, N3 ; « Aujourd'hui est
  proposé. Modifiable. », Q39). Les échéances suivantes sont l'origine de la grille plus un nombre
  entier de pas (R2) ; l'origine est la première échéance, elle se transmet d'un réglage au suivant
  tant que la fréquence ne change pas (R3), et **seule une ligne de décalage** la déplace (R6). En
  mois, un jour qui n'existe pas devient le dernier jour du mois sans que l'origine change
  (31 janv. → 28 févr. → 31 mars), y compris après un changement d'heures ou de posologie (R3). Une
  prise notée pour une dose non renseignée ne déplace rien (TR-18, spec Q8). (Décision du 2026-09-23,
  point 5 ; spec du 2026-09-28 §3.1, §4.1 ; moteur v2, décision du 2026-10-10.)
- **TR-8** Aucune échéance après la date de fin.

- **TR-9** « Prochaine dose » (« Modifier ») déplace la prochaine dose, plus tôt ou plus tard que
  l'échéance prévue, et recale la suite des échéances à partir de la nouvelle date. La date choisie va
  du lendemain de l'échéance qui précède (en pratique, de la dernière prise notée), jamais avant
  aujourd'hui (spec Q7), jusqu'à la date de fin quand il y en a une ; pour aller plus loin, on change
  « Date de fin » dans le même formulaire (TR-6 ; spec Q20). (« Modifier sert aussi à reporter »,
  2026-09-23 ; spec Q17) L'échéance d'origine est remplacée : elle ne devient jamais une dose non
  renseignée. Le déplacement s'inscrit dans l'historique comme une seule ligne « Reportée au 30 sept.
  (prévue le 26 sept.) », ou « Avancée au 8 oct. (prévue le 10 oct.) » quand la nouvelle date est plus
  tôt, qui couvre l'échéance déplacée ; déplacer de nouveau la même dose réécrit cette ligne, avec son
  échéance d'origine (spec Q18) ; remise à sa date d'origine, la dose n'a plus de ligne de
  déplacement. Traitement à plusieurs heures : le déplacement porte sur la journée, dont toutes
  les heures encore sans prise partent au nouveau jour, qui ne reçoit qu'elles, seul comme avec le
  décalage (spec Q21, R7) ; une dose déjà donnée de la journée ne se décale jamais. Les doses non
  renseignées d'avant restent à renseigner. Sans prise dans la période, déplacer la première dose
  corrige la première échéance de la période, sans ligne « Reportée » ni « Avancée » (TR-28). (Spec
  Q2 ; revue du modèle, 2026-09-29, M4 ; lot A révisé, N5)

- **TR-10** Dose du moment : la dernière échéance jusqu'à aujourd'hui inclus, si elle est encore sans
  prise ; à défaut, la prochaine. Traitement à plusieurs heures : on raisonne par journée (spec Q23).
  Les heures encore sans prise de la dernière journée d'échéance arrivée sont ensemble la dose du
  moment, chacune avec son propre « C'est fait » : du jour le jour même, toutes en retard ensuite ; à
  défaut, la prochaine. (Spec Q6) Jamais une date passée présentée comme « prochaine dose ». Libellés : « Dose du
  jour · 28 sept. », « Dose du jour · 5 oct. à 20 h »,
  « Prochaine dose · demain, 29 sept. », « en retard depuis le 22 sept. ». (Spec 2026-09-28 ; P5)
- **TR-11** Une échéance d'aujourd'hui reste « du jour » jusqu'à minuit, même son heure passée, avec
  son heure affichée (« Aujourd'hui · 8 h ») ; elle n'est jamais « en retard » le jour même, ni comptée
  dans les retards. (Spec Q3, 2026-09-29)
- **TR-12** Après la date de fin, il n'y a plus de dose du moment : la carte dit la fin du traitement.

### 4.3 Doses non renseignées

- **TR-13** **Chaque prise vise une échéance précise, jour et heure.** Depuis une notification, le
  geste vise l'échéance de la notification (même touchée plus tard, y compris par « Donnée quand ? »,
  spec Q8) ; depuis « À faire », la ligne touchée (une ligne par heure). Pour un traitement à plusieurs
  heures, chaque heure d'un jour est une échéance distincte : depuis la fiche, l'heure touchée ;
  « Fait à une autre date » demande la date, puis l'heure. Pour un traitement à une heure ou sans heure,
  une prise notée à une date depuis la fiche vise la dernière échéance tombée à cette date ou avant ;
  notée en avance (avant toute échéance restante), la prochaine. Une échéance d'un jour passé sans prise est non
  renseignée dès qu'une échéance plus récente est tombée ; une échéance du jour reste « du jour »
  jusqu'à minuit (TR-11). Traitement à plusieurs heures : les heures sans prise d'une journée passée ne
  deviennent non renseignées, toutes ensemble, que lorsqu'une journée d'échéance plus récente est
  arrivée ; d'ici là elles restent la dose du moment, en retard (TR-10, spec Q23). Après la date
  de fin, toute échéance jusqu'à elle sans prise est non renseignée. (Spec 2026-09-28 §4.2, tableau
  d'exemples ; spec Q6, Q23)
- **TR-14** Une dose non renseignée n'est pas un retard : ni badge « En retard », ni compteur de
  retards, ni notification. (Spec, décisions 2 et 7)
- **TR-15** Bandeau sur la fiche : « N doses non renseignées · du … au … », « Toutes données », « Choisir
  les jours », à égalité (tous deux bordés) ; une seule : « Donnée » / « Oubliée ». Il reste tant qu'une
  échéance n'a pas d'état ; il ne disparaît jamais seul. (Spec décision 3 ; P5 ; lot A révisé, N11)
- **TR-16** « Choisir les jours » s'ouvre avec tous les jours cochés ; décocher = oubliée ; le bouton
  annonce le résultat (« Valider : 20 données, 5 oubliées ») ; calendrier par mois, « Cocher / Décocher
  le mois ». Traitement à plusieurs heures : un calendrier par heure, en onglets (« 8 h », « 20 h »),
  chacun tout coché au départ ; le bouton annonce le total (« Valider : 45 données, 5 oubliées »). (P5 ;
  relecture de cohérence, question A ; planche Q3 ; spec Q5)
- **TR-17** Renseigner écrit toutes les prises en une seule opération (tout ou rien) ; « Annuler »
  défait tout le geste. (Spec §5)
- **TR-18** Une prise écrite pour une échéance recopie les réglages de la période qui l'a produite ;
  renseigner ne crée jamais d'autre écart et ne déplace jamais la dose du moment. (Relecture, point 2)

### 4.4 Noter une prise

- **TR-19** Depuis « À faire » ou la feuille du soin : « Fait aujourd'hui », « Fait à une autre
  date ». Depuis la fiche : « C'est fait » (aujourd'hui, un tap, sauf quand la prise décalerait la suite :
  confirmation, G20) et un lien « Fait à une autre date » toujours à côté. (Existant ; G2)
- **TR-20** Depuis une notification : « C'est fait » note aujourd'hui l'échéance de la notification
  (TR-13) si la notification est du jour ;
  plus tard, l'app demande « Donnée quand ? » (le jour prévu, aujourd'hui, une autre date), sur
  l'accueil (RA-18). Une notification est « du jour » quand son échéance tombe aujourd'hui (la relance
  demande donc toujours la date) ; « le jour prévu » note la date de l'échéance, sans demander d'heure
  (T5) ; chaque réponse note l'échéance de la notification, à la date choisie (spec Q8). (P3 Q1)
- **TR-21** Une prise par échéance ; une échéance déjà notée affiche « déjà notée (aujourd'hui) » au
  lieu d'en écrire une autre. (Existant, #384)
- **TR-22** « Fait à une autre date » sur un jour noté oublié le repasse en « donnée ». (Planche Q6)
- **TR-23** Noter une échéance retire ses notifications du volet et reprogramme la suite. (P3 R3)
- **TR-23 bis** Toast après une prise : « Prise de Panacur notée pour Pixel » ; pour un traitement à
  plusieurs heures, il dit l'heure (« Prise de 8 h de Métacam notée pour Luna »). « Fait à une autre
  date » demande le jour, puis « À quelle heure ? » s'il y en a plusieurs. (Relecture du lot A révisé)

### 4.5 Corriger une prise

- **TR-24** Menu ⋮ d'une prise : changer la date, supprimer, « Marquer comme donnée / oubliée » ;
  d'une prise en plus : « Changer la date » et « Supprimer cette prise » seulement (décision du
  2026-10-05 ; changer sa date la fait viser ce que viserait une prise notée ce jour-là, TR-13) ; d'une
  ligne « Reportée au … » ou « Avancée au … » : « Changer la date », « Supprimer ce report »
  (l'échéance d'origine redevient la dose du moment ou une dose non renseignée ; le décalage de la
  journée part avec lui, comme avec « Prochaine dose » ramenée au jour d'origine, R6 ; refusé, avec
  « Une dose plus lointaine est déjà notée. » ou « Une dose plus lointaine est déjà reportée. … »,
  quand ce décalage ne peut pas partir avec lui : une dose plus lointaine est notée, ou une ligne plus
  lointaine existe, même verrouillage que « Prochaine dose » ramenée au jour d'origine, Q25, N8,
  G19 ; décisions du 2026-10-14, #835) ; d'une ligne « Doses suivantes
  décalées » : « Supprimer ce décalage », le report restant (refus de R7 et G19) ; d'une ligne sans
  effet (R11) :
  « Supprimer » seul ; un toast
  « Annuler » après chaque geste. Un déplacement dont la dose d'arrivée est déjà notée (donnée ou
  oubliée) fait partie de l'historique : sa ligne n'a plus « Changer la date » ni « Supprimer ce
  report » ; pour corriger, on passe par la prise elle-même (changer sa date, la supprimer) (spec
  Q25) ; de même quand l'un des reports de la même dose venus de l'autre appareil, que « Supprimer ce
  report » emporterait (TR-25), a sa nouvelle date notée (lecture à confirmer par Gaelle, §11).
  (Existant ; P5 ; report : relecture de cohérence du 2026-09-30, validé en bloc)
- **TR-24 bis** Changer la date d'une prise se juge **au jour de la nouvelle date**, comme si la prise
  était notée ce jour-là (R6 ; décision du 2026-10-10, Q-C1) : la case « Décaler aussi les doses
  suivantes » est proposée aux mêmes conditions que pour « Fait à une autre date », et le résultat est
  le même. Une prise donnée ne se redate jamais un intervalle ou plus avant son échéance : ces jours
  sont grisés (date minimale), elle ne devient pas une prise en plus en silence (R5). Un déplacement
  placé après elle (ligne « Reportée au … » ou « Avancée au … ») est gardé et réécrit pour viser la
  dose que fixe la prise corrigée (G12), et le toast le dit (« Prise déplacée au 28 août. Prochaine
  dose gardée au 10 oct., que tu avais reportée. » · Annuler) ; s'il ne tombe plus après la prise
  déplacée, la suite repart de la prise, et le toast le dit ; un report seul suit la correction ou la
  refuse (G19). Une ligne verrouillée (dose d'arrivée déjà notée, spec Q25) n'est jamais retirée :
  elle reste dans l'historique, et le toast ne la mentionne pas. Seul le décalage ancré à la date de
  la prise la suit (lecture du 2026-10-12). (Décision du 2026-09-25, point 1, transposée ; plan de livraison, T3 ; points validés en bloc du
  2026-10-01 ; décision du 2026-10-10.)
- **TR-25** Une correction s'applique à toutes les lignes de la même échéance, jour et heure (deux
  appareils), et devient la modification la plus récente. Tous les gestes sur une ligne de la fiche
  (« Modifier », « Supprimer », « Marquer comme oubliée », « Marquer comme donnée ») s'appliquent à
  ce que cette ligne montre : dans une même période, une ligne montrée est une ligne, qu'il s'agisse
  des prises d'une même dose, des reports d'une même dose ou des décalages d'une même journée (deux
  appareils) ; « Supprimer » les retire toutes (« Supprimer ce report » emporte aussi les décalages
  de sa journée, TR-24), « Modifier » réécrit la ligne en vigueur et retire les autres, sans laisser
  de ligne grisée ni de ligne « · sans effet » qui redevienne active (décisions du 2026-10-12 et du
  2026-10-14, #839, #835) ; « Supprimer ce décalage » emporte de même les décalages de sa journée, le
  report restant (lecture à confirmer par Gaelle, §11). « Marquer comme oubliée » (feuille de la dose
  ou historique), « Marquer comme donnée » (historique) et « Fait à une autre date » sur une dose
  oubliée réécrivent la ligne en vigueur, qui devient la modification la plus récente, et laissent
  les autres lignes de la dose, venues de l'autre appareil : elles restent visibles et grisées
  (« · sans effet »), supprimables une par une ; un téléphone n'a qu'une ligne « donnée ou oubliée »
  par dose, et sur un seul téléphone le geste ne laisse aucune ligne grisée (décision de Gaelle du
  17 octobre 2026, #841). Milo, chaque lundi à 8 h ; la dose du 16 mars à 8 h donnée sur A à 9 h 02,
  puis sur B à 9 h 05 ; B touche « Marquer comme oubliée » : les deux téléphones montrent « Oubliée »
  et la prise de A grisée, que la prise de A soit arrivée sur B avant ou après le geste (avant le
  17 octobre : « Oubliée » seule dans un ordre, « Oubliée » et la prise de A « · sans effet » dans
  l'autre). Le libellé de la ligne grisée reste « · sans effet » (décidé le 17 octobre 2026, §11) ;
  une ligne grisée « · sans effet » se supprime seule ; entre deux périodes, même à la
  même date et à la même heure, la fiche montre deux lignes et le geste ne touche que celle choisie
  (#822, décision du 2026-10-13). (Relecture, point 5)
- **TR-26** Pas de règle de « seule prise » : supprimer la seule prise garde le traitement (son
  échéance redevient la dose du moment, ou une dose non renseignée si une échéance plus récente est
  tombée, TR-13) ; « Marquer comme oubliée » est permis sur toute prise, y compris la seule donnée. Pour
  tout effacer : « Supprimer ce traitement ». (Spec Q4, 2026-09-29 ; remplace le point 4 des réponses à
  la relecture du 2026-09-28)

### 4.6 Modifier, arrêter, reprendre, supprimer

- **TR-27** Nom et type : toujours une correction. (P9)
- **TR-28** Fréquence, heures, posologie : si aucune prise (donnée, oubliée ou reportée, T4 ; une
  prise en plus ne compte pas, R5) n'a été notée depuis le début du réglage, correction (les réglages
  sont remplacés) ; sinon, nouveau réglage à partir d'aujourd'hui, sans question. Le nouveau réglage
  ne ferme rien et ne recopie rien : il change la façon de calculer les échéances à partir
  d'aujourd'hui (R1) ; les prises, reports et décalages restent ceux du traitement (R4, R7, R11) ; le
  calendrier ne bouge que si la fréquence change, et alors seulement à partir de la première
  échéance proposée (R3, R9). Une prise déjà notée aujourd'hui couvre son heure si elle existe
  encore, sinon la première heure libre qui la suit (R4, Q24, décision de Gaelle du 16 octobre 2026) ; les prises passées gardent leurs réglages, et une journée à venir
  déjà notée ou déplacée garde ses heures (R4, décision de Gaelle du 15 octobre 2026) ; sans aucune
  dose tombée, des heures changées à fréquence gardée ouvrent un nouveau réglage à partir
  d'aujourd'hui plutôt que de corriger le réglage, pour que les journées passées gardent les leurs
  (décision de Gaelle du 16 octobre 2026) ; **quand la fréquence ne
  change pas (posologie ou heures seules), une dose en retard reste la dose du moment, en retard,
  comme avant la modification** (R9, décision Q-retard du 2026-10-10) ; quand la fréquence change,
  les échéances restées sans prise avant la première échéance du nouveau réglage restent à
  renseigner, comme après un arrêt (TR-30). Un réglage ouvert
  aujourd'hui et encore sans prise se remplace quand on le modifie de nouveau le jour même (R10).
  Exception au « sans question » : sans prise notée mais avec des échéances déjà tombées, changer la
  fréquence ou les heures pose la question à l'enregistrement (spec Q38). (P9 Q1 ; spec Q7 ; moteur
  v2, décision du 2026-10-10.)
- **TR-29** Un autre produit est un nouveau traitement : arrêter l'ancien, créer le nouveau. (P9 Q2)
- **TR-30** « Arrêter » : dialogue qui propose de renseigner les doses non renseignées (« Toutes
  données », « Choisir les jours », « Arrêter sans renseigner ») ; « Arrêté le … », plus aucune
  échéance ni rappel ; les doses non renseignées d'avant l'arrêt restent à renseigner, y compris une
  dose en retard depuis plusieurs jours, que le dialogue compte avec les autres (relecture de cohérence du 2026-09-30, validé en bloc) ; « Annuler ».
  La dose du jour non notée est retirée par l'arrêt ; quand elle existe, le dialogue le dit : « La dose
  d'aujourd'hui n'est pas notée : si tu l'as donnée, touche « C'est fait » avant d'arrêter. » (Spec Q9)
  Les prises du jour de l'arrêt notées avant l'arrêt restent comptées, quel que soit le jour où le
  traitement a commencé, dose arrivée d'un report comprise, et même repris ce jour-là, que la reprise
  y ait une dose ou non, et quel que soit le nombre d'arrêts et de reprises ce jour-là ; une dose
  d'après l'arrêt donnée d'avance reste « sans effet » (#819, #823, décisions du 2026-10-13). Quand la
  reprise a sa journée le jour de l'arrêt (sa première dose, ou une dose reportée ou avancée à ce
  jour), une prise d'avant l'arrêt donnée ce jour-là couvre toute cette journée, quelles que soient les
  heures (R8, Q-G3), tout en restant comptée dans sa période : aucune n'est « sans effet », et une dose
  que la reprise porte ce jour-là n'existe qu'une fois (R1). Une reprise le même jour aux mêmes
  heures retombe sur la même échéance : la note posée dessus reste, prise ou oubli ; un oubli ne
  couvre jamais une autre heure de la reprise (confirmé par Gaelle le 14 octobre 2026). Un
  report qui arrive le jour de l'arrêt et a servi de départ à un nouveau rythme reste verrouillé,
  comme avant l'arrêt (#780).
  Sans dose à renseigner, une confirmation simple : « Plus aucun rappel pour Milbemax. Ses prises
  restent dans le carnet. » (relecture du lot A, correction 6). (P9 Q3, doute de Gaelle à observer)
  Arrêté avant sa première échéance, sans aucune prise sur tout le traitement : la date d'arrêt reste
  le jour du geste, et la fiche, « Traitements terminés » et le PDF disent « Arrêté avant la première
  prise » au lieu de « Arrêté le … » ; aucune dose à renseigner. (#594, Q5 du 2026-10-07)
- **TR-31** Un traitement avec date de fin est « terminé » dès que sa dernière échéance a un état et
  qu'il ne reste rien à renseigner ; toast « Dernière dose de Panacur notée, à retrouver dans
  Traitements terminés. » avec « Annuler ». Même règle pour un arrêt : un traitement arrêté qui a encore
  des doses à renseigner reste dans « Traitements en cours » jusqu'à ce que tout soit renseigné ; le
  toast de l'arrêt dit « Panacur arrêté » s'il en reste, « Panacur arrêté, à retrouver dans Traitements
  terminés. » sinon, y compris après « Toutes données » ou « Choisir les jours » dans le dialogue d'arrêt
  (spec Q14). Quand renseigner termine un traitement fini ou arrêté : « Panacur : 4 prises et 1 oubli
  notés, à retrouver dans Traitements terminés. » · Annuler (spec Q16).
  (Relecture, point 1 ; planche Q8 ; relecture du lot A, QA-11)
- **TR-32** « Reprendre » (terminé ou arrêté) crée une nouvelle période : formulaire prérempli avec les
  réglages de la précédente (fréquence, heures, posologie, durée), tous modifiables, sans le nom ni le
  type (titre « Reprendre Panacur », bouton « Reprendre ») ; la première prise est demandée ; la période
  précédente n'est jamais modifiée. (P7 Q3 ; relecture du lot A, QA-12)
- **TR-33** « Supprimer » : confirmation (« Supprimer Milbemax ? Ses prises et ses rappels seront
  supprimés du carnet. »), puis « Annuler » ; suppression logique en base. Réservé aux erreurs de
  saisie. Sur la fiche : « Modifier » en crayon dans la barre, « Supprimer ce traitement » dans le menu
  ⋮, « Arrêter ce traitement » en bas (existant ; spec Q11). (G1 ; P9)

### 4.7 Affichage

- **TR-34** Fiche : carte de la dose du moment (« Dose du jour », « Prochaine dose », « en retard
  depuis », ou fin du traitement), fréquence (« Tous les jours · jusqu'au 5 oct. »), heure(s),
  posologie ; sous les heures, « Rappel 30 min avant · peut arriver en retard » avec « Réactiver » quand les
  rappels précis ont été retirés (spec Rappels, RA-23) ; bandeau des doses non renseignées ; historique.
  (Planches Q2, Q5, Q8 ; spec Rappels Q6)
- **TR-35** Historique : une seule liste chronologique par période ; oubliées en gris, regroupées quand
  elles se suivent ; déplacements en ligne discrète (« Reportée au 14 oct. 2026 (prévue le 10 oct.) »,
  ou « Avancée au 8 oct. 2026 (prévue le 10 oct.) », spec Q17) ;
  « Dernière prise » = dernière donnée ; « N prises » ne compte que les données ; une prise notée un
  autre jour que son échéance : l'échéance en titre (« 6 oct. 2026 », avec l'heure seulement si la
  période a plusieurs heures), « Donnée le 7 oct. 2026 » dessous ; aucune ligne « A fixé la dose
  du … » (spec Q13) ; période sans prise : « Aucune prise dans cette période pour l'instant » tant
  qu'elle est en cours, « Aucune prise dans cette période » une fois close, ou « Aucune prise » pour
  un traitement arrêté avant sa première prise (TR-30 ; la carte « Fin du traitement » dit « Arrêté
  avant la première prise ») ;
  l'écart d'une dose non renseignée n'apparaît pas comme une ligne (il est dans le bandeau), sauf quand
  il n'y a plus de bandeau (animal qu'on ne suit plus) : ligne « Non renseigné du … au … », comme dans le
  PDF. (Spec ; planches Q4, Q5 ; P10)
- **TR-36** Carnet et « À faire » : voir la spec Accueil (une ligne par traitement, par prise du jour
  pour plusieurs heures ; un traitement qui a des doses à renseigner a sa ligne dans le groupe
  « À renseigner », badge neutre, qu'il soit en cours, fini ou arrêté, en plus de ses lignes de dose
  s'il est en cours). Dans le Carnet, une ligne par traitement : un traitement en cours qui a des doses
  à renseigner garde son badge et ajoute dessous « 3 doses non renseignées », sans rouge ; fini ou
  arrêté, badge neutre « À renseigner » (spec Q15 ; planche B · V15). (P4 Q1, P5 Q1,
  P9 Q3 ; spec Accueil Q4, AC-8)
- **TR-37** Un animal qu'on ne suit plus : ses traitements en cours sont arrêtés (spec Animaux, AN-11) ;
  ils ne produisent plus ni échéance, ni rappel, ni dose à renseigner, et sont dans « Traitements
  terminés » ; leur historique reste, écarts compris (TR-35). Après « Suivre de nouveau », leurs doses
  non renseignées reviennent à renseigner (TR-30 ; relecture de cohérence du 2026-09-30, validé en bloc). (P10 ; spec Animaux, lot B révisé)

### 4.8 Règles du moteur (v2, décision du 2026-10-10)

Ces douze règles remplacent les gardes G1 à G26 de la v1 (plan de mise en œuvre : `docs/technical/moteur-doses-v2-plan.md`). Trois idées les portent :
1. **Un calendrier par traitement, pas par réglage.** Les prises, les reports et les décalages appartiennent au traitement. Un changement de réglage (fréquence, heures, posologie) change la façon de calculer les échéances **à partir d'un jour**, il ne ferme rien et ne recopie rien. Plus aucune ligne n'est « perdue » ou « purgée » parce qu'un réglage a changé.
2. **Une échéance, c'est un jour et une heure.** Une prise couvre l'échéance qu'elle vise, point. Une prise dont l'heure n'existe pas ce jour-là ne se perd pas : elle couvre la première échéance libre qui la suit dans la journée, sinon elle garde sa propre échéance ; elle ne se translate jamais sur une autre journée (règle unique du 17 octobre 2026) ; le jour où les heures changent, les prises du jour couvrent les premières heures du nouveau réglage, dans l'ordre (décisions de Gaelle du 16 octobre 2026). Une journée déjà notée ou déplacée garde les heures qu'elle avait quand elle a été touchée ; les nouvelles heures valent pour les journées non touchées (décision de Gaelle du 15 octobre 2026).
3. **La grille a une origine, et une seule chose la déplace : une ligne de décalage.** L'origine se transmet d'un réglage au suivant tant que la fréquence ne change pas (le 31 d'un mensuel reste le 31). Aucune date de réglage ne porte un autre sens caché.


#### R1 — Réglages successifs

Un traitement a des **réglages** successifs (fréquence, heures, posologie, date de fin, rappel), chacun valable **à partir d'un jour** jusqu'au jour du suivant. Un réglage a une **première échéance** et une **origine de grille**. À la création et à la reprise, l'origine est la première échéance. Un arrêt ferme le réglage en cours à la date d'arrêt ; une reprise ouvre un nouveau réglage.

#### R2 — La grille

Les journées d'échéance d'un réglage sont son origine plus un nombre entier de pas (jours, semaines, mois), **à partir de sa première échéance** et jusqu'à sa date de fin ou au jour du réglage suivant (exclu). En mois, un jour qui n'existe pas devient le dernier jour du mois, sans que l'origine change (31 janv., 28 févr., 31 mars). Chaque journée a les heures du réglage, ou une seule échéance sans heure.

#### R3 — L'origine se transmet

Quand un réglage **garde la fréquence** du précédent, il hérite de son origine de grille (telle qu'elle est **en vigueur** à son premier jour : décalages compris, R7) : le calendrier ne bouge pas. Quand la fréquence change, l'origine est la première échéance du nouveau réglage (R9). L'origine se transmet, les heures non : les nouvelles heures valent pour les journées que rien n'a touchées (R4) (décision de Gaelle du 15 octobre 2026). « Elles n'étaient pas à donner » (R10) à fréquence gardée n'y fait pas exception : la grille ne repart pas du jour d'arrivée d'un report, qui garde ses doses reportées en plus (seule exception, lecture à confirmer : R10, le report qui deviendrait sans effet). Milo, tous les 3 jours à 8 h et 20 h depuis le 6 mars, 8 h du 6 donnée, la dose du 9 reportée au 17 avec la case, puis tous les mois aux mêmes heures ; le 8, « sans heure » et « Elles n'étaient pas à donner » : le 17 garde 8 h et 20 h à donner, puis le 6 avril et le 6 mai ; avec une fin le 10 avril, la dose du 6 avril reste (#868, décision de Gaelle du 16 octobre 2026).

#### R4 — Ce qu'une prise couvre

Une prise (donnée ou oubliée) vise une échéance, jour et heure, et la couvre dans **tout** le calendrier du traitement, quel que soit le réglage qui la produit. Sa date réelle est une information d'historique. Une prise donnée dont l'heure n'existe pas ce jour-là couvre la première échéance encore libre qui la suit dans la journée ; s'il n'y en a pas, elle garde son heure. **Une prise ne se translate jamais sur une autre journée** (règle unique du 17 octobre 2026, qui amende #862 ; voir plus bas) : tous les 6 jours à 8 h et 20 h, les deux doses du 14 données d'avance, puis tous les 3 jours à 20 h dès le 7 : les deux prises gardent le 14 (« données d'avance »), le 16 et le 19 restent à donner. Un oubli ne couvre que sa propre échéance. Le jour où les heures changent, les prises du jour, données ou oubliées, couvrent les premières heures du nouveau réglage, dans l'ordre, à hauteur de leur nombre, quelle que soit leur heure ; une prise dont l'heure existe encore parmi les nouvelles couvre son heure : chaque jour à 8 h et 20 h, 20 h donnée d'avance le 10, heures passées à 9 h et 21 h le 10 : 9 h couverte, 21 h à donner. Quand la journée a plus de notes que d'heures, les prises données prennent les heures d'abord, dans l'ordre, les oublis ensuite, sur les heures restées libres (un oubli dont l'heure est prise par une prise donnée en prend une autre), et l'oubli en trop est sans effet : un écran ne dit jamais « oubliée » un jour où la dose a été donnée ; chaque jour à 8 h et 20 h, le 10, 8 h donnée et 20 h marquée oubliée, puis 20 h seule le même jour : 20 h est couverte par la prise de 8 h, l'oubli de 20 h est sans effet (#866, décision de Gaelle du 16 octobre 2026). Deux prises du même jour et de la même heure sont la même dose : la plus récente vaut, l'autre est sans effet (TR-25) ; deux téléphones, A donne 20 h d'avance le 10 sous 8 h et 20 h, B passe à 12 h et 20 h le 10 et donne 20 h : celle de B couvre 20 h, celle de A est sans effet, 12 h reste à donner. Une journée de l'ancien réglage entièrement notée n'a plus rien à donner. Les prises se posent avant les reports : un report n'emporte que les heures restées sans prise (#860) ; écrit sous d'autres heures que celles de sa journée, il les garde : une prise à l'une de ces heures la note, et une prise d'une heure absente écrite sous un réglage antérieur au sien s'y pose de la même façon ; une prise du réglage écrit après lui ne compte qu'à son heure. Le jour où les heures changent, une prise ou un oubli écrits après un report du jour ne se posent que sur les heures que le report a laissées ; s'il n'en reste aucune, une prise donnée garde son heure (règle unique du 17 octobre 2026) et un oubli est sans effet : chaque semaine à 20 h, la dose du 10 avril reportée au 15 et donnée ; le même jour, 8 h et 20 h, la dose de 8 h du 10 marquée oubliée, puis 20 h seule : l'oubli est sans effet, le 15 garde sa dose (graine 6100002653). Décisions de Gaelle du 16 octobre 2026. La journée du changement n'est traduite que quand le réglage qui la lit change d'heures ; une journée touchée lue sous un réglage plus ancien garde ses doses : tous les 2 jours à 6, 12, 18 et 23 h, « Prochaine dose » le 12, 6 h du 12 donnée d'avance et 23 h reportée au 13, puis 20 h seule ; le 12, 12 h donnée, puis 20 h 01 : le 12 garde 6 h et 12 h données, 18 h à donner, 23 h au 13, puis le 14 à 20 h 01 (graine 7810000428, décision de Gaelle du 16 octobre 2026).

**Une journée déjà déplacée ou notée garde les heures qu'elle avait quand elle a été touchée ; les nouvelles heures valent pour les journées non touchées** (décision de Gaelle du 15 octobre 2026). Hors du jour où les heures changent, une journée qui porte une prise, ou l'origine ou l'arrivée d'un report, se lit avec les heures du réglage de sa ligne la plus récente (TR-25 : entre deux appareils, la plus récente décide) ; une journée sans ligne lit le réglage en vigueur ; un décalage ne fixe pas les heures de sa journée, il ne la déplace ni ne la note (décision de Gaelle du 16 octobre 2026) ; une journée d'échéance qui reçoit un report garde les doses de sa grille et y ajoute les doses reportées, une même heure ne comptant qu'une fois : hebdomadaire à 20 h, la dose du 13 avril reportée au 15, puis tous les 3 jours à 8 h et 20 h dès le 12 : le 15 montre 8 h et 20 h (décision de Gaelle du 16 octobre 2026). « C'est fait » sur une journée qui garde ses heures s'écrit sous le réglage de ces heures. Luna, toutes les 2 semaines à 8 h, 14 h et 20 h, journée du 9 avril donnée ; le 12, la dose du 23 avancée au 15 ; le même jour, 6 h seule : le 15 porte 8 h, 14 h et 20 h, le 23 est vide, puis le 7 mai à 6 h ; aucune dose en retard ne réapparaît, le report n'est jamais « sans effet ». Deux téléphones : A avance la dose du 23 au 15, B passe à 6 h le même jour sans voir le report : après la synchro, les deux montrent la même lecture. Milo, tous les mois à 8 h et 20 h ; le 18 mars, la dose du 7 avril à 20 h donnée d'avance, celle de 8 h reportée au 12 et donnée d'avance, puis tous les 3 jours ; le 22 mars, 8 h 01 et 20 h 01 : le 7 et le 12 gardent leurs heures et restent couverts, puis le 10 à 8 h 01 et 20 h 01, le 13, le 16. Milo à 8 h et 20 h, dose de 8 h donnée ce matin, heures passées à 9 h et 21 h : aujourd'hui, 9 h est couverte par la prise de 8 h, première heure du nouveau réglage, et 21 h reste à donner ; demain, 9 h et 21 h ; si la dose de demain à 8 h était déjà donnée d'avance, demain garde 8 h (donnée) et 20 h.

Un oubli est une note sur **une** échéance, celle de son jour et de son heure : jamais compté comme donné, jamais reporté sur une autre dose (décision de Gaelle du 14 octobre 2026). Le jour où les heures changent, la traduction vaut pour lui aussi : c'est la même dose du matin (R9), l'oubli reste dessus et la nouvelle première heure n'est pas redemandée.

**Règle unique : une prise garde toujours la journée et l'heure écrites dans sa ligne** (décision de Gaelle du 17 octobre 2026, par la session d'analyse du moteur à qui elle a délégué les lectures de règles). Elle ne se translate jamais sur une autre journée, quelle que soit la cause (réécriture d'un réglage, « Elles n'étaient pas à donner », « Prochaine dose », date choisie, changement de fréquence, correction sur place, date de fin) et quelle que soit la naissance du réglage. Une prise donnée n'est jamais « sans effet » : seule une prise plus récente sur la même dose la remplace (TR-25) ; hors du calendrier, elle reste « donnée en avance » ou « donnée en retard » sur son échéance, et ne couvre aucune autre dose. Reste de R4 : la traduction des heures dans la même journée (le jour où les heures changent) et les décisions du 16 octobre sur la journée touchée. L'oubli garde sa lecture : une journée qui porte une prise est une journée touchée, qui garde les heures de sa ligne la plus récente (décision du 16 octobre 2026, TR-25) ; son échéance n'a pas disparu et l'oubli y reste ; « échéance disparue = sans effet » ne vaut que quand la journée entière est sortie du calendrier sans prise (décidé le 17 octobre 2026, graine 901836 : 8 h du 16 oubliée, 20 h donnée, « Prochaine dose » le 23 : l'oubli reste sur le 16 à 8 h). Au-delà de l'arrêt, la reprise seule porte ces jours (R8) : une prise d'avant l'arrêt datée après lui reste sans effet. Une réécriture ne retire donc que les doses non données qu'elle visait (principe du 17 octobre 2026), et une dose reportée est toujours portée par son jour d'arrivée. La règle unique protège une prise des effets de bord d'un réglage, pas d'un geste fait exprès sur la dose elle-même : une prise remplacée par un oubli sur la même dose (« Marquer comme oubliée », un autre appareil) est grisée « sans effet » (#841, décision du 17 octobre 2026).

Exemples (décisions du 17 octobre 2026) :
- Milo, chaque lundi à 8 h et 20 h ; le 9 mars, 20 h du 16 donnée d'avance ; le 11, 9 h et « Prochaine dose » le 23 : le 16 garde sa prise ; le 14, la dose du 23 avancée au 17 avec la case : le 17 à 9 h est à donner (en retard le 18), puis 24, 31 ; le 18, « Supprimer ce report » : le 16 garde sa prise, prochaine dose le 23 à 9 h.
- Le 7, le téléphone A note donnée la dose du 3 avril en retard, le téléphone B passe à 6 h et répond « Elles n'étaient pas à donner » : quel que soit l'ordre, le 3 à 20 h « donnée le 7, en retard », puis le 17 à 6 h (#892).
- Toutes les 6 semaines à 8 h et 20 h, les deux doses du 23 mars données d'avance sur l'arrivée d'un report ; A avance la dose du 28 avril au 23 avril, B choisit « Prochaine dose » le 9 juin, A plus récent : les deux prises gardent le 23 mars, rien n'y est demandé, le 23 avril à 8 h reste à donner (#893, graine 8810000692).
- Graine 4900001764 (#852) : chaque semaine à 8 h, 14 h et 20 h ; la dose de 8 h du 6 avril reportée au 16, la dose de 14 h du 13 donnée d'avance le 7, « Prochaine dose » le 20 : la prise du 13 reste « donnée en avance » sur le 13, le 16 à 8 h est à donner, en retard le 17 ; changer seulement les heures (8 h 01) ne change rien.
- Tous les 3 jours à 6, 12, 18 et 23 h dès le 26 mars ; le 24, la dose du 26 à 12 h donnée d'avance ; le 25, tous les 3 mois, puis « Prochaine dose » le 26 juin : le 26 mars à 12 h reste « donnée le 24 mars, en avance », les autres heures du 26 sortent, puis le 26 juin (#884) ; de même pour une date choisie le 22 à fréquence gardée quand la grille passait le 21 (#861).
- Chaque semaine à 8 h et 20 h, la dose du 3 mai donnée d'avance, puis heures seules changées : le 3 mai garde ses deux prises, le 8 mai à 20 h, dose reportée, reste à donner (#865, #874, #876, #877, #881, #898).
- Une date de fin retire les doses non données après elle ; une dose donnée d'avance après la fin reste « donnée », visible, jamais grisée (graine 8810000692, pas 14).

_Remplace Q24, G1, G2, G4, G22, G24 et les « journées entamées en avance », « journées réglées », « heures restées en arrière »._

#### R5 — Prise en plus

Une prise notée **un intervalle ou plus avant** l'échéance qu'elle viserait (ou un second « C'est fait » le même jour d'un traitement sans heure, ou avant le début du traitement) est une **prise en plus** : rangée sous sa date réelle, elle ne couvre rien et ne change jamais le calendrier. À plusieurs heures par jour, une heure donnée en avance couvre son échéance (ce n'est pas une prise en plus).

_= G11, inchangée._

#### R6 — Le décalage, et seulement lui, déplace la suite

La suite des échéances ne repart jamais d'elle-même d'une date réelle. Elle repart d'une **ligne de décalage**, écrite quand la personne coche « Décaler aussi les doses suivantes » (prise en retard ou en avance, report, correction de date). Une ligne de décalage dit : « à partir de cette journée d'origine, la grille a pour nouvelle origine ce jour d'ancrage ». Elle est visible dans l'historique, supprimable seule, et survit à la suppression de la prise qui l'a créée ; « Supprimer ce report » emporte les décalages de sa journée, comme « Prochaine dose » ramenée au jour d'origine, et il est refusé quand ils ne peuvent pas partir avec lui (TR-24, TR-25, #835, décisions du 2026-10-14).

La case est proposée quand la prise ou le report **change la date** de la dose du moment ou de la prochaine dose (pas pour une dose non renseignée, pas pour la dose du jour donnée le jour même, pas pour une prise en plus). **Corriger la date d'une prise** (décision du 2026-10-10, Q-C1) se juge **au jour de la nouvelle date**, comme si la prise était notée ce jour-là : la case est proposée aux mêmes conditions, et le résultat est le même que par « Fait à une autre date », sauf quand la dose visée est notée oubliée : « Fait à une autre date » la repasse en donnée (TR-22), la correction de la date d'une autre prise est refusée (R11).

**La case n'est pas proposée quand une ligne existe plus loin dans la période** (une prise, donnée ou oubliée, ou un décalage dont la journée d'origine est après la dose notée ou corrigée) : la date se note ou se corrige, le calendrier ne bouge pas, et l'aide le dit (« Une dose plus lointaine est déjà notée. », texte existant). Pour décaler quand même, la personne corrige ou supprime d'abord la ligne la plus récente. Même refus pour « Supprimer ce décalage » quand une prise existe plus loin (G19). La case n'est pas proposée non plus pour une dose déplacée seule (Q2 c), et une correction qui ferait d'un oubli plus lointain une prise donnée est refusée avec le même texte (décisions du 2026-10-12). Seul le décalage ancré à la date de la prise suit une prise corrigée. Un décalage ne vaut que si sa journée d'origine est encore une échéance du calendrier en vigueur : elle se juge sur la grille telle qu'elle est avant lui (la grille héritée ou celle du réglage courant), jamais sur la grille après son application, ou c'est l'arrivée d'une dose reportée du rythme en vigueur ; sinon il est sans effet (R11) (décision du 2026-10-12). Hebdo du lundi, tous les 3 jours le 14 (première dose le 16), dose du 16 donnée le 14 avec décalage puis la prise supprimée, retour à l'hebdo le 14 : le 16 n'est pas sur la grille 5, 12, 19, la fiche montre le 19 ; une posologie seule garde le décalage d'un vendredi 16 (grille 9, 16, 23). Un report qui suit est, lui, gardé et réécrit (G12, TR-24 bis) ; s'il ne peut pas l'être (R7), la correction est refusée. Raison : une ligne de décalage ne doit jamais déplacer la grille sous une prise déjà notée, sinon cette prise ne vise plus rien et l'app redemanderait une dose déjà donnée (#762, décision du 2026-10-10). Une prise qui garde déjà sa journée hors du calendrier (R4, règle unique du 17 octobre 2026) n'a pas d'échéance à perdre : un geste ne la laisse pas sans échéance. Milo de R4 : le 14 mars, avancer la dose du 23 au 17 est permis ; la prise du 16 garde le 16, le 17 est à donner.

Un report plus récent que la réécriture de son réglage faite sur un autre appareil (R10, #867) garde aussi son décalage : la ligne de décalage part de la journée de départ que ce report garde et translate les échéances suivantes de la grille du réglage réécrit, date choisie comprise, à ses heures ; le jour d'arrivée garde l'heure écrite dans le report. Milo de R10 : le téléphone A reporte la dose du 3 avril au 10 avec la case, le téléphone B passe à 6 h et répond « Elles n'étaient pas à donner » (première dose le 17, proposée ou choisie) ; A plus récent : le 10 à 20 h, puis le 24 et le 8 mai à 6 h (17 → 24, 1er mai → 8 mai) ; B plus récent : le report et son décalage sont sans effet, rien le 10, puis le 17 à 6 h (#885, décision de Gaelle du 17 octobre 2026, par la session d'analyse du moteur à qui elle a délégué les lectures de règles).

_Remplace TR-7 T1/T2 (« la suite repart de la dernière ligne »), G10, G18, G20 (le contenu de la case), TR-24 bis (la partie calcul)._

#### R7 — Le report déplace une journée, ou une heure et les suivantes

Un report déplace la dose visée **et les heures suivantes de la même journée encore sans prise** vers un jour d'arrivée, qui ne reçoit que ces heures. Les heures déjà notées de la journée d'origine y restent. Sans la case, seule cette dose bouge et elle arrive au plus **la veille** de la journée d'échéance suivante ; avec la case, une ligne de décalage ancrée au jour d'arrivée repart de lui (R6). Déplacer de nouveau la même dose réécrit sa ligne ; la ramener à sa date la supprime. Un report n'arrive jamais sur le jour d'origine d'un autre report, ni sur son propre jour d'origine, **y compris quand une correction de date le réécrit** (G9, G12) : la correction qui ferait se renvoyer la même dose entre deux reports est refusée, avec le texte existant « Change d'abord la date du report. » (#763, décision du 2026-10-10). Une journée n'a qu'une ligne de report et qu'une ligne de décalage (la plus récente vaut, deux appareils). Un report reste **une ligne du traitement** : il n'est jamais supprimé ni oublié parce qu'un réglage a changé (décisions Q-§11 et Q-purge du 2026-10-10). Le refus vaut pour un report **écrit par un geste** : une chaîne déjà existante (autre appareil, données d'avant la règle) se lit telle quelle (scénario #745). Un report dont l'arrivée est devenue la première échéance d'un nouveau rythme a servi : il est verrouillé comme Q25, ni « Changer la date » ni « Supprimer » (#780, décision du 2026-10-12).

Un report emporte ses heures telles qu'elles étaient quand il a été écrit, même si les heures changent ensuite : le jour d'arrivée ne reçoit que ces heures, et sa journée d'origine garde les siennes (R4) (décision de Gaelle du 15 octobre 2026). Une dose de 20 h reportée au lendemain, heures passées à 9 h et 21 h : elle arrive à 20 h. Il emporte son heure et les suivantes sans prise, prises de toute provenance comprises (décision de Gaelle du 16 octobre 2026) : Milo, tous les mois à 8 h et 20 h, 20 h du 1er avril donnée d'avance, passage à 8 h, 14 h et 20 h, 14 h reportée au 16 : le 1er lit 8 h, 14 h et 20 h, la prise de 20 h couvre 20 h, le 16 reçoit 14 h seule. Écrit avant le changement d'heures du jour où il part, le jour de départ, qui lit les nouvelles heures (R4), garde autant de doses que le report en a laissées (par rang : le report de 14 h sur 8 h, 14 h et 20 h laisse une dose ; une dose d'après lui déjà notée, qu'il n'emporte pas, reste aussi), posées sur les premières heures du nouveau réglage, dans la limite de ses heures, et les prises écrites après le report s'y posent ensuite ; une dose n'apparaît pas sans geste : chaque jour à 8 h, 14 h et 20 h, 8 h du 17 mars reportée au 5 avril avec la case, puis 6 h, 12 h, 18 h et 23 h le même jour : rien le 17 ; tous les 2 jours à 8 h, 14 h et 20 h, 14 h du 10 reportée au 11, 8 h encore à donner, le 10 passage à « sans heure » : une dose le 10 (à 6 h : 6 h ; à 9 h et 21 h : 9 h), 14 h et 20 h le 11 (décisions de Gaelle du 16 octobre 2026). La journée de départ, telle que le report l'a vue, porte aussi les doses qui y étaient arrivées, et il les emmène : la dose du 14 reportée au 22 y porte une dose sans heure, 6 h, 12 h et 18 h ; le 14, une heure ajoutée : le 22 les garde (#864). Arrivé sur une journée d'échéance, il y ajoute ses doses (voir R4). « Prochaine dose » désigne une journée : la date choisie qui l'emmène (#796) porte toutes les heures du nouveau réglage, avec les doses reportées, une heure comptée une fois (décisions de Gaelle du 16 octobre 2026) : hebdomadaire à 8 h et 20 h, la dose du 13 reportée au 15, le 9 passage à 9 h et 21 h, « Prochaine dose » le 17 : le 17 à 9 h et 21 h ; Luna, chaque semaine à 8 h et 20 h, 8 h du 6 avril donnée d'avance, 20 h reportée au 12, le 8 « Prochaine dose » le 10 : le 10 à 8 h et 20 h, puis le 17 et le 24.

_= Q21, G25 (la partie « arrivée »), G7, G9, G13, G17, Q18, Q2 a, Q25 pour les refus._

#### R8 — Reprendre

Après un arrêt, la reprise ouvre un nouveau réglage dont la première échéance est choisie par la personne (dès le jour de l'arrêt). Les prises **d'avant l'arrêt** ne couvrent pas la reprise, **sauf** une prise **donnée** le jour même de la reprise, qui couvre sa première journée (décision Q-G3 du 2026-10-10), y compris quand la première dose de la reprise est avancée à ce jour-là, avec ou sans changement de posologie (#784, décision du 2026-10-12). Elle couvre toute cette journée, quelles que soient les heures : Milo, dose de 8 h du 8 donnée, arrêt, reprise le 8 à 20 h, rien à redonner, prochaine dose le 9 à 20 h ; deux doses par jour à 8 h et 20 h données, reprise le 8 à 9 h et 21 h, journée couverte, pas de double dose. Les prises d'avant l'arrêt restent comptées dans leur période (#819) : 8 h, 14 h et 20 h du 8 données, arrêt et reprise le 8 à 20 h seulement, aucune n'est « sans effet », et la dose de 20 h du 8 n'existe qu'une fois (R1) (décisions du 2026-10-13). Une reprise le même jour aux mêmes heures retombe sur la même échéance : la note posée dessus reste (R1, comme #821 pour 20 h ; confirmé par Gaelle le 14 octobre 2026). Un oubli ne couvre que son échéance (R4) : il ne couvre jamais une autre heure de la reprise. Milo à 8 h, 14 h et 20 h ; le 8, la dose de 8 h marquée oubliée, arrêt, reprise le 8 aux mêmes heures : 8 h n'est pas redemandée, l'oubli reste dessus (pas « sans effet »), 14 h et 20 h sont à donner. Milo, une dose par jour à 8 h ; le 8, la dose de 8 h marquée oubliée, arrêt, reprise le soir à 20 h seule : la dose de 20 h reste à donner. Entre deux appareils, la ligne la plus récente de la dose décide : donnée puis oubliée, rien d'autre n'est couvert (lecture de R11, à confirmer par Gaelle).

#### R9 — Où commence un réglage changé

Quand la fréquence ou les heures changent, la première échéance proposée est :

1. **aujourd'hui**, si aujourd'hui est une journée d'échéance (grille ou arrivée d'un report) qui a encore des heures à donner, ou si rien n'y est noté et qu'une dose y était due ; les prises d'aujourd'hui couvrent leur heure si elle existe encore, sinon les premières heures du nouveau réglage, dans l'ordre (R4) ;
2. sinon, la **prochaine journée d'échéance** du calendrier en vigueur quand elle est déjà **entamée** (une de ses heures donnée en avance) ou quand c'est l'**arrivée d'un report** : elle garde son jour et ses heures (R4, décision de Gaelle du 15 octobre 2026), et le nouveau rythme part d'elle ;
3. sinon, la **dernière journée d'échéance passée plus la nouvelle fréquence**, jamais avant aujourd'hui ; une journée notée que le réglage suivant a fait sortir du calendrier compte (R4), la date ne dépend donc pas du jour de la correction (#799, décision du 2026-10-12) ; une journée qui garde ses prises avant une première échéance posée plus loin (R4, #847) compte comme dernière journée passée : Milo de R4, le 18 mars, passage à tous les 3 jours à 9 h : dernière journée le 16, première échéance le 19 à 9 h, à donner : la prise du 16, qui a gardé son échéance, ne couvre pas la première échéance du nouveau rythme (principe du 17 octobre 2026, R4 ; décision de Gaelle du 17 octobre 2026, par la session d'analyse du moteur). Mensuel à 8 h et 20 h, la dose de 8 h du 2 avril donnée d'avance, « Prochaine dose » le 2 juin ; le 3 avril, chaque semaine : date proposée le 9 avril, les huit semaines sans dose sont écartées. Après un changement de fréquence, la première échéance du nouveau rythme est à donner même si une dose a été donnée d'avance pour une journée disparue (décision du 17 octobre 2026).

La date proposée et montrée est la première dose encore à donner, comme sur la fiche (une journée déjà toute notée garde son rôle de première échéance écrite) ; un nouveau rythme dont la première dose encore à donner tomberait après la date de fin est refusé, une date de fin égale à aujourd'hui n'ayant rien de spécial (« Avec ce rythme, plus aucune dose avant la date de fin. Change la date de fin ou le rythme. », #787) (décisions du 2026-10-12). La date est modifiable (« Prochaine dose ») ; une autre date choisie devient la première échéance et l'origine, et le réglage enregistre qu'elle a été choisie : une date proposée, même écrite comme première échéance et origine, ne remplace jamais la dose du moment (#836, décision de Gaelle du 14 octobre 2026) ; à fréquence gardée, sauf après la question Q38 (R10), elle remplace la dose du moment : la dose en retard, qui ne passe pas « à renseigner », ou, si le réglage commence un jour d'échéance, la dose de ce jour, les doses plus anciennes restant à renseigner ; la grille repart de la date choisie, et un report plus loin la suit si sa journée d'origine est sur la nouvelle grille, sinon il est sans effet ; parti de la date choisie elle-même, il est porté par elle, donc sans effet (R6, R11 ; décisions du 2026-10-13) ; quand la dose du moment est l'arrivée d'un report (rien en retard ni en attente avant elle), la ligne du report est réécrite pour arriver à la date choisie (R7), elle ne devient pas « sans effet » (#796, décision du 2026-10-12), et le décalage de sa journée la suit comme avec « Prochaine dose » : réécrit avec elle, ou supprimé avec elle quand la date choisie est le jour d'origine (R6, dans les bornes de « Prochaine dose », G7, G8) ; elle est montrée même plus tôt que la première échéance d'un réglage jamais commencé (TR-9, #794, décisions du 2026-10-12). Une date choisie avant une dose déjà notée est refusée, et le champ est grisé dès qu'une dose est déjà notée plus loin que le jour de la modification, ou que la date proposée, sauf quand cette dose est sur la date proposée elle-même, la prochaine dose (« Une dose plus lointaine est déjà notée. », Q26, G24, #811, décisions du 2026-10-13) ; une prise qui garde son échéance sur une journée laissée avant une première échéance posée plus loin (R4, #847) compte comme une dose déjà notée : Milo, chaque lundi à 8 h, dose du 12 octobre donnée le 7, réglage à 10 h du 7 avec première dose le 19 sur la grille du 12 ; le 9, le champ est grisé (avant le 17 octobre, la prise du 12 était sans effet et le champ restait ouvert) ; de même pour Milo de R4, le 12 mars, à cause de la prise du 16 ; la date proposée reste affichée et la posologie reste modifiable sans toucher la date. Quand la fréquence ne change pas (heures ou posologie seules), la première échéance est **la prochaine journée du calendrier en vigueur** (dose du moment en retard comprise : elle reste en retard, jamais déplacée vers « à renseigner », Q-retard), et l'origine est héritée (R3) : le calendrier ne bouge pas. Quand la fréquence change, les échéances restées sans prise avant la première échéance du nouveau réglage restent à renseigner (TR-28, TR-30 ; #810 : « à renseigner » dans les deux cas, décision de Gaelle du 14 octobre 2026) ; la date choisie ne remplace la dose du moment qu'à fréquence gardée, la fréquence se comparant à celle du réglage en vigueur avant le jour du changement (R10).

_Remplace Q7, Q36, Q37, G15, G16, G23 (la partie « où commence »), G24._

#### R10 — Corriger un réglage le jour de son ouverture

Un réglage ouvert aujourd'hui et encore sans prise se **remplace** quand on le modifie de nouveau le jour même : il n'en ouvre pas un troisième (décision Q-#744 du 2026-10-10). Un réglage sans aucune prise dont on change la fréquence ou les heures alors que des échéances sont tombées pose la question de la spec Q38 (garder à renseigner, ou corriger) ; « Elles n'étaient pas à donner » y est refusée, avec le texte de #787, quand elle ne laisse plus aucune dose avant la date de fin, et elle n'annonce alors aucune date (#806, décision du 2026-10-13). « Elles n'étaient pas à donner » ne retire que les doses tombées sans prise que la question a listées, jamais l'arrivée à venir d'un report ni une journée à venir : à fréquence gardée, l'origine est héritée et le calendrier ne bouge pas (R3) ; à fréquence changée, le rythme repart de l'arrivée (R9 point 2) (#868, décision de Gaelle du 16 octobre 2026). Deux téléphones : quand l'un reporte une dose et que l'autre, sans voir ce report, répond « Elles n'étaient pas à donner » pour cette dose, la plus récente des deux intentions l'emporte, comme pour tout conflit entre deux appareils (« la modification la plus récente gagne ») : le report par sa date de modification, la réponse par la date d'écriture du réglage. Réponse plus récente : le report est sans effet, visible dans l'historique (R11), et sa dose disparaît ; report plus récent : il tient, et le jour d'arrivée porte la dose reportée à l'heure écrite dans le report (journée touchée). Milo, tous les 3 jours à 20 h depuis le 26 mars, puis toutes les 2 semaines à 20 h, première dose le 3 avril ; le 7, la dose du 3 est en retard ; le téléphone A la reporte au 10, le téléphone B passe à 6 h et répond « Elles n'étaient pas à donner » : réponse plus récente, rien le 10, prochaine dose le 17 à 6 h ; report plus récent, le 10 à 20 h, puis le 17 à 6 h. Le perdant ne disparaît jamais en silence : le report battu reste une ligne grisée (#867, graine 8010002409, décision de Gaelle du 16 octobre 2026). Une prise donnée de A, elle, tient toujours, même plus ancienne que la réponse de B, et garde son échéance (R4, #892) ; un report plus récent garde son décalage (R6, #885) (principe du 17 octobre 2026). Le réglage garde la réponse à la question, à trois états : aucune question posée, « Elles restent à renseigner », « Elles n'étaient pas à donner » ; seule cette dernière retire des doses, et une réécriture sans question (« Prochaine dose », heures d'un réglage sans dose tombée) ne vaut jamais réponse ; le jour de la réponse est celui de la date d'écriture du réglage (v14), que la réponse seule ne fait pas avancer ; une réécriture sans question garde la réponse du réglage (migration v15, décision de Gaelle du 18 octobre 2026, par la session d'analyse du moteur). La réponse se lit par dose : elle retire exactement les doses tombées sans prise que la question a listées, du premier jour du réglage à la veille du jour de la réponse, y compris celles du jour d'arrivée passé d'un report, qui devient sans effet (R11) s'il n'apporte plus rien ; un report plus récent que la réponse garde son arrivée (#867) ; le jour de la réponse et la suite restent, et une journée touchée garde ses heures (graine 901836) (#873). Graine 8000000726 : tous les 3 jours à 8 h et 20 h ; la dose de 14 h du 13 mars reportée au 18, la dose de 8 h du 16 reportée au 23 ; le 23, « Modifier » tous les mois, sans heure, fin le 20 avril : la question liste 14 h et 20 h du 18 ; « Elles n'étaient pas à donner » les retire, le report du 13 devient sans effet, le 23 à 8 h reste à donner, puis le 18 avril ; « Elles restent à renseigner » les garde. Milo, chaque semaine à 8 h depuis le 2 mars ; le 8, la dose du 9 reportée au 11 ; le 11, « C'est fait » sur la dose du 11, puis tous les 2 jours dès le 11, première dose le 13 ; le 12, « Prochaine dose » le 18, sans question ; le 13, la prise du 11 supprimée : la dose du 11 revient, en retard, et le report du 9 reste (aucune question posée, rien n'est retiré). « Elles n'étaient pas à donner » qui vide la période (plus aucune dose avant la date de fin, la correction à fréquence gardée gardant sa grille sans repartir d'aujourd'hui) est refusée avec le texte de #806, avec ou sans prise dans le carnet (chemins Q38 et Q39) ; « Elles restent à renseigner » ne l'est jamais pour cette raison (#872) : carnet sans prise, chaque semaine à 20 h, la dose du 18 mars reportée au 22, puis tous les 3 mois à 20 h, fin le 6 mai ; le 23, passage à 12, 18 et 23 h : « Elles n'étaient pas à donner » est refusée (la dose du 22 retirée, plus rien avant le 6 mai), « Elles restent à renseigner » reste possible (décision de Gaelle du 18 octobre 2026). Le report le plus récent n'emporte que l'heure écrite dans sa ligne, le réglage réécrit ayant perdu les heures qu'il avait vues (limite connue de la réécriture sur place entre deux appareils), et la règle vaut pour toute réécriture du réglage du report qui ôte sa journée de départ, « Prochaine dose » comprise ; la date d'écriture du réglage est une colonne à part, écrite seulement quand ses réglages changent (décisions de Gaelle du 16 octobre 2026). La règle s'évalue chaque fois que la réécriture ôte la dose de départ du report, que sa journée soit avant ou après la nouvelle première échéance (#882 ; après elle, seule une réécriture plus récente l'emporte, §10), et la ligne gagnante garde son jour et son heure, même quand seule son heure a disparu du réglage (#883) : Luna, chaque semaine à 8 h, première dose le 10 avril, sans prise ; le 8, A reporte la dose du 10 au 12, B choisit « Prochaine dose » le 9 : B plus récent, rien le 12, puis le 9, le 16 et le 23 ; A plus récent, le 9, le 12 à 8 h, puis le 16. Tous les 3 jours à 8 h, 14 h et 20 h depuis le 3 avril, le 3, 8 h oubliée et 20 h donnée d'avance ; A reporte 14 h au 6 mai avec la case, B passe à 8 h et 20 h : A plus récent, le 6 mai à 14 h, puis le 9 mai à 8 h et 20 h ; B plus récent, le report est sans effet (décision de Gaelle du 17 octobre 2026, par la session d'analyse du moteur). La dose de départ se juge sur sa journée lue sans le report, et seule une dose ôtée par la réécriture compte (§10). Limites connues : quand seule l'heure a disparu et que la journée de départ garde une dose encore libre après elle, le report plus récent se lit comme avant ; le décalage d'un report gagnant parti après la première échéance aussi (§11). Un réglage écrit avant la colonne (base d'avant la v14, export v6 ou plus ancien) est daté de sa création, lu comme jamais réécrit : pour lui, la lecture d'avant reste, et selon le cas le report garde ou perd son effet, quelle que soit la date de chacun (lecture de l'implémenteur de la v14, à confirmer par Gaelle). Une posologie seule, la date de fin, l'arrêt et son « Annuler » ne datent pas le réglage (la posologie ne change pas le calendrier, R6 ; lecture de l'implémenteur de la v14, à confirmer par Gaelle) : Milo, le 7 à 9 h le téléphone B passe à 6 h et répond « Elles n'étaient pas à donner » ; à 18 h le téléphone A reporte la dose du 3 au 10 ; à 19 h B ne change que la dose à 1 comprimé : le report tient, le 10 à 20 h puis le 17 à 6 h ; si la posologie datait le réglage, le report serait sans effet et rien le 10 (recommandation : la posologie ne date pas). À fréquence gardée, le jour d'arrivée n'est la première échéance, et la grille ne repart de lui, que si, sans cela, son report deviendrait sans effet (lecture de l'implémenteur de #868, à confirmer par Gaelle, §11 ; graines 7810000235 et 7810000909, lues comme sur `main`). Avec « Elles restent à renseigner », la dose en retard reste en retard : le réglage écrit par cette réponse le dit (« les doses passées du réglage précédent restent à renseigner », #825), et une date choisie n'est que la première échéance de la nouvelle grille, elle ne remplace pas la dose du moment et ne réécrit aucun report ; la règle « la date choisie remplace la dose en retard » (R9) ne vaut que quand aucune question n'a été posée (#817, décision du 2026-10-13). Un décalage écrit sous le réglage remplacé ou corrigé garde son effet seulement si sa journée d'origine est une échéance de la grille du réglage qui le remplace, telle qu'elle est avant lui, ou l'arrivée d'une dose reportée de ce rythme (R6, décision du 2026-10-12) : retour à l'hebdo du lundi, un décalage du 16 est sans effet ; une posologie seule ne change rien. Remplacé le jour même par un réglage de même fréquence sans date choisie (posologie, heures, ou réglage reçu d'un autre appareil), un réglage lui transmet sa date choisie : la dose du moment qu'elle remplaçait reste remplacée, et ses reports se lisent sur la grille repartie (TR-9, R6, décision du 2026-10-13) ; tous les 3 jours du 3 oct., dose du 6 non donnée, le 7 « Prochaine dose » le 8 : 8, 11, 14, la dose du 6 ne revient pas. Cela vaut aussi pour un réglage reçu d'un autre appareil : deux réglages datés du même jour, sans prise, le second remplace le premier, d'où qu'il vienne, et la fréquence du réglage final se compare à celle qui valait **avant ce jour** ; le même carnet sur deux téléphones ne montre jamais deux états (décision de Gaelle du 14 octobre 2026). Tous les 3 jours à 8 h depuis le 3 oct., dose du 6 non donnée : le 7, « Modifier » tous les 2 jours puis retour à tous les 3 jours, la dose du 6 reste en retard (inchangé) ; un téléphone passe à tous les 2 jours le 7, l'autre, non synchronisé, passe l'heure à 9 h en gardant tous les 3 jours : après la synchro, la dose du 6 est en retard. Fréquence réellement changée par rapport à avant ce jour : les échéances sans prise d'avant restent à renseigner (#810) ; le 7, tous les 2 jours dès le 8, dose du 8 donnée d'avance, second « Modifier » identique, puis la prise du 8 supprimée : la dose du 6 reste à renseigner, comme avec un seul « Modifier ». Le 7, tous les 2 jours, dose du 7 donnée, retour à tous les 3 jours à 9 h dès le 9, puis la prise du 7 supprimée : lu comme un seul « Modifier » à fréquence gardée, le 9 remplace la dose du 6, qui n'est ni en retard ni à renseigner (décision de Gaelle du 14 octobre 2026, qui remplace la condition « réglage écrit juste avant » du 12 octobre : « comparer au réglage d'avant ce jour » la contient) ; graine 1500018007 de #810 : les doses de 8 h et 14 h du 5 avril disparaissent, comme avec le geste final fait directement, sans règle sur une fréquence intermédiaire annulée le jour même (décision du 14 octobre 2026). Le même geste sans toucher la date proposée laisse la dose du 6 en retard : une date proposée par l'app n'est pas une date choisie, le réglage dit lequel des deux il porte (#836, décision de Gaelle du 14 octobre 2026) ; le 7, tous les 2 jours, dose du 7 donnée, puis tous les 3 jours à 9 h à la date proposée (le 10), puis la prise du 7 supprimée : la dose du 6 reste en retard. Graine 1500061791 de #810 : tous les jours à 8 h et 20 h, dose du 15 non donnée ; le 16, toutes les 6 semaines, dose du 16 donnée, retour à tous les jours à 20 h à la date proposée (le 17), prise du 16 supprimée : la dose du 15 reste en retard (décision de Gaelle du 14 octobre 2026).

#### R11 — Rien ne disparaît sans geste

Une ligne écrite par la personne (prise, prise en plus, report, décalage) n'est **jamais supprimée par le moteur**. Ce qui n'a plus d'effet (un report revenu à sa date, une ligne plus ancienne de la même journée entre deux appareils, sous le même réglage ou, selon la lecture de R11, R4 et TR-25 par #802 à confirmer par Gaelle, sous un autre réglage de la période, sauf une prise traduite le jour où les heures changent (R4), un report battu par une prise de la même échéance, un décalage d'avant la première échéance d'un réglage qui fait repartir la grille, un report parti d'une journée que la grille repartie d'une date choisie n'a pas, un report plus ancien que la réécriture de son réglage, faite sur un autre appareil, qui a ôté sa journée ou son heure de départ du calendrier, R10 (#882, #883) ; un oubli dont l'échéance a quitté le calendrier, R4 (une prise donnée, elle, garde toujours sa journée, règle unique du 17 octobre 2026) ; un report plus ancien que la réponse « Elles n'étaient pas à donner » dont elle a retiré l'arrivée, #873 ; le décalage d'un report plus récent que la réécriture de son réglage n'est pas sans effet, #885) reste en base et dans l'historique, à sa place, grisé, son texte suivi de « · sans effet » (« Reportée au 19 oct. · sans effet »), avec « Supprimer » pour seul menu (décision de Gaelle du 2026-10-10) ; seule la personne le supprime ; aucune correction de date ne fait d'un oubli une prise donnée (TR-22 et « Marquer comme donnée » restent permis) (décision du 2026-10-12). Le moteur ne lit **que** des lignes, il n'en écrit ni n'en efface jamais à la lecture (décision Q-purge du 2026-10-10). À l'écriture, l'app refuse une deuxième ligne de la même échéance et de la même famille sous le **même réglage** seulement : le jour où les heures changent, une prise d'avance écrite sous l'ancien réglage n'empêche pas « C'est fait » sous le nouveau (R4) ; une ligne d'un autre réglage reçue de la synchro est écartée à la lecture (écart au plan §3.2, confirmé par Gaelle le 14 octobre 2026).

#### R12 — Une seule lecture pour tous les écrans

Tout ce que l'app montre d'un traitement (dose du moment, retard, à renseigner, à venir, historique, rappels à programmer, menus permis, textes de confirmation) vient d'**une** lecture du moteur, la même pour la fiche, l'accueil, la feuille « À faire », les notifications, le Carnet, le PDF et le CSV. Aucun écran ne recalcule une règle (« déjà notée », « prise en plus », « en retard », journées perdues par la date de fin, « période en cours ») : il lit (décision Q-double du 2026-10-10).

#### Gardes des gestes conservées de la v1

Refus, bornes et confirmations qui restent tels quels (leur numéro est gardé pour les tests et les tickets) :

  - **G20** « C'est fait » ne décale jamais la suite sans l'aval de la personne (principe du
    2026-10-06). Quand la prise décalerait la suite (la case de « Fait à une autre date » serait
    proposée : dose en retard ou donnée en avance, N1, N3, G10), « C'est fait » ouvre une
    confirmation : « Dose du vendredi 16 oct., donnée le lundi 19 oct. », la case « Décaler aussi les
    doses suivantes » cochée par défaut et son aide, qui montre les dates, cochée comme décochée, ou la
    dose perdue à cause de la date de fin (V28 bis), puis « Enregistrer » et « Annuler », qui n'écrit
    rien. Restent un tap, sans rien décaler : la dose du jour, une prise sans case, et une prise dont le
    décalage ferait passer un report seul (Q2 a, G19 : le toast le dit). « Annuler » du toast défait
    tout le geste ; quand la prise termine le traitement, le toast le dit (TR-31). Le décalage
    automatique et la règle de la demi-fréquence face à la date de fin disparaissent des gestes de
    l'app : la fiche les a quittés avec #536, la notification les quitte avec #539 et la feuille
    « À faire » avec #543, qui reprennent la même confirmation. Vendredi, 16, 23 et 30 oct., fin le
    30 : dose du 16 donnée le lundi 19, cochée, 26 oct., et l'aide dit « Avec le décalage, la dose du
    30 oct. ne sera plus prévue (date de fin). » ; décochée, 23 et 30 restent. (Décision de Gaelle du
    2026-10-06, qui revient sur celles du 2026-10-03, Q4, et du 2026-10-05, #506.)
  - **G6** Une dose ne s'avance pas d'un intervalle entier ou plus (en mois : jamais à un jour d'où la
    fréquence retombe sur son échéance d'origine), pour garder une seule ligne par échéance.
    Exemples : hebdomadaire, la dose du 6 avr. s'avance au plus tôt au 31 mars ; mensuel, la dose du
    30 avr. s'avance au plus tôt au 1er avr., car le 30 mars comme le 31 mars plus un mois retombent
    sur le 30 avr. (Validée par Gaelle, points validés en bloc du 2026-10-01.)
  - **G7** Une dose ne se déplace pas tant qu'une ligne (prise ou déplacement) existe plus loin dans la
    période ; le moteur en donne la raison à l'écran. Quand c'est un déplacement, le champ
    « Prochaine dose » est grisé, avec l'aide « Une dose plus lointaine est déjà reportée. Supprime ce
    report pour déplacer celle-ci. » (Décidée, spec Q26.)
  - **G8** La date minimale passe aussi après la date réelle de la dernière prise notée.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G9** Une dose n'arrive pas sur le jour d'origine d'un autre déplacement.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G12** Le déplacement gardé est réécrit pour viser la dose que fixe la prise corrigée : sa ligne
    dit alors « prévue le » avec la nouvelle échéance (prise du 5 sept. corrigée au 28 août :
    « Reportée au 10 oct. (prévue le 28 sept.) »).
    (Validée par Gaelle, points validés en bloc du 2026-10-01.)
  - **G13** Quand la suite a changé depuis le déplacement, déplacer de nouveau la dose réécrit la ligne
    avec l'échéance qu'elle remplace désormais (« prévue le » peut changer) ; une ligne ne ramène
    jamais une dose à son propre jour d'origine.
    (Validée par Gaelle, points validés en bloc du 2026-10-01.)
  - **G17** Une journée n'a qu'une ligne de déplacement : la redéplacer réécrit sa ligne, même quand
    une heure y est revenue (prise supprimée) ; deux lignes pour la même journée (synchronisation) :
    la plus récente vaut, l'autre est sans effet.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G19** Un report seul (sans décalage) ne passe jamais la dose suivante (Q2 a). Quand une
    correction de date change le rythme, un report seul qui la suit vise l'échéance du nouveau
    calendrier la plus proche de son ancienne arrivée et garde cette date si elle reste dans les
    bornes de Q2 a ; sinon elle s'en approche, jamais avant aujourd'hui ; si aucune date ne convient,
    la correction est refusée (« Avec ce jour, la dose que tu avais reportée au 30 oct. ne pourrait plus tomber au bon moment. Change d'abord la date de ce report. »). L'aide sous la case
    l'annonce (« La dose que tu avais reportée au 30 oct. reste prévue ce jour-là. ») et le toast le dit (« Prise déplacée au 17 oct. Le
    report suit : dose reportée au 30 oct. »). Hebdomadaire du vendredi, aujourd'hui le 27, dose du
    16 donnée le 19 avec décalage, dose du 26 reportée seule au 30 : prise corrigée au samedi 17,
    « Avancée au 30 oct. (prévue le 31 oct.) », puis 7 nov. ; corrigée au 16, le report retombe sur
    la dose du 30. Une correction refusée dans un seul état de la case n'est permise que dans
    l'autre (jours grisés). « Fait à une autre date » coché suit la même règle que la correction de
    date : le report suit quand une date lui convient, sinon le geste est refusé, avec le même texte
    par les deux chemins (#786, décision du 2026-10-12). Reste refusé : « Supprimer ce
    décalage », grisé aussi quand un report seul qui le suit n'aurait plus son échéance d'origine
    dans le rythme rétabli (« Supprime d'abord le report du 23 oct. » ; vendredi, décalage du 16 au 19,
    dose du 26 avancée seule au 23 : sans le décalage, la dose du 23 et la dose avancée tomberaient
    ensemble ; graine 2157, #506). « C'est fait », la notification et la feuille « À faire » notent la prise
    sans décalage (« La suite ne bouge pas : un report est prévu le 28 oct. »). (Décisions de Gaelle
    du 2026-10-05, #505.)
  - **G21** Quand une prise notée ou corrigée fait repartir la suite plus tôt, l'aide sous la case
    et le toast annoncent les doses passées qui deviennent à renseigner ou en retard, et seulement
    celles-là : une dose déjà en retard avant le geste n'est pas répétée. Vendredi, aujourd'hui le
    27 oct., dose du 16 notée le lundi 19 avec décalage (la dose du 26 est en retard) ; la prise
    corrigée au 12 : « La dose du 19 oct. sera à renseigner. » (#528 ; textes à valider par Gaelle.)

## 5. États et transitions

| État | Ce que montre la fiche | Rappels | Vers |
| --- | --- | --- | --- |
| **À venir** (première prise future) | « Prochaine dose · demain » | oui | du jour (le jour venu) |
| **Du jour** | « Dose du jour » + « C'est fait » | oui | à venir (prise notée) ; sinon en retard le lendemain, puis non renseigné dès l'échéance suivante (pour un quotidien, dès le lendemain) |
| **En retard** (rythmes où la dose du moment est passée) | « en retard depuis le … » | relance J+3 | à venir (prise notée) ; sinon du jour à l'échéance suivante, et la dose en retard devient non renseignée (TR-13) |
| **Avec doses à renseigner** (s'ajoute aux états ci-dessus) | bandeau | non | sans bandeau (tout renseigné) |
| **Fin atteinte ou arrêté, à renseigner** | fin du traitement (ou « Arrêté le … ») + bandeau ; « À renseigner » dans « À faire » | non | terminé ou arrêté (tout renseigné) |
| **Terminé** | « Terminé le … » dans « Traitements terminés » | non | nouvelle période (« Reprendre ») |
| **Arrêté** | « Arrêté le … » ; bandeau s'il reste à renseigner | non | nouvelle période (« Reprendre ») |
| **Supprimé** | rien (« Annuler » quelques secondes) | non | — |

## 6. Notifications (détail dans la spec Rappels)

- Une notification par échéance : le jour même, à l'heure du traitement (moment choisi) ou à l'heure
  choisie le jour même (9 h par défaut) ; « 3 jours avant » (réglage « Me prévenir avant l'échéance »)
  et relance 3 jours après, seulement quand elles ne tombent pas sur l'échéance voisine ; à plusieurs
  heures, une seule prévenance et une seule relance par jour d'échéance (RA-5). (P3, P6, #447)
- Aucune notification pour une dose non renseignée, après la date de fin, pour un traitement arrêté ou
  un animal qu'on ne suit plus.
- Texte à heure absolue (« Panacur de Pixel à 20 h »), avec la posologie si elle existe (« · ½
  comprimé »). (P3 R5 ; P7 Q1)

## 7. Données (besoins, pas modèle)

- Traitement : animal (figé), nom, type, suppression logique. **Le calendrier est celui du traitement** (R1).
- Réglage (`treatment_period`) : date de début, première échéance, **origine de grille** (un seul sens, R2, R3), date de fin facultative, fréquence, heures, posologie (quantité, unité), moment du rappel, date d'arrêt ; ordonné par sa date de début.
- Ligne (`treatment_dose`) : traitement, échéance visée (jour, heure), date réelle (prise, prise en plus), état (donnée, oubliée, prise en plus, reportée, décalage), **date cible** (arrivée d'un report, ancrage d'un décalage, vide pour une prise) ; le réglage qui a produit la prise, à titre d'information (posologie affichée). Plus de « prochaine échéance fixée » sur une prise : le moteur ne la lisait pas.
- Rien n'est supprimé par le moteur (R11) ; une ligne sans effet est marquée à l'affichage, pas en base.
- Synchronisé (Plus), exporté (JSON complet v5, CSV, PDF) ; l'import relit chaque traitement par le moteur avant d'écrire (Q40). Schéma v12 : [modèle de données v2](../../technical/modele-de-donnees-v2.md), [plan du moteur v2](../../technical/moteur-doses-v2-plan.md) §3.
- Plus tard, une posologie différente selon l'heure (#365) demandera une posologie par heure : le
  schéma actuel n'en porte qu'une par réglage (décision du 2026-09-28 nuancée par la revue du modèle).

## 8. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** un traitement quotidien dont la dernière prise est le 2 sept., **quand** Sophie
   ouvre la fiche le 28 sept., **alors** la carte affiche « Dose du jour · 28 sept. » et le bandeau
   « 25 doses non renseignées · du 3 au 27 sept. ».
2. **Étant donné** ce même traitement, **quand** Sophie touche « C'est fait », **alors** la prise du
   28 est notée, la carte affiche « Prochaine dose · demain, 29 sept. », et le bandeau reste.
3. **Étant donné** un mensuel donné le 2 août puis le 28 sept., **quand** la fiche s'ouvre, **alors**
   aucune dose non renseignée n'apparaît et la prochaine dose est le 28 oct.
4. **Étant donné** « Choisir les jours » sur 25 jours, **quand** Sophie décoche 5 jours et valide,
   **alors** 20 prises données et 5 oubliées sont écrites en une fois, le bandeau disparaît, et
   « Annuler » les retire toutes.
5. **Étant donné** une fréquence changée entre deux prises, **quand** Sophie renseigne l'écart,
   **alors** aucun nouvel écart n'apparaît et la dose du moment ne bouge pas.
6. **Étant donné** une première prise demain, **quand** Sophie enregistre, **alors** rien n'est noté
   comme donné et la fiche affiche « Prochaine dose · demain ».
7. **Étant donné** une date de fin au 10 oct., **quand** la prise du 10 est notée et que rien ne reste
   à renseigner, **alors** le traitement passe dans « Traitements terminés », avec le toast « Dernière
   dose de Panacur notée, à retrouver dans Traitements terminés. » et « Annuler ».
8. **Étant donné** une date de fin passée et deux doses non renseignées, **quand** Sophie ouvre
   l'accueil, **alors** le traitement est dans « À faire » avec « À renseigner », hors du compteur de
   retards.
9. **Étant donné** des prises notées depuis le début de la période, **quand** Sophie change la
   fréquence, **alors** une nouvelle période commence aujourd'hui et les prises passées gardent leur
   fréquence ; **sans** prise notée, les réglages sont simplement remplacés.
10. **Étant donné** un traitement arrêté, **quand** Sophie touche « Reprendre », **alors** le formulaire
    est prérempli, et la période arrêtée reste intacte dans l'historique.
11. **Étant donné** une notification de la veille, **quand** Sophie touche « C'est fait », **alors**
    l'app demande « Donnée quand ? » et ne note rien d'office.
12. **Étant donné** deux lignes pour une même échéance (deux appareils), **quand** la fiche s'affiche,
    **alors** une seule prise apparaît, avec l'état de la ligne la plus récemment modifiée ; deux prises
    d'un même jour à deux heures différentes restent deux prises.

## 9. Indicateurs

- Part des traitements dont les doses non renseignées sont résolues dans la semaine (le bandeau sert).
- Part des prises notées par « C'est fait » (notification ou fiche) contre « Toutes données » (usage
  réel du rattrapage).
- Pendant le test : les testeurs comprennent-ils « Dose du jour » et le bandeau sans explication ?

## 10. Décisions de la spec

- 2026-09-29 — **Q1 : plusieurs heures par jour pour toutes les fréquences** (TR-5). Raison : une seule
  règle, pas de champ qui apparaît selon la fréquence ; « un jour sur deux, matin et soir » existe.
  Écartée : seulement « tous les jours » (exception à expliquer).
- 2026-09-29 — **Q2 : reporter la prochaine dose remplace l'échéance d'origine** (TR-9), qui ne devient
  pas une dose non renseignée. Raison : reporter, c'est déplacer, pas manquer ; le carnet dit vrai.
  Écartée : l'échéance d'origine non renseignée (bandeau pour un choix délibéré).
- 2026-09-29 — **Q3 : une échéance du jour reste « du jour » jusqu'à minuit**, heure passée comprise
  (TR-11). Raison : des heures de décalage sont normales dans une journée ; un rouge chaque après-midi
  serait du bruit et culpabiliserait (principes 5 et 6) ; le rappel a déjà sonné. Écartée : « en
  retard » dès l'heure passée (compteur allumé tous les jours pour les traitements à heure fixe).
- 2026-09-29 — **Q4 : plus de règle de « seule prise »** (TR-26). Raison : un traitement peut exister
  sans prise (première prise future, première dose oubliée) ; chaque geste fait une seule chose ;
  effacer une prise ne fait pas disparaître tout le traitement (principe 3). Écartée : garder les deux
  restrictions de l'ancien modèle. Remplace le point 4 des réponses à la relecture du 2026-09-28.

- 2026-09-29 — **Q5 : « Choisir les jours » avec plusieurs heures par jour, un calendrier par heure en
  onglets** (TR-16), chacun tout coché. Raison : le même calendrier répété, et le cas courant (des soirs
  oubliés) se règle en quelques taps. Écartées : une case par jour puis des corrections au menu ⋮ (une
  quinzaine de gestes pour cinq soirs) ; une case coupée en deux (trop petite, peu lisible).
  (Relecture de cohérence des specs, question B.)

- 2026-09-29 — **Q6 : chaque prise vise une échéance précise, jour et heure** (TR-10, TR-13, TR-20).
  Luna à 8 h et 20 h, 21 h, rien de noté : la notification de 8 h note 8 h ; « À faire » a une ligne par
  heure ; la fiche montre chaque heure du jour encore sans prise, avec son « C'est fait » ; « Fait à une
  autre date » demande l'heure s'il y en a plusieurs. Une heure non notée reste « du jour » jusqu'à
  minuit, puis devient non renseignée. Raison : le carnet dit quelle dose a été donnée, sans deviner
  (principe 1), et le modèle stocke déjà le jour et l'heure de l'échéance couverte. Écartées : la prise
  couvre la dernière heure passée (l'app devine, et se trompe d'heure quand Sophie note tard la dose du
  matin) ; demander l'heure à chaque prise (un tap de plus, principe 4). (Plan de livraison, QP1.)

- 2026-09-29 — **Q7 : la première dose d'une nouvelle période n'est jamais avant aujourd'hui** (TR-7,
  TR-28). Milo, hebdomadaire, dernière prise le 8 sept., passé à « tous les 15 jours » le 29 : le calcul
  donne le 23, « Prochaine dose » propose le 29, modifiable ; les 15 et 22 sept. restent à renseigner.
  Raison : la nouvelle période commence aujourd'hui, et le 23 relevait encore de l'ancien rythme.
  Écartées : garder la date calculée (traitement né « en retard » à tort, principe 6) ; « Prochaine
  dose » vide et obligatoire à chaque changement (un geste de plus quand le calcul est juste). (Plan de
  livraison, QP2.)

- 2026-09-29 — **Q8 : noter tard une dose non renseignée ne déplace pas la suite** (TR-7, TR-18).
  Panacur quotidien à 20 h, dose du 6 oct. non notée, notée « Aujourd'hui » le 7 à 8 h 15 : la dose du
  7 à 20 h reste prévue. La suite ne repart de la date réelle que si la prise couvre la dose du moment
  (le Milbemax prévu le 22 et donné le 23 du parcours 5). Raison : sinon, noter la veille effacerait la
  dose du jour et son rappel (principe 3). Écartée : TR-7 à la lettre. (Relecture du lot A, QA-7.)
  À rythme changé, une journée dont une prise a décalé la suite compte entière à la date réelle de
  cette prise (G24, 2026-10-09).
- 2026-09-29 — **Points de cohérence de la relecture du lot A, validés en bloc** : pas de « A fixé la
  dose du … » à plusieurs heures (TR-35 ; remplacé par Q13 du 2026-09-30) ; « Donnée quand ? » s'ouvre
  sur l'accueil (RA-18) ; dialogues avec « Annuler » (décision du 2026-09-25) ; arrêté avec doses à
  renseigner reste en cours (TR-31) ; « Reprendre » sans nom ni type (TR-32) ; couleurs du design
  system ; glossaire anglais complété avant les versions anglaises ; petits ajouts de la maquette
  acceptés (raccourcis ¼ ½ ¾, aides, sous-titres d'onglet, toast « Panacur arrêté · 25 prises notées »,
  remplacé par Q14 du 2026-09-30). (`technical/relecture-maquettes-lot-A.md`, QA-4, 5, 8, 10 à 14, 16,
  17.)

- 2026-09-29 — **Q9 : l'arrêt retire la dose du jour non notée, et le dialogue le signale** (TR-30).
  Raison : on arrête le plus souvent avant de donner (chez le vétérinaire) ; la phrase évite qu'une dose
  donnée et pas notée disparaisse sans bruit (principe 1). Écartée : la garder « à renseigner » (bandeau
  pour une dose qui n'était plus à donner ; « Oubliée » serait faux). (Relecture du lot A, QA-9.)

- 2026-09-29 — **Q10 : l'encart des doses passées est en fin de formulaire**, juste avant le bouton
  (TR-3). Raison : son compte dépend de la fréquence, des heures et de la date de fin ; placé sous
  « Première prise le », une réponse deviendrait fausse dès qu'on ajoute une heure. Écartée : sous
  « Première prise le » (maquette), avec une réponse à effacer à chaque changement plus bas.
  (Relecture du lot A, QA-1.)

- 2026-09-29 — **Q11 : « Supprimer ce traitement » reste dans le menu ⋮** (TR-33), le crayon
  « Modifier » dans la barre, « Arrêter » en bas, comme aujourd'hui. Raison : supprimer efface tout
  l'historique et ne sert qu'aux erreurs de saisie ; un lien rouge sous « Arrêter » inviterait à
  confondre les deux (parcours 9). Écartée : lien rouge en bas de la fiche (maquette). (Relecture du
  lot A, QA-6.)

- 2026-09-29 — **Q12 : textes adressés à la personne en tournures neutres**, jamais d'accord au
  féminin ni au masculin (« Pour un rappel à l'heure pile », pas « Pour être prévenue »). Raison : on ne
  connaît pas la personne qui tient le carnet ; une tournure neutre se lit bien pour tout le monde ; même
  choix que « J'ai déjà MémoPatte Plus ». Écartées : le féminin partout ; le masculin générique
  (l'existant, « être prévenu »). S'applique à toute l'app : à ajouter au glossaire (ton) dans la PR de
  documentation, et aux textes existants. (Relecture du lot A, QA-15.)

- 2026-09-30 — **Q13 : plus de ligne « A fixé la dose du … » dans l'historique d'un traitement**
  (TR-35) ; une prise notée un autre jour que son échéance garde l'échéance en titre, avec « Donnée le
  … » dessous. Raison (Gaelle) : « fixer la dose » ne veut rien dire ; la carte donne déjà la prochaine
  dose, les reports ont leur ligne, le rythme est en tête de chaque période. Écartée : une ligne
  « Prochaine dose prévue le … » sous la dernière prise (répète la carte). Remplace QA-5 du lot A.
  (Vérification du lot A révisé, U1.)
- 2026-09-30 — **Lot A révisé, points validés en bloc** : encart rempli « 25 données · Modifier »,
  remis à zéro si la première prise, la fréquence, les heures ou la date de fin changent ; encart à une
  dose ; aide sous « Prochaine dose » (« Calculée d'après la dernière prise : … Modifiable. ») ;
  « Aucune prise dans cette période pour l'instant » ; ligne de report avec l'échéance remplacée ; toast
  avec l'heure ; posologie dans le relais ; dialogues de confirmation existants ; boutons du bandeau à
  égalité. (`technical/relecture-maquettes-lot-A-rev1.md`, N1 à N11.)

- 2026-09-30 — **Q14 : toasts de fin et d'arrêt** (TR-31) : « Panacur arrêté, à retrouver dans
  Traitements terminés. » et « Dernière dose de Panacur notée, à retrouver dans Traitements terminés. »,
  à la place de « … Il est dans Traitements terminés. » (« c'est moche », Gaelle), aussi après « Toutes
  données » dans le dialogue d'arrêt. Raison : une phrase dit ce qui vient de se passer et où retrouver
  le traitement. Écartée : « Panacur arrêté · 25 prises notées » (ne dit pas où il est). Texte actuel de
  l'app à changer (`treatments…stopped`). (Vérification du lot A révisé, U2.)

- 2026-09-30 — **Lot A, révision 2 validée** (`technical/relecture-maquettes-lot-A-rev2.md`) ; points en
  bloc : badges de l'accueil aux couleurs existantes ; « 1 ½ » insécable ; l'heure sur une ligne
  d'historique seulement quand la période a plusieurs heures (TR-35) ; TR-23 bis reformulée ; anglais
  « To log », « not logged » (glossaire) ; TalkBack « Ouvre les actions » sur une ligne « À renseigner »
  (AC-9) ; gris #4A443E → #68625C. Restes laissés à l'implémentation, sans nouvelle révision.

- 2026-09-30 — **Q15 : dans le Carnet, un traitement à renseigner garde sa ligne unique** (TR-36) :
  badge habituel et « 3 doses non renseignées » dessous, sans rouge ; badge neutre « À renseigner » s'il
  est fini ou arrêté. Raison : visible en consultant le carnet de l'animal, et pas de choix entre deux
  heures puisqu'il n'y a qu'une ligne par traitement. Écartées : un groupe « À renseigner » dans le
  Carnet (le traitement deux fois sur le même écran) ; rien sur la ligne (visible seulement dans la
  fiche). (Relecture de cohérence du 2026-09-30, C1.)

- 2026-09-30 — **Q16 : quand renseigner termine un traitement**, toast « Panacur : 4 prises et 1 oubli
  notés, à retrouver dans Traitements terminés. » · Annuler (TR-31). Raison : même forme que Q14 ; le
  traitement change de liste, le message dit où le retrouver. Écartée : « 4 prises et 1 oubli notés »
  seul (parcours 5). (Relecture de cohérence du 2026-09-30, C2 ; planche A · V4.)
- 2026-09-30 — **Relecture de cohérence, points validés en bloc** : une dose en retard compte parmi les
  doses à renseigner du dialogue d'arrêt (TR-30) ; menu ⋮ d'une ligne « Reportée » (TR-24) ; « C'est
  fait » sur une relance à plusieurs heures : « Donnée quand ? » puis « À quelle heure ? » (TR-13,
  RA-18) ; après « Suivre de nouveau », les doses non renseignées reviennent (TR-37).
  (`technical/relecture-coherence-2026-09-30-1.md` à `-3.md`.)

- 2026-10-01 — **Q17 : « Prochaine dose » se déplace plus tôt ou plus tard** (TR-9), à toute date à
  partir d'aujourd'hui, avec la ligne « Reportée au 14 oct. (prévue le 10 oct.) » ou « Avancée au
  8 oct. (prévue le 10 oct.) ». Raison (Gaelle) : si les deux dates sont à venir, rien ne justifie de
  traiter « plus tôt » autrement que « plus tard ». Écartée : seulement reporter, et noter une dose
  donnée en avance par « C'est fait ». (Revue du moteur d'échéances, #453.)
- 2026-10-01 — **Q18 : une seule ligne par déplacement** (TR-9). « Prochaine dose » sur une dose déjà
  déplacée réécrit la ligne du déplacement (même échéance d'origine, nouvelle date), comme « Changer la
  date » d'une ligne « Reportée » (TR-24) ; l'historique montre « Reportée au 18 sept. (prévue le
  15 sept.) », ou « Avancée … » d'après l'échéance d'origine, jamais deux lignes. Raison : l'historique
  dit en une ligne ce qui s'est passé ; aucune ligne intermédiaire ne garde l'échéance d'une dose
  encore à donner, et la fusion entre deux appareils reste juste (TR-25). Écartée : une ligne par
  geste, chaînée à la précédente (une exception dans chaque calcul, des échéances en double).
  (Re-revue du moteur d'échéances, #453, N1.)
- 2026-10-01 — **Q19 (remplacée le même jour par Q24) : un réglage changé après une prise du jour
  laisse les heures restantes du jour à l'ancien réglage** (TR-28 ; condition précisée par Q22). Luna à 8 h et 20 h, prise de 8 h notée le
  28, heures passées à 9 h et
  21 h le 28 : la dose de 20 h du 28 reste à donner, puis 9 h et 21 h dès le 29. Raison : la dose
  prévue ce soir reste à donner comme prévu, et aucune dose déjà passée n'apparaît avec le nouveau
  réglage. Écartée : la nouvelle période commence le jour même (une dose de 9 h déjà passée
  apparaîtrait). (Revue du moteur d'échéances, #453, I2.)
- 2026-10-01 — **Q20 : pas de déplacement après la date de fin** (TR-9). « Prochaine dose » ne dépasse
  pas la date de fin de la période ; pour aller plus loin, on change « Date de fin » dans le même
  formulaire (TR-6). Raison : la date de fin reste la vraie fin du traitement. Écartée : accepter une
  dose après la date de fin (la date de fin ne serait plus la vraie fin). (Re-revue du moteur
  d'échéances, #453, N5.)
- 2026-10-01 — **Q21 : à plusieurs heures, « Prochaine dose » déplace la journée** (TR-9). Toutes les
  heures du jour d'origine encore sans prise partent au nouveau jour, qui reprend avec toutes ses
  heures, puis normalement ; une prise déjà notée ce jour-là reste notée (8 h notée le 28 : seule
  20 h part) ; même règle pour avancer ; une seule ligne d'historique par jour déplacé. Raison :
  « Prochaine dose » est une date, sans heure ; déplacer seulement la première heure laisserait une
  dose à donner le jour même après avoir déplacé la prochaine dose. Écartée : ne déplacer que la
  première heure. (Implémentation de #453, cas ouvert 6.) Sans décalage, le nouveau jour ne reçoit
  que les heures parties (G25, 2026-10-09, #720) ; avec décalage aussi (décision de Gaelle du
  2026-10-09, #735) : le décalage emporte la dose reportée et toutes celles d'après, jamais une dose
  déjà donnée de la journée (8 h notée le 28, 20 h déplacée au 30 : le 30 à 20 h seule, puis la
  suite repart du 30). Le nouveau jour « reprend avec toutes ses heures » ne vaut plus que quand
  rien n'est noté le jour d'origine.
- 2026-10-01 — **Q22 (remplacée le même jour par Q24) : tant que rien n'est noté aujourd'hui, le
  nouveau réglage vaut tout de suite** (TR-28, précise Q19) : la nouvelle période commence aujourd'hui ; dès qu'une prise du jour est notée,
  les heures restantes gardent l'ancien réglage et la nouvelle période commence le lendemain. Raison :
  passer de 8 h à 9 h à 7 h du matin ne doit pas laisser sonner le rappel de 8 h ; une heure déjà
  passée s'affiche comme dose du jour, jamais en retard le jour même (TR-11). Écartée : toujours le
  lendemain. (Re-revue 2 du moteur d'échéances, #453, N12.)
- 2026-10-01 — **Moteur d'échéances, points validés en bloc** : (le point « à plusieurs heures, seule
  la dernière heure tombée est en retard » est remplacé par Q23) ; la date minimale de « Prochaine dose » est le lendemain de l'échéance qui
  précède, en pratique de la dernière prise notée, jamais avant aujourd'hui (TR-9) ; TR-24 bis ne vaut
  que pour une prise qui a fixé la suite : changer la date d'une prise notée pour une dose non
  renseignée ne touche jamais un déplacement (TR-24 bis, Q8). (Revue et re-revue du moteur
  d'échéances, #453.)
- 2026-10-01 — **Q23 : à plusieurs heures par jour, on raisonne par journée** (TR-10, TR-13). Les doses
  de la dernière journée prévue encore sans prise restent ensemble la dose du moment : du jour le jour
  même, toutes en retard ensuite, chacune avec son geste ; elles ne deviennent non renseignées
  (bandeau) que lorsqu'une journée d'échéance plus récente est arrivée. Métacam tous les 2 jours à 8 h
  et 20 h, rien noté le 27 ; le 28 : 8 h et 20 h du 27 en retard, rien au bandeau ; « Prochaine dose »
  déplacée au 29 emporte les deux (Q21). Pour un traitement quotidien rien ne change : hier non noté,
  les deux doses d'hier sont au bandeau, la journée d'aujourd'hui étant arrivée. Écartée : la règle
  heure par heure (une même journée coupée en deux statuts). (Re-revue 2 du moteur d'échéances, #453,
  n2 ; remplace le point validé en bloc du même jour.)
- 2026-10-01 — **Q24 : un réglage changé en cours de journée vaut tout de suite, y compris pour le
  reste de la journée** (TR-28, TR-7 ; remplace Q19 et Q22). La nouvelle période commence aujourd'hui,
  toujours. Les prises déjà notées aujourd'hui comptent pour les premières heures du nouveau réglage ;
  les heures suivantes restent à donner. Ancien réglage 8 h et 20 h : 8 h notée, nouveau 9 h et 21 h,
  reste 21 h ; 8 h notée, nouveau 8 h, 14 h et 20 h, restent 14 h et 20 h ; 8 h notée, nouveau 9 h
  seule, rien ne reste aujourd'hui ; rien noté, nouveau 9 h et 21 h, 9 h et 21 h. Une heure déjà passée
  reste « dose du jour », jamais en retard le jour même (TR-11). Il n'y a plus de dose restante de
  l'ancien réglage le jour du changement ; ses échéances des jours d'avant restent à renseigner
  (TR-28). Écartées : heures restantes à l'ancien réglage (Q19) ; nouveau réglage seulement le
  lendemain. (Re-revue 2 du moteur d'échéances, #453.) Étendue le 2026-10-09 à une journée à venir
  entamée en avance : ses prises comptent de même, et le nouveau réglage part d'elle (G24, #711). Le
  même jour, une journée entière reportée seule garde son jour d'arrivée quand les heures changent,
  et la suite le calendrier : 4, 5, 7 au lieu de 4, 6, 8 (G23, #737).
- 2026-10-01 — **Q25 : un déplacement dont la dose d'arrivée est notée ne se supprime plus et ne
  change plus de date** (TR-24). Donnée ou oubliée, la dose d'arrivée fait entrer la ligne dans
  l'historique ; pour corriger, on passe par la prise elle-même (changer sa date, la supprimer).
  Raison : supprimer le report laisserait une prise sans échéance et ferait réapparaître à renseigner
  une dose déjà donnée (dose du 15 reportée au 20 et donnée le 20 : le 15 passerait à renseigner).
  Écartée : supprimer le report supprime aussi la prise. La règle l'emporte sur TR-24 bis : corriger
  la date de la prise d'avant ne retire jamais une ligne verrouillée, même dépassée (prise du 8
  corrigée au 21 : la ligne « Reportée au 20 sept. (prévue le 15 sept.) » reste, prochaine dose le
  27). (Re-revues 4 et 5 du moteur d'échéances, #453, N17 et N18.)
- 2026-10-01 — **Q26 : une dose ne se déplace pas tant qu'une dose plus lointaine est déjà reportée**
  (TR-9, G7). Le champ « Prochaine dose » du formulaire est alors grisé, avec l'aide « Une dose plus
  lointaine est déjà reportée. Supprime ce report pour déplacer celle-ci. » Le moteur distingue ce
  cas des autres refus (dose d'une période précédente, dose plus lointaine déjà notée, plus aucune
  date avant la date de fin, dose d'arrivée déjà notée). (Re-revue 3 du moteur d'échéances, #453,
  garde 7.)
- 2026-10-01 — **Gardes du moteur d'échéances, points validés en bloc** : G15, « même rythme » —
  changer un réglage sans changer la fréquence garde la dose du jour encore sans prise (TR-28) ; G14
  — une prise supprimée fait réapparaître son échéance, à donner ou à renseigner, même si la dose
  suivante avait été déplacée (TR-9, TR-26) ; G12 et G13 — la ligne « Reportée / Avancée » dit
  « prévue le » avec l'échéance réellement remplacée dans le calendrier actuel, et suit donc la
  correction d'une prise (TR-9, TR-24 bis) ; G6 — date minimale de « Prochaine dose », avec
  l'exemple en mois (dose précédente le 31 mars : pas avant le 1er avril) (TR-9). Les autres gardes
  (G1 à G5, G8 à G11, G16, G17) sont des conséquences techniques des règles décidées, consignées au
  journal des décisions autonomes. (Re-revues 3 et 4 du moteur d'échéances, #453.)

- 2026-10-02 — **Q27 : corriger « Prochaine dose » d'un traitement sans prise l'annonce** (TR-9). Sans
  prise dans la période, la première échéance est réécrite et les échéances passées d'avant cette date
  ne sont plus à renseigner ; le champ le dit avant l'enregistrement : « Les 12 doses prévues avant
  cette date ne seront plus à renseigner. » Raison : sans prise notée, c'est une erreur de saisie qu'on
  corrige, mais rien ne doit disparaître sans être dit (principe 1). Écartée : garder ces doses à
  renseigner (une ligne de déplacement sans prise, que le moteur ne tient pas). (Revue de #460.)
- 2026-10-02 — **Q28 : une dose en retard garde sa date dans « Modifier »** (TR-7, TR-9). Le champ
  « Prochaine dose » montre la date de la dose en retard, avec l'aide « Dose en retard depuis le
  27 sept. » ; ne rien toucher n'écrit rien ; changée, la date est à partir d'aujourd'hui. Raison :
  proposer aujourd'hui créerait un report à chaque enregistrement sans y toucher. Écartée : proposer
  aujourd'hui et n'écrire que si le champ a été touché. (Revue de #460.)
- 2026-10-02 — **Q29 : l'aide de « Prochaine dose » dit quand la date calculée est passée** (TR-7,
  planche A · V1 quater) : « Calculée d'après la dernière prise : le 23 sept., déjà passé ; aujourd'hui
  est proposé. Modifiable. » Écartée : masquer l'aide dans ce cas. (Revue de #460.)
- 2026-10-02 — **Q30 : pas de date de fin avant l'arrivée d'un report** (TR-6, TR-9). Une date de fin
  ramenée avant la date d'une dose reportée ou avancée est refusée : « La prochaine dose est reportée
  au 8 oct. » Raison : sinon le traitement passe « terminé » avec une dose encore prévue. Écartée :
  accepter et supprimer le report. (Revue de #460.)
- 2026-10-02 — **Q31 : un traitement fini ou arrêté ne se modifie que par son nom et son type**
  (TR-27, TR-28, TR-32) ; pour le reste, « Reprendre ». La reprise est possible dès le jour de l'arrêt.
  Raison : corriger une période close réécrirait le passé ; une seule porte pour rouvrir un traitement.
  Écartée : ouvrir une période depuis « Modifier » pour un traitement fini par sa date de fin. (Revue
  de #460.)
- 2026-10-02 — **Q32 : d'ici les rappels par heure (lot 4), « C'est fait » d'une notification ouvre la
  feuille du soin quand une prise de la journée est déjà notée** (TR-20), au lieu de noter l'heure
  suivante. Raison : la notification du matin, restée dans le volet après la prise de 8 h, noterait la
  dose de 20 h pas encore donnée. Écartée : noter l'heure suivante avec un toast « Annuler ». (Re-revue
  de #461.)
- 2026-10-02 — **Q33 : depuis « À faire » et une notification, un second « Fait aujourd'hui » le même
  jour répond « déjà notée aujourd'hui »** (TR-13, TR-21) quand il ne reste aucune dose du jour ni en
  retard ; noter une dose en avance reste possible depuis la fiche. Raison : un second tap y est presque
  toujours une erreur. Écartée : la prise en avance partout. (Re-revue de #461.)
- 2026-10-02 — **Lot 3, points validés en bloc** : menu ⋮ déroulant d'une prise et calendrier dans la
  feuille de « Fait à une autre date », comme le reste de l'app, à la place des feuilles des planches
  A · V3 bis et V3 ter bis ; 3 lignes d'historique par période avant « Voir… » ; un groupe d'oubliées
  qui se déplie ; formulaire aux patrons des formulaires existants (dates natives, « Optionnel ») ;
  sélecteur de type compact à trois options ; carte d'une dose en retard sans titre ; « Fin du
  traitement · Terminé le 10 oct. » quand la date de fin est atteinte ; « Ce traitement n'a plus de
  dose à noter. » ; textes du champ « Prochaine dose » grisé (« Une dose plus lointaine est déjà
  notée. », « Plus aucune date possible avant la date de fin. Change la date de fin pour déplacer
  cette dose. », « Cette dose a déjà été déplacée, et sa nouvelle date est notée. ») ; « Cette heure
  est déjà dans la liste. » ; anglais « until Oct 10 », à relire avec #353. Reportés : « 1er » pour le
  premier du mois (#481), un report resté sans effet dans une période fermée (#482), un traitement
  sans prise donnée dans le PDF (#483).
- 2026-10-02 — **Q36 : changer le rythme le jour même ne fait pas disparaître la dose du jour encore
  sans prise** (TR-28, TR-7 ; étend G15). Quotidien, dose du 6 notée le 7 au matin, passage à « tous
  les 2 jours » le 7 : la nouvelle période commence par la dose du 7, que la fréquence change ou non. À
  plusieurs heures, Q24 reste la règle. Raison : la dose du 7 n'était plus ni à donner, ni à
  renseigner, ni à venir. Écartée : la dernière prise plus la nouvelle fréquence même ce jour-là
  (première dose le 8). (Revue du moteur d'échéances du 2026-10-02, M11.)
- 2026-10-02 — **Q37 : sans changement de fréquence ni d'heures, la prochaine dose reste celle qui
  était prévue** (TR-7, TR-28). Mensuel démarré le 31 janv., doses du 31 janv. et du 28 févr. données ;
  posologie changée le 1er mars : la première dose de la nouvelle période est le 31 mars, pas le
  28 mars. C'est la dose du moment si elle est due ou en retard (jamais avant aujourd'hui), sinon la
  prochaine dose, report en vigueur compris. Raison : changer la posologie ne doit pas avancer la dose
  de trois jours sans le dire. Écartée : la dernière prise plus la fréquence (28 févr. + 1 mois). À
  plusieurs heures, la règle ne vaut que si aucune heure de la journée de la dose du moment n'est
  notée ; sinon, la dernière prise plus la fréquence ; une journée à venir entamée en avance reste
  la prochaine (G22, #656) ; l'arrivée d'un report seul garde sa date, et la suite son rythme (G23,
  #692). Limite : quand la dose reprise est un jour borné
  (28 févr. d'une suite du 31), la nouvelle période repart de ce jour (28 mars, 28 avr.…) ; la lever
  demande un jour de référence porté par la période (#488).
  (Revue du moteur d'échéances du 2026-10-02, M3.)
- 2026-10-02 — **Q38 : changer la fréquence ou les heures d'une période sans prise qui a déjà des
  échéances tombées pose la question à l'enregistrement** (TR-28, exception au « sans question » ;
  TR-9). Tous les 2 jours depuis le 3 oct., aucune prise notée, fréquence passée à 3 jours le 8 : une
  feuille annonce « 3 doses étaient prévues avant aujourd'hui », « Les 3, 5 et 7 oct., au rythme
  « tous les 2 jours ». » (une plage au-delà de trois dates). « Elles restent à renseigner » ouvre
  une nouvelle période à partir d'aujourd'hui : la période en cours n'est pas réécrite, ses
  échéances tombées restent à renseigner, dose en retard comprise. « Elles n'étaient pas à donner »
  corrige la période : réglages remplacés, première échéance recalculée, les échéances tombées
  sortent du carnet. Chaque choix annonce sa prochaine dose dans son sous-texte (« Le nouveau rythme
  commence aujourd'hui. Prochaine dose le 15 oct. », « L'ancien réglage était une erreur. Prochaine
  dose le 4 oct. ») : c'est la date que ce choix écrit, celle saisie dans « Prochaine dose » quand
  elle vaut pour ce chemin, sinon celle qu'il calcule ; aucune date n'est écrite sans avoir été vue.
  « Annuler » revient au formulaire, rien n'est écrit. Les échéances tombées sont
  les doses non renseignées de la période en cours et sa dose du moment en retard. Aucune question
  pour le nom, le type, la posologie ou la date de fin seuls, ni sans échéance tombée, ni quand une
  prise est notée dans la période (TR-28). Raison : rien ne disparaît ni n'apparaît dans le carnet
  sans que la personne l'ait choisi. Écartées : corriger en annonçant seulement ; ouvrir toujours une
  période. (Relecture d'ensemble du 2026-10-02, formulaire #460.)
- 2026-10-02 — **Q39 : après cette question, sur un traitement jamais noté, aujourd'hui est
  proposé** (TR-7, Q38). Sans aucune prise dans tout le traitement, il n'y a pas de « dernière
  prise » d'où calculer : dans les deux choix, « Prochaine dose » propose aujourd'hui, avec l'aide
  « Aujourd'hui est proposé. Modifiable. ». Raison : le champ dit d'où vient sa date. Écartée : une
  date sans aide. (Décision déléguée par Gaelle, formulaire #460.)
- 2026-10-02 — **Q40 : le formulaire refuse une saisie que le moteur ne saura pas relire** (TR-1,
  TR-28, TR-32). À la création, à la modification et à la reprise, le plan est relu par le moteur
  d'échéances avant toute écriture ; une première prise trop ancienne pour le rythme (1er janv. 1950,
  tous les jours, deux heures par jour) est refusée sous « Première prise le » : « Cette date est trop
  ancienne pour ce rythme. » ; rien n'est écrit. Une fiche déjà illisible (import, synchronisation)
  le dit : « Ce traitement contient une donnée illisible. Tu peux le supprimer, ou importer un export
  antérieur. ». Raison : un traitement que l'app ne sait plus afficher est perdu pour la personne.
  Écartée : accepter la saisie et laisser la fiche en échec. (Relecture d'ensemble du 2026-10-02,
  D5 et U7.)
- 2026-10-02 — **Q41 : depuis la feuille « À faire » et une notification, un oubli ne redevient
  jamais « donné »** (TR-19, TR-20, TR-22). Une dose notée oubliée se corrige par la fiche du
  traitement, pas par ces deux gestes. La feuille demande l'heure avant de noter quand le traitement
  en a plusieurs. Une notification ne note que la dose de son jour d'échéance ; sinon, la feuille
  s'ouvre, ou la fiche du traitement quand il n'est plus dans « À faire » : elle ne reste jamais sans
  réponse. Un autre jour choisi dans « Fait à une autre date » garde TR-22. Raison : ces gestes rapides ne doivent pas réécrire ce que le carnet dit déjà. Écartée :
  laisser « Fait aujourd'hui » repasser un oubli en « donné » depuis la feuille. (Relecture
  d'ensemble du 2026-10-02, fiche #461.)
- 2026-10-02 — **Q42 : l'encart de création compte aussi la dose du moment déjà passée** (TR-3), en
  plus des doses non renseignées ; une dose du jour n'y est jamais ; à plusieurs heures, la journée en
  retard entière (Q23). Mensuel créé le 28 sept. avec « Première prise le 7 sept. » : « 1 dose prévue
  le 7 sept. », « Donnée » / « Oubliée » ; donnée, elle est notée le jour prévu et la prochaine dose
  est le 7 oct. Le bandeau de la fiche ne change pas (TR-15). Raison : l'aide de « Première prise le »
  invite à saisir la dernière prise certaine ; sans cela, le traitement naît « en retard depuis le
  7 sept. » alors que la personne vient de dire que la dose a été donnée. Écartée : limiter l'encart à
  ce qui deviendra le bandeau. (Décision déléguée par Gaelle, encart #462.)

- 2026-10-10 — **Moteur des doses v2 : douze règles à la place des gardes** (§4.8, R1 à R12 ;
  remplace G1 à G5, G10, G14 à G16, G18, G22 à G26, et précise Q7, Q8, Q21 à Q24, Q36, Q37). Raison
  (Gaelle) : « bien trop longtemps que nous tournons en rond » ; quatre correctifs en trois jours,
  chacun révélant un cas de plus ; l'analyse du 2026-10-10 montre que tous les défauts tiennent à la
  frontière entre deux périodes, où l'ancienne était fermée et la nouvelle devait tout deviner (29
  règles non écrites dans le code). Décision : un calendrier par traitement (R1), les lignes
  appartiennent au traitement (R7, R11), l'origine de grille se transmet (R3), une seule règle de
  couverture (R4), seul un décalage déplace la suite (R6), une seule lecture pour tous les écrans
  (R12). Écartées : consolider règle par règle (laisse les concepts fautifs) ; échéances
  matérialisées en base (dérivées stockées, conflits de synchro, trois à quatre fois le coût).
  Mise en œuvre : `docs/technical/moteur-doses-v2-plan.md`, épic GitHub #758 « Moteur des doses v2 » (pas 1 à 10 : #748 à #757).
- 2026-10-10 — **Q-C1 : corriger la date d'une prise se juge au jour de la nouvelle date** (TR-24
  bis, R6). Hebdo du vendredi, dose du 16 notée le 16 par erreur, corrigée le 25 « donnée le 24 » :
  la case est proposée ; cochée, la suite repart du 24 (31, 7 nov.) ; même résultat que par « Fait
  à une autre date ». Écartée : garder la dose du 23 en retard (Q8 l'emportait sur TR-24 bis).
  Même lecture quand la correction saute des doses (2026-10-11) : hebdo, dose du 2 donnée, le 20 la
  dose du 9 est à renseigner et celle du 16 en retard ; la prise du 2 corrigée en 17 vaut « Fait le
  17 » pour la dose du 16, la case est proposée (24 si cochée), la dose du 9 reste à renseigner et
  celle du 2 le devient. Une prise en retard ne couvre jamais plus d'une dose, une dose passée sans
  prise ne s'efface jamais. Écartée : garder la prise sur le 2 et effacer le 9 et le 16.
- 2026-10-10 — **Q-G3 : une prise notée le jour de la reprise couvre sa première journée** (R8).
  Dose du jour donnée, « Arrêter » chez le vétérinaire, « Reprendre » le soir même : rien à
  redonner. Écartée : afficher « Une dose a déjà été notée aujourd'hui » et garder G3.
- 2026-10-10 — **Q-#744 : un réglage ouvert aujourd'hui, sans prise, se remplace quand on le modifie
  le jour même** (R10). Journée du 3 reportée au 4, fréquence → 3 jours puis → 2 jours le 3 :
  4, 5, 7. Écartée : empiler les réglages (4, 6, 8).
- 2026-10-10 — **Q-§11 : un report plus lointain que la prochaine dose survit à un changement de
  posologie** (R7, R11 ; ferme #719, retire la limite du §11). Hebdo (1, 8, 15, 22), dose du 15
  reportée seule au 17 pendant que le 8 est à venir, posologie changée : 8, 17, 22. Écartée : griser
  « Prochaine dose » quand un report existe plus loin.
- 2026-10-10 — **Q-purge : une ligne écrite par la personne ne disparaît jamais sans son geste**
  (R11). Le moteur ne supprime plus rien à la lecture ; une ligne sans effet reste visible, grisée,
  avec « Supprimer » seul. Écartée : garder la purge et l'écrire dans TR-35.
- 2026-10-10 — **Q-retard : changer la posologie (ou les heures) ne change pas l'état d'une dose en
  retard** (R9, TR-28). Milo, hebdomadaire du lundi, dose du lundi 12 oct. non donnée, posologie
  changée le mercredi 14 : le 12 reste la dose du moment, en retard, comme avant la modification.
  Écartée : la passer dans « à renseigner » avec « Prochaine dose 19 oct. » (lettre de l'ancien
  TR-28), qui ferait changer une dose de statut parce qu'on a modifié le dosage. Limitée au cas où la
  fréquence ne change pas ; quand elle change, les échéances sans prise avant la première échéance du
  nouveau réglage restent à renseigner.
- 2026-10-10 — **Q-double : une seule lecture du moteur pour tous les écrans** (R12). « Déjà
  notée », « prise en plus », « en retard », journées perdues par la date de fin, « période en
  cours » ne sont plus recalculées à l'écran (17 doubles sources relevées). Écartée : attendre un
  premier écart visible.
- 2026-10-10 — **#762 et #763, trous du pas 1** (R4, R6, R7). Une correction de date avec
  « Décaler » n'est plus proposée quand une prise ou un décalage existe plus loin ; une prise dont
  l'échéance a quitté le calendrier (synchro, import) couvre la première échéance qui suit son
  jour à moins d'un pas, sinon elle est sans effet (remplacé le 17 octobre 2026 par la règle unique :
  une prise garde la journée et l'heure de sa ligne, R4) ; une correction qui ferait se renvoyer une dose
  entre deux reports est refusée (« Change d'abord la date du report. »). Raison : ne jamais
  redemander une dose déjà donnée ; agir en amont, par construction, comme G7 pour « Prochaine
  dose » ; une lecture de secours pour les lignes que le moteur ne peut pas refuser (R11).
  Écartées : laisser la dose en retard (une dose de trop) ; réécrire la prise pour qu'elle vise la
  dose la plus proche (une règle de plus dès que deux prises visent la même dose).

- 2026-10-12 — **#787 : un rythme qui ne laisse plus aucune dose avant la date de fin est refusé à
  l'enregistrement** (R9, TR-8, Q20). Tous les 2 jours depuis le 1er oct., fin le 10, doses du 1er et
  du 3 données ; le 4, « Modifier » passe au mensuel : la première dose tomberait le 3 nov. Texte sous
  le champ : « Avec ce rythme, plus aucune dose avant la date de fin. Change la date de fin ou le
  rythme. » (EN : « At this frequency, no dose is left before the end date. Change the end date or
  the frequency. »). Le refus vaut quand le nouveau rythme repart de sa propre première échéance
  (fréquence changée, ou date choisie) après une date de fin encore à venir : finir un traitement par
  une date de fin passée reste permis (TR-6). Écartée : accepter et
  terminer le traitement (les doses des 5, 7 et 9 disparaîtraient sans un mot).
- 2026-10-12 — **« Modifier » propose la première dose encore à donner, comme la fiche** (R9, R12).
  Milo, chaque lundi à 8 h : dose du 5 donnée, celle du 12 donnée en avance le 7 ; le 7, posologie
  seule ou heures passées à 9 h : « Prochaine dose » montre et propose le 19 ; le 12 reste donné. La
  première échéance écrite reste le 12, pour la traduction des heures (R4) ou le départ du nouveau
  rythme (R9.2) ; passer le 19 tel quel ne change rien ; une autre date choisie reste celle qui
  compte. Écartée : proposer le 12, que la fiche ne montre pas.
- 2026-10-12 — **#784 : la prise d'avant l'arrêt notée le jour de la reprise compte, avec ou sans
  changement de posologie** (R8, Q-G3). Reprise le 23 mars, chaque semaine à 8, 14 et 20 h, première
  dose le 24 ; le 23, la dose de 20 h du 24 avancée au 23 ; une prise d'avant l'arrêt notée le 23 à
  20 h : rien à redonner le 23, que la posologie ait été réécrite le 23 ou non. Écartée : ne compter
  la prise que si la reprise commence ce jour-là (la dose de 20 h serait redemandée).
- 2026-10-12 — **#780 et #786 : un report qui a servi de départ à un nouveau rythme est verrouillé
  comme Q25 ; un seul refus par geste** (R7, R6). Toutes les 2 semaines à 20 h, dose du 13 avr.
  reportée au 14, puis toutes les 6 semaines à 6, 12, 18 et 23 h dès le 14 : la ligne « Reportée au
  14 avr. » n'a plus « Changer la date » ni « Supprimer » ; « Prochaine dose » sur la dose du 14 reste
  refusée ; pour bouger cette dose : « Modifier › Prochaine dose » ou « Fait à une autre date ».
  « Fait à une autre date » et « C'est fait » puis « Changer la date » passent par la même
  vérification et rendent le même refus (toutes les 6 semaines à 20 h du 27 mars, fin le 10 mai, dose
  du 8 mai avancée seule au 23 avr. ; le 10 avr., dose du 27 mars donnée le 9, case cochée : « Avec ce
  jour, la dose que tu avais reportée au 23 avr. ne pourrait plus tomber au bon moment. »). Écartées :
  laisser bouger le report en déplaçant le début du réglage avec lui ; deux textes pour le même geste.
- 2026-10-12 — **Heures seules changées, date choisie** (R9, TR-9, Q-retard). Posologie ou heures
  seules changées : la dose en retard reste en retard (Q-retard). Une « Prochaine dose » choisie à
  fréquence gardée remplace la dose en retard, qui ne passe pas « à renseigner » : Milo, hebdo du
  lundi, dose du 12 non donnée ; le 14, posologie et « Prochaine dose » le jeudi 15 (ou le lundi 19) :
  la fiche montre le 15 (ou le 19), le 12 n'est plus dû. Cela vaut quand le réglage écrit juste avant
  avait la même fréquence ; fréquence changée : les échéances sans prise
  avant la première échéance restent à renseigner (inchangé). Écartée : passer le 12 « à renseigner ».
- 2026-10-12 — **Un décalage d'avant la première échéance d'un réglage qui fait repartir la grille
  est sans effet** (R6, R10, R11). Hebdo du lundi, doses des 5 et 12 oct. données ; le 14, tous les
  3 jours (première dose le 16), dose du 16 donnée le 14 avec décalage puis la prise supprimée ; le
  14, retour à toutes les 2 semaines : « Modifier » propose et la fiche montre le 26 oct. (pas le 28).
  Hebdo dont la première dose est le lundi 12, rien noté, dose du 12 donnée le 7 avec décalage puis
  la prise supprimée ; le 7, « Prochaine dose » le 19 : la fiche montre le 19. Le décalage reste dans
  l'historique, grisé, « · sans effet », avec « Supprimer » seul. Gardent leur effet : le décalage
  posé sur l'arrivée d'un report (une échéance), et celui sur lequel une date choisie a été posée
  (grille en vigueur à la première échéance, R3) ; un changement de posologie ensuite n'y change rien. Écartée : laisser
  le décalage faire repartir le nouveau rythme (la fiche ne montrerait pas la date de « Modifier »).
- 2026-10-12 — **Un oubli ne disparaît jamais par une correction de date** (R6, R11, Q-C1). Hebdo,
  prise du 2 oct. donnée, dose du 9 à renseigner, dose du 16 notée oubliée ; le 20, corriger la date
  de la prise du 2 en 17 est refusé : « Une dose plus lointaine est déjà notée. » ; la personne
  corrige ou supprime d'abord l'oubli. L'oubli supprimé, la correction est acceptée : la dose du 16
  donnée le 17, celles du 2 et du 9 à renseigner, le 24 si la case est cochée (le 23 sinon). Écartée :
  faire de l'oubli du 16 une prise donnée le 17 (un oubli ne redevient jamais donné par un geste
  rapide, décision du 2026-10-02).
- 2026-10-12 — **Lecture : une prise de « Choisir les jours » se corrige comme les autres** (TR-16,
  TR-24 bis). Dose du 16 renseignée le 25 par « Choisir les jours », ou notée le 16 par « C'est
  fait » ; corrigée au 17 : même résultat, même chemin. Écartée : un cas particulier pour les prises
  renseignées en lot.
- 2026-10-12 — **Lecture : noter une dose déplacée seule ne propose pas la case « Décaler aussi les
  doses suivantes »** (Q2 c du 2026-09-29, gardée ; R6). Hebdo du vendredi, dose du 9 reportée seule
  au 13 ; la dose du 13 donnée le 14 : pas de case, la suite reste au 16 ; même chose pour la
  correction de la date de cette prise. Écartée : appliquer R6 à la lettre et proposer la case.
- 2026-10-12 — **Lecture : les chaînes de reports déjà existantes restent permises** (R7, G9).
  Seul un report **écrit par un geste** n'arrive jamais sur la journée d'origine d'un autre report ;
  une chaîne reçue d'un autre appareil ou écrite avant la règle se lit telle quelle (scénario #745).
  Les gardes non conservées ne produisent plus leurs refus (« trop proche de la suivante »,
  « période précédente »). Écartée : refuser la lecture d'une chaîne existante (une ligne de la
  personne perdrait son effet sans geste, R11).
- 2026-10-12 — **Lecture : Q-C1 l'emporte sur TR-24 bis** (R6). Corriger la date d'une prise se juge
  au jour de la nouvelle date, même pour une prise notée pour une dose non renseignée : hebdo du
  vendredi, dose du 2 donnée, dose du 9 renseignée le 20 ; corrigée en 17, elle vaut « Fait le 17 »
  pour la dose du 16 et la case est proposée. La phrase de TR-24 bis « changer sa date ne touche ni la
  suite ni un déplacement » est retirée. Écartée : garder cette prise sans effet sur la suite.
- 2026-10-12 — **Lecture : seul le décalage ancré à la date de la prise suit une prise corrigée**
  (R6, N2). Vendredi, dose du 16 donnée le 19 avec décalage (ancré au 19) : corrigée au 18, le
  décalage suit ou disparaît selon la case ; un autre décalage de la journée, ancré à un autre jour,
  reste. Écartée : faire suivre tout décalage de la journée.
- 2026-10-12 — **Un décalage se juge à la lettre** (R6, R10, R11). Un décalage ne vaut que si sa
  journée d'origine est encore une échéance du calendrier en vigueur, jugée sur la grille telle
  qu'elle est avant lui (héritée ou celle du réglage courant), jamais sur la grille après lui, ou
  l'arrivée d'une dose reportée du rythme en vigueur. Hebdo du lundi, tous les 3 jours le 14 (première
  dose le 16), dose du 16 donnée le 14 avec décalage puis la prise supprimée ; retour à l'hebdo le
  14 : la fiche montre le 19 (pas le 21). Une posologie seule garde le décalage (vendredi, le 16 est
  sur la grille 9, 16, 23). La parité avec l'ancien moteur ne compte pas (aucune donnée réelle).
  Écartée : garder l'effet de tout décalage d'après le début d'un réglage de même fréquence.
- 2026-10-12 — **#794 : une date choisie est montrée, même plus tôt que celle d'un réglage jamais
  commencé** (TR-9). Première dose choisie le 16 mai par un réglage jamais commencé ; le 24 avr.,
  « Prochaine dose » le 24 : la fiche montre le 24 (pas le 20 mai). Écartée : garder le plancher du
  réglage jamais commencé.
- 2026-10-12 — **Date choisie le jour d'une échéance** (TR-9). Métacam tous les 2 jours du 2 oct.,
  doses du 2 et du 4 données ; le 8, posologie et « Prochaine dose » le 9 : le 9 remplace la dose du
  8, le 6 reste à renseigner. Écartée : faire disparaître la dose à renseigner la plus ancienne.
- 2026-10-12 — **#787 : le critère est la première dose encore à donner**. Refusé quand elle tombe
  après la date de fin, y compris quand la prochaine journée est déjà donnée en avance (tous les 2
  jours du 1er oct., fin le 10, doses du 1er, du 3, et du 5 donnée le 4 ; le 4, hebdomadaire : refusé).
  Dose due le 4, fin le 4, passage à tous les jours le 4 : accepté. Une date de fin passée termine le
  traitement (TR-6). Écartée : juger sur l'état de la date de fin (passée, aujourd'hui, à venir).
- 2026-10-12 — **#786 : un seul résultat pour « Fait à une autre date » coché et pour la correction de
  date** (G12, G19, TR-24 bis). Toutes les 6 semaines à 20 h du 27 mars, sans date de fin, dose du
  8 mai avancée seule au 23 avr. ; le 10 avr., dose du 27 mars donnée le 9, cochée : accepté, le
  report suit, par les deux chemins ; avec une fin le 10 mai, où aucune date ne convient au report :
  refusé par les deux. Écartée : refuser « Fait à une autre date » coché dès qu'un report seul suit.
- 2026-10-12 — **R11 et l'oubli : l'asymétrie est voulue**. « Fait à une autre date » sur un jour noté
  oublié le repasse en donnée (TR-22, geste fait exprès sur cette dose) ; la correction de date d'une
  autre prise n'efface jamais l'oubli (refus).
- 2026-10-12 — **Journée déplacée à plusieurs heures : seules les heures restantes** (R7, Q21).
  Milo, trois prises par jour (8 h, 14 h, 20 h), dose de 8 h du 5 mars donnée, « Prochaine dose » le
  7 mars : le 7 reçoit 14 h et 20 h, la dose de 8 h du 5 étant donnée ; les jours suivants ont leurs
  trois heures. Écartée : 8 h, 14 h et 20 h le 7, comme un réglage ouvert ce jour-là.
- 2026-10-12 — **#799 : la première dose proposée ne dépend pas du jour de la correction** (R9.3).
  Quotidien depuis le 30 sept., doses des 30, 1er et 2 oct. données ; le 2 oct., passage à
  hebdomadaire ; corrigé en « toutes les 2 semaines » le 2, le 3 ou le 5 oct. : le 16, avec l'aide
  « Calculée d'après la dernière prise ». Écartée : le 15 les jours suivants (la journée du 2, sortie du
  calendrier par l'hebdomadaire, n'était plus lue comme une échéance).
- 2026-10-12 — **Date avant une dose déjà donnée plus loin : refusée** (Q26, R12). Demander
  « Prochaine dose » le 22 mars alors qu'une dose du 4 mai est déjà donnée : « trop tôt ». Le refus
  vient du moteur, le formulaire l'affiche seulement. Écartée : ouvrir un réglage à cette date.
  Étendue au réglage changé le 2026-10-13 (voir plus bas).
- 2026-10-12 — **TR-25 : « Supprimer » une dose supprime toutes ses lignes**. Dose du 10 oct. de
  Milo notée sur chaque appareil, « Supprimer » : plus aucune ligne pour cette dose. La lecture d'une
  ligne plus récente reste celle de R11 (#654). Écartée : laisser la dose donnée par l'autre ligne.
- 2026-10-12 — **#796 : la date choisie déplace la prochaine dose, arrivée d'un report comprise**
  (R9, R7). Métacam tous les 2 jours du 2 oct., doses des 2, 4 et 6 données, dose du 8 reportée au 10 ;
  le 9, posologie et « Prochaine dose » le 11 : la ligne du report est réécrite pour arriver le 11, la
  fiche montre 11, 13 (pas 10, 11, 13) ; le 8 avec « Prochaine dose » le 9 : 9, 11. Écartée : laisser le
  report arriver le 10, ou le rendre « sans effet ». Le report posé avec « Décaler aussi les doses
  suivantes » emmène son décalage, comme « Prochaine dose » (relecture du 2026-10-13) : le 8 avec
  « Prochaine dose » le 8, report et décalage supprimés, 8, 10, 12 ; le 9 avec le 11, les deux arrivent
  le 11.
- 2026-10-12 — **Prise en plus et « Prochaine dose » : rien ne change** (R5). Hebdo, première dose le
  21 sept., prise en plus le 16 ; le 17, « Prochaine dose » au 24 : la première dose est corrigée,
  sans ligne « Reportée ». Une prise en plus ne touche pas le calendrier ; avant la première dose,
  c'est « Première prise le » qui change. Écartée : écrire un report.
- 2026-10-12 — **Avant une date choisie, seul le décalage qui la porte garde son effet** (R3, R6) :
  confirmé.
- 2026-10-12 — **PDF, CSV et feuilles montrent les lignes sans effet comme l'historique** (R11, R12).
  Une ligne remplacée, battue ou revenue à sa date y est écrite à sa place, suivie de « · sans effet »
  (« · no longer applies »). Écartée : les cacher. Appliquée au PDF ; le CSV attend la question de
  §11.

- 2026-10-13 — **Q26 avec un réglage changé : refusé par le moteur** (R9, R12, G7). Une date
  choisie avant une dose déjà notée est refusée, posologie, heures ou fréquence changées comprises ;
  quand une dose plus lointaine que la date proposée est déjà notée, le champ « Prochaine dose » est
  grisé, avec le texte existant « Une dose plus lointaine est déjà notée. ». Le refus vient du moteur,
  le formulaire l'affiche seulement ; la posologie reste modifiable sans toucher la date. Exemple de
  #794 : tous les jours, dose du 19 mai donnée d'avance ; le 24 avr., posologie et « Prochaine dose »
  le 24 : refusé (la fiche montrait le 24 ; grisé aussi dès qu'une dose est notée plus loin que le
  jour de la modification, #811, entrée suivante du même jour). #794 reste vrai quand rien n'est noté plus loin : la date
  choisie avant la première échéance d'un réglage jamais commencé est montrée. Une dose du lendemain
  à 8 h donnée d'avance, qui est la prochaine dose, ne grise pas le champ (G24, #711). Écartée : ouvrir
  le réglage à la date choisie et montrer le 24.
- 2026-10-13 — **Date choisie et report plus loin : une seule règle** (R9, R6, R7, TR-9). Si la dose
  du moment est l'arrivée d'un report (rien en retard ni en attente avant elle), la date choisie la
  déplace et réécrit le report (#796). Si c'est une dose en retard ou en attente, c'est elle que la
  date choisie remplace : la grille repart de cette date, et un report plus loin la suit si sa journée
  d'origine est sur la nouvelle grille, sinon il est sans effet, à sa place dans l'historique (R11).
  Tous les 2 jours, doses des 2 et 4 données, 6 non donnée, 8 reportée au 10 ; le 7, posologie et
  « Prochaine dose » le 9 : 9, 11, 13 (le 9 remplace la dose en retard du 6, le report du 8 est sans
  effet). Même carnet, dose du 6 en attente le jour même ; le 6, « Prochaine dose » le 7 : 7, 9, 11
  (plus trois prises sur trois jours de suite). Le 6 ou le 7 avec le 8 : le report part de la date
  choisie, elle le porte, il est sans effet : 8, 10, 12 (confirmé par Gaelle le 2026-10-13 au soir,
  l'historique montre le report du 8 au 10 « · sans effet »). Une posologie
  seule écrite ensuite garde la grille repartie. Écartées : fusionner la dose en retard et l'arrivée
  du report le 9 en réécrivant le report ; laisser arriver le report le 10.
- 2026-10-13 — **Date choisie transmise au réglage qui la remplace le jour même** (R10, TR-9, R6 ;
  choix de cohérence en autonomie, confirmé par Gaelle le 2026-10-13 au soir). Un réglage remplacé le jour même par un réglage sans date choisie
  lui laisse sa date choisie, pour que le remplacement ne change ni les échéances ni l'historique.
  Tous les 3 jours du 3 oct., dose du 6 non donnée ; le 7, « Prochaine dose » le 8, puis une
  posologie reçue d'un autre appareil le même jour : 8, 11, 14, la dose du 6 reste remplacée (6, 8, 11
  avant). Mensuel à 20 h du 10 avr. ; le 22 avr., « Prochaine dose » le 23 juin, dose du 10 juin
  reportée au 19 mai avec décalage, report du 23 juin au 10 juin ; posologie seule le même jour :
  19 juin, 19 juil., les reports restent sans effet (avant : une dose le 19 mai). Écartée : laisser
  au réglage remplacé ses journées sorties du calendrier.
- 2026-10-13 — **TR-25 entre deux périodes : confirmé**. Une dose prise d'avance avant un arrêt,
  notée de nouveau après « Reprendre » le même jour : « Supprimer » emporte les deux lignes (jour et
  heure). Remplacée le soir même (#822, plus bas).
- 2026-10-13 — **Q38 : « Elles n'étaient pas à donner » refusée quand elle ne laisse plus aucune dose
  avant la date de fin** (#806, R12, #787). Chaque jour à 8 h, 14 h et 20 h, fin le 6 avr. ; le
  17 mars, la dose de 8 h reportée au 5 avr. avec « Décaler aussi les doses suivantes », puis les
  heures passent à 6, 12, 18 et 23 h ; le 18, retour à 8, 14 et 20 h avec fin au 25 mars : la
  question s'ouvre, « Elles restent à renseigner » garde la dose de 6 h du 17 (« Prochaine dose le
  17 mars », la fiche la montre en retard) ; « Elles n'étaient pas à donner » ne se choisit pas et dit
  « Avec ce rythme, plus aucune dose avant la date de fin. Change la date de fin ou le rythme. » au
  lieu d'annoncer une date. Un dialogue n'annonce jamais une dose que la fiche ne montre pas (R12).
  Écartées : refuser tout l'enregistrement ; accepter et terminer le traitement.
- 2026-10-13 — **Q26 : le champ « Prochaine dose » grisé dès qu'une dose est notée plus loin que le
  jour de la modification** (#811, G7, G24). Pas seulement plus loin que la date proposée : tous les
  2 jours, doses du 2 au 10 données, celle du 12 donnée d'avance le 11 ; le 11, posologie : le champ
  est grisé (« Une dose plus lointaine est déjà notée. »), la date proposée, le 14, reste affichée, la
  posologie reste modifiable. Avant, choisir le 13 était accepté et la prise du 12 perdait son
  échéance. Une dose notée sur la date proposée elle-même, la prochaine dose (8 h du lendemain donnée
  d'avance, 20 h encore à donner), ne grise pas le champ (G24, #711). Écartée : ne refuser que les
  dates choisies après la dose notée.
- 2026-10-13 — **Les prises du jour de l'arrêt restent comptées** (TR-30, R4, #819). « Test », tous
  les 2 jours à 8 h et 20 h, première dose le 13 oct. ; les doses de 8 h et 20 h du 13 données le 13,
  celles du 15 données d'avance le 13 ; « Arrêter » le 13 : les deux prises du 13 couvrent leurs
  doses, les deux du 15, après l'arrêt, restent « sans effet ». Le jour de l'arrêt se lit de la même
  façon quel que soit le jour de début : un traitement commencé le 10 et arrêté le 13 garde de même
  les prises du 13, et une dose du 12 reportée au 13, donnée le 13 avant l'arrêt, reste couverte. Même
  lecture quand la reprise s'ouvre le jour de l'arrêt sans y avoir de dose : mensuel sans heure, dose
  du 13 oct. donnée le 13, arrêté le 13, repris le 13 avec première dose le 13 nov. (ou tous les jours
  dès le 14) : la prise du 13 oct. compte, comme pour une reprise le 14 ; 8 h, 14 h et 20 h du 8
  données, arrêté et repris le 8 avec première dose le 9 : les trois prises comptent. Une reprise qui a
  sa journée le jour de l'arrêt (première dose ce jour-là, ou dose reportée ou avancée à ce jour) lit
  seule cette journée (Q-G3, inchangé). Un report arrivé le jour de l'arrêt qui a servi de départ à un
  nouveau rythme reste verrouillé, comme avant l'arrêt (#780). Une dose du jour non notée reste
  retirée par l'arrêt, sans passer « à renseigner » ; arrêté avant sa première échéance sans aucune
  prise, le traitement dit toujours « Arrêté avant la première prise ». Écartée : un jour de l'arrêt
  qui n'appartient plus au traitement (ses prises sans effet, y compris celles données avant l'arrêt).
- 2026-10-13 (nuit) — **R8 et Q-G3 tels qu'écrits : une prise notée le jour de la reprise couvre
  toute sa première journée, quelles que soient les heures** (R1, R8, TR-30, #819, #821 ; « notée »
  devient « donnée » le 2026-10-14). Milo, dose
  de 8 h donnée, arrêt, reprise le soir à 20 h : rien à redonner, prochaine dose le 9 à 20 h. Deux
  doses par jour reprises à 9 h et 21 h : journée couverte, pas de double dose. Tous les jours à 8 h,
  14 h et 20 h, les trois du 8 données, arrêt, reprise le 8 à 20 h seule : la première journée de la
  reprise est couverte, et les trois doses de l'ancienne période gardent leurs prises (#819) : rien de
  grisé, aucune prise « sans effet ». Aucun double comptage d'une même dose (R1). Le défaut d'origine
  de #821 était seulement le grisage des prises de 14 h et 20 h. Remplace la décision du soir même
  (« chaque prise couvre la dose de son heure »), retirée. Écartées : une prise ne couvre que la dose
  de son heure ; une règle composée (dans l'ordre si aucune heure commune, par heure sinon).
- 2026-10-13 (soir) — **#823 : arrêter, reprendre le même jour, arrêter** (TR-30, R4). Tous les jours
  à 20 h, dose du 2 avr. donnée ; arrêt le 2, reprise le 2 dès le 2, arrêt le 2 : la prise de 20 h du
  2 reste comptée, quel que soit le nombre d'arrêts et de reprises ce jour-là. Avant : « sans effet ».
- 2026-10-13 (soir) — **#822 : « Supprimer » retire ce que la fiche montre comme une ligne** (TR-25).
  Dans une même période, la fiche montre une ligne, et « Supprimer » retire ce qu'elle montre (les
  deux prises de deux appareils, règle du 2026-10-12 gardée). Entre deux périodes, la fiche montre
  deux lignes et on ne retire que celle touchée : tous les jours à 20 h, dose du 2 avr. donnée, arrêt
  le 2, reprise le 2 dès le 2, la même dose notée de nouveau : « Supprimer » la prise de la reprise
  garde celle d'avant l'arrêt, qui couvre alors la dose. Remplace l'entrée « TR-25 entre deux
  périodes : confirmé » du même jour. Écartée : supprimer toute prise de même date et même heure.
- 2026-10-13 (soir) — **#817 : Q38 et une date choisie** (R9, R10). Chaque jour à 8, 14 et 20 h, fin
  le 6 avr. ; le 17 mars, 8 h reportée au 5 avr. avec décalage, puis 6, 12, 18 et 23 h ; le 18, retour
  à 8, 14 et 20 h avec « Prochaine dose » le 19 : « Elles restent à renseigner » garde la dose de 6 h
  du 17 en retard et le report du 5 avr. ; la nouvelle grille part du 19. La règle « la date choisie
  remplace la dose en retard » ne vaut que quand aucune question n'a été posée. Le report n'est plus
  réécrit ; la dose en retard attend une donnée explicite sur le réglage, nommée par ce qu'elle veut
  dire (« les doses passées du réglage précédent restent à renseigner »), jamais déduite, écrite par
  une migration dans un ticket à part (#825). Écartée : réécrire le report en « 6 h du 17 → 19 » et
  faire disparaître la dose de 6 h du 17.
- 2026-10-13 (nuit) — **#810 : un changement de fréquence seul ne fait pas disparaître une dose en
  retard** (R9, R10). Une dose en retard ne disparaît que par « Elles n'étaient pas à donner »
  (question ouverte) ou par une date choisie dans « Prochaine dose » sans question posée ; un
  changement de fréquence seul la laisse en retard. Le correctif essayé le soir même (la dose de 12 h
  du 20 passée à renseigner dans la graine 991003624) est retiré ; #810 reste ouvert (§11). Retirée
  le 2026-10-14 (plus bas) : elle contredisait TR-28.

- 2026-10-14 — **#802 : deux lignes de la même échéance sous deux réglages d'une période** (lecture
  de R11, R4 et TR-25 par #802, à confirmer par Gaelle). Milo, tous les jours à 8 h, réglage du
  1er oct. ; le 10, posologie changée sur le téléphone B ; le téléphone A, pas synchronisé, note la
  dose du 12 « oubliée » le 12 à 21 h (ancien réglage), B la note « donnée » le 13 à 7 h (nouveau
  réglage) : la prise donnée, plus récente, est lue, l'oubli est « sans effet », comme sous un même
  réglage, quel que soit l'ordre de réception. Même lecture pour les reports et les décalages d'une
  journée. Seule exception : les jours que le calendrier traduit (R4, R7), celui où les heures
  changent et celui où arrive un report à d'autres heures, une prise visant les anciennes heures
  couvre une heure du nouveau réglage et reste lue à côté d'une prise de même heure du nouveau
  réglage. Tous les jours à 8 h et 20 h, 20 h du 10 donnée d'avance, heures passées à 12 h et 20 h
  le 10, puis 20 h donnée : les deux comptent, rien à donner le 10, et « Supprimer » l'une garde
  l'autre (TR-25 : la fiche montre deux lignes). Toutes les 2 semaines à 8 h et 20 h depuis le
  1er oct., le 10 dose du 15 déplacée au 20 et 20 h du 20 donnée d'avance, puis tous les mois à 12 h
  et 20 h, prochaine dose le 15 nov. : le 20, la prise d'avance couvre 12 h et « C'est fait » sur
  20 h complète la journée. Avant : la ligne lue dépendait de l'ordre de réception. L'app refuse à
  l'écriture une deuxième ligne de la même échéance et de la même famille sous le même réglage
  seulement, pas sous tout le traitement (écart au plan §3.2, confirmé par Gaelle le 14 octobre
  2026) : une garde par traitement refuserait le « C'est fait » sur 20 h du 10 de l'exemple du
  changement d'heures ; les lignes d'un autre réglage n'arrivent que par la synchro et la lecture
  les écarte (`scripts/dose-engine/ecarts-acceptes.md`).
- 2026-10-14 — **Décisions de Gaelle du 14 octobre 2026 : #810, oubli, aller-retour de fréquence**
  (TR-28, TR-30, R4, R8, R9, R10). #810 : « à renseigner » dans les deux cas ; la phrase du 13 oct.
  « un changement de fréquence seul la laisse en retard » est retirée (elle contredisait TR-28). Tous
  les 3 mois à 6, 12, 18 et 23 h depuis le 31 mars, dose de 18 h du 31 oubliée ; le 1er avr., tous
  les 2 jours dès le 2 (6 h du 2 donnée d'avance), second « Modifier » identique, puis la prise du 2
  supprimée : 6, 12 et 23 h du 31 à renseigner, prochaine dose le 2 à 6 h. Tous les jours à 8 h et
  20 h, le 16 toutes les 6 semaines (dose du 16 donnée), retour à tous les jours dès le 17, prise du
  16 supprimée : le 15 à renseigner. Remplacé le même jour par Gaelle (graine 1500061791, entrée
  « #836 » plus bas) : le retour à tous les jours garde la fréquence d'avant le 16, le 17 est la date
  proposée, la dose du 15 reste en retard.
  **Un oubli** est une note sur une échéance, celle de son jour et de son heure : jamais compté comme
  donné, jamais reporté sur une autre dose. Heures changées le jour même : c'est la même dose du matin
  (R9), l'oubli reste dessus, la dose de 9 h n'est pas redemandée (inchangé). Oubli reçu d'un autre
  téléphone sur un jour qui n'est plus une échéance : il ne porte sur rien, « sans effet » dans
  l'historique, et la dose suivante reste demandée (tous les 2 jours à 8 h depuis le 2 oct., doses du
  2 et du 4 données ; le 5, l'autre téléphone passe à tous les 3 jours dès le 7 ; oubli du 6 reçu : la
  dose du 7 reste demandée). Une prise donnée en retard couvre encore une dose orpheline (R4, pas de
  double dose) ; un oubli jamais. Reprise le même jour aux mêmes heures : même échéance (R1), la note
  posée dessus reste ; 8 h oubliée, arrêt, reprise aux mêmes heures : 8 h n'est pas redemandée, 14 h
  et 20 h sont à donner. « Seule une prise donnée couvre » ne vaut que pour une autre heure : 8 h
  oubliée, reprise le soir à 20 h seule, 20 h reste à donner.
  **Aller-retour de fréquence le même jour** : pas d'écart accepté. R10 vaut aussi pour un réglage
  reçu d'un autre appareil : deux réglages datés du même jour, sans prise, le second remplace le
  premier, d'où qu'il vienne ; la fréquence du réglage final se compare à celle qui valait avant ce
  jour ; le même carnet sur deux téléphones ne montre jamais deux états. Tous les 3 jours à 8 h
  depuis le 3 oct., dose du 6 non donnée ; le 7, tous les 2 jours puis retour à tous les 3 jours : le
  6 reste en retard ; un téléphone à tous les 2 jours, l'autre à 9 h en gardant tous les 3 jours :
  après la synchro, le 6 est en retard.
  Lecture à confirmer par Gaelle : entre deux appareils, une dose donnée puis oubliée ne couvre rien
  d'autre (R11, la ligne la plus récente décide).

  Confirmé par Gaelle le 14 octobre 2026 (remplace la
  condition « réglage écrit juste avant » de TR-9, 12 octobre) : tous les 2 jours le 7, dose du 7
  donnée, retour à tous les 3 jours à 9 h dès le 9, prise du 7 supprimée : le réglage du jour est sans
  prise et se remplace (R10), lu comme un seul « Modifier » à fréquence gardée, le 9 remplace la dose
  du 6 ; même lecture pour la graine 1500018007 de #810, où les doses du 5 avril disparaissent ; aucune
  règle sur une fréquence intermédiaire annulée. Écartées : laisser la dose en retard comme dose du
  moment après un réglage qui change vraiment la fréquence ; un oubli qui couvre une autre dose ;
  comparer au réglage intermédiaire remplacé le jour même.
- 2026-10-14 — **TR-25 : « Modifier » corrige ce que la fiche montre comme une ligne** (#654). Dose
  de Milo du 10 oct. notée sur deux téléphones, corrigée au 11 par « Modifier » : une seule prise,
  donnée le 11, plus de ligne grisée « · sans effet » restée au 10. « Modifier » comme « Supprimer » :
  « Laisser une ligne grisée que la personne n'a jamais créée, c'est une ligne inexpliquée sur sa
  fiche » (Gaelle). Écartées : ne corriger que la ligne touchée ; réécrire les deux lignes à
  l'identique, qui laisse une ligne grisée « · sans effet » à la nouvelle date.
- 2026-10-14 — **#835 : « Supprimer ce report » emporte le décalage de sa journée, ou est refusé**
  (TR-24, R6). Même lecture que « Prochaine dose » ramenée au jour d'origine. Milo, chaque vendredi à
  20 h depuis le 2 oct., dose du 9 donnée ; le lundi 12, la dose du vendredi 16 avancée au mardi 13,
  case cochée : 13, 20, 27 ; « Avancée au 13 oct. » › « Supprimer ce report » : 16, 23, 30 (avant :
  16, 20, 27). 16 reporté au 19 avec la case, report supprimé : 16, 23, 30 (avant : 16, 26). Le
  décalage reste supprimable seul, le report gardé. Refusé quand le décalage ne peut pas partir avec
  lui : « un geste ne fait jamais la moitié de ce qu'il annonce » (Gaelle). 16 reporté au 19 avec la
  case, puis 26 reporté seul au 28 : « Supprimer ce report » du 16 refusé (« Une dose plus lointaine
  est déjà reportée. … »), comme « Prochaine dose » ramenée au 16 ; le 12, 16 avancé au 13 avec la
  case, le 13 non renseigné, le 20 donné : le 21, « Supprimer ce report » refusé (« Une dose plus
  lointaine est déjà notée. »). Écartées : garder le décalage (« reste et se supprime à part »), qui
  laisse deux doses à quelques jours d'écart ; supprimer le report en gardant un décalage verrouillé,
  qui ne fait que la moitié du geste.
- 2026-10-14 — **TR-25 : deux décalages de la même journée sont une ligne**. « Deux décalages de la
  même journée sont une ligne, comme deux prises ou deux reports de la même dose. « Supprimer ce
  report » emporte les deux reports et les deux décalages ; aucun décalage « sans effet » ne redevient
  actif » (Gaelle). 16 reporté au 19 avec la case sur un appareil, un autre décalage de la journée du
  16 reçu de l'autre appareil (ancré au 19 ou au 20, plus ancien ou plus récent) : « Supprimer ce
  report » montre 16, 23, 30 dans tous les cas (avant : 16, 26 ou 16, 27). Écartée : ne supprimer
  que les lignes en vigueur, qui rend actif un décalage « sans effet » que la personne n'a pas vu.
- 2026-10-14 — **#841 : tous les gestes sur une ligne de la fiche s'appliquent à ce que cette ligne
  montre** (TR-25 ; « Modifier », « Supprimer », « Marquer comme oubliée », « Marquer comme
  donnée », confirmé par Gaelle). Dose du 16 donnée sur deux appareils, marquée oubliée : la fiche
  montre « Oubliée » seule, sans « Donnée le 16 · sans effet » ; de même le jour d'un arrêt suivi
  d'une reprise le même jour (Milo, tous les jours à 20 h depuis le 30 mars, dose du 2 avr. donnée
  sur deux appareils, arrêt et reprise dès le 2 ; le 4, « Marquer comme oubliée » sur la prise du 2 :
  « Oubliée » seule) ; entre deux périodes, on ne touche que la ligne choisie (#822). « Annuler »
  rétablit la ligne qui était en vigueur. Écartée : ne réécrire que la ligne touchée, qui laisse la
  ligne grisée de l'autre appareil. Pour « Marquer comme oubliée », « Marquer comme donnée » et
  « Fait à une autre date » sur une dose oubliée : remplacé par la décision du 17 octobre 2026
  ci-dessous.
- 2026-10-14 — **#836 et #825 : deux faits sur le réglage** (R9, R10, TR-9). Le réglage enregistre
  « date choisie par la personne » et « les doses passées du réglage précédent restent à renseigner »,
  jamais déduits, dans une même migration (schéma v13, export v6). « Le moteur lit un fait, il ne
  devine pas si une date vient de la personne ou d'une proposition » ; « une date proposée par l'app
  n'est pas une date choisie ; seule une date choisie remplace la dose du moment : c'est exactement le
  fait que #825/#836 enregistre » (Gaelle). Graine 1500061791 de #810 : tous les jours à 8 h et 20 h,
  dose du 15 non donnée ; le 16, « Modifier » toutes les 6 semaines, dose du 16 donnée ; le même jour,
  retour à tous les jours à 20 h dès le 17 (date proposée) ; prise du 16 supprimée : la dose du 15
  reste en retard (avant : à renseigner). Milo, tous les 3 jours à 8 h depuis le 3 oct., dose du 6
  non donnée ; le 7, tous les 2 jours, dose du 7 donnée, retour à tous les 3 jours à 9 h à la date
  proposée (le 10), prise du 7 supprimée : la dose du 6 reste en retard (avant : elle disparaissait).
  Écartée : déduire la date choisie de l'origine de grille posée, qui confond une date proposée avec
  une date choisie.
- 2026-10-15 — **Décision de Gaelle du 15 octobre 2026 (soir) : une journée touchée garde ses heures**
  (#854, R3, R4, R7, R9, R11, TR-28). « Une journée déjà déplacée ou notée garde les heures qu'elle
  avait quand elle a été touchée ; les nouvelles heures valent pour les journées non touchées ;
  aujourd'hui garde la règle actuelle (R4 : les prises du jour couvrent les premières heures du
  nouveau réglage) ; la journée à venir déjà entamée (R9.2) garde aussi ses heures, pour n'avoir
  qu'une règle. » Trois réponses : (a) une journée à venir qui porte une prise, ou l'origine ou
  l'arrivée d'un report, garde les heures du réglage de sa ligne la plus récente, et un report emporte
  ses heures telles quelles (plus de « fin de liste ») ; Luna, toutes les 2 semaines à 8 h, 14 h et
  20 h, la dose du 23 avancée au 15, puis 6 h seule le même jour : le 15 porte 8 h, 14 h et 20 h, le
  23 est vide, puis le 7 mai à 6 h ; (b) aujourd'hui, seul jour traduit : 8 h et 20 h, 8 h donnée ce
  matin, heures passées à 9 h et 21 h : 9 h couverte, 21 h à donner, demain 9 h et 21 h ; (c) la
  journée à venir entamée garde ses heures et le rythme repart toujours d'elle : tous les 2 jours à
  8 h et 20 h, 8 h du 3 donnée le 2, heure passée à 9 h le 2 : le 3 garde 8 h (donnée) et 20 h (à
  donner), puis le 5 à 9 h. Remplace la décision du 15 octobre au matin sur Luna (le 15 ne gardait
  qu'une dose, à 6 h), la « fin de liste » de R7 et, pour une journée à venir, la traduction de R9.2.
  Attendus de #848 relus sous cette règle : graine 7500000173, rien en retard, le 18 (arrivée d'un
  report) à 20 h, puis la journée du 25 à 8 h 01 et 20 h 01 (la date choisie reste l'origine) ;
  graine 7500002108, seule la dose du 10 (arrivée d'un report) reste à renseigner, à 20 h.
  « Elles n'étaient pas à donner » repart de la première dose encore à donner, ou d'une journée
  plus proche qui garde ses heures (ses prises comptent toujours), hors jour d'arrivée d'un report
  qui n'est pas sur la grille (R6 : la grille n'en repart pas) ; hebdomadaire du vendredi, doses du 17 avril reportées au 21 (12 h donnée),
  le 18 heures changées, « Elles n'étaient pas à donner » : le 21 garde 18 h et 23 h, puis 24 avril
  et 1er mai.
- 2026-10-16 — **Décisions de Gaelle du 16 octobre 2026 sur les six lectures de #859** (#854, R4,
  R7, R9, TR-25, TR-28, #860). (1) Oui : le jour du changement, le jour de départ d'un report écrit
  avant perd autant de doses que le report en emporte. (4) Oui : un décalage ne fixe pas les heures
  de sa journée. (5) Oui : sans dose tombée, changer les heures à fréquence gardée ouvre un réglage à
  partir d'aujourd'hui. (2) Reformulée : une prise couvre son échéance, jour et heure, quel que soit
  le réglage ; une journée touchée lit les heures de sa ligne la plus récente (TR-25) ; une prise dont
  l'heure n'existe pas ce jour-là ne se perd pas (première échéance libre qui suit, une heure plus
  tard le même jour comprise, à moins d'un pas) ; le report emporte son heure et les suivantes sans
  prise, prises de toute provenance comprises ; Milo, mensuel à 8 h et 20 h, 20 h du 1er avril donnée
  d'avance, passage à 8 h, 14 h et 20 h, 14 h reportée au 16 : le 16 reçoit 14 h seule. (6)
  Reformulée : une journée d'échéance qui reçoit un report garde ses doses et y ajoute les doses
  reportées, une même heure ne comptant qu'une fois ; hebdomadaire à 20 h, la dose du 13 avril
  reportée au 15, puis tous les 3 jours à 8 h et 20 h dès le 12 : le 15 montre 8 h et 20 h. (3)
  Décidée : « Prochaine dose » désigne une journée entière : la date choisie qui emmène un report
  reçoit toutes les heures du nouveau réglage (le 17 à 9 h, ou à 9 h et 21 h, ou à 8 h, 14 h et
  20 h selon les heures écrites). #860 : les prises se posent d'abord, exactes puis sur la première
  échéance libre qui suit, les reports se lisent ensuite ; trimestriel à 8, 14 et 20 h, 14 h et 20 h
  du 5 mars données d'avance, A reporte 8 h du 5 au 6, B réécrit les heures en 8 h 01, 14 h 01,
  20 h 01 : le 5, 14 h 01 et 20 h 01 couvertes, le 6 une seule dose (graines 7600001452,
  7600002410) ; le 9 porte 8 h donnée, A donne 14 h d'avance, B retire 8 h : le 9, 14 h et 20 h
  couvertes (graine 7700002507).
- 2026-10-16 — **Décisions de Gaelle du 16 octobre 2026 sur les cinq lectures de #859, sur #862 et
  #864** (R4, R7, R9, TR-25, transmises par la session d'analyse du moteur, mandatée par Gaelle).
  (1) Reformulée : le jour du changement, le jour de départ d'un report garde autant de doses que le
  report en a laissées avant lui (par rang), posées sur les premières heures du nouveau réglage dans
  la limite de ses heures ; une dose n'apparaît pas sans geste : chaque jour à 8, 14 et 20 h, 8 h du
  17 mars reportée au 5 avril, puis 6, 12, 18 et 23 h le même jour : rien le 17. (2) Oui : les prises
  du jour couvrent les premières heures du nouveau réglage, dans l'ordre, à hauteur de leur nombre ;
  une prise ne couvre son heure que si elle existe encore : chaque jour à 8 h et 20 h, 20 h donnée
  d'avance le 10, 9 h et 21 h le 10 : 9 h couverte, 21 h à donner. (3) Non : deux prises du même jour
  et de la même heure sont la même dose (TR-25), la plus récente vaut, l'autre est sans effet, et
  « Supprimer » emporte les deux ; deux téléphones, 20 h notée sous 8 h et 20 h puis sous 12 h et
  20 h : 12 h reste à donner. (4) Même sens : une prise ou un oubli écrits après un report du jour ne
  se posent que sur les heures qu'il a laissées ; sinon une prise couvre la première échéance qui
  suit, un oubli est sans effet (graine 6100002653). (5) Oui : « Prochaine dose » désigne une journée,
  le jour choisi porte toutes les heures du nouveau réglage, avec les doses reportées ; Luna, chaque
  semaine à 8 h et 20 h, 8 h du 6 avril donnée, 20 h reportée au 12, le 8 « Prochaine dose » le 10 :
  le 10 à 8 h et 20 h, puis le 17 et le 24 (l'exemple « deux doses en retard le 12 » de la lecture
  était faux : une date déjà passée est refusée). #862 : « première échéance libre » vaut dans la
  journée ; d'un jour à l'autre, la première échéance qui suit, à moins d'un pas, et si elle est déjà
  couverte, la prise est sans effet. #864 : défaut corrigé, la journée de départ d'un report porte
  aussi les doses qui y étaient arrivées (le 22 garde sa dose sans heure, 6 h, 12 h et 18 h).
  Précision de la même session (R7, R9.2) : « Elles n'étaient pas à donner » ne saute le jour
  d'arrivée d'un report hors de la grille que si ce report part d'avant le réglage corrigé ; sinon
  ce jour reste la première échéance proposée, car le jour de départ sortirait du calendrier et le
  report deviendrait sans effet (graines 7810000235 et 7810000909).
- 2026-10-16 — **Décision de Gaelle du 16 octobre 2026 sur la journée du changement** (R4, graine
  7810000428 ; transmise par la session d'analyse du moteur, mandatée par Gaelle). La journée du
  changement est traduite seulement quand le réglage qui la lit change d'heures ; une journée touchée
  lue sous un réglage plus ancien garde ses doses : journée du 12 touchée sous 6, 12, 18 et 23 h, 6 h
  et 12 h données, 23 h reportée au 13, réglage en cours à 20 h ; « 20 h → 20 h 01 » le 12 : le 12
  garde 6 h et 12 h données et 18 h à donner, puis le 14 à 20 h 01. Une dose à donner ne disparaît
  pas pour une minute d'écart. Le cas « 20 h donnée le 3, 9 h seule dès le 3 : 9 h couverte » reste
  vrai : le réglage qui lit le 3 change ses heures. Même session : « Elles n'étaient pas à donner »
  ne fait pas partir le réglage corrigé après l'arrivée, déjà passée, d'un report parti de ses
  journées (graine 7810000235, le lendemain de l'arrivée ; remplacé le 18 octobre 2026 : les doses
  restées sans prise d'une arrivée passée, listées, sortent avec la réponse, #873).
- 2026-10-16 — **Décisions de Gaelle du 16 octobre 2026 sur #866 et #868** (R3, R4, R9, R10 ;
  transmises par la session d'analyse du moteur, mandatée par Gaelle). #866 : le jour du changement
  d'heures, quand la journée a plus de notes que d'heures, les prises données prennent les heures
  d'abord, dans l'ordre, les oublis ensuite ; l'oubli en trop est sans effet : chaque jour à 8 h et
  20 h, le 10, 8 h donnée et 20 h marquée oubliée, puis 20 h seule : 20 h couverte par la prise de
  8 h, l'oubli de 20 h sans effet ; un écran ne dit jamais « oubliée » un jour où la dose a été
  donnée. #868 : après « Elles n'étaient pas à donner », la règle dépend de la fréquence. Gardée
  (heures ou posologie seules) : l'origine est héritée, le calendrier ne bouge pas, le jour
  d'arrivée d'un report garde ses doses reportées en plus (graine 8000000154 : le 17 mars garde ses
  trois doses à donner, puis le 6 avril ; graine 8000000726 : le 23 mars garde sa dose à donner et
  celle du 18 avril reste avant la fin du 20 avril). Changée : le rythme repart de l'arrivée (R9
  point 2). Dans les deux cas, aucune dose ne disparaît par ce geste : il ne retire que les doses
  tombées sans prise que la question a listées, jamais l'arrivée à venir d'un report ni une journée
  à venir.
- 2026-10-16 — **Décision de Gaelle du 16 octobre 2026 sur #867** (R10, R11 ; transmise par la
  session d'analyse du moteur, mandatée par Gaelle). Deux téléphones : le report écrit par A contre la
  réponse « Elles n'étaient pas à donner » écrite par B pour la même dose : la plus récente des deux
  intentions l'emporte (le report par sa date de modification, la réponse par la date d'écriture du
  réglage), comme pour tout conflit entre deux appareils. Réponse plus récente : le report est sans
  effet, visible dans l'historique, et le 10 disparaît ; report plus récent : il tient, le 10 porte la
  dose reportée à l'heure écrite dans le report (journée touchée). Milo, tous les 3 jours à 20 h, puis
  toutes les 2 semaines à 20 h dès le 3 avril ; le 7, A reporte la dose du 3 au 10, B passe à 6 h et
  répond « Elles n'étaient pas à donner » : rien le 10 et le 17 à 6 h, ou le 10 à 20 h puis le 17 à
  6 h (graine 8010002409). Jamais de perte silencieuse : le perdant reste une ligne grisée.
- 2026-10-16 — **Décisions de Gaelle du 16 octobre 2026 sur les lectures de #867** (R10, R11 ;
  transmises par la session d'analyse du moteur, mandatée par Gaelle). (1) La date d'écriture du
  réglage est une colonne à part de la période, écrite seulement quand ses réglages changent
  (migration v14 de la base et du miroir Supabase, livrée à part) ; écartée : la dernière
  modification de la période, que l'arrêt et son « Annuler » font bouger (Milo arrêté puis
  « Annuler » le 8 perdrait sa dose reportée au 10). (2) Le report le plus récent n'emporte que
  l'heure écrite dans sa ligne : limite connue de la réécriture sur place entre deux appareils, le
  réglage réécrit ayant perdu les heures que le report avait vues. Toutes les 2 semaines à 8 h et
  20 h, A reporte au 10 la dose de 8 h du 3 avril (qui emmène 20 h), B passe à 9 h et répond
  « Elles n'étaient pas à donner » : le 10 à 8 h seulement, puis le 17 à 9 h. (3) La règle vaut
  pour toute réécriture du réglage du report qui ôte sa journée de départ du calendrier,
  « Prochaine dose » comprise : Luna, chaque semaine à 8 h, première dose le 10 avril, sans prise ;
  le 8, A reporte la dose du 10 au 12, B choisit « Prochaine dose » le 15 : B plus récent, rien le
  12, puis le 15 et le 22 ; A plus récent, le 12 à 8 h, puis le 15 et le 22. Alternative écartée
  par l'implémenteur, pas par Gaelle : pour (2), les heures suivantes du réglage corrigé (8 h, 9 h
  et 21 h pour un passage à 9 h et 21 h, une dose de trop). Description, pas une décision : d'ici
  la colonne, la lecture d'avant reste, et selon le cas le report garde ou perd son effet ; la
  règle (3) n'est appliquée qu'à une journée de départ située avant la nouvelle première échéance,
  limite connue (#882).
- 2026-10-17 — **#847 : une journée laissée avant une première échéance posée plus loin garde ses
  prises** (R4, R6, R9, R11 ; décision du 16 octobre 2026 « après « Supprimer ce report », la
  journée lit les heures de ses prises restantes, aucune prise donnée ne passe sans effet », et
  principe du 17 octobre 2026 ci-dessous). À fréquence gardée, quand aucune prise donnée de la
  journée ne couvre une échéance qui la suit, chaque prise y garde son échéance ; sinon la règle
  « une prise ne se perd jamais » reste (la prise couvre l'arrivée d'un report à moins d'un pas,
  graine 4900001764 de #852). Milo, chaque lundi à 8 h et 20 h ; le 9 mars, 20 h du 16 donnée
  d'avance ; le 11, 9 h et « Prochaine dose » le 23 ; le 14, le 23 avancé au 17 avec la case ; le
  18, « Supprimer ce report » : la prise du 16 couvre 20 h le 16 (avant : sans effet), prochaine
  dose le 23 à 9 h. Le même carnet sans le report se lit pareil dès le 11. Conséquences : « Prochaine
  dose » grisée par Q26 quand une telle prise est plus loin que le jour de la modification (cas #787
  du 12 octobre : le 9, la prise du 12 compte ; Milo le 12 mars) ; la journée gardée compte comme
  dernière journée passée (R9.3) ; un geste qui fait passer une telle prise sur une autre échéance
  est permis (R6). Écartée : le 16 qui garde toujours sa prise, le 17 alors à donner avant la
  suppression, qui contredit #852 (« l'arrivée du 16 couverte, rien en retard »).
- 2026-10-17 — **Principe du 17 octobre 2026 : une réécriture de réglage ne retire que les doses non
  données qu'elle visait.** Une prise donnée, ou un report plus récent qu'elle, garde son échéance
  telle qu'écrite, jamais translatée vers une autre. Portée : ni le jour où les heures changent (R4,
  les prises du jour couvrent les premières heures du nouveau réglage), ni une journée sortie par un
  changement de fréquence (#862), ni la journée à venir déjà entamée (R9.2, G26). Appliqué ici à
  #847 seulement ; le reste est au §11.
- 2026-10-17 — **Principe du 17 octobre 2026 appliqué à #892, #893 et #885** (R4, R6, R10, R11 ;
  décisions de Gaelle du 17 octobre 2026, par la session d'analyse du moteur à qui elle a délégué
  les lectures de règles). (1) #892 : une prise donnée de A tient toujours face à « Elles n'étaient
  pas à donner » de B, même plus ancienne, et garde son échéance : le 3 à 20 h « donnée le 7, en
  retard », puis le 17 à 6 h ; écartés : la translater sur le 17, la griser. (2) #893 : une prise
  de l'arrivée d'un report que la réécriture rend sans effet garde son échéance et ne couvre pas
  l'arrivée d'un report plus récent : le 23 mars à 8 h « donnée le 13 mars, en avance », le 23
  avril à 8 h à donner (graine 8810000692) ; écartée : la prise sans effet. (3) #885 : un report
  plus récent fait avec la case garde son décalage, qui translate la grille du réglage réécrit,
  date choisie comprise : le 10 à 20 h, puis le 24 et le 8 mai à 6 h ; écarté : le report sans son
  décalage (le 10 puis le 17). (4) Les journées laissées avant une première échéance posée plus
  loin se lisent telles que la fiche les montrait, décalages compris (graine 7830000046). Une
  seule règle du moteur, celle de #867, dit pour un report, un décalage ou une prise donnée si la
  ligne l'emporte sur la réécriture de son réglage.
- 2026-10-17 — **Règle unique : une prise garde toujours la journée et l'heure écrites dans sa ligne**
  (R4, R6, R9, R10, R11 ; décisions de Gaelle du 17 octobre 2026 sur les arrêts de la PR #914, par la
  session d'analyse du moteur à qui elle a délégué les lectures de règles). Elle ne se translate
  jamais sur une autre journée, quelle que soit la cause et la naissance du réglage ; la lecture du
  16 octobre pour #862 (« entre journées, R4 comme écrit ») est retirée pour les prises ; une prise
  donnée n'est plus jamais sans effet, seule une ligne plus récente de la même dose (prise ou oubli) la remplace ;
  l'oubli garde sa lecture. (1) #852, graine 4900001764 : la prise de 14 h du 13 reste « donnée en
  avance » sur le 13, le 16 à 8 h est à donner, en retard le 17, avant comme après le passage à
  8 h 01. (2) Date proposée : la journée gardée est la dernière journée passée (R9.3) ; Milo, le 16
  gardé, le 19 à donner ; mensuel, le 9 avril ; #862 compris. (3) #873 : la date de la réponse est la
  date d'écriture du réglage (v14) ; sortent les doses tombées sans prise strictement avant ce jour,
  sous le réglage remplacé ; le 23 mars reste, le 18 mars sort (livré le 18 octobre 2026 avec la
  réponse à trois états, ci-dessous). (4) La prise de 20 h du 23 mars
  (#893) garde son échéance. (5) Q1 (#884, #861) et Q2 (#865, #874, #876, #877, #881, #898) : la
  prise garde sa journée, une dose reportée est portée par son jour d'arrivée. (6) Q4 (#872) :
  « Elles n'étaient pas à donner » refusée avec le texte de #806 quand elle ne laisse aucune
  dose avant la fin, avec ou sans prise ; « Elles restent à renseigner » non ; la correction ne repart plus
  d'aujourd'hui (livré le 18 octobre 2026, ci-dessous). (7) Une date de fin retire les doses non données après elle ; une dose donnée
  après la fin reste « donnée », jamais grisée. Écartées : la translation d'une prise sur la
  journée suivante (#862 du 16 octobre) ; une colonne « réponse du » ou une première échéance
  réécrite pour #873.
- 2026-10-18 — **#873 et #872 : la réponse à la question des doses tombées est écrite sur le
  réglage, à trois états** (R10, R11 ; décision de Gaelle du 18 octobre 2026, par la session
  d'analyse du moteur à qui elle a délégué les lectures de règles ; migration v15, export v8).
  (1) Aucune question posée, « Elles restent à renseigner », « Elles n'étaient pas à donner » ; seule
  la dernière retire des doses ; la date de la réponse reste la date d'écriture du réglage (v14). Les
  données d'avant valent « restent à renseigner » si le booléen était vrai, sinon « aucune question
  posée », jamais « n'étaient pas à donner » : rien n'est retiré après coup. (2) Lecture par dose : la
  réponse retire exactement les doses listées ; la journée touchée garde ses heures (graine 901836).
  Milo, chaque semaine à 8 h depuis le 2 mars, le 9 reporté au 11, le 11 « C'est fait » puis tous les
  2 jours dès le 13, le 12 « Prochaine dose » le 18, le 13 la prise du 11 supprimée : la dose du 11
  revient et le report du 9 reste (défaut Critical de la relecture de #914, graine 8840000838).
  (3) #872 : « Elles n'étaient pas à donner » qui vide la période est refusée avec le texte de #806,
  chemins Q38 et Q39 ; jamais « Elles restent à renseigner » ; la correction à fréquence gardée ne
  repart plus d'aujourd'hui. Carnet sans prise, tous les 3 mois à 20 h, fin le 6 mai, dose du 18 mars
  reportée au 22 ; le 23, 12, 18 et 23 h puis « Elles n'étaient pas à donner » : refusée. Écartées :
  déduire la réponse d'un réglage réécrit (une « Prochaine dose » retirait des doses) ; ne retirer que
  les doses jamais retouchées ; une ligne par dose retirée.
- 2026-10-17 — **#841 : « Marquer comme oubliée » sur une dose donnée sur deux appareils laisse la
  prise de l'autre appareil, grisée** (TR-25 ; décision de Gaelle du 17 octobre 2026, par la session
  d'analyse du moteur à qui elle a délégué les lectures de règles). Le geste réécrit la ligne en
  vigueur ; les autres lignes de la dose restent visibles et grisées, supprimables une par une
  (#822). Même règle pour « Marquer comme donnée » depuis l'historique et « Fait à une autre date »
  sur une dose oubliée (un geste au moteur, une règle). Raison : un geste fait exprès sur la dose,
  hors de la portée de la règle unique (voir R4) ; la modification la plus récente gagne, comme entre
  deux prises sur la même dose ; les deux téléphones montrent la même fiche dans les deux ordres de
  synchro. Milo, chaque lundi à 8 h ; dose du 16 mars donnée sur A à 9 h 02 et sur B à 9 h 05 ; B
  touche « Marquer comme oubliée » : « Oubliée » et la prise de A grisée sur les deux téléphones. Un
  téléphone garde une seule ligne « donnée ou oubliée » par dose (règle du 12 octobre, non levée) :
  sur un seul téléphone, rien ne change. « Modifier » garde la décision du 14 octobre (#839). Un
  oubli ne redevient pas « donné » depuis la feuille ou une notification (décision du 2 octobre).
  Écartées :
  refuser le geste ; garder aussi la prise du téléphone qui fait le geste, qui demande de lever la
  règle d'une ligne par dose et par téléphone.
- 2026-10-17 — **#882 et #883 : la règle de #867 vaut à chaque contradiction entre un report et la
  réécriture de son réglage** (R6, R10, R11 ; décision de Gaelle du 17 octobre 2026, par la session
  d'analyse du moteur à qui elle a délégué les lectures de règles : aucune règle nouvelle, #867
  appliqué en entier). Elle lève la limite « journée de départ avant la nouvelle première échéance »
  du 16 octobre pour la réécriture la plus récente. (1) #882 : après la nouvelle première échéance,
  une réécriture plus récente que le report l'emporte, le report est sans effet. Luna, chaque
  semaine à 8 h, première dose le 10 avril, sans prise ; le 8, A reporte la dose du 10 au 12, B
  choisit « Prochaine dose » le 9 : B plus récent, rien le 12, puis le 9, le 16 et le 23 (avant : 9,
  12, 16) ; A plus récent, le 9, le 12 à 8 h, puis le 16 (comme avant). A reporte la dose du 17 au
  19, B, plus récent, choisit le 11 : 11, 18, 25 (avant : 11, 18, 19). La journée doit être lue sous
  le réglage réécrit, ou sous un réglage qui reprend sa grille sans la changer (même rythme, sans
  origine propre), avant leur fin, et manquer à la grille propre du réglage réécrit (son origine
  écrite ou sa première échéance) quand il a pu la déplacer (origine propre ou rythme changé) ;
  sinon la lecture d'avant reste. Un report plus récent après la première échéance garde la lecture
  d'avant (question au §11, graine 8710000057), et son décalage aussi (Luna avec la case : 9, 12,
  16). (2) #883 : la ligne gagnante garde son jour et son
  heure, même quand seule son heure a disparu du réglage réécrit (graine 8710000013) : tous les 3
  jours à 8 h, 14 h et 20 h depuis le 3 avril, fin le 28 mai ; le 3, 8 h oubliée et 20 h donnée
  d'avance le 1er ; A reporte 14 h au 6 mai avec la case, B passe à 8 h et 20 h : A plus récent, le
  6 mai à 14 h, puis le 9 mai à 8 h et 20 h (avant : le 9 mai, la dose de 14 h perdue) ; B plus
  récent, le report est sans effet. Tous les 3 mois à 8 h, 14 h et 20 h, sans prise le 5 mars ; A
  reporte 8 h du 5 au 6, B passe à 8 h 01, 14 h 01 et 20 h 01 : B plus récent, le report est sans
  effet, le 5 réclame 8 h 01, 14 h 01 et 20 h 01 (avant : tout au 6). (3) La dose de départ se juge
  sur sa journée lue sans le report, doses arrivées d'un autre report comprises, et la règle ne vaut
  que pour une dose ôtée par la réécriture ; une ligne écrite au même instant que le réglage (le
  même « Modifier ») ne le contredit pas. Même carnet avec 14 h et 20 h du 5 données d'avance : sur B, le 5 garde 8 h (journée
  touchée par les prises), la réécriture ne l'a pas ôtée, le report tient, le 6 à 8 h 01 (relecture
  de la PR #934, graines 9050001002 et vingt autres). Sur un seul téléphone, une journée qui n'existait
  que par un décalage supprimé se lit comme avant : Milo, toutes les 2 semaines à 20 h depuis le 13
  mars, fin le 26 avril ; le 15 mars, dose du 13 donnée, dose du 27 donnée d'avance avec la case ;
  fin le 16 avril, puis 8 h, 14 h et 20 h le même jour ; la dose de 8 h du 29 mars reportée au 8
  avril avec la case ; « Supprimer » le décalage du 27 : le 8 avril à 8 h, 14 h et 20 h, puis le 10
  avril, et une posologie seule ne change rien (graines 9000000692 et 9500001489) ; un réglage créé
  ensuite (date de fin, fréquence, « Prochaine dose ») qui ôte la journée laisse aussi la lecture
  d'avant (graines 9640000023 à 9640000934 du comparateur, 9010001511 de l'oracle). Limites connues,
  questions au §11 : un report plus récent après la première échéance, une heure ôtée quand la
  journée de départ garde une dose libre après elle, et le décalage d'un report gagnant parti après
  la première échéance, se lisent comme avant.

## 11. Questions ouvertes

Posées par la relecture de cohérence du 2026-09-30 (`technical/relecture-coherence-2026-09-30-1.md`),
toutes tranchées le 2026-09-30 : C1 (Q15), C2 (Q16), C5 (TR-30), C6 (TR-24), C7 (TR-13, RA-18), les
trois dernières validées en bloc.

Les limites connues du moteur v1 (report plus lointain perdu à un changement de posologie, journée
entamée en avance redemandée, prises d'une période remplacée qui couvrent encore, calendrier de
départ irrégulier, mensuel du 29, 30 ou 31 ouvert sur l'arrivée d'un report) sont fermées par
construction par les règles R1, R3, R4, R7 et R11 du moteur v2 (décision du 2026-10-10). Elles
restent des scénarios du jeu de recette (`docs/technical/moteur-doses-v2-plan.md` §6 et
`src/shared/__tests__/dose-calendar.recette.spec.ts` à partir du pas 1) jusqu'à la suppression du
moteur v1 (pas 10).

Décision de Gaelle du 2026-10-10 : une ligne sans effet reste à sa place dans l'historique, grisée,
avec son texte habituel suivi de « · sans effet » (« Reportée au 19 oct. · sans effet »), et son
menu ⋮ ne propose que « Supprimer » (R11, TR-24, TR-35).

Trous relevés au pas 1 de l'épic #758 et fermés le 2026-10-10 : #762 (prise qui ne vise plus aucune
échéance après une correction avec décalage : R6, pas de case quand une ligne existe plus loin, et
R4 « une prise ne se perd jamais » pour les lignes reçues) ; #763 (deux reports qui se renvoient une
dose : R7, refus de la correction, G9 étendue à la réécriture).

Ouvertes le 2026-10-13, en appliquant les décisions du 2026-10-12 au soir :

- **CSV.** `prises.csv` liste déjà toutes les lignes, sans effet comprises ; les marquer
  « · sans effet » demande une colonne de plus, donc un titre nouveau.
- **#817, la dose en retard après « Elles restent à renseigner » avec une date choisie (tenu,
  #825).** Le réglage écrit par cette réponse dit que les doses passées du réglage précédent restent à
  renseigner : la dose de 6 h du 17 reste en retard, le report du 5 avr. aussi.
- **#810, un changement de fréquence et la dose en retard (tranchée le 14 octobre 2026, §10).** La décision du 2026-10-13 (« un
  changement de fréquence seul la laisse en retard ») et TR-28 (« quand la fréquence change, les
  échéances restées sans prise avant la première échéance du nouveau réglage restent à renseigner »)
  ne disent pas la même chose quand on lit « en retard » comme la dose du moment : tous les 3 jours à
  8 h du 3 oct., dose du 6 non donnée, le 7 passage à tous les 2 jours dès le 8 : la dose du 6 passe
  « à renseigner ». La graine 991003624 (`scripts/dose-engine/ecarts-acceptes.md`) montre le même
  réglage lu des deux façons selon qu'une prise d'avance existe ou non sous le réglage remplacé.
  Tranchée : « à renseigner » dans les deux cas ; la phrase du 2026-10-13 est retirée.
- **#836, une dose en retard qui disparaissait sans date choisie (tenu).** Tous les 3 jours à 8 h depuis le
  3 oct., dose du 6 non donnée ; le 7, « Modifier » tous les 2 jours, « C'est fait » sur la dose du 7,
  puis « Modifier » tous les 3 jours à 9 h sans toucher la date proposée (l'app écrit une première
  dose et un départ de grille le 10) ; la prise du 7 supprimée, la dose du 6 disparaît, alors qu'elle
  doit rester en retard (R10). Même chose chaque lundi depuis le 5 oct., dose du 12 non donnée : le
  13, tous les 3 jours, dose du 13 donnée, retour à l'hebdo à la date proposée (le 20), prise du 13
  supprimée : la dose du 12 doit rester en retard. Tenu : le réglage enregistre « date choisie par
  la personne » (schéma v13, avec #825, décision de Gaelle du 14 octobre 2026).

Lectures à confirmer par Gaelle, ouvertes le 15 octobre 2026 avec #825 et #836 :

- **« Elles n'étaient pas à donner » sans date choisie ne remplace plus la dose du moment.** Milo,
  tous les 2 jours à 8 h depuis le 1er oct., dose du 1er donnée, dose du 3 non donnée ; le 4, heure
  passée à 9 h ; le 6, dose du 5 non donnée, heure passée à 10 h, « Elles n'étaient pas à donner » :
  la dose du 5 sort du carnet, la dose du 3 redevient la dose du moment, en retard, puis 7 et 9 à
  10 h (avant : la dose du 3 disparaissait, prochaine dose le 7). C'est la règle de #836 appliquée
  à la lettre (la date montrée n'a pas été choisie, R11 : rien ne disparaît sans geste). Écartée :
  laisser cette réponse remplacer la dose du moment comme une date choisie.
- **Valeurs posées pour les réglages d'avant le schéma v13** (base, miroir Supabase, exports v3 à
  v5) : « date choisie » quand une origine de grille est posée, sinon non ; « restent à renseigner »
  à non. Chaque traitement se lit alors exactement comme avant la migration. Limite : la base d'avant
  ne sait pas si une origine posée venait d'une date proposée ; un carnet déjà dans la situation de
  #836 garde l'ancienne lecture (graine 1500061791 telle qu'enregistrée par la campagne : les doses
  sans prise restent à renseigner, prochaine dose le 17). Écartée : « non » partout, qui ferait réapparaître en
  retard des doses qu'une date réellement choisie avait remplacées.
- **Création et reprise** écrivent « date choisie » : la première dose y est toujours saisie ou
  validée par la personne. Écartée : « non », sans effet sur la lecture (un premier réglage ou un réglage
  d'après un arrêt ne remplace aucune dose) mais faux sur ce que la personne a fait.

Lectures ouvertes le 16 octobre 2026 avec #859, #862, #864, #866 et #868 : tranchées le même jour
(§10), sauf une, à confirmer par Gaelle :

- **Après « Elles n'étaient pas à donner » à fréquence gardée, le jour d'arrivée d'un report n'est
  la première échéance que si, sans cela, ce report deviendrait sans effet** (lecture de
  l'implémenteur de #868). Elle remplace la condition « report parti d'avant le réglage corrigé » de
  la précision du 16 octobre (§10). Tous les 2 jours à 6, 12, 18 et 23 h ; le 3 avril, la dose du 5
  à 6 h reportée au 7 avec la case, puis 8 h et 20 h dès le 3 ; le 7, 20 h seule et « Elles
  n'étaient pas à donner » : le 7 reste la première échéance et garde les doses reportées du 5, le
  report reste en vigueur (graine 7810000235 ; même lecture que `main`). Sans report menacé, la
  grille garde son origine (graines 8000000154, 8000000726). Écartée : toujours partir de la
  journée de la grille suivante, qui rendrait ce report sans effet et ferait disparaître ses doses.

#860 (deux téléphones, un réglage du jour réécrit) : réglé par l'ordre des passes (§10, décision du
16 octobre 2026), tests au vert dans `src/shared/__tests__/dose-calendar.reports-journee-touchee.spec.ts`.

Cas dégradés connus de #848 (graines 7500000173 et 7500002108) : fermés par #854 sous la décision
de Gaelle du 15 octobre 2026 (§10), tests passés au vert dans
`src/shared/__tests__/dose-calendar.reglage-corrige-date-choisie.spec.ts`.

Lectures à confirmer par Gaelle, ouvertes le 14 octobre 2026 avec #845 (TR-24, TR-25) :

- **« Supprimer ce report » refusé aussi quand l'un des reports emportés (autre appareil) a sa
  nouvelle date notée.** Milo, chaque vendredi depuis le 2 oct., doses du 2 et du 9 données ; le 12,
  le téléphone A reporte la dose du 16 au 19, case décochée, et le 19 il note « C'est fait » ; le
  téléphone B, hors ligne, avait reporté la dose du 16 au 20 (modification plus récente). Le 21, la
  fiche montre « Reportée au 20 oct. » en vigueur et la prise du 19 compte : la ligne n'a plus de
  menu ⋮ (Q25) et la fiche garde 23, 30, 6 nov. Sans ce refus, les deux reports partaient et la prise
  du 19 comptait comme la dose du 23 donnée en avance : le 23 disparaissait (16 en retard, puis 30,
  6, 13). Écartée : ne supprimer que le report en vigueur, qui rend actif le report de l'autre
  appareil et ne fait que la moitié du geste.
- **« Supprimer ce décalage » emporte les décalages de sa journée**, déduite de « deux décalages de
  la même journée sont une ligne » (décision du 14 octobre) : 16 reporté au 19 avec la case, un autre
  décalage de la journée du 16 ancré au 20 reçu de l'autre appareil : « Supprimer ce décalage »
  retire les deux, la fiche garde « Reportée au 19 oct. ».
- **« Fait à une autre date » sur une dose oubliée** : décidé le 17 octobre 2026 (§10, TR-25), même
  règle que « Marquer comme donnée » depuis l'historique, un seul geste au moteur : dose du 16
  marquée oubliée sur deux appareils, « Fait à une autre date » le 17 sur B : « Donnée le 17 », et
  l'oubli de A reste visible et grisé.

Décidé le 17 octobre 2026 avec #841 : **le libellé d'une ligne remplacée par une ligne plus récente
de la même dose** (deux appareils) reste « · sans effet », comme toute ligne grisée ; aucun texte
nouveau (décision de Gaelle, transmise par la session d'analyse du moteur).

Limite connue de #841 (relecture du 17 octobre) : quand la ligne de l'**autre** téléphone est la plus
récente de la dose, « Marquer comme oubliée » réécrit cette ligne (la ligne en vigueur), pas celle du
téléphone, car le moteur ne connaît pas l'appareil d'une ligne. Les deux téléphones montrent le même
écran, mais il dépend de l'ordre de synchro quand les deux lignes n'ont pas la même date. Milo, chaque
lundi à 8 h : la dose du 16 mars est donnée sur B le 16 et sur A le 17 ; le 18, sur B, « Marquer comme
oubliée » : si la prise de A est arrivée avant le geste, « Oubliée » et « Donnée le 16 · sans effet » ;
si elle arrive après, « Oubliée » et « Donnée le 17 · sans effet ». Aucune dose n'est perdue ni inventée.
Alternative : le service donne au moteur la ligne du téléphone (`created_by_device`), un choix de modèle
à faire trancher.

Principe du 17 octobre 2026 (§10), ouvert le 17 octobre avec #847 : une réécriture de réglage ne
retire que les doses non données qu'elle visait ; une prise donnée ou un report plus récent garde
son échéance telle qu'écrite, jamais translatée. Hors de sa portée : le jour où les heures changent
(R4), une journée sortie par un changement de fréquence (#862), la journée à venir déjà entamée
(R9.2, G26). Appliqué à #847, puis le même jour à #892, #893, #885 et remplacé par la règle unique « une prise garde la journée et l'heure de sa ligne » (§10, décisions du 17 octobre 2026 sur les arrêts de la PR #914). Restent :

Décidés le 17 octobre 2026 (lectures de la PR #914) : l'oubli d'une journée touchée garde son heure (R4, livré) ; « Elles n'étaient pas à donner » se lit par dose ; le refus de #806 vaut quel que soit le chemin, avec ou sans prise (Q38 ou Q39). Livrés le 18 octobre 2026 avec la réponse à trois états sur le réglage (#873, #872, migration v15, §10). Reste, posée par cette livraison :

- **Une réécriture sans question après « Elles n'étaient pas à donner » fait avancer le jour de la réponse.** La date de la réponse est la date d'écriture du réglage (v14) ; une réécriture plus tardive sans question (« Prochaine dose », ou heures changées sans dose tombée) garde la réponse et avance cette date : une dose tombée entre les deux réécritures, couverte au moment de la seconde puis découverte (prise supprimée), serait retirée sans avoir été listée. Rare sur un téléphone (sans dose tombée sans prise au moment de la seconde réécriture), à faire trancher : garder la lecture livrée, ou écrire la date de la réponse à part (migration).

Livrés le 17 octobre 2026 : #882 et #883 (§10, la règle de #867 à chaque contradiction entre un report et la réécriture de son réglage). Restent, posées par leur livraison :

- **Lecture à confirmer (livrée, différente de `main`) : B plus récent ôte la journée de départ par un simple changement de fréquence.** Luna, chaque semaine à 8 h, première dose le 10 avril, sans prise ; le 8, A reporte la dose du 17 au 19 ; B, sans voir ce report et plus récent, passe à toutes les 2 semaines (grille du 10 et du 24) ou à chaque mois (10 avril, 10 mai). Livré : le report est sans effet, la fiche montre le 10 puis le 24 (ou le 10 puis le 10 mai) ; `main` montrait 10, 19, 24. Cohérent avec la décision du 16 octobre (« toute réécriture du réglage du report qui ôte sa journée de départ ») ; impossible sur un seul téléphone (15 variantes jouées par la relecture, identiques à `main`). Recommandation : garder (la réécriture plus récente l'emporte, quelle que soit la cause qui ôte la journée) ; alternative : la lecture de `main`, le report tient. À confirmer par la session d'analyse du moteur.
- **Report plus récent dont la journée de départ est ôtée après la nouvelle première échéance (#882, sens inverse).** Graine 8710000057 : toutes les 2 semaines à 6 h, 12 h, 18 h et 23 h depuis le 11 mars ; le 14, A avance au 16 la dose de 6 h du 25, B choisit « Prochaine dose » le 14 ; A plus récent. Lu comme avant (livré, identique à `main`) : le report reste sans effet, rien le 16. Raison : sur un seul téléphone, le même carnet naît quand la journée de départ n'existait que par une ligne supprimée ensuite (un décalage, l'arrivée d'un autre report) ou qu'un réglage créé ensuite l'a ôtée ; appliquer « le plus récent l'emporte » y changeait la fiche (relecture de la PR #934 : Milo, graines 9500001489 et 9640000279 : le 18 avril perdait 12 h, 18 h et 23 h). Rien dans les données ne dit qu'un report a été écrit sans voir la réécriture. Pistes : (a) garder la lecture d'avant (livré) ; (b) noter sur la ligne le réglage, tel qu'il était, que le report a vu (date d'écriture du réglage au moment du report), migration ; (c) le décider à la synchro, quand les deux écritures se rencontrent. Recommandation : (b), seule à distinguer les deux carnets ; (a) en attendant.
- **Heure ôtée, journée qui garde une dose libre après elle : même dose à une autre heure ?** Tous les 3 mois à 8 h, 14 h et 20 h, sans prise le 5 mars ; A reporte 8 h du 5 au 6, B, sans voir ce report, passe à 8 h 01, 14 h 01 et 20 h 01 ; A plus récent. Lu comme avant (livré, identique à `main`) : le 6 à 8 h 01, 14 h 01 et 20 h 01, aux heures de B, et plus rien le 5. La règle de #883 lue à la lettre : le 6 à 8 h, et le 5 garde 8 h 01, 14 h 01 et 20 h 01 : deux doses du matin pour une. Recommandation : le report emporte son heure (le 6 à 8 h) et la journée de départ perd autant de doses libres qu'il en emporte (le 5 perd 8 h 01), comme le jour où les heures changent (R4, R7) ; écartées : la lecture à la lettre (une dose de trop), garder la lecture d'avant (l'heure du report perdue, et les doses suivantes emportées).
- **B plus récent, heure ôtée, report fait avec la case : le décalage tient seul.** Carnet de #883 ci-dessus, B plus récent : le report est sans effet, mais son décalage part du 3 avril, encore une échéance du réglage de B (R6) ; la fiche ne montre plus rien du 4 avril au 8 mai, puis le 9 mai (identique à `main`). Recommandation : le décalage suit son report, sans effet quand la réécriture plus récente l'emporte, comme pour #885 (« le report et son décalage sont sans effet ») ; écartée : R6 seule (le décalage tient, un mois sans dose).
- **Décalage d'un report gagnant parti après la première échéance réécrite.** Luna avec la case : A reporte la dose du 10 au 12, B choisit « Prochaine dose » le 9, A plus récent. Lu comme avant (livré, identique à `main`) : le report tient, son décalage reste dépassé : 9, 12, 16, 23. Deux autres lectures : le décalage tient et la grille repart au rythme de A depuis le jour d'arrivée, comme #885 le fait avant la première échéance (9, 12, 19, 26) ; ou il translate de deux jours les échéances de B qui suivent (9, 12, 18, 25), lecture littérale du texte de #885, qui ne coïncide avec la précédente que si la date choisie par B est sur la grille que A a vue (même écart déjà possible avant la première échéance). Recommandation : le rythme de A depuis le jour d'arrivée, la grille de B n'ayant plus de dose sur le jour de départ ; écartées : la lecture d'avant (la case de A perdue alors que son report gagne), la translation (deux doses à un jour d'écart quand la grille de B est décalée d'un jour).


Fermées par Gaelle le 2026-10-13 au soir (§10) : Q38 quand « Elles n'étaient pas à donner » ne laisse
aucune dose avant la date de fin (#806, refusée) ; date choisie le jour d'origine d'un report en
attente (le report est porté par elle, sans effet : 8, 10, 12).
