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

- **TR-7** La première échéance d'une période est sa première prise ; pour une période ouverte par
  « Modifier » (TR-28), c'est la dernière prise plus la nouvelle fréquence, jamais avant aujourd'hui
  (sinon aujourd'hui ; à plusieurs heures, aujourd'hui tant qu'il reste des heures du nouveau réglage
  au-delà des prises déjà notées ce jour, spec Q24 ; aujourd'hui aussi quand une dose est due
  aujourd'hui et encore sans prise, spec Q36 ; la prochaine journée quand une de ses heures a déjà
  été donnée en avance, G24), proposée dans « Prochaine dose » et modifiable (spec Q7), avec l'aide « Calculée
  d'après la dernière prise : … Modifiable. » (lot A révisé, N3). Quand ni la fréquence ni les heures
  ne changent, c'est la prochaine échéance du calendrier en cours, report compris (spec Q37), et la
  suite reste celle du calendrier en cours (G23) ; les heures d'aujourd'hui reportées à un autre
  jour y restent. Les suivantes se calculent depuis
  la **dernière ligne** plus la fréquence : date réelle d'une prise donnée, échéance d'une oubliée,
  nouvelle date d'un report (T1). En mois, le jour de référence est celui de la première échéance
  (31 janv. → 28 févr. → 31 mars), ou le dernier jour du mois quand il n'existe pas, sans dériver ; une
  prise donnée un autre jour que son échéance devient la nouvelle référence (T2). La suite ne repart
  de la date réelle que si la prise couvre la dose du moment ; une prise notée pour une échéance plus
  ancienne (dose non renseignée) ne déplace rien (TR-18, spec Q8). (Décision du 2026-09-23, point 5 ;
  spec du 2026-09-28 §3.1, §4.1 ; plan de livraison, T1 et T2)

  Gardes du moteur d'échéances (#453) :
  - **G10** À plusieurs heures, une prise donnée un autre jour que son échéance ne refixe la suite que
    si elle est la dernière heure du jour et que les autres heures de ce jour sont déjà notées.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G11** Une prise datée un intervalle ou plus avant son échéance est une **prise en plus**
    (#503, étude `technical/etude-modele-prises.md` §2.6, Q1) : rangée sous sa date réelle, elle ne
    couvre aucune échéance, n'écrit aucune ligne de décalage et **ne change jamais le calendrier** :
    les doses prévues restent toutes à leur date (décision de Gaelle du 2026-10-05). Hebdomadaire du
    vendredi, dose du 16 donnée le mercredi 7, le 9 ou le 2 : « 9 oct. 2026 · Prise en plus », la
    prochaine dose reste le 16, puis 23, 30 ; notée avant le début de la période, idem. Second « C'est
    fait » du jour d'un quotidien : prise en plus, la dose du lendemain reste à donner. Seule la fiche
    note une prise en plus : sur la feuille « À faire » et depuis une notification, un second geste du
    jour répond « déjà notée » (Q33). « Changer la date » d'une prise en plus ne va jamais sur un jour
    qui en a déjà une (jours grisés ; décochée, l'aide propose de cocher la case) ; sans dose à viser (traitement terminé ou arrêté), elle reste une
    prise en plus à la nouvelle date. À plusieurs heures par jour, une heure donnée en avance couvre son
    échéance (G10).
- **TR-8** Aucune échéance après la date de fin.

  Garde du moteur d'échéances (#506, réécrite par #536) :
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
  décalage (spec Q21, G25) ; une dose déjà donnée de la journée ne se décale jamais. Les doses non
  renseignées d'avant restent à renseigner. Sans prise dans la période, déplacer la première dose
  corrige la première échéance de la période, sans ligne « Reportée » ni « Avancée » (TR-28). (Spec
  Q2 ; revue du modèle, 2026-09-29, M4 ; lot A révisé, N5)

  Gardes du moteur d'échéances (#453) :
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
  - **G13** Quand la suite a changé depuis le déplacement, déplacer de nouveau la dose réécrit la ligne
    avec l'échéance qu'elle remplace désormais (« prévue le » peut changer) ; une ligne ne ramène
    jamais une dose à son propre jour d'origine.
    (Validée par Gaelle, points validés en bloc du 2026-10-01.)
  - **G17** Une journée n'a qu'une ligne de déplacement : la redéplacer réécrit sa ligne, même quand
    une heure y est revenue (prise supprimée) ; deux lignes pour la même journée (synchronisation) :
    la plus récente vaut, l'autre est sans effet.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G14** Un déplacement ne remplace que l'échéance qu'il vise : si la suite change sans lui (prise
    supprimée, TR-26), l'échéance qui réapparaît reste à donner ou à renseigner.
    (Validée par Gaelle, points validés en bloc du 2026-10-01.)
  - **G18** Le décalage d'une dose avancée est rangé sous son échéance d'origine, avec celui de son
    report : une prise notée un autre jour le réancre à sa date réelle ; corrigée au jour d'arrivée,
    elle le ramène à ce jour. Un décalage du jour d'arrivée reste celui de cette échéance : le calendrier
    ne dépend jamais de l'heure d'écriture des lignes, et « Annuler » rend le calendrier d'avant.
    Vendredi, dose du 16 avancée au 13 avec décalage, puis donnée le 12 : prochaine dose le 19.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G25** Une heure reportée seule ne déplace que cette heure (décision de Gaelle du 2026-10-09,
    #720) : le nouveau jour ne reçoit que les heures de la journée d'origine encore sans prise, à
    partir de la première. Vermifuge tous les 2 jours à 8 h et 20 h (1, 3, 5), 8 h du 3 donnée, 20 h
    du 3 reportée seule au 4 : le 4, seule la dose de 20 h (« Dose du jour · 4 oct. à 20 h »), puis
    le 5 à 8 h et 20 h (l'app demandait 8 h et 20 h le 4) ; rien de noté le 3, la journée reportée
    seule au 4 garde ses deux heures. Avec « Décaler aussi les doses suivantes », la même règle vaut
    (décision de Gaelle du 2026-10-09, #735) : le décalage emporte la dose reportée et toutes celles
    d'après, jamais une dose déjà donnée de la journée ; le 4, seule 20 h, puis le 6 et le 8 à 8 h
    et 20 h (l'app demandait 8 h et 20 h le 4) ; le décalage supprimé ensuite, le 4 garde 20 h seule
    et la suite revient au 5 ; rien de noté le 3, la journée part entière au 4, puis le 6. Une
    période ouverte sur ce jour par un changement de posologie (G23) le garde tel quel ; quand les
    heures changent sans changer la fréquence, le jour d'arrivée reste la prochaine dose et ne
    demande que les dernières heures du nouveau réglage, une par dose reportée, puis la grille
    reprend : heures passées à 9 h et 21 h le 3 ou le 4, le 4 à 21 h seule, puis le 5 à 9 h et 21 h
    (réponse de Gaelle du 2026-10-09) ; la dose reportée déjà donnée, le 4 n'a plus rien à donner,
    et la nouvelle période commence le 5 ; la fréquence changée, le 4 ne redemande rien non plus
    (#711). Fréquence changée le 4 même, la dose reportée pas encore donnée : le 4 ne demande que
    l'heure reportée, puis le nouveau rythme part du 4 (tous les 3 jours : 20 h le 4, puis le 7 ;
    tous les jours : le 5 ; chaque semaine : le 11 ; décision de Gaelle du 2026-10-10) ; changée le
    3, Q24 vaut : 20 h le 3, puis le 6. Plusieurs changements le 4 (une fréquence corrigée aussitôt,
    par exemple) gardent la même règle : le 4 ne demande toujours que l'heure reportée. Un report
    seul arrivé sur un jour de la grille n'y retire aucune heure : ce jour garde les siennes ;
    reporté à son tour, un jour d'arrivée n'emporte que les heures qui y étaient à donner. Une heure
    restée en arrière parce qu'elle était notée revient si sa prise est supprimée : à son jour tant
    que la période la garde, sinon au jour d'arrivée. Un traitement de tous les jours ne reporte pas
    une heure seule au lendemain : elle passerait la dose suivante (Q2 a, G19). Avec décalage,
    chaque cas ci-dessus garde sa règle pour le jour d'arrivée, et la suite repart de lui :
    posologie changée le 3 ou le 4, le 4 à 20 h seule, puis le 6 ; heures passées à 9 h et 21 h, le
    4 à 21 h seule, puis le 6 à 9 h et 21 h ; la dose reportée déjà donnée, le 4 n'a plus rien à
    donner, et la nouvelle période commence le 6 (tous les 3 jours : le 7) ; fréquence changée le 4,
    la dose reportée pas encore donnée, 20 h le 4, puis le nouveau rythme part du 4 (le 7, le 5 ou
    le 11) ; plusieurs changements le 4, toujours 20 h seule ; reportée au 5, jour de la grille, le
    5 à 20 h seule, puis le 7, car la grille repart de lui ; le 4 reporté à son tour au 5, seule 20
    h part ; tous les jours, le 4 à 20 h seule, puis le 5 à 8 h et 20 h ; la prise de 8 h du 3
    supprimée, 8 h revient le 3.
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
  ligne « Reportée au … » ou « Avancée au … » : « Changer la date », « Supprimer ce report » (la suite
  repart de la ligne précédente ; l'échéance d'origine redevient la dose du moment ou une dose non
  renseignée) ; un toast
  « Annuler » après chaque geste. Un déplacement dont la dose d'arrivée est déjà notée (donnée ou
  oubliée) fait partie de l'historique : sa ligne n'a plus « Changer la date » ni « Supprimer ce
  report » ; pour corriger, on passe par la prise elle-même (changer sa date, la supprimer) (spec
  Q25). (Existant ; P5 ; report : relecture de cohérence du 2026-09-30, validé en bloc)
- **TR-24 bis** Changer la date d'une prise qui a fixé la suite recalcule la prochaine dose qu'elle
  fixe. Une prise donnée ne se redate jamais un intervalle ou plus avant son échéance : ces jours sont
  grisés (date minimale), elle ne devient pas une prise en plus en silence (G11). Un déplacement placé après elle (ligne « Reportée au … » ou « Avancée au … ») est gardé, et le
  toast le dit (« Prise déplacée au 28 août. Prochaine dose gardée au 10 oct., que tu avais
  reportée. » · Annuler) ; s'il ne tombe plus après la prise déplacée, la suite repart de la prise, et
  le toast le dit. Une ligne verrouillée (dose d'arrivée déjà notée, spec Q25) n'est jamais retirée :
  elle reste dans l'historique, et le toast ne la mentionne pas. Une prise notée pour une dose non
  renseignée ne fixe aucune suite (TR-7, spec Q8) :
  changer sa date ne touche ni la suite ni un déplacement. (Décision du 2026-09-25, point 1,
  transposée ; plan de livraison, T3 ; points validés en bloc du 2026-10-01)

  Garde du moteur d'échéances (#453) :
  - **G12** Le déplacement gardé est réécrit pour viser la dose que fixe la prise corrigée : sa ligne
    dit alors « prévue le » avec la nouvelle échéance (prise du 5 sept. corrigée au 28 août :
    « Reportée au 10 oct. (prévue le 28 sept.) »).
    (Validée par Gaelle, points validés en bloc du 2026-10-01.)
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
    l'autre (jours grisés). Restent refusés : « Fait à une autre date » coché et « Supprimer ce
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
- **TR-25** Une correction s'applique à toutes les lignes de la même échéance, jour et heure (deux
  appareils), et devient la modification la plus récente. (Relecture, point 5)
- **TR-26** Pas de règle de « seule prise » : supprimer la seule prise garde le traitement (son
  échéance redevient la dose du moment, ou une dose non renseignée si une échéance plus récente est
  tombée, TR-13) ; « Marquer comme oubliée » est permis sur toute prise, y compris la seule donnée. Pour
  tout effacer : « Supprimer ce traitement ». (Spec Q4, 2026-09-29 ; remplace le point 4 des réponses à
  la relecture du 2026-09-28)

### 4.6 Modifier, arrêter, reprendre, supprimer

- **TR-27** Nom et type : toujours une correction. (P9)
- **TR-28** Fréquence, heures, posologie : si aucune prise (donnée, oubliée ou reportée, T4 ; une
  prise en plus ne compte pas, G11) n'a été notée depuis le début de la période, correction (les réglages sont remplacés) ; sinon, nouvelle
  période à partir d'aujourd'hui, sans question, et le nouveau réglage vaut tout de suite, y compris
  pour le reste de la journée : les prises déjà notées aujourd'hui comptent pour les premières heures
  du nouveau réglage, les heures suivantes restent à donner ; il ne reste aucune dose de l'ancien
  réglage aujourd'hui (spec Q24), sauf quand seule la posologie change : les heures d'aujourd'hui
  reportées à un autre jour y restent, et le calendrier ne change pas (G23) ; les prises passées gardent leurs réglages ; les échéances de l'ancien rythme restées sans
  prise avant aujourd'hui restent à renseigner, comme après un arrêt (TR-30). Exception au « sans
  question » : sans prise notée mais avec des échéances déjà tombées, changer la fréquence ou les
  heures pose la question à l'enregistrement (spec Q38). (P9 Q1 ; spec Q7)

  Gardes du moteur d'échéances (#453) :
  - **G1** Quand la fréquence ou les heures changent, seules comptent pour les premières heures du
    nouveau réglage les prises dont l'échéance est le jour du changement (Q24 ; une dose d'hier
    notée aujourd'hui n'en retire aucune) ou la journée entamée en avance qui ouvre la nouvelle
    période (G24). Quand ni la fréquence ni les heures ne changent : G22.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G2** Une prise notée « oubliée » compte comme une prise donnée.
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G3** Une reprise après un arrêt garde sa première prise du jour : seules comptent les prises
    notées depuis le dernier arrêt. (Garde technique, consignée au journal des décisions autonomes.)
  - **G4** Les heures couvertes sont les plus tôt du nouveau réglage, quel que soit l'ordre de saisie,
    quand les heures changent ; sinon, chaque prise couvre son heure, même si la fréquence change
    (G22, G24).
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G15** « Dose du jour » : quand rien n'est noté pour aujourd'hui et qu'une dose est due
    aujourd'hui, la nouvelle période commence par la dose du jour, que la fréquence change ou non
    (heures passées de 8 h et 20 h à 9 h et 21 h : 9 h et 21 h le jour même ; quotidien passé à tous
    les 2 jours : la dose du jour, puis le surlendemain), même si la dose suivante avait déjà été
    déplacée. (Validée par Gaelle, points validés en bloc du 2026-10-01 ; étendue à un changement de
    fréquence par la spec Q36.)
  - **G16** Pour « la dernière prise plus la nouvelle fréquence » (TR-7), une prise qui n'a pas fixé
    la suite compte par son échéance, pas par sa date réelle (spec Q8) : hebdomadaire, la dose du
    8 sept. notée le 10 alors que la dose du moment est celle du 15, fréquence passée à tous les
    10 jours le 17, première dose le 18. Quand une dose est due le jour du changement, G15 l'emporte
    (spec Q36). (Garde technique, consignée au journal des décisions autonomes.)
  - **G5** Une période précédente ne garde aucune dose à partir du début de la suivante, même si
    celle-ci commence dans le futur (cas que l'app n'écrit pas).
    (Garde technique, consignée au journal des décisions autonomes.)
  - **G22** Quand ni la fréquence ni les heures ne changent (Q37), une prise déjà notée sous l'ancien
    réglage couvre son heure dans la nouvelle période, chaque jour, pas seulement le jour du
    changement ; les autres heures restent à donner : ce que l'ancien réglage tenait pour donné le
    reste, rien de plus (une prise d'une période encore plus ancienne, à un autre rythme, ne couvre
    pas une heure qui restait à donner). Quand une heure de la prochaine journée
    d'échéance a été donnée en avance, la nouvelle période commence par cette journée, si elle est
    sur la suite en vigueur ou l'arrivée d'un report seul (G23). Métacam tous les 2 jours à
    8 h et 20 h, prochaines doses le 3 ; le 2, la dose de 8 h du 3 est donnée en avance, puis la
    posologie changée : prochaine dose le 3 à 20 h, puis le 5 ; donnée en avance à 20 h plutôt qu'à
    8 h, c'est le 8 h du 3 qui reste. Quotidien à 8 h et 20 h, le 2 : 8 h du 2 donnée, 8 h du 3
    donnée en avance, posologie changée : restent 20 h du 2, puis 20 h du 3. Une journée déjà passée
    entamée (8 h du 3 donnée, 20 h non, posologie changée le 4) garde la dernière prise plus la
    fréquence (Q37) : prochaine dose le 5, la dose de 20 h du 3 à renseigner. (#656)
  - **G23** Un report seul ne déplace que sa dose, et changer la posologie ne change jamais le
    calendrier (décision de Gaelle du 2026-10-09, #692). Quand ni la fréquence ni les heures ne
    changent, la nouvelle période commence par la prochaine dose (Q37), y compris l'arrivée d'un
    report seul, à venir ou du jour, puis suit le calendrier en vigueur après elle : vermifuge tous
    les 2 jours (1, 3, 5, 7), dose du 3 reportée seule au 4, posologie passée de ½ comprimé à 1 le
    2, le 3 ou le 4 : 4, 5, 7 ; dose du 5 avancée seule au 4 : 4, 7, 9 ; dose du 5 avancée au 4 avec
    décalage : 4, 6, 8 ; hebdomadaire, dose du 8 avancée au 6 avec décalage : 6, 13, 20 ; mensuel du
    31, dose du 28 févr. avancée seule au 25 : 25 févr., 31 mars, 30 avr. Une heure de ce jour
    donnée en avance couvre son heure (G22) : à 8 h et 20 h, dose du 3 reportée seule au 4, 8 h du 4
    donnée le 2 : 20 h du 4, puis le 5. Les heures d'aujourd'hui reportées à un autre jour, seules
    ou avec décalage, y restent, même quand une prise d'aujourd'hui est notée (TR-28, Q24 ne les
    ramène pas) : la nouvelle période commence alors par la prochaine dose. Un report seul plus
    lointain part avec l'ancienne période (§11) ; la grille, elle, reste : hebdomadaire, dose du 8
    avancée seule au 6, dose du 15 reportée seule au 17, posologie changée le 2 : 6, 15, 22. Pour
    décaler la suite, la personne déplace elle-même la dose, case cochée (TR-9). Les heures changées
    sans changer la fréquence, la règle reste (décision de Gaelle du 2026-10-09, #737) : la journée
    reportée seule garde son jour d'arrivée, dans les nouvelles heures, puis la suite reprend le
    calendrier. Tous les 2 jours (1, 3, 5) à 8 h et 20 h, rien de noté le 3, la journée reportée
    seule au 4, heures passées à 9 h et 21 h le 3 ou le 4 : le 4 à 9 h et 21 h, puis le 5 et le 7
    (l'app donnait 4, 6, 8) ; à 9 h seule : le 4, le 5, le 7 à 9 h ; hebdomadaire (1, 8, 15),
    journée du 8 reportée seule au 10 : 10, 15, 22 ; mensuel du 1er, journée du 1er nov. reportée
    seule au 3 : 3 nov., 1er déc., 1er janv. Les prises déjà notées le jour d'arrivée comptent pour
    les premières heures du nouveau réglage (Q24) : 8 h du 4 donnée, heures passées le 4 à 9 h et
    21 h, il reste 21 h le 4, puis le 5 ; à 9 h seule, plus rien le 4, puis le 5 ; les deux doses du
    4 données, le 5 ; 8 h du 4 donnée en avance le 3, heures changées le 3, de même (G24). La fréquence changée, le nouveau rythme part du jour d'arrivée, comme pour une
    heure reportée seule (G25) : tous les 3 jours, 4 puis 7 ; tous les jours, 4 puis 5 ; chaque
    semaine, 4 puis 11. Une posologie changée après un jour d'arrivée entamé suit aussi le
    calendrier : tous les 3 jours (1, 4, 7) à 8 h et 20 h, journée du 4 reportée seule au 5 (ou
    avancée seule au 3), 8 h donnée ce jour-là, posologie changée le lendemain : prochaine dose le 7
    (l'app proposait le 8, ou le 6), la dose de 20 h restant à renseigner.
  - **G24** Une dose déjà donnée compte : quand la fréquence ou les heures changent et qu'une heure
    de la prochaine journée d'échéance a déjà été donnée en avance, la nouvelle période commence par
    cette journée, ses prises comptent pour les premières heures du nouveau réglage (G4), et le
    nouveau réglage s'applique à partir de la dose suivante pas encore donnée (décision de Gaelle du
    2026-10-09, #711). Métacam tous les 2 jours à 8 h et 20 h, prochaine journée le 3, 8 h du 3
    donnée le 2 : heures passées le 2 à 9 h et 21 h, il ne reste que 21 h le 3, puis le 5 à 9 h et
    21 h ; fréquence passée à tous les 3 jours, il reste 20 h le 3, puis le 6. « Prochaine dose »
    propose le 3, avec l'aide « Prochaine dose prévue : 3 oct. Modifiable. » ; une autre date
    choisie, les prises du 3 ne comptent plus. La journée n'ouvre pas la période quand ses prises
    couvrent déjà toutes les heures du nouveau réglage (la dernière prise plus la nouvelle
    fréquence, TR-7 : heure passée à 9 h seule, prochaine dose le 5), ni quand une de ses prises a
    décalé la suite : la journée compte alors entière à la date réelle de la prise (Q8), et aucune
    de ses prises ne couvre la nouvelle période. Tous les 3 jours à 9 h, dose du 4 donnée le 2 avec
    décalage, passage à tous les 2 jours le 3 : prochaine dose le 4 ; tous les 3 jours à 8 h et
    20 h, les deux doses du 4 données le 2, le 20 h avec décalage, passage à tous les 2 jours le 3 :
    le 4 à 8 h et 20 h. Une journée ouverte ainsi garde ce rôle si le décalage est supprimé plus
    tard. Des prises notées aujourd'hui font partir la nouvelle période d'aujourd'hui (Q24).
- **TR-29** Un autre produit est un nouveau traitement : arrêter l'ancien, créer le nouveau. (P9 Q2)
- **TR-30** « Arrêter » : dialogue qui propose de renseigner les doses non renseignées (« Toutes
  données », « Choisir les jours », « Arrêter sans renseigner ») ; « Arrêté le … », plus aucune
  échéance ni rappel ; les doses non renseignées d'avant l'arrêt restent à renseigner, y compris une
  dose en retard depuis plusieurs jours, que le dialogue compte avec les autres (relecture de cohérence du 2026-09-30, validé en bloc) ; « Annuler ».
  La dose du jour non notée est retirée par l'arrêt ; quand elle existe, le dialogue le dit : « La dose
  d'aujourd'hui n'est pas notée : si tu l'as donnée, touche « C'est fait » avant d'arrêter. » (Spec Q9)
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

## 11. Questions ouvertes

Posées par la relecture de cohérence du 2026-09-30 (`technical/relecture-coherence-2026-09-30-1.md`),
toutes tranchées le 2026-09-30 : C1 (Q15), C2 (Q16), C5 (TR-30), C6 (TR-24), C7 (TR-13, RA-18), les
trois dernières validées en bloc.

Limites connues du moteur d'échéances, renvoyées à #488 (la ligne d'une prise ne disait pas si elle
avait fixé la suite ; revue du 2026-10-02). Fermées par la ligne de décalage et le jour de référence
de la période (#502, étude `technical/etude-modele-prises.md` §2.6) : la dose non renseignée redatée
(dose du moment au 15), la dose du moment notée par erreur puis corrigée (17), les départs les 29, 30
et 31 (30 oct., 30 nov.) et le jour borné repris par Q37 (31 mars, 30 avr.). La date de fin qui
faisait sauter une dose après une prise en retard est fermée par la case et son avertissement (G20, #536).
La journée à venir entamée en avance, dont les heures restantes n'étaient plus demandées après un
changement de posologie, est fermée par G22 (#656). La prochaine dose reportée seule, après laquelle
la suite glissait d'un jour à un changement de posologie (4, 6, 8 au lieu de 4, 5, 7), est fermée par
G23 (#692). Reste :

- Un changement de posologie ne garde, au-delà de la prochaine dose, qu'une suite décalée. Un report
  seul plus lointain part avec l'ancienne période (G5) : hebdomadaire (1, 8, 15, 22), dose du 15
  reportée seule au 17, posologie changée le 2 : 8, 15, 22, au lieu de 8, 17, 22 (avec décalage, 8,
  17, 24 est gardé). Un report plus lointain encore, même décalé, part aussi. Le garder demande de
  rattacher ses lignes à la nouvelle période.
- Heures ou fréquence changées alors qu'il reste des doses à donner aujourd'hui et que la journée
  d'échéance suivante est déjà entamée en avance : la nouvelle période part d'aujourd'hui (Q24), et
  la prise en avance ne compte pas pour la journée suivante, qui redemande toutes ses heures si elle
  tombe dans le nouveau rythme (#721).
- Heures ou fréquence changées avant le début du traitement, quand toute la première journée a déjà
  été donnée en avance, la dernière dose avec décalage : la nouvelle période commence ce jour-là et
  ses prises la couvrent (Q24), au lieu de compter à leur date réelle (Q8). Mensuel à 8 h, 14 h et
  20 h commençant le 25, les trois doses du 25 données les 23 et 24, la dernière avec décalage ;
  le 24, passage à tous les jours à 20 h : prochaine dose le 26 au lieu du 25.
- Des prises données en avance pour une journée d'une période que d'autres ont remplacée depuis
  comptent encore pour cette journée si une nouvelle période la reprend comme jour du changement
  (Q24) : tous les jours à 6 h, 12 h, 18 h et 23 h, puis toutes les 6 semaines à 8 h et 20 h avec le
  30 mars donné en avance, puis toutes les 2 semaines ; le 30 mars, passage à tous les 2 jours :
  prochaine dose le 1er avr. au lieu du 30 mars (#721).
- Un calendrier de départ dont deux journées se suivent de plus près que la fréquence, puis hors
  rythme (plusieurs déplacements combinés), ne se reprend pas tel quel : toutes les 6 semaines,
  3 mai, 5 mai, 14 juin, posologie changée : 3 mai, 5 mai, 16 juin.
- Mensuel du 30 ou du 31 dont la dose qui suit la prochaine tombe sur un jour borné : dose du
  30 janv. reportée seule au 4 févr., posologie changée : 4 févr., 28 févr., puis le 28 de chaque
  mois (28 mars, 28 avr.) au lieu du 30 (30 mars, 30 avr.).
