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
| **Période** | Intervalle pendant lequel un traitement suit les mêmes réglages : première prise, date de fin facultative, fréquence, heures, posologie, moment du rappel. Un traitement a une ou plusieurs périodes successives. |
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
  départ si la première prise, la fréquence, les heures ou la date de fin changent. (Relecture, point 7 ;
  décisions du 2026-09-28 ; lot A révisé, N1.)
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

- **TR-7** La première échéance d'une période est sa première prise ; pour une période ouverte par
  « Modifier » (TR-28), c'est la dernière prise plus la nouvelle fréquence, jamais avant aujourd'hui
  (sinon aujourd'hui ; à plusieurs heures, aujourd'hui tant qu'il reste des heures du nouveau réglage
  au-delà des prises déjà notées ce jour, spec Q24), proposée dans « Prochaine dose » et modifiable (spec Q7), avec l'aide « Calculée
  d'après la dernière prise : … Modifiable. » (lot A révisé, N3). Les suivantes se calculent depuis
  la **dernière ligne** plus la fréquence : date réelle d'une prise donnée, échéance d'une oubliée,
  nouvelle date d'un report (T1). En mois, le jour de référence est celui de la première échéance
  (31 janv. → 28 févr. → 31 mars), ou le dernier jour du mois quand il n'existe pas, sans dériver ; une
  prise donnée un autre jour que son échéance devient la nouvelle référence (T2). La suite ne repart
  de la date réelle que si la prise couvre la dose du moment ; une prise notée pour une échéance plus
  ancienne (dose non renseignée) ne déplace rien (TR-18, spec Q8). (Décision du 2026-09-23, point 5 ;
  spec du 2026-09-28 §3.1, §4.1 ; plan de livraison, T1 et T2)

  Gardes du moteur d'échéances (#453 ; choisies au plus prudent, non tranchées par Gaelle) :
  - **G10** À plusieurs heures, une prise donnée un autre jour que son échéance ne refixe la suite que
    si elle est la dernière heure du jour et que les autres heures de ce jour sont déjà notées.
  - **G11** Une prise datée plus d'un intervalle avant son échéance ne refixe pas la suite.
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
  déplacement. Traitement à plusieurs heures : le déplacement porte sur la journée,
  dont toutes les heures encore sans prise partent au nouveau jour, qui a toutes ses heures (spec
  Q21). Les doses non renseignées d'avant restent à renseigner. Sans prise dans la période, déplacer
  la première dose corrige la première échéance de la période, sans ligne « Reportée » ni « Avancée »
  (TR-28). (Spec Q2 ; revue du modèle, 2026-09-29, M4 ; lot A révisé, N5)

  Gardes du moteur d'échéances (#453 ; choisies au plus prudent, non tranchées par Gaelle ; G6 et G7
  se voient à l'écran et sont à valider) :
  - **G6** Une dose ne s'avance pas d'un intervalle entier ou plus (en mois : jamais à un jour d'où la
    fréquence retombe sur son échéance d'origine), pour garder une seule ligne par échéance.
    Exemples : hebdomadaire, la dose du 6 avr. s'avance au plus tôt au 31 mars ; mensuel, la dose du
    30 avr. s'avance au plus tôt au 1er avr., car le 30 mars comme le 31 mars plus un mois retombent
    sur le 30 avr.
  - **G7** Une dose ne se déplace pas tant qu'une ligne (prise ou déplacement) existe plus loin dans la
    période ; le moteur en donne la raison à l'écran.
  - **G8** La date minimale passe aussi après la date réelle de la dernière prise notée.
  - **G9** Une dose n'arrive pas sur le jour d'origine d'un autre déplacement.
  - **G13** Quand la suite a changé depuis le déplacement, déplacer de nouveau la dose réécrit la ligne
    avec l'échéance qu'elle remplace désormais (« prévue le » peut changer) ; une ligne ne ramène
    jamais une dose à son propre jour d'origine.
  - **G17** Une journée n'a qu'une ligne de déplacement : la redéplacer réécrit sa ligne, même quand
    une heure y est revenue (prise supprimée) ; deux lignes pour la même journée (synchronisation) :
    la plus récente vaut, l'autre est sans effet.
  - **G14** Un déplacement ne remplace que l'échéance qu'il vise : si la suite change sans lui (prise
    supprimée, TR-26), l'échéance qui réapparaît reste à donner ou à renseigner.
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
  date ». Depuis la fiche : « C'est fait » (aujourd'hui, un tap) et un lien « Fait à une autre date »
  toujours à côté. (Existant ; G2)
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

