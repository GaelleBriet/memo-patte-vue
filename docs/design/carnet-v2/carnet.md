---
tags:
  - perso
  - memo-patte
  - carnet
---

# Écran Carnet (profil animal) — maquette v2 (référence)

Maquette de référence : `MémoPatte v2 - Carnet.png` (capture) et
`MémoPatte v2 - Carnet (standalone).html` (version interactive, planche C1).
Remplace `../carnet-v1/carnet.md`, conservé uniquement comme historique.

**Objectif inchangé** : voir le détail de santé d'un animal et accéder
rapidement à ses informations et actions.

## Ce qui change par rapport à la v1

| Élément | v1 | v2 |
|---|---|---|
| Stats | 3 cartes encadrées | **bandeau de 3 colonnes** séparées par des filets verticaux, sans cadre |
| Sections | titre + lien « + Ajouter » à droite du titre | titre seul, l'ajout devient **la dernière ligne de la carte** |
| Listes | une carte par vaccin / traitement | **une carte par section**, lignes séparées par des filets |
| États vides | carte illustrée (icône + texte + bouton contour) | ligne de texte simple (`Aucun vaccin enregistré`) + ligne d'ajout |
| Bottom nav | pilule flottante sombre | **barre pleine largeur** claire, icône + libellé |
| Photos | placeholder uniquement | emplacements photo réels (header + chips), planche C3 |
| Animaux d'exemple | Milo, Luna, Nala (lapin) | Milo (chien), Luna (chat) — plus d'espèce hors scope |

## Structure de l'écran

### 1. Header pétrole (hauteur 158 px)

- Fond plein `#01383E`.
- Barre de statut, puis bouton **retour** (`arrow_back`) sur sa propre ligne.
- Bloc identité : avatar rond 56 px (photo de l'animal, bordure claire de 2 px)
  + nom (Space Grotesk, 25 px, 700) + sous-titre `Golden retriever · 4 ans`
  (13,5 px).
- Icône **`edit`** à droite pour modifier la fiche.

### 2. Chips animaux

Même composant que l'accueil, mêmes règles : à cheval sur le header et le
contenu, avatar + prénom, chip « + » en fin de rangée. Différence de
comportement : sur le Carnet la sélection **change l'animal consulté** (il y a
toujours un animal actif), alors que sur l'accueil elle filtre la vue et peut
être désélectionnée.

### 3. Bandeau de stats (3 colonnes)

Pas de cartes : trois colonnes de largeur égale séparées par des filets
verticaux de 1 px. Chaque colonne = libellé (11,5 px, 600) + valeur (Space
Grotesk, 21 px, 700) + sous-libellé (11,5 px).

| Colonne | Valeur | Sous-libellé |
|---|---|---|
| **Poids** | `24,5 kg`, ou `—` sans pesée | `+0,5 kg vs août`, ou `Aucune pesée` |
| **Rappels** | nombre de vaccins en retard | `en retard` si > 0, sinon `à venir` |
| **Traitements** | nombre de traitements actifs | `en cours` |

La colonne Rappels passe **en corail (valeur + sous-libellé)** dès qu'il y a un
retard ; c'est le seul accent coloré du bandeau.

### 4. Section « Vaccins »

Titre « Vaccins », puis une carte unique (rayon 22 px) contenant :

- une ligne par vaccin (hauteur ≥ 76 px, filet de séparation) :
    - barre verticale de 3 px à gauche, **corail si en retard, transparente
      sinon**
    - nom du vaccin (15,5 px, 700)
    - détail en dessous (12,5 px) : `Échéance passée`, `Valide jusqu'au 12/2026`
    - badge à droite : icône `error` + `En retard` (fond `#FFE3DF`), ou icône
      `check` + `À jour` (fond `#DFF3E2`)
- en dernière ligne de la carte, séparée par un filet : icône `add` +
  **« Ajouter un vaccin »** (pétrole, 13,5 px, 700), hauteur 52 px.

### 5. Section « Traitements en cours »

Même principe de carte unique :

