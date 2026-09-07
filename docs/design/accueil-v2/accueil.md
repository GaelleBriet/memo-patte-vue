---
tags:
  - perso
  - memo-patte
  - accueil
---

# Écran d'accueil — maquette v2 (référence)

Maquette de référence : `MémoPatte v2 - Accueil.png` (capture) et
`MémoPatte v2 - Accueil (standalone).html` (version interactive, planche A1).
Remplace `../accueil-v1/accueil.md`, conservé uniquement comme historique.

**Objectif inchangé** : voir d'un seul coup d'œil, pour tous les animaux, le
prochain rappel à venir ou en retard.

## Ce qui change par rapport à la v1

| Élément | v1 | v2 |
|---|---|---|
| Header | « Bonjour Sophie » + date du jour | « MémoPatte » + « Foyer de Sophie », **plus de date** |
| Liste « À faire » | une carte par rappel | **une seule carte** contenant les lignes, séparées par des filets |
| Ligne de rappel | type + animal + détail (dose, échéance) | type + animal seulement, le détail passe dans le Carnet |
| État « aucun rappel » | grande carte centrée + bouton contour | ligne discrète (pastille verte + « Tout est à jour ») + lien texte |
| Bottom nav | pilule flottante sombre | **barre pleine largeur** claire, icône + libellé |
| Premier lancement | header visible + icône patte | **écran plein**, sans header, illustration de marque |
| Animaux d'exemple | Milo, Luna, Nala (lapin) | Milo (chien), Luna (chat) — plus d'espèce hors scope |

## Structure de l'écran

### 1. Header pétrole (hauteur 158 px)

- Fond plein `#01383E`, pas de dégradé.
- Barre de statut système en haut.
- En bas du bloc, alignés sur la même ligne de base :
    - titre **« MémoPatte »** (Space Grotesk, 26 px, 700)
    - sous-titre **« Foyer de {prénom} »** (13,5 px, 500)
    - icône **paramètres** à droite (Material Symbols `settings`)
- Pas de salutation, pas de date : le header porte la marque, pas le contexte
  temporel.

### 2. Chips animaux

- Rangée horizontale, positionnée **à cheval** sur le header et le contenu
  (`bottom: -21px` par rapport au header) — contrainte conservée de la v1.
- Une chip par animal : avatar rond 32 px (photo de l'animal, sinon dégradé de
  couleur) + prénom (14 px, 700). Hauteur de chip 42 px.
- Chip **« + »** en fin de rangée : cercle 42 px, bordure pointillée, icône `add`.
- Sélection :
    - non sélectionnée = fond crème, bordure fine
    - **sélectionnée = fond `#01383E`, texte clair, anneau clair de 2 px**
    - re-cliquer sur la chip active revient à la vue « tous les animaux »

### 3. Section « À faire »

Titre « À faire » (Space Grotesk, 21 px, 700) avec, à droite, un compteur de
portée :

- aucun animal sélectionné : `3 rappels` (ou `1 rappel`)
- animal sélectionné : `Milo · 2 rappels`
- animal sélectionné sans rappel : `Milo` seul