- **TR-24** Menu ⋮ d'une prise : changer la date, supprimer, « Marquer comme donnée / oubliée » ; d'une
  ligne « Reportée au … » ou « Avancée au … » : « Changer la date », « Supprimer ce report » (la suite
  repart de la ligne précédente ; l'échéance d'origine redevient la dose du moment ou une dose non
  renseignée) ; un toast
  « Annuler » après chaque geste. (Existant ; P5 ; report : relecture de cohérence du 2026-09-30, validé en bloc)
- **TR-24 bis** Changer la date d'une prise qui a fixé la suite recalcule la prochaine dose qu'elle
  fixe. Un déplacement placé après elle (ligne « Reportée au … » ou « Avancée au … ») est gardé, et le
  toast le dit (« Prise déplacée au 28 août. Prochaine dose gardée au 10 oct., que tu avais
  reportée. » · Annuler) ; s'il ne tombe plus après la prise déplacée, la suite repart de la prise, et
  le toast le dit. Une prise notée pour une dose non renseignée ne fixe aucune suite (TR-7, spec Q8) :
  changer sa date ne touche ni la suite ni un déplacement. (Décision du 2026-09-25, point 1,
  transposée ; plan de livraison, T3 ; points validés en bloc du 2026-10-01)

  Garde du moteur d'échéances (#453 ; choisie au plus prudent, non tranchée par Gaelle, visible dans
  l'historique : à valider) :
  - **G12** Le déplacement gardé est réécrit pour viser la dose que fixe la prise corrigée : sa ligne
    dit alors « prévue le » avec la nouvelle échéance (prise du 5 sept. corrigée au 28 août :
    « Reportée au 10 oct. (prévue le 28 sept.) »).
- **TR-25** Une correction s'applique à toutes les lignes de la même échéance, jour et heure (deux
  appareils), et devient la modification la plus récente. (Relecture, point 5)
- **TR-26** Pas de règle de « seule prise » : supprimer la seule prise garde le traitement (son
  échéance redevient la dose du moment, ou une dose non renseignée si une échéance plus récente est
  tombée, TR-13) ; « Marquer comme oubliée » est permis sur toute prise, y compris la seule donnée. Pour
  tout effacer : « Supprimer ce traitement ». (Spec Q4, 2026-09-29 ; remplace le point 4 des réponses à
  la relecture du 2026-09-28)

### 4.6 Modifier, arrêter, reprendre, supprimer

