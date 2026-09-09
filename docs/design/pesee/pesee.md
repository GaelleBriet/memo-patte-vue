---
tags:
  - perso
  - memo-patte
  - pesee
---

# Feuille pesée — saisie rapide (#30)

Maquette de référence : `MémoPatte v2 - Pesée.png` (capture) et
`MémoPatte v2 - Pesée (standalone).html` (version interactive, planches P1 à
P4).

**Objectif** : tenir la promesse des 2 taps. Bottom sheet, pas un écran
poussé, ouverte depuis le Carnet (animal déjà identifié) ou depuis les
Actions rapides de l'Accueil (animal parfois à demander).

## Champs

| Champ | Contrôle | Obligatoire | Règle |
|---|---|---|---|
| Animal | Sélecteur de chips | Oui, uniquement si l'animal n'est pas déjà identifié par le contexte d'ouverture | « Choisis un animal. » si aucun choisi à l'envoi |
| Poids | Nombre décimal | **Oui** | Strictement positif, 0 refusé, unité « kg » en suffixe |
| Date de la pesée | Sélecteur de date natif | **Oui** | Pré-remplie à aujourd'hui, modifiable, bornée à aujourd'hui au maximum, une date passée est explicitement autorisée |

Contrairement au formulaire animal, le poids est ici **obligatoire** : c'est
tout l'objet de l'écran, pas une donnée annexe.

## Structure de la feuille

### 1. Fermeture

- Fond assombri derrière la feuille : `rgba(20,26,26,0.46)`, tap dessus =
  fermeture.
- La feuille remonte depuis le bas, coins hauts rayon 24 px, fond `#F9F3E9`,
  ombre `0 -6px 24px rgba(30,25,20,0.14)`.
- Poignée de glissement en haut, centrée : pilule 36×4 px, couleur `#C1BDB7`,
  elle-même cliquable pour fermer.

### 2. En-tête

- Titre « Ajouter une pesée » (Space Grotesk 20 px / 700).
- Si l'animal est déjà identifié (ouverture depuis le Carnet) : sous-titre
  « Pour {prénom} » sous le titre, texte secondaire `#68625C`, pas d'icône de
  fermeture visible (la poignée et le tap hors-feuille suffisent).
- Si l'animal n'est pas identifié (ouverture depuis l'Accueil sans chip
  active) : pas de sous-titre, icône de fermeture (`close`) en haut à droite,
  zone de tap 44×44 px, couleur `#3E3630`.

### 3. Sélecteur d'animal (uniquement si nécessaire)

- N'apparaît que si l'animal n'est pas déjà identifié par le contexte.
- Label « Animal * », même style que les labels de champ du formulaire
  animal.
- Rangée de chips, même composant que l'Accueil : avatar 32 px + prénom,
  hauteur de chip 42 px.
- **Chaque animal a son propre dégradé de placeholder** : Milo reprend le
  dégradé déjà documenté dans `animal.md` (`#D8AF83` → `#B6744B`), Luna a le
  sien (`#C5CBD2` → `#8C939E`). Premier indice que ces dégradés sont propres
  à chaque animal, pas un gris générique unique — à confirmer quand un
  troisième animal apparaîtra dans une maquette.
- Sélection : fond plein pétrole, anneau clair `#F9F4EE` autour de l'avatar.
  Non sélectionné : fond `#FEFCF9`, bordure `#DBD7D1`.
- Tant qu'aucun animal n'est choisi, les champs Poids et Date en dessous sont
  visibles mais grisés (opacité réduite) et non interactifs. Erreur
  « Choisis un animal. » sous la rangée si on tente d'envoyer sans choix.

### 4. Champs Poids et Date

- Même style de champ que le formulaire animal (hauteur 52 px, rayon 14 px,
  fond `#FEFCF9`, bordure `#DBD7D1`, focus et erreur pétrole/rouge
  identiques).
- Poids : clavier décimal, unité « kg » en suffixe. Sur la planche
  interactive, un curseur clignotant et un pavé numérique factice
  apparaissent sous le champ quand il est actif — c'est une simulation du
  clavier système du téléphone, pas un composant à construire.
- Date : identique au champ date du formulaire animal, `max` posé sur
  aujourd'hui.
- **Le bouton n'est pas ancré en bas de la feuille.** Contrairement au
  formulaire animal (barre d'actions fixe), ici il suit directement les
  champs, avec un espacement de 22 px au-dessus. La feuille est courte, elle
  n'a pas besoin d'un footer fixe.

### 5. Bouton d'envoi

- Pleine largeur, fond plein pétrole, texte blanc cassé, rayon plein,
  hauteur 52 px. Libellé unique « Enregistrer ».
- État d'envoi : même traitement que le formulaire animal, fond gris clair
  `#E1DDD8`, texte `#6E6862`, spinner, libellé « Enregistrement… ».
- Pas de bouton « Annuler » : la fermeture passe uniquement par la poignée,
  le tap hors-feuille ou l'icône de fermeture.

## Les 4 états de la feuille

| Réf. | État | Contenu |
|---|---|---|
| **P1** | Animal identifié, interactif | Ouverte depuis le Carnet de Milo, champ Poids déjà focus, sous-titre « Pour Milo » |
| **P2** | Sans animal, sélecteur en tête, interactif | Ouverte depuis l'Accueil, aucun animal choisi au départ, champs grisés jusqu'au choix |
| **P3** | Erreur de validation | Poids à 0, message « Le poids doit être supérieur à 0 kg. » |
| **P4** | Enregistrement en cours | Exemple Milo, poids 24,7 kg, bouton désactivé + spinner |

Une règle de validation existe dans le code mais n'est démontrée dans aucun
état : la date ne peut pas être vide (« La date est obligatoire. »). Comme
elle est toujours pré-remplie à aujourd'hui, ce cas ne survient qu'en
effaçant manuellement le champ.

## Artefacts de démo à ne pas prendre pour une spécification

Le décor derrière la feuille assombrie simule un Carnet ou un Accueil très
simplifié (blocs gris à la place des cartes, texte d'en-tête différent du
vrai Accueil). En particulier, l'en-tête de fond affiche « Bonjour » / « Tes
compagnons » sur P2 : ce n'est **pas** un changement du texte d'accueil déjà
fixé dans `accueil.md` (« MémoPatte » / « Foyer de {prénom} »), juste un
raccourci pour signaler visuellement « on vient de l'Accueil » sans
reconstruire l'écran entier.

## Tokens propres à cette feuille

En complément des tokens déjà définis dans `accueil.md` et `animal.md`.

| Rôle | oklch | hex |
|---|---|---|
| Fond assombri (overlay) | — | `rgba(20,26,26,0.46)` |
| Poignée de la feuille | `oklch(80% 0.01 78)` | `#C1BDB7` |
| Dégradé placeholder Luna, début / fin | `oklch(84% 0.012 250)` / `oklch(66% 0.018 260)` | `#C5CBD2` / `#8C939E` |

Le reste (champs, bouton, erreur, chip sélectionnée) reprend tel quel les
tokens du formulaire animal, sans variante.

## Règle de patron

Première feuille modale du design system. À reprendre pour toute action
courte (2 champs maximum, contexte déjà connu la plupart du temps) plutôt
que d'ouvrir un écran poussé : fond assombri, coins hauts 24 px, poignée de
fermeture, pas de bouton « Annuler » dédié, bouton d'action qui suit les
champs sans être ancré en bas sauf si le contenu de la feuille devient plus
long que celui-ci.
