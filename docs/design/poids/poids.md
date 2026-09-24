---
tags:
  - perso
  - memo-patte
  - historique-poids
---

# Suivi de poids — historique (#31)

Maquette de référence : `MémoPatte v2 - Historique poids.png` (capture) et
`MémoPatte v2 - Historique poids (standalone).html` (version interactive,
planches H1 à H3).

⚠️ **Le titre affiché à l'écran est « Suivi de poids »**, pas « Historique de
poids ». Le ticket #31 et ce fichier utilisent « historique » pour désigner
l'écran, mais c'est bien « Suivi de poids » que verra la personne qui utilise
l'app. À garder en tête si quelqu'un cherche l'un et pas l'autre.

**Objectif** : écran poussé atteint depuis le lien « Voir l'historique » de
la carte poids du Carnet. Aucune saisie ici, uniquement de la lecture ; la
saisie reste dans la feuille pesée (`pesee.md`).

## Structure de l'écran

### 1. Top app bar

- Même mécanique que le formulaire animal : sticky, sans bordure au repos,
  bordure `#ECE9E5` + ombre légère dès que le contenu défile.
- Flèche retour pétrole vers le Carnet, annoncée « Retour au carnet » (#351).
- Titre « Suivi de poids » (Space Grotesk 22 px / 700) avec, juste en
  dessous, le prénom de l'animal consulté en petit texte secondaire
  (12,5 px / 500, `#68625C`) — absent du formulaire animal, propre à cet
  écran puisqu'il n'y a pas de chips ici pour identifier l'animal autrement.

### 2. Poids actuel

- N'apparaît que s'il existe au moins une pesée.
- Libellé « Poids actuel » (11,5 px / 600, `#79736D`).
- Valeur en gros : 44 px, Space Grotesk 700, plus grande que le chiffre
  équivalent du bandeau de stats du Carnet (21 px) — c'est le sujet de
  l'écran, elle porte tout le poids visuel (au sens propre).
- Unité « kg » à côté, 17 px / 600, `#413933`.
- Ligne de delta en dessous, trois formulations possibles :
    - une pesée précédente existe : `+0,5 kg vs août` (le mois vient de la
      pesée précédente, même convention que la carte Carnet)
    - aucune pesée précédente (une seule pesée au total) : `Première pesée ·
      {date complète}`, par exemple `Première pesée · 8 nov. 2026`
    - delta nul : `±0,0 kg`
- Couleur du delta : vert `#2F5437` (même token que le badge « À jour » du
  Carnet) si la variation est positive, gris chaud `#5A544D` si négative,
  gris neutre `#736E67` si nulle ou s'il n'y a pas de pesée précédente. Pas
  de rouge : une perte de poids n'est pas en soi une alerte santé.
- Ce bloc suit la pesée sélectionnée sur la courbe (§3). Au repos, c'est la
  dernière pesée et il reste tel que décrit ci-dessus. Une autre pesée
  sélectionnée remplace « Poids actuel » par `Pesée du 11 oct. 2026`, affiche
  son poids et sa variation par rapport à la pesée précédente au format de la
  liste (`+0,1 kg`, même code couleur) ; la variation reste vide pour la toute
  première pesée, la ligne gardant sa hauteur. Le bloc est annoncé en
  « polite » au lecteur d'écran.
- Puce « × Poids actuel » (#351, maquette `courbes-poids/` H2) à droite de la
  ligne « Pesée du … », seulement quand une autre pesée que la plus récente est
  lue : fond `#DEF1F2`, texte pétrole 13 px / 700, 28 px de haut (zone de
  toucher 48 px), annoncée « Revenir au poids actuel ». Elle remet le résumé
  à la pesée la plus récente, sans changer de page, et rend le focus à la
  courbe.

### 3. Courbe

- N'apparaît qu'à partir de deux pesées.
- Par pages de **12 pesées** (#351, maquette `courbes-poids/` H1 à H3),
  découpées depuis la plus récente : l'écran s'ouvre sur la page la plus
  récente, la plus ancienne garde le reste (elle peut n'en compter qu'une). La
  courbe occupe toute la largeur quel que soit le nombre de pesées de la page,
  une pesée seule au centre. Échelle, repères et mois se recalculent pour
  chaque page, avec les règles ci-dessous. La carte du Carnet et le PDF restent
  un aperçu de toute la période.
- En-tête de la carte : ‹ · période · › ; période `mars 2026 – sept. 2026`
  (Space Grotesk 16 px / 700), `mars 2026` seul quand la page tient dans un
  mois (Gaelle, 2026-09-24), en dessous `12 pesées` (13 px / 500,
  `#68625C`), `6 pesées · début du suivi` sur la page de la première pesée.
  Chevrons pétrole de 24 px, zone de toucher 48 px ; grisés `#CFCAC3` quand il
  n'y a plus de page de ce côté, et annoncés « Pesées précédentes, aucune » /
  « Pesées suivantes, aucune ». La période est annoncée en « polite » à chaque
  changement de page.
- Piste D, choisie le 2026-09-23 (#340). Même tracé que la courbe du Carnet
  (`carnet.md` §6) : axe horizontal proportionnel au temps, polyline pétrole
  2 px, voile pétrole à 10 % d'opacité, points de 4 px cerclés de 2 px couleur
  surface, mois sous la courbe avec les mêmes règles : un libellé au début de
  chaque mois, puis tous les 2, 3, 6 ou 12 mois pour en garder au plus six,
  mois de départ partiel écrit s'il reste la place, dernier mois jamais
  débordant. Courbe plus haute : 190 px, contre 160 dans le Carnet. Comme
  dans le Carnet, la rangée des mois se tient contre la ligne de base
  (libellés écrits 18 px sous elle, 22 px dans le Carnet), et aucun texte ne
  traverse ni ne touche la ligne de base, jambages compris (#350) : les mois
  restent dessous, les chiffres des repères à gauche du tracé.
- Échelle verticale : 3 à 5 lignes de repère horizontales `#ECE6DE` en kg
  ronds, au pas de 0,1 / 0,2 / 0,5 / 1 / 2 / 5 / 10 kg, le plus petit qui
  tient en cinq lignes en encadrant les pesées. La ligne du bas est le
  multiple du pas juste sous la pesée la plus légère : jamais une échelle
  forcée à zéro. Deux exceptions acceptées par Gaelle le 2026-09-23 :
    - l'axe descend jusqu'à 0 kg quand les pesées s'en approchent (un chaton
      de 0,9 à 4 kg donne un axe de 0 à 6 kg) ;
    - au-delà d'environ 40 kg d'écart, le pas reste de 10 kg et l'axe compte
      plus de cinq lignes.
- Chiffres à gauche des lignes (12 px, `#736E67`, sans décimale inutile :
  `24`, `24,5`), unité « kg » au-dessus de l'axe (12 px / 500). Aucun chiffre
  sur les points.
- Gestes (#351) :
    - **glisser** vers la droite montre la page précédente, vers la gauche la
      suivante ; la courbe suit le doigt, et au bout du suivi elle résiste
      (elle ne suit le doigt qu'au quart) puis revient, sans changer de page ;
    - **toucher** un point sélectionne la pesée la plus proche : trait vertical
      pétrole à 50 % de 1 px sur toute la hauteur du tracé, point agrandi à
      7 px de rayon, contour couleur surface ;
    - **appui long puis glisser** parcourt les pesées de la page, le résumé
      suit ; l'écran ne défile pas sous le doigt pendant ce geste ;
    - un geste qui part à la verticale fait défiler l'écran.
- La sélection reste en place quand le doigt se lève. Au repos, aucune pesée
  n'est marquée sur la courbe ; à chaque ouverture de l'écran, après chaque
  ajout d'une pesée et à chaque changement de page, le résumé revient à la
  pesée la plus récente.
- Clavier et lecteur d'écran : les chevrons changent de page. La courbe prend
  le focus comme un curseur (« Évolution du poids ») sur les pesées de la
  page : flèches gauche / droite (et haut / bas) et Début / Fin les
  parcourent, Page précédente / Page suivante changent de page, et la pesée
  est annoncée date en toutes lettres (`Pesée du 3 février 2026, 17,8 kg`).
  Au repos, le curseur annonce la dernière pesée de la page. Pas d'anneau de
  focus visible : le trait vertical dit déjà la sélection.
- Le tout dans une carte `#FEFCF9`, bordure `#ECE9E5`, rayon 22 px, même
  traitement que les autres cartes du Carnet.

### 4. Une seule pesée (remplace la courbe)

- Carte identique en forme à la courbe, mais contenu différent : icône
  `show_chart` 22 px couleur `#798A8B` + texte « Ajoute une nouvelle pesée
  pour voir l'évolution. » (13,5 px / 500, `#68625C`).

### 5. Liste « Toutes les pesées »

- N'apparaît que s'il existe au moins une pesée.
- Titre « Toutes les pesées » (20 px / 700), le nombre de pesées à droite
  (#351), puis une carte unique contenant toutes les entrées, **la plus récente en haut** (ordre
  chronologique inversé par rapport à la courbe, qui va dans le sens du
  temps).
- Une ligne par pesée, hauteur 56 px, filet de séparation entre les lignes
  (aucun filet avant la première) :
    - date en toutes lettres à gauche (`8 nov. 2026`), 14 px / 600
    - delta par rapport à la pesée immédiatement précédente, au centre,
      même code couleur que la ligne « Poids actuel »
    - valeur en gras à droite (`24,5 kg`), 16 px / 700
- La toute première pesée jamais enregistrée (donc la dernière ligne de la
  liste, en bas) n'a pas de delta : la cellule reste présente mais vide, pas
  de texte « — » à la place.

### 6. Poids à l'arrivée

- Ligne de texte discrète sous la carte « Toutes les pesées » : « Poids à
  l'arrivée : {valeur} kg », 12,5 px / 500, `#736E67`, hors carte.
- Vient de `animal.initialWeightKg`, une donnée séparée de l'historique de
  pesées : **elle s'affiche même quand il n'existe encore aucune pesée**
  (état H3), puisqu'elle ne dépend pas de la table `weight_entry`.
- N'est jamais injectée comme point de la courbe : `initialWeightKg` n'a pas
  de date associée en base actuellement, lui en inventer une fausserait le
  graphe. Reste une question ouverte pour plus tard, pas tranchée par cette
  maquette.

### 7. Bouton « Ajouter une pesée »

- Fixe en bas de l'écran, fond `#FCFAF7`, bordure supérieure `#ECE9E5`,
  pleine largeur, fond pétrole, ouvre la feuille `pesee.md`.
- **N'apparaît que s'il existe déjà au moins une pesée.** Dans l'état vide
  (H3), l'ajout se fait uniquement via la ligne « + Ajouter une pesée » à
  l'intérieur de la carte d'état vide, pour ne pas avoir deux affordances
  d'ajout visibles en même temps.

## Les 3 états de l'écran

| Réf. | État | Contenu |
|---|---|---|
| **H1** | Historique complet | Milo, 6 pesées de juin à novembre 2026 (23,6 → 24,5 kg), courbe + liste + poids à l'arrivée (8,5 kg) |
| **H2** | Une seule pesée | Seule la dernière pesée de Milo (24,5 kg), pas de courbe, message d'invitation à en ajouter une deuxième |
| **H3** | Aucune pesée | État vide repris de `carnet.md` (« Aucune pesée enregistrée » + ligne d'ajout), ni bloc « Poids actuel » ni bouton fixe en bas, mais le « Poids à l'arrivée » reste affiché |

## Tokens propres à cet écran

En complément des tokens déjà définis dans `accueil.md`, `carnet.md` et
`animal.md`.

| Rôle | oklch | hex |
|---|---|---|
| Delta négatif | `oklch(45% 0.014 70)` | `#5A544D` |
| Delta neutre / première pesée / poids à l'arrivée | `oklch(54% 0.012 70)` | `#736E67` |
| Icône « une seule pesée » | `oklch(62% 0.02 202)` | `#798A8B` |
| Plus haut / plus bas écrits sur la courbe du Carnet | `oklch(28% 0.015 60)` | `#2F2722` |
| Lignes de repère, ligne de base et traits des mois | — | `#ECE6DE` |
| Date de ligne (liste des pesées) | `oklch(30% 0.015 60)` | `#342C26` |

Delta positif : réutilise exactement le token du badge « À jour » du Carnet
(`#2F5437`), pas de nouvelle couleur créée.

## Format des nombres

Toujours une décimale, virgule française : `23,6`, jamais `23.6` ni `23,60`.
Seule exception, les chiffres des lignes de repère de la courbe : `24`,
`24,5`, sans décimale inutile.