- **TR-27** Nom et type : toujours une correction. (P9)
- **TR-28** Fréquence, heures, posologie : si aucune prise (donnée, oubliée ou reportée, T4) n'a été
  notée depuis le début de la période, correction (les réglages sont remplacés) ; sinon, nouvelle
  période à partir d'aujourd'hui, sans question, et le nouveau réglage vaut tout de suite, y compris
  pour le reste de la journée : les prises déjà notées aujourd'hui comptent pour les premières heures
  du nouveau réglage, les heures suivantes restent à donner ; il ne reste aucune dose de l'ancien
  réglage aujourd'hui (spec Q24) ; les prises passées gardent leurs réglages ; les échéances de l'ancien rythme restées sans
  prise avant aujourd'hui restent à renseigner, comme après un arrêt (TR-30). (P9 Q1 ; spec Q7)

  Gardes du moteur d'échéances (#453 ; choisies au plus prudent, non tranchées par Gaelle) :
  - **G1** Seules les prises dont l'échéance est le jour du changement comptent pour les premières
    heures du nouveau réglage (une dose d'hier notée aujourd'hui n'en retire aucune).
  - **G2** Une prise notée « oubliée » compte comme une prise donnée.
  - **G3** Une reprise après un arrêt garde sa première prise du jour : seules comptent les prises
    notées depuis le dernier arrêt.
  - **G4** Les heures couvertes sont les plus tôt du nouveau réglage, quel que soit l'ordre de saisie.
  - **G15** « Même rythme » : quand la fréquence ne change pas, que rien n'est noté pour aujourd'hui
    et qu'une dose est due aujourd'hui, la nouvelle période commence par la dose du jour (heures
    passées de 8 h et 20 h à 9 h et 21 h : 9 h et 21 h le jour même), même si la dose suivante avait
    déjà été déplacée.
  - **G16** Pour « la dernière prise plus la nouvelle fréquence » (TR-7), une prise qui n'a pas fixé
    la suite compte par son échéance, pas par sa date réelle (spec Q8) : la dose du 6 notée le 7,
    fréquence passée à tous les 2 jours le 7, première dose le 8.
  - **G5** Une période précédente ne garde aucune dose à partir du début de la suivante, même si
    celle-ci commence dans le futur (cas que l'app n'écrit pas).
- **TR-29** Un autre produit est un nouveau traitement : arrêter l'ancien, créer le nouveau. (P9 Q2)
- **TR-30** « Arrêter » : dialogue qui propose de renseigner les doses non renseignées (« Toutes
  données », « Choisir les jours », « Arrêter sans renseigner ») ; « Arrêté le … », plus aucune
  échéance ni rappel ; les doses non renseignées d'avant l'arrêt restent à renseigner, y compris une
  dose en retard depuis plusieurs jours, que le dialogue compte avec les autres (relecture de cohérence du 2026-09-30, validé en bloc) ; « Annuler ».
  La dose du jour non notée est retirée par l'arrêt ; quand elle existe, le dialogue le dit : « La dose
  d'aujourd'hui n'est pas notée : si tu l'as donnée, touche « C'est fait » avant d'arrêter. » (Spec Q9)
  Sans dose à renseigner, une confirmation simple : « Plus aucun rappel pour Milbemax. Ses prises
  restent dans le carnet. » (relecture du lot A, correction 6). (P9 Q3, doute de Gaelle à observer)
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
  posologie ; sous les heures, « Rappel 30 min avant · moins précis » avec « Réactiver » quand les
  rappels précis ont été retirés (spec Rappels, RA-23) ; bandeau des doses non renseignées ; historique.
  (Planches Q2, Q5, Q8 ; spec Rappels Q6)
- **TR-35** Historique : une seule liste chronologique par période ; oubliées en gris, regroupées quand
  elles se suivent ; déplacements en ligne discrète (« Reportée au 14 oct. 2026 (prévue le 10 oct.) »,
  ou « Avancée au 8 oct. 2026 (prévue le 10 oct.) », spec Q17) ;
  « Dernière prise » = dernière donnée ; « N prises » ne compte que les données ; une prise notée un
  autre jour que son échéance : l'échéance en titre (« 6 oct. 2026 », avec l'heure seulement si la
  période a plusieurs heures), « Donnée le 7 oct. 2026 » dessous ; aucune ligne « A fixé la dose
  du … » (spec Q13) ; période sans prise : « Aucune prise dans cette période pour l'instant » ;
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

- Traitement : animal (figé), nom, type, suppression logique.
- Période : date de début, première échéance, date de fin facultative, fréquence, heures, posologie
  (quantité, unité), moment du rappel, date d'arrêt ; ordonnée par sa date de début.
- Prise : échéance couverte (jour, heure), date réelle (vide pour une oubliée ou une reportée), état
  (donnée, oubliée, reportée : TR-9), prochaine échéance fixée ; ses réglages sont ceux de sa période.
- Synchronisé (Plus), exporté (JSON complet, CSV, PDF). Schéma : [modèle de données v2](../../technical/modele-de-donnees-v2.md).
- Plus tard, une posologie différente selon l'heure (#365) demandera une posologie par heure : le
  schéma actuel n'en porte qu'une par période (décision du 2026-09-28 nuancée par la revue du modèle).

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
  première heure. (Implémentation de #453, cas ouvert 6.)
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
  lendemain. (Re-revue 2 du moteur d'échéances, #453.)

## 11. Questions ouvertes

Posées par la relecture de cohérence du 2026-09-30 (`technical/relecture-coherence-2026-09-30-1.md`),
toutes tranchées le 2026-09-30 : C1 (Q15), C2 (Q16), C5 (TR-30), C6 (TR-24), C7 (TR-13, RA-18), les
trois dernières validées en bloc.
