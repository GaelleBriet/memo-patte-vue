---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Accueil et « À faire » (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md) (4 : l'action du moment d'abord ;
6 : pas de bruit), parcours 1, 4, 5, 10, 12, 13, matrice des fonctionnalités ; specs
[traitements](traitements.md), [vaccins](vaccins.md), [rappels](rappels.md) ; accueil existant (#36,
#344, #339, décisions du 2026-09-23). Une règle marquée **(à valider)** renvoie à une question
ouverte.

## 1. Problème

L'accueil est le différenciant n° 2 : voir d'un coup d'œil ce qui est à faire pour tous les animaux
(besoin 2). Il doit montrer l'action du moment sans bruit, y compris les doses à renseigner, et rester
lisible quand plusieurs informations se disputent la place (rappels désactivés, sauvegarde, invitations).

## 2. Objectifs

1. En ouvrant l'app, Sophie voit ce qu'elle doit faire aujourd'hui pour tous ses animaux, dans le bon
   ordre, et le fait en deux gestes par soin.
2. Rien d'important n'est caché (principe 3), rien d'inutile n'est montré (principe 6).

**Hors objectifs** : tableau de bord statistique ; calendrier mensuel ; fil d'actualité.

## 3. Règles

### 3.1 États de l'accueil

- **AC-1** Aucun animal : accueil de bienvenue — « Bienvenue sur MémoPatte · Le carnet de santé de tes
  animaux, toujours à jour », la ligne « Ton carnet reste sur ton téléphone. Gratuit, sans compte. »,
  « Créer mon premier animal », « Importer un export MémoPatte », le lien discret « J'ai déjà MémoPatte
  Plus · Retrouver mon carnet », et l'icône Paramètres. (Existant ; P1 Q1, Q2 ; G3)
- **AC-2** Des animaux suivis : en-tête (« Ton foyer », icône Paramètres toujours visible, icône de
  nuage pour les abonnés Plus), sélecteur d'animaux, « À faire », actions rapides. (Existant ; P12 Q2 ;
  G3)
- **AC-3** Tous les animaux ne sont plus suivis : pas de « À faire » ; « Aucun soin à venir », « Tu ne
  suis plus aucun animal. Leurs carnets restent consultables. » (pour un seul animal : « Son carnet reste
  consultable. »), « Ajouter un animal », et le chemin vers « Animaux que tu ne suis plus ». (P10 ; lot B
  révisé, validé en bloc)

### 3.2 « À faire »

- **AC-4** Regroupe tous les animaux suivis ; le sélecteur d'animaux filtre (« Milo · 1 soin »).
  (Existant)
- **AC-5** Contient : les soins en retard, ceux du jour, ceux des 29 jours suivants (fenêtre de 30 jours,
  aujourd'hui compris) ; **tout traitement qui a des doses à renseigner**, en cours (même si sa prochaine dose est hors de la
  fenêtre), fini ou arrêté. (Existant, #344 ; P5 Q1 ; P9 Q3 ; spec Q2)
- **AC-6** Ordre : retards (du plus ancien), aujourd'hui (les soins sans heure en tête, puis par heure),
  jours suivants (par date), puis « À renseigner » (spec Q6). (Existant ; P4 ; P5 Q1)
- **AC-7** Une ligne par soin ; pour un traitement à plusieurs heures, une ligne par prise du jour
  (« · 8 h », « · 20 h »), et une seule ligne au-delà d'aujourd'hui. (P4 Q1)
- **AC-8** Chaque ligne : le soin, le type et l'animal, un badge (« En retard · 6 j », « Aujourd'hui »,
  « Aujourd'hui · 20 h », « Demain », « Dans 12 jours », « Prévu le 5 oct. » pour un vaccin jamais fait,
  « Aujourd'hui » le jour d'un vaccin prévu ; « À renseigner » neutre sur chaque ligne du groupe « À
  renseigner »). Seconde ligne : « type · animal » (« Vermifuge · Milo », « Premier vaccin · Pixel »
  pour un vaccin prévu), jamais la posologie ; une ligne du groupe « À renseigner » ajoute « N doses non
  renseignées ». Un traitement en cours qui a des doses à renseigner garde ses lignes de dose et apparaît
  aussi dans le groupe « À renseigner » (spec Q4) ; fini ou arrêté, il n'y a que cette ligne. (Existant ;
  P5 ; spec Vaccins Q1 bis ; relecture du lot B, questions 1 et 5 ; maquette V16)
- **AC-9** Toucher une ligne ouvre la feuille du soin : « Fait aujourd'hui », « Fait à une autre date »,
  « Modifier », « Arrêter » (traitement) ; et le bandeau compact des doses non renseignées. Pour une ligne
  « À renseigner », la feuille propose directement « Toutes données » et « Choisir les jours » (une
  seule dose : « Donnée » / « Oubliée ») ; son nom TalkBack finit par « Ouvre les actions. ». (Existant ;
  planche Q6 ; spec Traitements TR-15 ; lot A, révision 2)
