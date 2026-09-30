---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Rappels et notifications (brouillon du 2026-09-29)

Suivi : cadrage produit. Sources : [principes](../principes.md) (3 : un rappel ne se perd pas ; 6 :
pas de bruit), parcours 1, 3, 4, 6, 11, 14 ; `technical/analyse-programmation-rappels.md`,
`technical/recherche-permissions-rappels.md` ; ticket #447 (modèle de Gaelle du 2026-09-28) ; spec
[traitements](traitements.md). Une règle marquée **(à valider)** renvoie à une question ouverte.

## 1. Problème

Le rappel est le différenciant n° 1 : Sophie (P1) veut ne plus y penser. Aujourd'hui, les rappels
sonnent tous à 9 h, s'arrêtent en silence au bout de 60 jours sans ouvrir l'app, ignorent l'heure à
laquelle un traitement se donne, et une notification touchée n'ouvre rien de précis.

## 2. Objectifs

1. Chaque échéance est rappelée au bon moment, hors ligne, sans action de Sophie (principe 3).
2. Une notification correspond à une action utile, jamais au bruit (principe 6).
3. Noter un soin depuis la notification prend un geste.
4. Sophie sait toujours ce qui empêche ses rappels, et comment y remédier.

**Hors objectifs** : notifications envoyées par un serveur ; rappels par e-mail ou SMS ; plusieurs prises
par jour gérées au-delà d'une notification par heure (#365, plus tard) ; alarme sonore de réveil.

## 3. Vocabulaire

| Terme | Sens |
| --- | --- |
| **Rappel** | Une notification locale programmée pour une échéance (spec Traitements, vaccins). Sur l'accueil, ce qui est à faire s'appelle un « soin » (« 1 soin en retard », spec Accueil Q5). |
| **Moment du rappel** | Quand il sonne : relatif à l'heure du traitement (« À l'heure », « 1 h avant »…) ou à une heure choisie le jour même. |
| **Prévenance** | Le rappel avant l'échéance : 2 semaines pour un vaccin, 3 jours pour un traitement. Mot des specs, jamais affiché dans l'app (relecture du lot C, QC-11). |
| **Relance** | Le rappel 3 jours après une échéance non notée. |
| **Rappels précis** | Option qui demande à Android des alarmes exactes (`SCHEDULE_EXACT_ALARM`). Sans elle, les alarmes sont inexactes : jamais avant l'heure, en général dans les minutes qui suivent, au plus une heure après (davantage en économie de batterie ou en veille profonde). |
| **Relais** | Texte ajouté au dernier rappel programmé d'un soin : « Pour continuer à recevoir les rappels de Pixel, ouvre MémoPatte ». |

## 4. Règles

### 4.1 Quels rappels pour une échéance

- **RA-1** Le jour même : un rappel à chaque échéance (pour un traitement à plusieurs heures, un rappel
  par heure). (P3 R1 ; P7 Q2)
- **RA-2** Prévenance : 2 semaines avant pour un vaccin (« Le 5 oct. Pense à prendre rendez-vous chez
  le vétérinaire. »), 3 jours avant pour un traitement (« Vérifie qu'il te reste une dose »). Réglage
  général « Me prévenir avant l'échéance » (oui par défaut) dans Paramètres › Rappels. (P3 Q2 ; P6 Q1 ;
  relecture du lot A, QA-17)
- **RA-3** Relance 3 jours après une échéance non notée, puis plus rien pour cette échéance ; non
  réglable. (Décision du 2026-09-15 ; P3 Q2)
- **RA-4** Prévenance et relance ne sont pas programmées quand elles tomberaient sur l'échéance voisine
  ou au-delà (rythmes de 1 à 3 jours : le jour même seul). (Existant, `dueReminders`)
- **RA-5** Pour un traitement à plusieurs heures : une seule prévenance par jour d'échéance, à l'heure
  de la première prise (« Médicament de Luna dans 3 jours, à 8 h et 20 h ») ; une seule relance, si
  aucune prise de ce jour n'est notée. (Spec Q2, 2026-09-29)
- **RA-6** Aucun rappel pour une dose non renseignée, après la date de fin, pour un traitement arrêté,
  ou pour un animal qu'on ne suit plus. (Spec Traitements TR-14 ; P10)

### 4.2 Moment du rappel

