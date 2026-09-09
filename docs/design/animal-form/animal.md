---
tags:
  - perso
  - memo-patte
  - formulaire-animal
---

# Formulaire animal — création / édition (#15)

Maquette de référence : `MémoPatte v2 - Animal.png` (capture) et
`MémoPatte v2 - Animal (standalone).html` (version interactive, planches F1 à
F5).

**Objectif** : premier écran poussé (hors onglets) du design system v2. Fixe
le patron formulaire, réutilisé ensuite par les formulaires vaccin (#20) et
traitement (#25) : sélecteur à deux choix, sélecteur de date, affichage
d'erreur Zod, comportement d'envoi, comportement de la top bar au scroll.

## Champs

Source de vérité : `src/features/animals/animal.schema.ts`
(`animalInputSchema`). Détail complet dans `champs-des-ecrans.md`.

| Champ | Contrôle | Obligatoire | Règle |
|---|---|---|---|
| Photo | Cercle 88 px, tap pour ouvrir le sélecteur de fichier | Non | Hors du schéma Zod de #15, arrive avec #101. Affichée quand même dans la maquette pour donner la vision complète de l'écran, décision du 2026-09-09 : le tap ouvre bien le sélecteur dans l'interactif, sans persistance réelle avant #101 |
| Nom | Texte | **Oui** | Non vide après suppression des espaces |
| Espèce | Deux choix exclusifs (segmented control) | **Oui** | `chien` ou `chat` uniquement, jamais de select ni de champ libre |
| Race | Texte | Non | Si renseignée, au moins 1 caractère |
| Date de naissance | Sélecteur de date natif | Non | Borné à aujourd'hui au niveau du sélecteur (`max`), pas seulement refusé après coup |
| Poids initial | Nombre décimal | Non | Strictement positif si renseigné, 0 refusé. Unité « kg » affichée en suffixe |

## Structure de l'écran

### 1. Top app bar

- Sticky en haut du contenu défilant, pas un header fixe séparé du scroll
  comme sur Accueil/Carnet.
- Fond identique au fond d'écran (`#F9F3E9`), pas de bandeau pétrole : c'est
  un écran poussé, pas un onglet.
- Au repos, sans scroll : pas de bordure, pas d'ombre.
- Dès que le contenu défile (`scrollTop > 2px`) : bordure inférieure 1 px
  `#ECE9E5` + ombre légère `0 1px 3px rgba(30,25,20,0.06)`. Empêche le titre
  de se fondre dans le contenu qui défile en dessous — voir état F5.
- Flèche retour : icône `arrow_back`, zone de tap 48×48 px, couleur pétrole
  `#01383E` (décision du 2026-09-09, initialement gris neutre).
- Titre : Space Grotesk 22 px / 700, tronqué avec ellipse si trop long.
  « Nouvel animal » en création, « Modifier {prénom} » en édition.

### 2. Photo

- Cercle 88 px, centré, sous la top bar.
- Vide : fond `#FEFCF9`, bordure pointillée 1,5 px `#A2BDC0`, icône patte
  (`pets`) 40 px centrée, couleur `#90ABAD`.
- Remplie : dégradé placeholder (`linear-gradient(135deg, #D8AF83, #B6744B)`
  tant qu'il n'y a pas de vraie photo), bordure pleine 2 px blanc cassé,
  ombre légère.
- Badge appareil photo superposé en bas à droite : cercle 32 px, fond
  pétrole, bordure 2,5 px couleur du fond d'écran (effet de découpe), icône
  `photo_camera` 16 px blanc cassé.
- Légende sous la photo : « Ajouter une photo » (vide) / « Changer la
  photo » (remplie), 12,5 px / 600, `#857F79`.

### 3. Champs texte et nombre

- Hauteur 52 px, rayon 14 px, fond `#FEFCF9`, bordure 1 px `#DBD7D1`.
- Focus : bordure pétrole + anneau interne pétrole 1 px.
- Erreur : bordure et anneau interne passent en rouge système `#B3261E`
  (rôle `error`, jamais les couleurs d'urgence de la marque — même règle que
  documentée dans `accueil.md`).
- Label au-dessus : 12,5 px / 600, `#5C5751`. Astérisque pétrole si
  obligatoire, mention « Optionnel » à droite du label sinon (12,5 px / 500,
  `#857F79`).
- Message d'erreur sous le champ : icône `error` (remplie) 16 px + texte,
  12,5 px / 500, `#B3261E`.

### 4. Sélecteur d'espèce

- Segmented control, hauteur 48 px, rayon plein (pilule), bordure 1 px
  `#CECAC3`, fond `#FEFCF9`, séparateur vertical 1 px entre les deux
  options.
- Option sélectionnée : fond plein pétrole `#01383E`, texte blanc cassé
  `#F9F4EE` / 700, coche (`check`) 18 px devant le libellé. Même traitement
  que l'état sélectionné des chips animal sur Accueil/Carnet (décision du
  2026-09-09, initialement un bleu cyan générique Material 3).
- Option non sélectionnée : fond transparent, texte `#3E3630` / 600, pas de
  coche.
- Jamais de troisième option, jamais de select : contrainte de base
  (`CHECK (species IN ('dog','cat'))`).

### 5. Date de naissance

- Champ date natif, icône `calendar_month` 21 px en suffixe, couleur
  pétrole.
- `max` du champ posé sur la date du jour : le futur est grisé dans le
  sélecteur natif, pas seulement rejeté après validation.

### 6. Poids initial

- Champ nombre, clavier décimal, pas de flèches spin.
- Suffixe « kg » en fin de champ, 15 px / 600, `#413933`.
- 0 est une valeur invalide, traitée comme une erreur de validation (« Le
  poids doit être supérieur à 0 kg. »), pas comme un champ vide.

### 7. Barre d'actions (bas d'écran)

- Fixe en bas, fond quasi blanc `#FCFAF7`, bordure supérieure 1 px
  `#ECE9E5`, padding bas 30 px (zone de gestes).
- Bouton « Annuler » : texte pétrole seul, pas de fond, renvoie au Carnet.
- Bouton principal : occupe la largeur restante, fond plein pétrole, texte
  blanc cassé, rayon plein. Libellé « Créer » en création, « Enregistrer »
  en édition.
- État d'envoi : bouton désactivé, fond gris clair `#E1DDD8`, texte gris
  `#6E6862`, spinner 18 px en rotation devant le libellé (« Création… » /
  « Enregistrement… »). « Annuler » grisé et non cliquable pendant l'envoi.
  Volontairement un micro-état, pas un écran de chargement plein : la
  sauvegarde locale (SQLite) est quasi instantanée, la latence perçue dans la
  démo ne reflète pas l'architecture réelle.

## Les 5 états de l'écran

| Réf. | État | Contenu |
|---|---|---|
| **F1** | Création vide, interactif | Formulaire vierge, saisie et sélection d'espèce fonctionnelles, validation déclenchée au clic sur « Créer » |
| **F2** | Édition pré-remplie | Exemple Milo : chien, Labrador, né le 12/03/2023, 8,5 kg, photo renseignée |
| **F3** | Erreurs de validation | Nom vide et poids à 0, les deux messages d'erreur affichés simultanément |
| **F4** | Envoi en cours | Exemple Luna (chat, Européen), bouton désactivé et spinner |
| **F5** | Contenu défilé | Démontre la bordure/ombre de la top bar une fois le contenu scrollé — pas un état produit distinct, une preuve de comportement |

## Tokens propres à cet écran

En complément des tokens déjà définis dans `accueil.md` (pétrole `#01383E`,
fond d'écran `#F9F3E9`, texte principal `#221B16`, rôle `error` `#B3261E`).

| Rôle | oklch | hex |
|---|---|---|
| Surface champ | `oklch(99.2% 0.005 78)` | `#FEFCF9` |
| Bordure champ | `oklch(88% 0.009 78)` | `#DBD7D1` |
| Bordure segmented control | `oklch(84% 0.01 78)` | `#CECAC3` |
| Label de champ | `oklch(46% 0.012 70)` | `#5C5751` |
| Texte « Optionnel » / hint | `oklch(60% 0.012 70)` | `#857F79` |
| Placeholder | `oklch(66% 0.012 70)` | `#97918A` |
| Texte segment inactif | `oklch(34% 0.015 60)` | `#3E3630` |
| Icône patte (photo vide) | `oklch(72% 0.03 202)` | `#90ABAD` |
| Bordure pointillée (photo vide) | `oklch(78% 0.03 202)` | `#A2BDC0` |
| Fond barre d'actions | `oklch(98.6% 0.005 78)` | `#FCFAF7` |
| Bordure top bar scrollée / barre d'actions | `oklch(93.5% 0.006 78)` | `#ECE9E5` |
| Suffixe « kg » | `oklch(35% 0.015 60)` | `#413933` |
| Bouton désactivé, fond | `oklch(90% 0.008 78)` | `#E1DDD8` |
| Bouton désactivé, texte | `oklch(52% 0.012 70)` | `#6E6862` |

**Typographie** : identique à Accueil/Carnet — `Space Grotesk` pour le titre
de la top bar, `Inter` pour tout le reste, `Material Symbols Outlined` pour
les icônes.

## Validation

Zod, au niveau du champ. Message affiché en français sous le champ
concerné, jamais en toast ou en résumé global.

| Champ | Message d'erreur |
|---|---|
| Nom vide | « Le nom est obligatoire. » |
| Espèce non choisie | « Choisis une espèce. » |
| Poids ≤ 0 (si renseigné) | « Le poids doit être supérieur à 0 kg. » |

Race et date de naissance n'ont pas de règle de validation au-delà du
typage natif du champ.

## Règles de patron, à reprendre par les formulaires vaccin (#20) et traitement (#25)

- Écran poussé : top bar sticky avec bordure/ombre au scroll, jamais de
  bottom nav.
- Sélecteur à choix exclusifs fermés : segmented control pétrole plein sur
  l'option active, jamais de select pour un choix fermé (ex. type de
  traitement si la liste reste courte).
- Erreur de champ : rôle système `error`, jamais les couleurs d'urgence de
  la marque.
- Bouton principal sur la largeur restante + « Annuler » en texte seul,
  jamais deux boutons de poids visuel égal.
- Envoi : micro-état (bouton désactivé + spinner), jamais un écran de
  chargement plein.
- Particularité du vaccin (#20) à anticiper : le schéma d'édition retire
  `animalId`, le formulaire d'édition n'a donc pas de sélecteur d'animal
  visible — l'animal y est un fait affiché, pas un choix. Création et
  édition ne sont pas exactement le même écran, contrairement au formulaire
  animal.