**Bandeau retard** (uniquement s'il y a au moins un retard) : fond rose pâle,
icône `error`, texte `1 rappel en retard` / `2 rappels en retard`.

**Carte de rappels** : une seule surface arrondie (rayon 22 px) contenant toutes
les lignes, hauteur de ligne 76 px minimum, filet de séparation entre les lignes.

Chaque ligne contient, de gauche à droite :

1. barre d'urgence verticale de 3 px collée au bord gauche
2. icône du type (`vaccines`, `medication`, `pest_control`)
3. type de rappel (15,5 px, 700) + nom de l'animal en dessous
   (13 px, masqué quand un animal est sélectionné : l'info serait redondante)
4. badge d'échéance relative, aligné à droite

Tri : par urgence croissante (le plus en retard en premier).

**Libellés d'échéance** (à reprendre tels quels) :

| Situation | Badge | Barre |
|---|---|---|
| En retard | `En retard · 2 j` (sans icône) | corail |
| Aujourd'hui | icône `today` + `Aujourd'hui` | ambre |
| Demain | icône `schedule` + `Demain` | vert |
| Plus tard | icône `schedule` + `Dans 3 jours` | vert |

### 4. État « aucun rappel » (remplace la carte vide de la v1)

- Ligne simple : pastille verte 46 px avec icône `check`, puis
  **« Tout est à jour »** (18 px, 700) et une sous-ligne :
    - animal sélectionné : `Aucun rappel à venir pour Milo.`
    - vue globale : `Milo et Luna n'ont aucun rappel à venir.`
      (les prénoms sont listés dynamiquement)
- En dessous, lien texte pétrole : icône `add` + **« Ajouter un vaccin ou un
  traitement »**. Ce n'est plus un bouton contour dans une carte.

### 5. Section « Actions rapides »

Titre « Actions rapides », puis grille de 3 tuiles égales (rayon 18 px,
hauteur ~78 px), icône en haut et libellé en bas :

- `medication` — **Nouveau traitement**
- `vaccines` — **Rappel de vaccin**
- `monitor_weight` — **Ajouter un poids**

Chaque tuile ouvre le formulaire correspondant en 1 tap.

Sur la planche interactive, un toast sombre confirme l'action en bas d'écran
(`Nouveau traitement — c'est noté`) : c'est un artefact de démo, pas une
spécification de comportement.

### 6. Bottom navigation

- Barre **pleine largeur**, fond crème très clair, filet supérieur, padding bas
  de 22 px (zone de gestes Android).
- 2 onglets seulement, icône + libellé :
    - `home` — **Accueil**
    - `pets` — **Carnet**
- Onglet actif : pétrole `#01383E`, libellé en 700. Onglet inactif : gris chaud,
  libellé en 500.
- Toujours pas d'onglets Documents / Finances, même désactivés
  (decisions-log du 2026-08-15).

## Les 5 états de l'écran

| Réf. | État | Contenu |
|---|---|---|
| **A1** | Tous les animaux, avec rappels | aucune chip sélectionnée, rappels de tous les animaux fusionnés et triés, nom de l'animal visible sur chaque ligne |
| **A2** | Animal sélectionné, avec rappels | chip active, liste filtrée, nom de l'animal masqué sur les lignes, compteur `Milo · 2 rappels` |
| **A3** | Animal sélectionné, aucun rappel | état « Tout est à jour » + sous-texte nominatif |
| **A4** | Tous les animaux, aucun rappel | état « Tout est à jour » + sous-texte listant les animaux |
| **A5** | Premier lancement, aucun animal | écran plein, sans header ni chips |

**Détail de A5 (premier lancement)** :

- Contenu centré verticalement, aucun header pétrole, fond crème.
- Illustration de marque 150 px : patte + chien/chat (variante B, celle qui
  reprend l'art de l'icône — voir `../logos/logos.md`).
- Titre **« Bienvenue sur MémoPatte »** (Space Grotesk, 27 px, 700).
- Sous-titre **« Le carnet de santé de tes animaux, toujours à jour. »**
- Bouton plein pétrole pleine largeur, rayon 18 px, icône `add` +
  **« Créer mon premier animal »**.
- La bottom nav reste visible.

## Tokens de la maquette v2

Les valeurs sont exprimées en oklch dans la maquette ; l'équivalent hex est
donné pour l'implémentation Vuetify/SCSS.

| Rôle | oklch | hex |
|---|---|---|
| Pétrole (header, actif, boutons) | — | `#01383E` |
| Pétrole foncé (hover lien) | — | `#012A2F` |
| Fond d'écran | `oklch(96.5% 0.014 78)` | `#F9F3E9` |
| Surface carte | `oklch(99.2% 0.005 78)` | `#FEFCF9` |
| Bordure carte | `oklch(93.6% 0.006 78)` | `#ECE9E5` |
| Filet de séparation | `oklch(94.5% 0.006 78)` | `#EFECE8` |
| Texte principal | `oklch(23% 0.015 60)` | `#221B16` |
| Texte secondaire | `oklch(50% 0.012 70)` | `#68625C` |
| Texte méta / compteur | `oklch(56% 0.012 70)` | `#79736D` |
| Sous-titre sur pétrole | `oklch(84% 0.025 202)` | `#B9D0D1` |
| Retard — barre | `oklch(56% 0.16 27)` | `#C0453D` |
| Retard — badge fond / texte | `oklch(96.6% 0.018 27)` / `oklch(44% 0.16 27)` | `#FFF0ED` / `#971B1A` |
| Aujourd'hui — barre | `oklch(70% 0.13 68)` | `#D38D38` |
| Aujourd'hui — badge fond / texte | `oklch(96.8% 0.022 75)` / `oklch(45% 0.12 62)` | `#FDF3E5` / `#834200` |
| Bientôt — barre | `oklch(58% 0.07 150)` | `#5C8664` |
| Bientôt — badge fond / texte | `oklch(96.6% 0.016 150)` / `oklch(40% 0.075 150)` | `#EDF7EE` / `#265331` |
| Pastille « tout est à jour » | `oklch(93% 0.035 150)` / `oklch(45% 0.09 150)` | `#D8EFDC` / `#2B6339` |

**Typographie** : `Space Grotesk` (500/600/700) pour les titres et les valeurs
mises en avant, `Inter` (400→800) pour tout le reste, `Material Symbols
Outlined` pour les icônes.

⚠️ Le thème Vuetify actuel (`src/core/theme/vuetify.ts`) utilise encore
`primary: #0F766E` et l'icon set `mdi`. L'alignement sur ces tokens (et le choix
mdi vs Material Symbols) n'est pas encore ticketé.

## Règles de design conservées de la v1

- Chips à cheval sur le header et le contenu.
- L'urgence doit être lisible en moins d'une seconde.
- Maximum 2 taps pour ajouter une information importante.
- Rien hors scope v1 : ni Documents, ni Finances, ni Toilettage, ni RDV, ni
  export PDF.