- **RA-7** Traitement avec une heure : « À l'heure », « 1 h avant » ; avec les rappels précis actifs,
  aussi « 15 min avant » et « 30 min avant ». (#447 ; P3 Q3)
- **RA-8** Traitement sans heure : une heure au choix le jour même, 9 h par défaut. (#447)
- **RA-9** Vaccins : une seule heure pour tous, réglable dans Paramètres › Rappels (« Heure des rappels
  de vaccins : 9 h »). (Spec Q1, 2026-09-29)
- **RA-10** L'heure suit le lieu où est le téléphone (comme un réveil) ; les rappels sont recalculés à
  chaque ouverture de l'app ; après un changement de fuseau, ils gardent l'heure de départ jusqu'à la
  prochaine ouverture. (P11 Q1)

### 4.3 Programmation

- **RA-11** Les rappels les plus proches sont programmés jusqu'au plafond de 400 (Android plante au-delà
  de 500 alarmes par app) ; la prochaine échéance de chaque soin est toujours programmée, quelle que
  soit sa distance ; **plus de fenêtre de 60 jours**. Le nombre de rappels programmés par soin est
  plafonné (valeur fixée à la mesure sur téléphone), le relais prend la suite (T7). (P3 Q4)
- **RA-12** Le dernier rappel programmé de chaque soin porte le relais (une ligne ajoutée à son texte,
  jamais une notification à part) ; ouvrir l'app reprogramme la suite. Pas de relais quand toutes les
  échéances restantes du soin sont programmées (date de fin proche). (P3 Q4 ; relecture du lot A, QA-13)
- **RA-13** Tout geste qui change une échéance (noter, renseigner, modifier, reporter, arrêter,
  reprendre, supprimer, ne plus suivre, restaurer, importer, synchroniser) reprogramme les rappels du
  soin ; à chaque ouverture de l'app, tout est recalculé. (Existant ; P3 R3)
- **RA-14** Au redémarrage du téléphone, les rappels manqués pendant qu'il était éteint sonnent
  aussitôt, les suivants sont reprogrammés. (Vérifié dans le plugin)

### 4.4 Contenu et gestes d'une notification

- **RA-15** Le texte dit l'animal, le soin, et le moment à l'heure absolue, vrai même s'il arrive en
  retard : « Panacur de Pixel à 20 h · ½ comprimé » ; jamais « dans 30 minutes ». (P3 R5 ; P7 Q1)
- **RA-16** Un soin, un moment, une notification ; trois soins à 9 h = trois notifications. (P3 R1)
- **RA-17** Toucher la notification ouvre l'app sur la feuille du soin. (#384 ; P3)
- **RA-18** Bouton « C'est fait » sur le rappel du jour même et sur la relance, pas sur la prévenance.
  Pour un traitement : si l'échéance de la notification tombe aujourd'hui, note sa prise, datée
  d'aujourd'hui ; sinon (notification d'un jour passé, relance), demande « Donnée quand ? » (spec
  Traitements TR-20, T5), puis « À quelle heure ? » quand la relance vise un jour à plusieurs heures
  (TR-23 bis ; relecture de cohérence du 2026-09-30, validé en bloc). Pour un vaccin : ouvre la feuille du vaccin (date, prochain rappel). Après une
  prise notée depuis la notification, l'app s'ouvre sur l'accueil et affiche le message avec
  « Annuler », même si elle était fermée ; « Donnée quand ? » s'ouvre aussi sur l'accueil. (#384 ; P3 Q1
  et R6 ; relecture du lot A, QA-8)
- **RA-19** Une échéance notée, sur ce téléphone ou (Plus) sur un autre après synchronisation, retire
  ses notifications du volet. (P3 R3 ; P14)
- **RA-20** Deux appareils Plus : un rappel peut sonner sur un appareil pas encore à jour ; accepté en
  v1 ; « C'est fait » y note une seconde ligne que l'affichage fusionne. (P14 Q2)

### 4.5 Autorisations

- **RA-21** Jamais d'autorisation demandée d'office avant d'avoir un soin. Dès que le carnet a un soin à
  venir et que l'autorisation n'a jamais été demandée sur ce téléphone : écran d'explication « Ne rate
  plus aucun rappel », une seule fois, puis la demande d'Android. Ce moment arrive après le premier soin
  enregistré, juste après un import ou une restauration, ou au démarrage quand Android a transféré le
  carnet. Sous-titre sans accord : « Active les notifications pour recevoir à temps les rappels des
  vaccins et traitements de tes animaux. » Après un import ou une restauration, le même écran (planche
  B · V18 ter) ; la variante « Ton carnet est prêt » (C · V26 quater) est abandonnée (relecture de cohérence du 2026-09-30, validé en bloc).
  Le premier avantage de l'écran nomme l'animal et le type du
  prochain soin à venir (« On te prévient avant le rappel de traitement de Luna »). Tant qu'Android n'a
  jamais demandé l'autorisation (écran pas encore vu, ou « Plus tard »), Paramètres › Rappels propose
  aussi « Activer les rappels », qui ouvre le même écran. (P1 ; existant ; spec Q4 ; vérification du lot B révisé, correction 9 et U1 ;
  relecture du lot C, QC-5) L'écran précède toujours la demande d'Android (deux refus et Android ne la
  montre plus).
- **RA-22** Notifications refusées : bandeau « Les rappels sont désactivés · Activer dans les
  réglages » sur l'accueil (qu'on peut fermer, et qui revient au prochain soin enregistré : spec
  Accueil, AC-13), et l'état en permanence dans Paramètres › Rappels, avec le même lien. Après « Plus
  tard » sur l'écran d'explication, le bandeau s'affiche aussi (parcours 1, variante 1) ; Android
  n'ayant jamais demandé, son bouton est « Activer les rappels », comme dans Paramètres › Rappels
  (RA-21, §5) ; « Activer dans les réglages » seulement après un refus. (Existant ; P3 R8 ; relecture de cohérence du 2026-09-30, validé en bloc)
