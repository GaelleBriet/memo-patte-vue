---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Paramètres et premier lancement (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md), parcours 1, 3, 13, 15, matrice des
fonctionnalités (G3) ; specs [rappels](rappels.md), [données](donnees.md),
[Plus et compte](plus-et-compte.md), [accueil](accueil.md) ; cadrage (parades pour P2) ; existant
(Paramètres #48, consentement #66 #67, #352). Une règle marquée **(à valider)** renvoie à une question
ouverte.

## 1. Problème

Le premier lancement décide de l'adoption ; les Paramètres rassemblent tout ce qui n'est pas le
quotidien. Aujourd'hui, les Paramètres sont introuvables sans animal, n'ont rien sur les rappels ni sur
la sauvegarde, et il n'existe aucun moyen de dire « il me manque… ».

## 2. Objectifs

1. Premier lancement : arriver à un premier rappel utile le soir même, sans compte ni autorisation
   demandés d'avance.
2. Paramètres : chaque réglage à un endroit évident, toujours accessible.
3. Garder le contact avec les utilisateurs pour apprendre ce qui manque (objectif business 4).

**Hors objectifs** : choix de la langue (suit le téléphone) ; thème sombre (non prévu en v1) ;
personnalisation de l'accueil.

## 3. Premier lancement

- **PR-1** Premier écran : « Avant de commencer » (statistiques d'usage, « Accepter » /
  « Refuser ») ; aucun événement avant la réponse ; changeable ensuite dans Paramètres ›
  Confidentialité. (P1 Q3 ; CLAUDE.md)
- **PR-2** Puis l'accueil de bienvenue (spec Accueil, AC-1) : ligne « Ton carnet reste sur ton
  téléphone. Gratuit, sans compte. », « Créer mon premier animal », « Importer un export MémoPatte »,
  « J'ai déjà MémoPatte Plus · Retrouver mon carnet », icône Paramètres. (P1)
- **PR-3** Aucun compte, aucun achat, aucune autorisation au lancement ; les notifications se demandent
  dès que le carnet a un soin à venir (premier soin enregistré, import, restauration ou transfert
  d'Android), avec l'écran d'explication, une seule fois. (P1 R1 ; spec Rappels RA-21, Q4)
- **PR-4** Langue : celle du téléphone (français, sinon anglais) ; unité de poids par défaut selon la
  région (lb aux États-Unis, kg ailleurs). (Existant ; #352)
- **PR-5** Après le premier soin : la carte unique « Ton carnet est sur ce téléphone. Voici comment le
  protéger », jamais pour un abonné Plus. (P1 Q1 ; spec Accueil AC-14)

## 4. Paramètres

- **PA-1** Toujours accessible par l'icône de l'accueil, y compris sans animal. (G3)
- **PA-2** Rubriques et contenu :
  - **Rappels** : état des notifications (et lien), « Rappels précis », « Me prévenir avant
    l'échéance », « Heure des rappels de vaccins », « Je ne reçois pas mes rappels » (page Aide). (Spec
    Rappels)
  - **Sauvegarde** : ce qui est protégé ou non, « Exporter une copie » (partage d'Android), état de la
    sauvegarde (abonnés et anciens abonnés), « Effacer les données de ce téléphone ». (Spec Données
    DO-12, Q6, Q7)
  - **Mes données** : unité de poids, « Exporter mes données » (JSON, CSV), « Exporter en PDF » (tous les
    animaux ou un au choix), « Importer un export MémoPatte ». (Existant ; spec Données)
  - **MémoPatte Plus** : découvrir, statut, restaurer les achats, gérer l'abonnement ; « J'ai déjà
    MémoPatte Plus » (même libellé que sur l'accueil de bienvenue, qui remplace « Je suis déjà abonné »).
    (Existant ; spec Plus ; P1 Q2)
  - **Compte** (si un compte existe) : adresse (« Compte Google » pour un compte Google), « Changer mon
    mot de passe », « Changer mon adresse e-mail » (comptes par e-mail), « Se déconnecter », « Supprimer
    mon compte » (écrans de l'app, spec Plus PL-21). (Spec Plus)
  - **Confidentialité** : « Statistiques d'usage », lien vers la politique de confidentialité.
    (Existant ; site ; #425 : jamais « anonymes », un abonné connecté y est rattaché à son compte)
  - **Aide et contact** : page Aide du site ; « Nous écrire » (e-mail à `memopatte@gaelle-briet.fr`,
    objet « MémoPatte : question ») et « Il me manque quelque chose » (objet « MémoPatte :
    suggestion »), qui ouvrent l'app de messagerie, message prérempli avec la version de l'app et
    d'Android, jamais le contenu du carnet. (Décision du 2026-09-29 ; parades P2 ; spec Q2)
  - **À propos** : version, mentions légales (lien), site. (Existant ; site)
- **PA-2 bis** Paramètres est une liste de rubriques ; chacune affiche son état (« Autorisés · rappels
  précis », « Plus · il y a 5 min ») et ouvre sa propre page ; un lien peut ouvrir directement une
  rubrique (« Voir comment » → Sauvegarde). Rubrique Rappels, autorisation jamais demandée : « Activer
  les rappels » ouvre l'écran d'explication puis la demande d'Android ; les réglages d'Android
  seulement après un refus (RA-21). Sans app de messagerie, « Nous écrire » affiche l'adresse avec
  « Copier ». Sous-titre de « Rappels » selon l'état : « Autorisés · rappels précis », « Autorisés »
  (rappels précis coupés), « Désactivés » (notifications refusées), « Pas encore activés »
  (autorisation jamais demandée). Sous-titre de « Sauvegarde » selon l'état : « Sur ce téléphone »
  (gratuit), « Plus · il y a 5 min », « Plus · en attente de réseau », « Plus · interrompue », « En
  pause » (Plus arrêté). (Spec Q3 ; relecture du lot C et du lot C révisé)
- **PA-3** Ordre des rubriques, du plus utile au plus rare : Rappels, Sauvegarde, Mes données, MémoPatte
  Plus, Compte, Confidentialité, Aide et contact, À propos. (Spec Q1, 2026-09-29)
- **PA-4** Réglages du carnet (heure des rappels de vaccins, « Me prévenir avant l'échéance ») : en
  base, synchronisés avec Plus, exportés, et donc restaurés avec le carnet (Plus, import, sauvegarde
  d'Android). Réglages de l'appareil (unité de poids, rappels précis, statistiques, messages fermés) :
  gardés sur le téléphone, non synchronisés, non restaurés par la sauvegarde d'Android. (Modèle de
  données, M8 ; [`auto-backup-android.md`](../../technical/auto-backup-android.md))

## 5. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** une première ouverture, **quand** l'app démarre, **alors** l'écran « Avant de
   commencer » s'affiche d'abord, et aucun événement de statistiques n'est envoyé avant la réponse.
2. **Étant donné** aucun animal, **quand** Sophie touche l'icône Paramètres, **alors** tous les
   réglages sont accessibles, dont Confidentialité.
3. **Étant donné** un compte Google, **quand** Sophie ouvre Paramètres › Compte, **alors** « Changer mon
   mot de passe » et « Changer mon adresse e-mail » n'apparaissent pas.
4. **Étant donné** les notifications refusées, **quand** Sophie ouvre Paramètres › Rappels, **alors**
   elle voit qu'elles sont désactivées, avec le lien vers les réglages d'Android.

## 6. Décisions de la spec

- 2026-09-29 — **Q1 : rubriques du plus utile au plus rare** (PA-3), Rappels en tête, MémoPatte Plus en
  quatrième. Raison : on vient régler ses rappels ou vérifier sa sauvegarde ; Plus en tête ferait
  « vitrine » ; « Sauvegarde » présente déjà Plus au bon moment. Écartée : Plus en tête (objectif le
  moins prioritaire, devant ce que Sophie vient chercher).

- 2026-09-29 — **Q2 : « Nous écrire » et « Il me manque quelque chose »** ouvrent un e-mail prérempli
  (version de l'app et d'Android, jamais le carnet). Raison : parade prévue pour P2, objectif business 4,
  contact d'assistance demandé par la Play Console ; aucun serveur ni donnée en plus (échanges déjà
  prévus par la politique). Écartés : un formulaire relié à un serveur ; rien dans l'app.

- 2026-09-30 — **Q3 : une page par rubrique** (PA-2 bis), comme la maquette V19. Raison : huit
  rubriques et une trentaine de lignes ; l'état de chaque rubrique se lit d'un coup d'œil ; un lien
  peut viser une rubrique. Écartée : l'écran unique actuel (un tap de moins, page très longue).
  (Relecture du lot C, QC-13.) Points validés en bloc le même jour : « Activer les rappels » quand
  l'autorisation n'a jamais été demandée ; adresse à copier sans app de messagerie (QC-5, QC-10).

## 7. Questions ouvertes

Aucune. Spec « Paramètres et premier lancement » validée le 2026-09-30.