- **AC-10** Compteur « N soins en retard » (spec Q5) : seulement les soins en retard (doses du moment des
  traitements, vaccins) ; jamais les doses non renseignées ni les « À renseigner ». (P5 ; spec
  Traitements TR-14)
- **AC-11** Rien dans « À faire » (ni soin dans la fenêtre, ni ligne « À renseigner ») : « Tout est à
  jour », avec « Prochain soin : Milbemax le 10 oct. » s'il en existe un plus loin, sinon « Aucun soin à
  venir » et « Ajouter un vaccin ou un traitement ». (Existant, #344 ; spec Q2)
- **AC-12** Pas de « Tout est fait » en v1. (P4 Q2)

### 3.3 Messages de l'accueil

- **AC-13** Bandeau « Les rappels sont désactivés », tant que les notifications sont refusées (bouton
  « Activer dans les réglages ») ou après « Plus tard » sur l'écran d'explication, Android n'ayant encore
  rien demandé (bouton « Activer les rappels », qui ouvre l'écran d'explication puis la demande
  d'Android, comme Paramètres › Rappels : spec Rappels RA-21, RA-22 ; parcours 1, variante 1 ; relecture de cohérence du 2026-09-30, validé en bloc),
  avec le lien « Je ne reçois pas mes rappels » ; **on peut le fermer**, et il
  revient au prochain soin enregistré. L'état reste visible en permanence dans Paramètres › Rappels.
  (Existant ; spec Rappels ; spec Q3)
- **AC-14** Carte unique après le premier soin enregistré : « Ton carnet est sur ce téléphone. Voici
  comment le protéger », vers Paramètres › Sauvegarde ; fermée d'un geste (ou par « Voir comment »), ne
  revient pas. Jamais pour un abonné Plus. (P1 Q1 ; relecture du lot B, validé en bloc)
- **AC-15** Carte trimestrielle pour les gratuits : « Ton carnet n'existe que sur ce téléphone. Mets une
  copie à l'abri. », « Exporter une copie » (même geste et même nom que dans Sauvegarde, spec Données
  Q6 ; relecture de cohérence du 2026-09-30, validé en bloc), « Découvrir Plus », « Ne plus me le proposer » ; absente si
  un export a été partagé depuis moins de 3 mois. Une croix la cache jusqu'au trimestre suivant ;
  « Ne plus me le proposer » est la sortie définitive. Jamais pour un abonné Plus. (P13 Q1 ; relecture du
  lot B, validé en bloc)
- **AC-16** Icône de nuage (abonnés Plus) : discrète quand tout va bien, en alerte en cas de problème
  (aucune synchronisation réussie depuis 7 jours, session expirée), avec une pastille du rôle d'alerte
  système (`warning-container` #FFE8C2, lisible sur le pétrole), jamais la couleur des retards ; elle
  ouvre Paramètres › Sauvegarde. (P12 Q2 ; G4 bis ; relecture du lot B, validé en bloc ; lot B révisé)
- **AC-17** Au plus un message à la fois sur l'accueil, par priorité : (1) « Les rappels sont
  désactivés », (2) la carte « Voici comment protéger ton carnet », (3) la carte trimestrielle ; les
  suivants attendent que le premier soit réglé ou fermé. L'icône de nuage, dans l'en-tête, n'entre pas
  dans ce compte. Place : le bandeau au-dessus d'« À faire », les cartes sous « À faire », avant
  « Actions rapides ». (Spec Q1, 2026-09-29 ; relecture du lot B, validé en bloc)
- **AC-18** Les invitations vers Plus (première photo, carnet qui s'étoffe, premier export) restent hors
  de l'accueil ; seule la carte trimestrielle (AC-15) y propose « Découvrir Plus », en second. (Existant,
  décision du 2026-09-16 ; P13 Q1)

### 3.4 Actions rapides

- **AC-19** « Nouveau traitement », « Rappel de vaccin », « Ajouter un poids », avec le choix de l'animal
  s'il y en a plusieurs. (Existant, #37)

## 4. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** Milo en retard de 2 jours, Luna aujourd'hui à 21 h, Pixel dans 3 jours, **quand**
   Sophie ouvre l'accueil, **alors** l'ordre est Milo, Luna, Pixel, et le compteur dit « 1 soin en
   retard ».
2. **Étant donné** un traitement fini avec 2 doses non renseignées, **quand** l'accueil s'affiche,
   **alors** il apparaît après les soins à faire, avec « À renseigner » et « 2 doses non renseignées »,
   hors du compteur.
3. **Étant donné** un médicament à 8 h et 20 h, **quand** Sophie note la prise de 8 h, **alors** la
   ligne de 8 h disparaît et celle de 20 h reste.
4. **Étant donné** aucun animal, **quand** l'app s'ouvre, **alors** l'accueil de bienvenue montre
   l'icône Paramètres et le lien « J'ai déjà MémoPatte Plus ».
5. **Étant donné** un gratuit dont le dernier export partagé date de moins de 3 mois, **quand**
   l'accueil s'affiche, **alors** la carte « Mets une copie à l'abri » n'apparaît pas.

## 5. Décisions de la spec

- 2026-09-29 — **Q1 : au plus un message à la fois sur l'accueil, par priorité** (AC-17). Raison :
  « À faire » reste visible en haut (principe 4), le plus important passe en premier (principe 6).
  Écartée : tous les messages empilés (« À faire » peut sortir de l'écran).

- 2026-09-29 — **Q2 : tout traitement qui a des doses à renseigner apparaît dans « À faire »**, groupe
  « À renseigner », même si sa prochaine dose est hors de la fenêtre de 30 jours (AC-5) ; hors du
  compteur de retards. Raison : l'accueil ne dit jamais « Tout est à jour » quand des doses restent à
  renseigner (principes 1 et 3), même règle que pour un traitement fini ou arrêté. Écarté : le bandeau de
  la fiche seul. (Relecture de cohérence des specs, question A.)

- 2026-09-29 — **Q3 : le bandeau « Les rappels sont désactivés » se ferme**, et revient au prochain soin
  enregistré (AC-13) ; une fois fermé, les cartes sur la sauvegarde peuvent s'afficher. Raison : refuser
  les notifications est un choix légitime ; un bandeau à vie serait du bruit (principe 6) et cacherait
  la sauvegarde (principe 3). Écarté : le bandeau permanent. (Relecture de cohérence des specs,
  question C.)

- 2026-09-29 — **Q4 : un traitement en cours qui a des doses à renseigner garde ses lignes de dose et
  apparaît aussi dans « À renseigner »** (AC-8, spec Traitements TR-36). Raison : « À renseigner » est le
  seul endroit de ce qui reste à remplir ; avec deux heures, pas de choix à faire entre 8 h et 20 h pour
  une seconde ligne. Écartée : une seconde ligne « N doses non renseignées » sous la ligne de la dose
  (ambiguë à plusieurs heures). (Relecture du lot B, question 1.)
- 2026-09-29 — **Relecture du lot B, points validés en bloc** : seconde ligne « type · animal » ;
  croix sur la carte trimestrielle ; bandeau au-dessus d'« À faire », cartes en dessous ; pas de carte 2
  ni 3 pour un abonné, « Voir comment » ferme la carte 2, pastille `warning` ; badge « Aujourd'hui » pour
  un vaccin prévu le jour même. (`technical/relecture-maquettes-lot-B.md`.)

- 2026-09-29 — **Q5 : « soin » sur l'accueil** pour ce qui est à faire : « 6 soins », « 1 soin en
  retard », « Milo · 1 soin », « Aucun soin à venir », « Prochain soin : … » ; le compteur n'inclut jamais
  « À renseigner ». « Rappel » garde ses deux autres sens (l'alerte, le rappel d'un vaccin). Anglais
  inchangé (« reminders »), sans double sens. Raison : « soin » est le mot des specs ; on retire un
  triple sens. Écartée : garder « rappels » (texte actuel). (Relecture du lot B, question 6 ; suite de
  Rappels Q5.)

- 2026-09-30 — **Q6 : un soin du jour sans heure passe en tête des soins du jour** (AC-6), vaccin
  prévu comme traitement sans heure. Raison : il se fait « dans la journée » et ne se perd pas sous les
  prises à heure fixe. Écartée : le ranger à l'heure des rappels de vaccins (un réglage de notification
  n'est pas l'heure du soin). (Vérification du lot B révisé, U2.)

- 2026-09-30 — **Lot B révisé, points validés en bloc** : plus aucun animal suivi : « Aucun soin à
  venir », « Tu ne suis plus aucun animal. Leurs carnets restent consultables. » (au singulier « Son
  carnet reste consultable. »), « Ajouter un animal » (AC-3) ; pastille du nuage en `warning-container`
  #FFE8C2 (contraste suffisant sur le pétrole, AC-16) ; TalkBack de la croix de la carte trimestrielle
  « Masquer jusqu'au prochain trimestre » ; le bandeau garde « Activer dans les réglages » et ajoute
  « Je ne reçois pas mes rappels » (AC-13). (`technical/relecture-maquettes-lot-B-rev1.md`.)

## 6. Questions ouvertes

Posées par la relecture de cohérence du 2026-09-30 (`technical/relecture-coherence-2026-09-30-1.md`),
toutes tranchées : C1 (spec Traitements Q15), C4 (AC-13, validé en bloc).