- **RA-23** Rappels précis : dans Paramètres › Rappels, « Rappels précis » (seul nom de l'option, spec
  Q5), qui explique puis ouvre l'écran d'Android « Alarmes et rappels » ; une seule suggestion en
  contexte, « Pour un rappel à l'heure pile, active les rappels précis », la première fois qu'un
  traitement reçoit une heure alors que les notifications sont autorisées (relecture du lot A, QA-4 ;
  tournure neutre, spec Traitements Q12) ; jamais au démarrage. L'app revérifie l'autorisation à chaque
  retour au premier plan ; retirée, les rappels passent en alarmes inexactes **sans changer les choix de
  Sophie** (« 15 min avant » reste « 15 min avant ») ; Paramètres › Rappels et le choix du rappel dans
  le formulaire affichent « Moins précis : les rappels précis sont désactivés », avec le lien pour les
  réactiver ; la fiche d'un traitement à heure(s) ajoute alors, sous les heures, une ligne discrète
  « Rappel 30 min avant · moins précis » avec « Réactiver » (spec Q6) ; réactivés, tout redevient
  précis sans rien ressaisir. (P3 Q3 ; recherche ; spec Q3, 2026-09-29)
- **RA-24** Lien « Je ne reçois pas mes rappels » vers la page Aide du site, depuis Paramètres › Rappels
  et le bandeau. (Décision du 2026-09-29)

## 5. Paramètres › Rappels (contenu)

- État des notifications : autorisées ; désactivées, avec le lien vers les réglages d'Android ; jamais
  demandées par Android (« Pas encore activés »), avec « Activer les rappels », qui ouvre l'écran
  d'explication puis la demande d'Android (RA-21 ; relecture du lot C, QC-5).
- « Rappels précis » (activé / désactivé, avec l'état réel de l'autorisation ; « Moins précis » et
  « Réactiver » quand il a été retiré, RA-23).
- « Me prévenir avant l'échéance » (oui / non).
- « Heure des rappels de vaccins » (9 h par défaut).
- « Je ne reçois pas mes rappels » (page Aide).

## 6. Données (besoins)

- Par période de traitement : heure(s), moment du rappel.
- Réglages du carnet, en base, synchronisés et exportés : heure des rappels de vaccins, « Me prévenir
  avant l'échéance » (CLAUDE.md : ce qui sert à reprogrammer les notifications est persisté).
- Réglages de l'appareil, non synchronisés : rappels précis (autorisation propre à l'appareil),
  réponse à l'écran d'explication, bandeau « Les rappels sont désactivés » fermé (modèle, M8).
- Rien d'autre : les rappels se reconstruisent toujours depuis le carnet.

## 7. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** un traitement quotidien à 20 h, rappel « À l'heure », **quand** 20 h arrive,
   **alors** une notification « Panacur de Pixel à 20 h · ½ comprimé » avec « C'est fait » sonne, sans
   prévenance ni relance.
2. **Étant donné** un vermifuge tous les 3 mois sans heure, **quand** l'échéance approche, **alors**
   un rappel sonne 3 jours avant à 9 h (sans bouton), le jour même à 9 h (avec « C'est fait »), et 3 jours
   après s'il n'est pas noté.
3. **Étant donné** un vaccin, **quand** l'échéance approche, **alors** la prévenance sonne 2 semaines
   avant ; **et si** « Me prévenir avant l'échéance » est coupé, **alors** elle ne sonne pas.
4. **Étant donné** un traitement quotidien sans fin et l'app jamais rouverte, **quand** les rappels
   programmés s'épuisent, **alors** le dernier porte le relais, et ouvrir l'app reprogramme la suite.
5. **Étant donné** 400 rappels déjà programmés, **quand** un nouveau soin est ajouté, **alors** les
   400 plus proches sont gardés, la prochaine échéance de chaque soin comprise, et l'app ne plante pas.
6. **Étant donné** une notification de la veille, **quand** Sophie touche « C'est fait », **alors**
   l'app demande « Donnée quand ? ».
7. **Étant donné** une échéance notée sur le téléphone, **quand** la tablette se synchronise, **alors**
   la notification de cette échéance disparaît de son volet.
8. **Étant donné** les notifications refusées, **quand** Sophie ouvre l'accueil (bandeau pas encore
   fermé) ou Paramètres › Rappels, **alors** elle voit qu'ils sont désactivés et un lien vers les
   réglages.
