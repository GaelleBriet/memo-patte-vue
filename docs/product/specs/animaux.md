---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Animaux et poids (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md) (1, 3, 7 : sans limite d'animaux),
parcours 1, 8, 10, matrice des fonctionnalités (G1, G5, G6, G7) ; existant (#14, #15, #101, #127, #31,
#340, #351, #352, #385, #402, #409). Une règle marquée **(à valider)** renvoie à une question ouverte.

## 1. Problème

L'animal est la racine du carnet : tout s'y rattache. Il faut pouvoir le créer vite, le reconnaître
d'un coup d'œil, suivre son poids, et gérer avec tact le jour où il n'est plus là.

## 2. Objectifs

1. Créer un animal en moins d'une minute, sans champ superflu.
2. Retrouver son poids et son évolution, dans l'unité de Sophie.
3. Ne plus suivre un animal sans rien perdre, et sans brutalité.

**Hors objectifs** : fiche d'identité (sexe, stérilisation, identification ; v2) ; espèces autres que
chien et chat ; partage d'un animal entre personnes (v2, Plus).

## 3. Règles

### 3.1 Créer et modifier un animal

- **AN-1** Champs : nom (1 à 80 caractères), espèce (chien ou chat), race facultative (80 caractères),
  date de naissance facultative avec la case « Date approximative » (désactivée tant qu'aucune date
  n'est saisie, aide « Disponible une fois la date saisie. »), poids facultatif, photo
  facultative. Nombre d'animaux illimité, gratuit. (Existant ; #409 ; P8 Q1 ; principe 7 ; lot B révisé)
- **AN-2** Le poids saisi à la création devient la première pesée, datée du jour de la création ; plus
  de notion de « poids initial ». (G6)
- **AN-3** « Modifier » : tous les champs, espèce comprise ; le poids se corrige par les pesées. (Existant ;
  G6)
- **AN-4** Photo par le sélecteur de photos d'Android, sans autorisation d'accès aux photos ; rangée dans
  `files/photos/` (exclue de la sauvegarde d'Android, sauvegardée par Plus). (CLAUDE.md ; #101)
- **AN-5** Sur le Carnet : un badge « appareil photo » sur l'avatar ; toucher l'avatar ou le badge ouvre
  « Voir la photo », « Changer la photo », « Retirer la photo » (ou « Ajouter une photo »). L'appui long
  disparaît. Sans photo, l'avatar porte un dégradé de la palette. « Changer la photo » et « Ajouter une
  photo » : « Choisir une photo » (le sélecteur ne prend pas de photo). « Retirer la photo » sans
  confirmation, toast « Photo retirée » · Annuler. (G5 ; décision du 2026-09-08 ; relecture du lot B)

### 3.2 Consulter

- **AN-6** Sélecteur d'animaux (chips) dans l'ordre de création, animaux suivis seulement (AN-9), avec
  « + » pour en ajouter. (Existant, décisions du 2026-09-16)
- **AN-7** En-tête du Carnet : nom, race et âge (« environ … » si la date est approximative) ; la date de
  naissance elle-même se lit dans « Modifier » et le PDF. Animal qu'on ne suit plus : AN-10. (G7 ; P8)
- **AN-8** Âge : en semaines jusqu'à 16 semaines, puis en mois avant un an, puis en années. (Existant,
  modifié : spec Q2)

### 3.3 Ne plus suivre, supprimer

- **AN-9** « Ne plus suivre [nom] » (« Ses rappels et ses traitements en cours s'arrêtent. Son carnet
  reste intact. »), sans question : tous les rappels coupés immédiatement (notifications du volet
  comprises), l'animal quitte l'accueil, « À faire » et le sélecteur ; son carnet est gardé, consultable,
  exportable en PDF ; toast « Tu ne suis plus Luna » · « Annuler ». (P10 Q1 ; relecture du lot B)
- **AN-10** « Animaux que tu ne suis plus (N) », ligne discrète en bas du Carnet (sous la dernière section,
  quel que soit l'animal affiché), et sur l'accueil seulement quand plus aucun animal n'est suivi ; elle
  ouvre le carnet s'il n'y en a qu'un, une liste sinon (spec Q4) : revoir
  le carnet, « Ajouter une date » (puis « Modifier la date » ; facultatifs : « Motif » (« Décès », « Chez
  quelqu'un d'autre », « Autre ») et « Date du départ », jamais future ; affichés avec douceur :
  l'en-tête garde « race · âge » tant qu'aucune date n'est saisie, puis dit « jusqu'au 3 mars 2026 »
  (« Luna · jusqu'au 3 mars 2026 ») ; le motif n'y est jamais affiché ; spec Q5), « Suivre de
  nouveau » (qui efface le motif et la date du départ : l'animal est de retour ; ses traitements
  gardent « Arrêté le … » dans leur historique), et, dans ses « Options » (AN-12), « Suivre Luna de
  nouveau » et « Supprimer Luna ». (P10 Q1 ; revue du modèle, 2026-09-29 ; lot B révisé)
- **AN-11** « Ne plus suivre » arrête ses traitements en cours (« Arrêté le … » dans leur historique,
  rangés dans « Traitements terminés » : TR-37, lot B révisé) ; « Suivre de nouveau » ne les relance pas : Sophie
  reprend ceux qui continuent par « Reprendre » (nouvelle période), et le toast le dit (« Tu suis de
  nouveau Luna. Ses traitements arrêtés ne reprennent pas seuls : relance chacun avec « Reprendre ». »
  · « Annuler »), et leurs doses non renseignées reviennent à renseigner (spec Traitements TR-37). Ses
  vaccins restent tels quels, leurs rappels reviennent avec leur statut réel.
  « Annuler » juste après « Ne plus suivre » remet tout, traitements compris. (Spec Q1, 2026-09-29 ;
  maquette V15 octies, lot B validé)
- **AN-12** « Supprimer » : confirmation (« Supprimer Luna ? Tout son carnet sera supprimé : vaccins,
  traitements, pesées, photo. »), puis « Annuler » ; suppression logique en cascade. Réservé aux
  erreurs, ou si Sophie ne veut rien garder. Place : le menu ⋮ du Carnet ouvre « Options » (« Ne plus
  suivre Luna », ou « Suivre Luna de nouveau » pour un animal qu'on ne suit plus, et « Supprimer
  Luna ») ; jamais de lien rouge en bas du carnet (même règle que Traitements Q11). (P10 ; G1 ; décision
  du 2026-09-08 ; relecture du lot B ; lot B révisé)

### 3.4 Poids

- **AN-13** Pesée : poids et date (pas de date future) ; créer depuis le Carnet, l'historique ou l'action
  rapide ; modifier (poids, date) et supprimer (toast « Annuler ») depuis l'historique. (Existant, #402)
- **AN-14** Unité kg ou lb (Paramètres, lb par défaut si la région du téléphone est les États-Unis) ;
  la base garde les kilos ; bornes > 0 et ≤ 200 kg (440,9 lb). (#352)
- **AN-15** Carnet : dernier poids, variation calculée sur les poids affichés (« +0,4 kg depuis le 28
  août »), mini-courbe ; historique : courbe par pages de 12 pesées, la plus récente d'abord. (#385, #351, #352)

## 4. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** un chat créé avec 1,1 kg, **quand** le Carnet s'ouvre, **alors** le poids 1,1 kg
   s'affiche comme dernière pesée, datée du jour de la création.
2. **Étant donné** une date de naissance approximative il y a 10 semaines, **quand** le Carnet s'ouvre,
   **alors** l'âge affiche « environ 10 semaines ».
3. **Étant donné** un animal suivi avec des rappels programmés, **quand** Sophie touche « Ne plus suivre
   Luna », **alors** aucun rappel de Luna ne sonne plus, et Luna n'apparaît plus dans « À faire » ni
   dans le sélecteur.
4. **Étant donné** un animal qu'on ne suit plus, **quand** Sophie ouvre « Animaux que tu ne suis
   plus », **alors** son carnet est intact et exportable en PDF.
5. **Étant donné** la suppression d'un animal confirmée, **quand** Sophie touche « Annuler », **alors**
   l'animal et tout son carnet reviennent, rappels compris.

## 5. Décisions de la spec

- 2026-09-29 — **Q1 : « Ne plus suivre » arrête les traitements en cours ; « Suivre de nouveau » ne les
  relance pas** (AN-11). Raison : aucune mécanique nouvelle (« Arrêter » et « Reprendre »), aucune
  période fantôme à renseigner au retour, historique exact. Écartée : une pause des traitements pendant
  l'absence (un état de plus ; le mode « En pause » par animal reste une piste de la roadmap).

- 2026-09-29 — **Relecture du lot B, points validés en bloc** : « Chez quelqu'un d'autre » (libellé
  qui ne s'accorde pas, l'app ne connaît pas le sexe de l'animal ; EN « Luna's », jamais « Her ») ;
  « Date approximative » désactivée sans date ; raison jamais dans l'en-tête, date future refusée ;
  « Retirer la photo » avec « Annuler » ; « Supprimer » dans le menu ⋮ (« Options »). Remplace « en bas
  du sélecteur ou du Carnet » pour l'emplacement de « Supprimer » ; celui de « Animaux que tu ne suis
  plus » est tranché par Q4. (`technical/relecture-maquettes-lot-B.md`.)

- 2026-09-29 — **Q2 : l'âge se compte en semaines jusqu'à 16 semaines**, puis en mois, puis en années
  (AN-8). Pixel, 10 semaines : « environ 10 semaines ». Raison : la primo-vaccination se compte en
  semaines jusqu'à 16 semaines (`technical/etude-liste-vaccins.md` §3.1) ; « 2 mois » est trop vague à
  cet âge. Écartée : semaines seulement avant un mois (l'existant). Code à modifier : calcul de l'âge
  (`animal-age.ts`). (Relecture du lot B, question 2.)

- 2026-09-29 — **Q3 : pas de champ libre « Un mot » en v1** (AN-10) : « un mot » est le choix de la
  raison (« Décès », « Chez quelqu'un d'autre », « Autre ») ; le nom du geste ne change pas. Raison :
  modèle bouclé sans ce champ ; un texte libre demande une colonne, une limite, la synchro, l'export et
  le PDF, sans besoin identifié ; il pourra s'ajouter plus tard. Écartée : une note de 80 caractères
  (maquette). (Relecture du lot B, question 3.) (Nom du geste remplacé par Q5 du 2026-09-30.)

- 2026-09-29 — **Q4 : « Animaux que tu ne suis plus » en bas du Carnet**, et sur l'accueil seulement
  quand plus aucun animal n'est suivi (AN-10). Raison : l'accueil s'ouvre chaque jour, une ligne
  permanente y rappellerait un animal mort ou parti (tact, principe 6) ; le Carnet est l'endroit où l'on
  consulte un dossier. Écartées : en bas de l'accueil (maquette) ; dans Paramètres › Mes données (trop
  caché). (Relecture du lot B, question 4.)

- 2026-09-30 — **Q5 : le geste s'appelle « Ajouter une date » / « Modifier la date »** (AN-10), et
  l'écran demande « Motif » (Décès, Chez quelqu'un d'autre, Autre) puis « Date du départ ». Remplace
  « le nom du geste ne change pas » de Q3. Raison : sans champ libre, « et un mot » promet un champ
  absent ; « Ce qui s'est passé » sonnait mal (Gaelle, qui a choisi « Motif » plutôt que « Son
  départ »). (Vérification du lot B révisé, U1.)

- 2026-09-30 — **Lot B révisé, points validés en bloc** : « Date approximative » avec l'aide
  « Disponible une fois la date saisie. » ; « Tout est facultatif et reste dans le carnet de Luna. »,
  « Au plus tard aujourd'hui. » ; « Suivre Luna de nouveau » dans les « Options » d'un animal qu'on ne
  suit plus ; dialogue de suppression sans « Impossible de revenir en arrière » (un « Annuler » suit) ;
  traitements arrêtés dans « Traitements terminés », jamais une section « Traitements » à part.
  (`technical/relecture-maquettes-lot-B-rev1.md`.)

## 6. Questions ouvertes

Aucune. Spec « Animaux et poids » validée le 2026-09-30.