- une ligne par traitement :
    - nom commercial (15,5 px, 700) — ex. `Bravecto`
    - type en dessous (12,5 px) — ex. `Antiparasitaire`
    - prochaine dose, couleur selon l'urgence :
      `Prochaine dose dans 15 jours` (gris), `Prochaine dose aujourd'hui`
      (ambre, 700), `Prochaine dose en retard · 2 j` (corail, 700)
    - badge de fréquence à droite, neutre : `Tous les 3 mois`
- dernière ligne : icône `add` + **« Ajouter un traitement »**.

### 6. Section « Suivi de poids »

Carte unique contenant :

- poids actuel en gros (Space Grotesk, 26 px) + unité `kg`
- delta en vert : `+0,5 kg vs août`
- à droite, lien **« Voir l'historique »** + chevron
- courbe SVG simple : polyline pétrole 2 px, un point par pesée, valeur écrite
  au-dessus de chaque point (`23,6`, `23,8`…), sans axes ni grille
- sous la courbe, les libellés de période : `Juin`, `Juil.`, `Août`, `Sept.`,
  `Oct.`, `Nov.`
- dernière ligne séparée par un filet : icône `add` + **« Ajouter une pesée »**.

### 7. Bottom navigation

Identique à l'accueil (barre pleine largeur, `home` / `pets`), onglet **Carnet
actif**.

## Les 3 états de l'écran

| Réf. | État | Contenu |
|---|---|---|
| **C1** | Animal avec données — interactif | version complète ci-dessus ; les chips changent l'animal consulté (Milo chien / Luna chatte) |
| **C2** | Sections vides | `Aucun vaccin enregistré`, `Aucun traitement en cours`, `Aucune pesée enregistrée`, chaque carte gardant sa ligne d'ajout ; stats à `—` / `0` / `0` |
| **C3** | Photos réelles | même écran que C1, mais l'avatar du header et les avatars des chips sont des photos importées |

Les états vides sont **par section** : une section vide n'enlève ni son titre ni
sa ligne d'ajout. Il n'y a pas d'état « aucun animal » sur cet écran — ce cas
est traité par l'état A5 de l'accueil.

## Contenu d'exemple des maquettes

À titre de référence pour les jeux de test :

- **Milo** — Golden retriever · 4 ans. Vaccins : CHPPi (en retard), Rage
  (valide jusqu'au 12/2026). Traitement : Bravecto, antiparasitaire, tous les
  3 mois. Poids : 23,6 → 24,5 kg sur 6 mois.
- **Luna** — chatte. Vaccin : Typhus (RCP), valide jusqu'au 09/2026.
  Traitement : Milbemax, vermifuge, tous les 3 mois. Poids : 3,8 → 4,2 kg.

⚠️ Incohérence connue entre les deux planches : l'accueil v2 nomme le vaccin de
Milo `Vaccin CHPPiL` et le carnet v2 `CHPPi`. C'est un libellé de démo, aucune
des deux orthographes n'est normative.

## Tokens

Identiques à l'accueil — voir la table dans `../accueil-v2/accueil.md`.
Spécifiques au Carnet :

| Rôle | oklch | hex |
|---|---|---|
| Badge « À jour » fond / texte | `oklch(94.5% 0.03 150)` / `oklch(41% 0.065 150)` | `#DFF3E2` / `#2F5437` |
| Badge « En retard » fond / texte | `oklch(94.5% 0.04 27)` / `oklch(45% 0.15 27)` | `#FFE3DF` / `#972622` |
| Badge de fréquence fond / texte / bordure | `oklch(95.5% 0.006 78)` / `oklch(46% 0.012 70)` / `oklch(92% 0.008 78)` | `#F2F0EC` / `#5C5751` / `#E7E4DF` |

## Contraintes conservées de la v1

- Pas d'export PDF, pas de section Documents ni Finances.
- Chips à cheval sur le hero, feedback de sélection très marqué.
- Ajout rapide accessible depuis chaque section, sans quitter l'écran.