9. **Étant donné** les rappels précis retirés dans les réglages d'Android et un rappel « 15 min avant »,
   **quand** Sophie revient dans l'app, **alors** le choix reste « 15 min avant », les rappels passent
   en inexact, et Paramètres comme la fiche affichent « Moins précis ».
10. **Étant donné** un voyage à une heure de décalage, **quand** Sophie ouvre l'app sur place,
    **alors** les rappels sonnent à l'heure locale.

## 8. Indicateurs

- Part des prises notées depuis une notification (le rappel sert à agir).
- Part des installations avec notifications autorisées après l'écran d'explication.
- Pendant le test : des rappels arrivent-ils trop tard sans les rappels précis ?

## 9. Décisions de la spec

- 2026-09-29 — **Q1 : une seule heure pour les rappels de vaccins, réglable dans Paramètres › Rappels**,
  9 h par défaut (RA-9). Raison : un vaccin se fait chez le vétérinaire, le rappel sert à prendre
  rendez-vous ; un réglage unique suffit. Écartées : 9 h fixe (personne ne peut la changer) ; une heure
  par vaccin (un choix de plus sans besoin).
- 2026-09-29 — **Q2 : plusieurs heures par jour, une prévenance et une relance par jour d'échéance**
  (RA-5). Raison : la prévenance sert à vérifier son stock ; deux relances pour un même jour seraient du
  bruit (principe 6). Écartée : une par heure.
- 2026-09-29 — **Q3 : rappels précis retirés, les choix de Sophie sont gardés** (RA-23) : rappels
  inexacts, mention « Moins précis » dans Paramètres et sur la fiche, retour à la précision dès la
  réactivation. Raison : ne jamais changer un réglage dans son dos, dire la vérité sur la précision
  (principes 1 et 3). Écartées : repasser à « À l'heure » ou à « 1 h avant » sans le dire.

- 2026-09-29 — **Q4 : l'écran d'explication vient dès qu'un soin existe, y compris après un import, une
  restauration ou un transfert d'Android** (RA-21). Raison : l'autorisation ne suit pas le carnet sur un
  nouveau téléphone ; sans l'écran, les rappels restaurés ne sonnent jamais, sans que Sophie le voie
  (principe 3). Fonctionnement actuel. Écartées : attendre le prochain soin créé (rappels muets d'ici
  là, sans bandeau puisque rien n'a été refusé) ; un bandeau sur l'accueil (trop facile à ignorer).
  (Plan de livraison, QP3.)

- 2026-09-29 — **Q5 : « Rappel » dans le formulaire, « Rappels précis » partout pour l'option** (RA-7,
  RA-23). Raison : « Rappel » a le sens du glossaire (l'alerte) ; « Me prévenir » se confondrait avec
  « Me prévenir avant l'échéance » ; un seul nom pour un réglage. Écartées : « Me prévenir » (maquette) ;
  « Rappels à l'heure précise » dans Paramètres. Le mot « rappels » de l'accueil est revu avec le lot B
  (revu : « soin », spec Accueil Q5 du 2026-09-29). (Relecture du lot A, QA-2.)

- 2026-09-29 — **Q6 : « Moins précis » dans le formulaire, dans Paramètres et sur la fiche** (RA-23),
  sur la fiche seulement pour un traitement à heure(s) quand l'accès est retiré. Raison : Sophie ouvre
  la fiche bien plus souvent que « Modifier » ; elle doit savoir sans chercher (principe 3). Écartée :
  le formulaire seul (maquette). (Relecture du lot A, QA-3.)

- 2026-09-30 — **Lots B et C révisés, points qui touchent les rappels** : écran « Ne rate plus aucun
  rappel » au sous-titre sans accord, premier avantage nommant le prochain soin à venir (RA-21) ;
  « Activer les rappels » dans Paramètres › Rappels tant qu'Android n'a jamais demandé l'autorisation,
  sous-titre « Pas encore activés » (§5). (`technical/relecture-maquettes-lot-B-rev1.md`, correction 9 ;
  `relecture-maquettes-lot-B-rev2.md`, U1 ; `relecture-maquettes-lot-C.md`, QC-5.)

## 10. Questions ouvertes

Posées par la relecture de cohérence du 2026-09-30 (`technical/relecture-coherence-2026-09-30-1.md`),
toutes tranchées en bloc le 2026-09-30 : C3 (RA-21), C4 (RA-22), C7 (RA-18).
