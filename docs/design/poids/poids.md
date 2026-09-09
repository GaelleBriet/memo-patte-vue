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
- Flèche retour pétrole vers le Carnet.
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

### 3. Courbe

- N'apparaît qu'à partir de deux pesées.
- Reprend le style de la mini-courbe du Carnet : polyline pétrole 2 px,
  points 4 px de rayon, valeur affichée au-dessus de chaque point (une
  décimale, virgule française : `23,6`).
- Échelle verticale automatique : bornée au min/max des valeurs affichées,
  avec une marge de 0,3 kg de chaque côté — jamais un axe qui part de zéro.
- Labels de mois abrégés sous la courbe (`Juin`, `Juil.`, `Août`…), un par
  point.
- Le tout dans une carte `#FEFCF9`, bordure `#ECE9E5`, rayon 22 px, même
  traitement que les autres cartes du Carnet.

### 4. Une seule pesée (remplace la courbe)

- Carte identique en forme à la courbe, mais contenu différent : icône
  `show_chart` 22 px couleur `#798A8B` + texte « Ajoute une nouvelle pesée
  pour voir l'évolution. » (13,5 px / 500, `#68625C`).

### 5. Liste « Toutes les pesées »

- N'apparaît que s'il existe au moins une pesée.
- Titre « Toutes les pesées » (20 px / 700), puis une carte unique
  contenant toutes les entrées, **la plus récente en haut** (ordre
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
| Valeur au-dessus d'un point de courbe | `oklch(28% 0.015 60)` | `#2F2722` |
| Date de ligne (liste des pesées) | `oklch(30% 0.015 60)` | `#342C26` |

Delta positif : réutilise exactement le token du badge « À jour » du Carnet
(`#2F5437`), pas de nouvelle couleur créée.

## Format des nombres

Toujours une décimale, virgule française : `23,6`, jamais `23.6` ni `23,60`.
